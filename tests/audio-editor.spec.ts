import { devices, expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import path from 'node:path';

function createDemoAudioBuffer(durationSeconds: number, frequency = 220) {
  const sampleRate = 44_100;
  const frameCount = Math.max(1, Math.round(sampleRate * durationSeconds));
  const bytesPerSample = 2;
  const dataSize = frameCount * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const sample = Math.sin((2 * Math.PI * frequency * frameIndex) / sampleRate) * 0.32;
    buffer.writeInt16LE(Math.round(sample * 32_767), 44 + frameIndex * bytesPerSample);
  }

  return buffer;
}

test('audio mixer exposes live gain, mute, and solo controls per track', async ({ page }) => {
  await page.goto('/tools/audio', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('main')).toBeVisible({ timeout: 60_000 });
  // Wait for the editor to hydrate so the file input handler is attached.
  await expect(page.locator('[data-testid="audio-editor-shell"][data-ready="true"]')).toBeVisible({ timeout: 60_000 });

  await page.locator('input[type="file"]').setInputFiles([
    { name: 'alpha.wav', mimeType: 'audio/wav', buffer: createDemoAudioBuffer(1.2, 220) },
    { name: 'beta.wav', mimeType: 'audio/wav', buffer: createDemoAudioBuffer(1.2, 330) },
  ]);

  await expect(page.getByTestId('audio-track-stack-row')).toHaveCount(2, { timeout: 60_000 });
  await expect(page.getByRole('slider', { name: /^Gain / })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Mute' })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Solo' })).toHaveCount(2);

  await page.getByRole('button', { name: 'Mute' }).first().click();
  await expect(page.getByRole('button', { name: 'Unmute' })).toHaveCount(1);

  await page.getByRole('button', { name: 'Solo' }).first().click();
  await expect(page.getByRole('button', { name: 'Solo off' })).toHaveCount(1);
});

test('undo history survives switching the active track', async ({ page }) => {
  await page.goto('/tools/audio', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('main')).toBeVisible({ timeout: 60_000 });
  // Wait for the editor to hydrate so the file input handler is attached.
  await expect(page.locator('[data-testid="audio-editor-shell"][data-ready="true"]')).toBeVisible({ timeout: 60_000 });

  await page.locator('input[type="file"]').setInputFiles([
    { name: 'first.wav', mimeType: 'audio/wav', buffer: createDemoAudioBuffer(1.4, 220) },
    { name: 'second.wav', mimeType: 'audio/wav', buffer: createDemoAudioBuffer(1.4, 330) },
  ]);

  await expect(page.getByTestId('audio-track-stack-row')).toHaveCount(2, { timeout: 60_000 });

  // Create a selection on the active (second) clip and remove it.
  const activeSurface = page.getByTestId('audio-track-waveform-surface').nth(1);
  const surfaceBox = await activeSurface.boundingBox();
  if (!surfaceBox) {
    throw new Error('Active surface was not available.');
  }

  await page.mouse.move(surfaceBox.x + surfaceBox.width * 0.3, surfaceBox.y + surfaceBox.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(surfaceBox.x + surfaceBox.width * 0.6, surfaceBox.y + surfaceBox.height * 0.6, { steps: 8 });
  await page.mouse.up();

  await expect(page.getByTestId('audio-selection-bar')).toHaveCount(1);
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();

  // Switching the active track must not clear the undo stack.
  await page.getByRole('button', { name: 'first.wav' }).click();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Undo applied.')).toBeVisible();
  // Importing files is itself undoable, so Undo stays available; undoing the
  // removal also makes Redo available, proving the edit was reverted.
  await expect(page.getByRole('button', { name: 'Redo' })).toBeEnabled();
});

test('split at playhead creates a second clip and cut/paste works through the clipboard', async ({ page }) => {
  await page.goto('/tools/audio', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('main')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-testid="audio-editor-shell"][data-ready="true"]')).toBeVisible({ timeout: 60_000 });

  await page.locator('input[type="file"]').setInputFiles({
    name: 'clip.wav',
    mimeType: 'audio/wav',
    buffer: createDemoAudioBuffer(2.0, 220),
  });

  await expect(page.getByTestId('audio-track-stack-row')).toHaveCount(1, { timeout: 60_000 });

  const splitButton = page.getByRole('button', { name: 'Split at playhead' });
  const pasteButton = page.getByRole('button', { name: 'Paste at playhead' });
  await expect(splitButton).toBeDisabled();
  await expect(pasteButton).toBeDisabled();

  // Seek into the middle of the clip, then split it into two clips.
  const surface = page.getByTestId('audio-track-waveform-surface').first();
  const surfaceBox = await surface.boundingBox();
  if (!surfaceBox) {
    throw new Error('Clip surface was not available.');
  }

  await page.mouse.click(surfaceBox.x + surfaceBox.width * 0.5, surfaceBox.y + surfaceBox.height * 0.6);
  await expect(splitButton).toBeEnabled();
  await splitButton.click();
  await expect(page.getByTestId('audio-track-stack-row')).toHaveCount(2);
  await expect(page.getByText('clip.wav (2)').first()).toBeVisible();

  // Cut a range from the first clip and paste it back at the playhead.
  const firstSurface = page.getByTestId('audio-track-waveform-surface').first();
  await page.getByRole('button', { name: 'clip.wav', exact: true }).click();
  const firstBox = await firstSurface.boundingBox();
  if (!firstBox) {
    throw new Error('First clip surface was not available.');
  }

  await page.mouse.move(firstBox.x + firstBox.width * 0.2, firstBox.y + firstBox.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(firstBox.x + firstBox.width * 0.6, firstBox.y + firstBox.height * 0.6, { steps: 8 });
  await page.mouse.up();

  await expect(page.getByTestId('audio-selection-bar')).toHaveCount(1);
  await page.getByRole('button', { name: 'Cut' }).click();
  await expect(page.getByText('Selection cut to the clipboard.')).toBeVisible();
  await expect(pasteButton).toBeEnabled();

  await pasteButton.click();
  await expect(page.getByText('Clipboard audio pasted.')).toBeVisible();
});

test('drops audio files onto the editor shell to import them', async ({ page }) => {
  await page.goto('/tools/audio', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-testid="audio-editor-shell"][data-ready="true"]')).toBeVisible({ timeout: 60_000 });

  const dataTransfer = await page.evaluateHandle((bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], 'dropped.wav', { type: 'audio/wav' }));
    return transfer;
  }, Array.from(createDemoAudioBuffer(0.6, 220)));

  await page.dispatchEvent('[data-testid="audio-editor-shell"]', 'drop', { dataTransfer });

  await expect(page.getByTestId('audio-track-stack-row')).toHaveCount(1, { timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'dropped.wav' })).toBeVisible();
});

test('timeline conveniences: zoom to selection, inline rename, and reorder', async ({ page }) => {
  await page.goto('/tools/audio', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-testid="audio-editor-shell"][data-ready="true"]')).toBeVisible({ timeout: 60_000 });

  await page.locator('input[type="file"]').setInputFiles([
    { name: 'a.wav', mimeType: 'audio/wav', buffer: createDemoAudioBuffer(0.8, 220) },
    { name: 'b.wav', mimeType: 'audio/wav', buffer: createDemoAudioBuffer(0.8, 330) },
  ]);
  await expect(page.getByTestId('audio-track-stack-row')).toHaveCount(2, { timeout: 60_000 });

  // Build a selection by dragging across the first clip (reliable in headless).
  const firstClip = page.getByTestId('audio-track-waveform-surface').first();
  const clipBox = await firstClip.boundingBox();
  if (!clipBox) {
    throw new Error('First clip surface was not available.');
  }
  await page.mouse.move(clipBox.x + clipBox.width * 0.2, clipBox.y + clipBox.height * 0.7);
  await page.mouse.down();
  await page.mouse.move(clipBox.x + clipBox.width * 0.7, clipBox.y + clipBox.height * 0.7, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByTestId('audio-selection-bar')).toHaveCount(1);

  // Zoom-to-selection expands the timeline beyond the viewport.
  await page.getByRole('button', { name: 'Zoom to selection' }).click();
  const zoomedMetrics = await page.getByTestId('audio-waveform-scroll').evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(zoomedMetrics.scrollWidth - zoomedMetrics.clientWidth).toBeGreaterThan(40);
  await page.getByRole('button', { name: 'Fit to view' }).click();

  // Inline rename: double-click the track name, type, press Enter.
  await page.getByRole('button', { name: 'a.wav' }).dblclick();
  const renameInput = page.getByLabel('Track name');
  await expect(renameInput).toBeVisible();
  await renameInput.fill('renamed-a.wav');
  await renameInput.press('Enter');
  await expect(page.getByRole('button', { name: 'renamed-a.wav' })).toBeVisible();

  // Reorder: move the second track (b.wav) above the first.
  await page.getByRole('button', { name: 'Move track up' }).nth(1).click();
  await expect(
    page.getByTestId('audio-track-stack-row').first().getByRole('button', { name: 'b.wav' }),
  ).toBeVisible();
});

/**
 * Fake capture devices: the microphone and a shared tab play tones, and every
 * request is recorded on `window.__capture` so tests can read what was asked.
 */
async function stubCapture(page: Page, { sharedAudio = true }: { sharedAudio?: boolean } = {}) {
  await page.addInitScript((withAudio) => {
    type CaptureLog = { mic: unknown[]; display: unknown[] };
    const log: CaptureLog = { mic: [], display: [] };
    (window as unknown as { __capture: CaptureLog }).__capture = log;
    const tone = (frequency: number) => {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const destination = context.createMediaStreamDestination();
      oscillator.frequency.value = frequency;
      gain.gain.value = 0.25;
      oscillator.connect(gain);
      gain.connect(destination);
      oscillator.start();
      return destination.stream;
    };
    navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
      log.mic.push(constraints?.audio ?? null);
      return tone(220);
    };
    navigator.mediaDevices.getDisplayMedia = async (options?: DisplayMediaStreamOptions) => {
      log.display.push(options ?? null);
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 180;
      canvas.getContext('2d')?.fillRect(0, 0, 320, 180);
      const stream = canvas.captureStream(5);
      if (withAudio) {
        tone(440).getAudioTracks().forEach((track) => stream.addTrack(track));
      }
      return stream;
    };
  }, sharedAudio);
}

async function openReadyEditor(page: Page) {
  await page.goto('/tools/audio', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-testid="audio-editor-shell"][data-ready="true"]')).toBeVisible({ timeout: 60_000 });
}

async function recordFor(page: Page, milliseconds: number) {
  await page.getByRole('button', { name: 'Start recording' }).click();
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('audio-level-meter')).toBeVisible();
  // The take being recorded shows on the timeline (its own lane or over the selected track).
  await expect(page.getByTestId('audio-live-take')).toBeVisible();
  await page.waitForTimeout(milliseconds);
  await page.getByRole('button', { name: 'Stop recording' }).click();
}

test('the microphone records the sound as it is, and voice cleanup is a choice that sticks', async ({ page }) => {
  await stubCapture(page);
  await openReadyEditor(page);

  await recordFor(page, 900);
  await expect(page.getByTestId('audio-track-stack-row')).toHaveCount(1, { timeout: 30_000 });
  await expect(page.getByText(/Recording ready: .*kHz · (Mono|Stereo) · WAV/)).toBeVisible();

  // Call processing is off by default: it makes music and rooms sound thin.
  const first = await page.evaluate(() => (window as unknown as { __capture: { mic: Record<string, unknown>[] } }).__capture.mic[0]);
  expect(first).toMatchObject({ echoCancellation: false, noiseSuppression: false, autoGainControl: false });
  expect(first.channelCount).toEqual({ ideal: 2 });

  await page.getByRole('button', { name: 'Recording settings' }).click();
  await page.getByText('Voice cleanup', { exact: true }).click();
  await page.keyboard.press('Escape');
  await recordFor(page, 400);
  // The second take continues the selected track.
  await expect(page.getByText(/^Recorded into audio-recording-/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('audio-track-stack-row')).toHaveCount(1);
  const second = await page.evaluate(() => (window as unknown as { __capture: { mic: Record<string, unknown>[] } }).__capture.mic[1]);
  expect(second).toMatchObject({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });

  // The choice is remembered on this device.
  await openReadyEditor(page);
  await expect(page.getByRole('checkbox', { name: /Voice cleanup/ })).toBeChecked();
});

test('device sound is recorded without the microphone', async ({ page }) => {
  await stubCapture(page);
  await openReadyEditor(page);

  const settings = page.getByTestId('audio-recording-settings');
  await settings.getByRole('button', { name: 'Device sound' }).click();
  await expect(settings.getByText(/Only the sound a tab or the computer plays/)).toBeVisible();

  await recordFor(page, 700);
  await expect(page.getByTestId('audio-track-stack-row')).toHaveCount(1, { timeout: 30_000 });

  const log = await page.evaluate(() => (window as unknown as { __capture: { mic: unknown[]; display: unknown[] } }).__capture);
  expect(log.display).toHaveLength(1);
  expect(log.mic).toHaveLength(0);
});

test('sharing a tab without its sound says how to turn the sound on', async ({ page }) => {
  await stubCapture(page, { sharedAudio: false });
  await openReadyEditor(page);

  await page.getByTestId('audio-recording-settings').getByRole('button', { name: 'Device sound' }).click();
  await page.getByRole('button', { name: 'Start recording' }).click();

  await expect(page.getByText(/No sound was shared/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop recording' })).toHaveCount(0);
});

/** Project length from the transport readout ("0:01.234 / 0:05.678"). */
async function projectSeconds(page: Page) {
  const text = (await page.getByTestId('audio-time-display').textContent()) ?? '';
  const total = text.split('/')[1]?.trim() ?? '0:00';
  const [minutes, seconds] = total.split(':');
  return Number(minutes) * 60 + Number(seconds);
}

test('recording again continues the selected track instead of adding tracks', async ({ page }) => {
  await stubCapture(page);
  await openReadyEditor(page);

  await recordFor(page, 700);
  await expect(page.getByTestId('audio-track-stack-row')).toHaveCount(1, { timeout: 30_000 });
  const firstLength = await projectSeconds(page);
  await expect(page.getByTestId('audio-record-hint')).toContainText('continue');

  await recordFor(page, 700);
  await expect(page.getByText(/^Recorded into audio-recording-/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('audio-track-stack-row')).toHaveCount(1);
  expect(await projectSeconds(page)).toBeGreaterThan(firstLength + 0.4);
});

test('recording from the middle of the selected track writes over it', async ({ page }) => {
  await stubCapture(page);
  await openReadyEditor(page);
  await page.locator('input[type="file"]').setInputFiles({ name: 'speech.wav', mimeType: 'audio/wav', buffer: createDemoAudioBuffer(3, 220) });
  await expect(page.getByTestId('audio-track-stack-row')).toHaveCount(1, { timeout: 60_000 });

  // Put the playhead a third of the way in.
  const surface = page.getByTestId('audio-track-waveform-surface').first();
  const box = (await surface.boundingBox())!;
  await page.mouse.click(box.x + box.width / 3, box.y + box.height * 0.7);
  await expect(page.getByTestId('audio-record-hint')).toContainText('over speech.wav');

  await recordFor(page, 500);
  await expect(page.getByText(/^Recorded into speech\.wav/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('audio-track-stack-row')).toHaveCount(1);
  // The take replaced audio inside the clip, so the length did not change.
  expect(await projectSeconds(page)).toBeCloseTo(3, 1);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Undo applied.')).toBeVisible();
});

test('new-track recording and Shift+R each add a track', async ({ page }) => {
  await stubCapture(page);
  await openReadyEditor(page);
  await recordFor(page, 400);
  await expect(page.getByTestId('audio-track-stack-row')).toHaveCount(1, { timeout: 30_000 });

  // Shift+R: a new track once, whatever the setting.
  await page.keyboard.press('Shift+R');
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('audio-recording-lane')).toBeVisible();
  await page.waitForTimeout(400);
  await page.keyboard.press('r');
  await expect(page.getByTestId('audio-track-stack-row')).toHaveCount(2, { timeout: 30_000 });

  // The "New track" setting does it every time.
  await page.getByRole('button', { name: 'Recording settings' }).click();
  await page.getByTestId('audio-recording-settings').getByRole('button', { name: 'New track' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('audio-record-hint')).toHaveText('Record → new track');
  await recordFor(page, 400);
  await expect(page.getByTestId('audio-track-stack-row')).toHaveCount(3, { timeout: 30_000 });
});

test.describe('on a phone', () => {
  const phone = devices['iPhone 13'];
  test.use({
    viewport: phone.viewport,
    userAgent: phone.userAgent,
    deviceScaleFactor: phone.deviceScaleFactor,
    isMobile: phone.isMobile,
    hasTouch: phone.hasTouch,
  });

  test('without screen sharing, device sound points to the phone screen recorder', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: undefined });
    });
    await openReadyEditor(page);
    const settings = page.getByTestId('audio-recording-settings');

    await expect(settings.getByRole('button', { name: 'Device sound' })).toBeDisabled();
    await expect(settings.getByText('Only the sound playing on a phone')).toBeVisible();
    await expect(settings.getByText(/Screen Recording/)).toBeVisible();
    await expect(settings.getByRole('link', { name: /Extract Audio/ })).toHaveAttribute('href', '/tools/video/extract-audio');
  });

  test('with screen sharing (iOS 27+), device sound can be tried and says when the phone gives no sound', async ({ page }) => {
    await stubCapture(page, { sharedAudio: false });
    await openReadyEditor(page);
    const settings = page.getByTestId('audio-recording-settings');

    await settings.getByRole('button', { name: 'Device sound' }).click();
    await expect(settings.getByText(/can share its screen/)).toBeVisible();
    await page.getByRole('button', { name: 'Start recording' }).click();
    await expect(page.getByText(/This phone shared its screen without sound/)).toBeVisible();
  });
});

test('pdf to hwpx converts the sample pdf into an hwpx package', async ({ page }) => {
  await page.goto('/tools/pdf/pdf-to-hwpx');

  await page.locator('input[type="file"]').setInputFiles('tests/fixtures/sample.pdf');
  await page.getByRole('button', { name: 'Run tool' }).click();

  await expect(page.getByText('sample.hwpx')).toBeVisible({ timeout: 60_000 });
});

test('hwpx to pdf renders extracted hangul text into pdf pages', async ({ page }) => {
  const zip = new JSZip();
  zip.file('mimetype', 'application/hwp+zip');
  zip.folder('META-INF')?.file(
    'container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container">
  <ocf:rootfiles>
    <ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>
  </ocf:rootfiles>
</ocf:container>`,
  );
  zip.folder('Contents')?.file(
    'section0.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
  <hp:p id="1" paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t>안녕하세요 JH Toolbox</hp:t></hp:run></hp:p>
  <hp:p id="2" paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t>두 번째 문단입니다.</hp:t></hp:run></hp:p>
</hs:sec>`,
  );
  const hwpxBuffer = await zip.generateAsync({ type: 'nodebuffer' });

  await page.goto('/tools/pdf/hwpx-to-pdf');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'minimal.hwpx',
    mimeType: 'application/hwp+zip',
    buffer: hwpxBuffer,
  });
  await page.getByRole('button', { name: 'Run tool' }).click();

  await expect(page.getByText('minimal.pdf')).toBeVisible({ timeout: 60_000 });
});


test.describe('audio save compatibility', () => {
  test.beforeEach(async ({ page }) => {
    // Same pinned core as production, served locally for deterministic encoding.
    // This replaces only CDN transport, never the encoder or the download.
    await page.route('https://unpkg.com/@ffmpeg/core@0.12.9/dist/umd/*', route => {
      const name = new URL(route.request().url()).pathname.split('/').pop()!;
      return route.fulfill({
        path: path.join(path.dirname(require.resolve('@ffmpeg/core')), name),
        contentType: name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
        headers: { 'access-control-allow-origin': '*' },
      });
    });
  });
  const downloadLink = (page: Page) => page.getByRole('link', { name: 'Download file / retry', exact: true });
  const panel = (page: Page) => page.getByTestId('audio-download');

  async function loadExportTrack(page: Page) {
    await openReadyEditor(page);
    await page.locator('input[type="file"]').setInputFiles({
      name: 'fallback.wav', mimeType: 'audio/wav', buffer: createDemoAudioBuffer(0.25),
    });
    await expect(page.getByTestId('audio-track-stack-row')).toHaveCount(1);
  }
  async function submitExport(page: Page, format: 'wav' | 'mp3' | 'session' = 'wav') {
    await page.getByRole('button', { name: 'Save as', exact: true }).click();
    if (format === 'session') await page.getByRole('button', { name: 'Session file', exact: true }).click();
    if (format === 'mp3') await page.getByRole('button', { name: 'Save MP3', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
  }
  async function prepare(page: Page, format: 'wav' | 'mp3' | 'session' = 'wav') {
    const oldUrl = await downloadLink(page).count() ? await downloadLink(page).getAttribute('href') : null;
    await submitExport(page, format);
    await expect(downloadLink(page)).toBeVisible({ timeout: 120_000 });
    await expect(downloadLink(page)).not.toHaveAttribute('href', oldUrl ?? '', { timeout: 120_000 });
    await expect(downloadLink(page)).toHaveAttribute('download', new RegExp(`\\.${format === 'session' ? 'jhaudio' : format}$`));
  }
  async function downloadBytes(page: Page) {
    const pending = page.waitForEvent('download');
    await downloadLink(page).click();
    const download = await pending;
    expect(await download.failure()).toBeNull();
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    expect(bytes.length).toBeGreaterThan(44);
    console.log(JSON.stringify({ download: download.suggestedFilename(), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }));
    await test.info().attach(download.suggestedFilename(), { body: bytes, contentType: 'application/octet-stream' });
    return { bytes, filename: download.suggestedFilename() };
  }
  async function checkDecoded(page: Page, bytes: Buffer, duration = 0.25) {
    // Decode only bytes received from the browser's real download event.
    const decoded = await page.evaluate(async (data) => {
      const context = new AudioContext();
      try {
        const buffer = await context.decodeAudioData(Uint8Array.from(data).buffer);
        const samples = buffer.getChannelData(0);
        return { duration: buffer.duration, channels: buffer.numberOfChannels, peak: samples.reduce((peak, sample) => Math.max(peak, sample), 0) };
      } finally { await context.close(); }
    }, [...bytes]);
    console.log(JSON.stringify({ decoded }));
    expect(decoded.duration).toBeCloseTo(duration, 2);
    expect(decoded.channels).toBe(1);
    expect(decoded.peak).toBeGreaterThan(0.2);
    expect(decoded.peak).toBeLessThan(0.4);
    return decoded;
  }
  async function observeUrls(page: Page) {
    await page.addInitScript(() => {
      const audit = { created: [] as string[], revoked: [] as string[] };
      Object.assign(window, { __exportUrls: audit });
      const create = URL.createObjectURL.bind(URL);
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = blob => { const url = create(blob); audit.created.push(url); return url; };
      URL.revokeObjectURL = url => { audit.revoked.push(url); revoke(url); };
    });
  }
  async function revoked(page: Page, url: string | null) {
    await expect.poll(() => page.evaluate(value => {
      return (window as unknown as { __exportUrls: { revoked: string[] } }).__exportUrls.revoked.includes(value!);
    }, url)).toBe(true);
  }

  for (const errorName of ['unsupported', 'SecurityError', 'NotAllowedError', 'NotSupportedError']) {
    test(`WAV has a persistent real link when picker is ${errorName}`, async ({ page }) => {
      await page.addInitScript(name => {
        Object.defineProperty(window, 'showSaveFilePicker', {
          configurable: true,
          value: name === 'unsupported' ? undefined : async () => { throw new DOMException('Unavailable', name); },
        });
      }, errorName);
      await loadExportTrack(page);
      let downloads = 0;
      page.on('download', () => { downloads += 1; });
      await prepare(page);
      expect(downloads).toBe(0);
      await expect(panel(page)).toContainText('WAV');
      await expect(panel(page)).toContainText('bytes');
      if (errorName !== 'unsupported') {
        await page.getByRole('button', { name: 'Choose save location' }).click();
        await expect(panel(page)).toContainText('The save dialog is unavailable');
        expect(downloads).toBe(0);
      }
      const first = await downloadBytes(page);
      expect(first.filename).toBe('fallback.wav');
      expect(first.bytes.subarray(0, 4).toString()).toBe('RIFF');
      expect(first.bytes.subarray(8, 12).toString()).toBe('WAVE');
      expect(first.bytes.readUInt32LE(40) + 44).toBe(first.bytes.length);
      await checkDecoded(page, first.bytes);
      await expect(panel(page)).toContainText('Download requested.');
      // Retry uses exactly the retained bytes, no new encoding/URL or timer expiry.
      const url = await downloadLink(page).getAttribute('href');
      await page.clock.install();
      await page.clock.fastForward(61_000);
      const retry = await downloadBytes(page);
      expect(retry.bytes.equals(first.bytes)).toBe(true);
      expect(await downloadLink(page).getAttribute('href')).toBe(url);
      expect(downloads).toBe(2);
      await expect(page.getByTestId('audio-track-stack-row')).toHaveCount(1);
    });
  }

  test('picker cancellation and write/close errors preserve export for retry', async ({ page }) => {
    await page.addInitScript(() => {
      let attempts = 0;
      Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async () => {
        attempts += 1;
        if (attempts === 1) throw new DOMException('', 'AbortError');
        return { createWritable: async () => ({
          write: async () => { if (attempts === 2) throw new Error('disk write failed'); },
          close: async () => { if (attempts === 3) throw new Error('disk close failed'); },
          abort: async () => {},
        }) };
      } });
    });
    await loadExportTrack(page);
    await prepare(page);
    const url = await downloadLink(page).getAttribute('href');
    const save = page.getByRole('button', { name: 'Choose save location' });
    for (const message of ['Save cancelled.', 'disk write failed', 'disk close failed', 'Finished writing the selected file.']) {
      await save.click();
      await expect(panel(page)).toContainText(message);
      expect(await downloadLink(page).getAttribute('href')).toBe(url);
      await expect(page.getByTestId('audio-track-stack-row')).toHaveCount(1);
    }
    await checkDecoded(page, (await downloadBytes(page)).bytes);
  });

  test('duplicate save clicks wait for close and close releases the retained URL', async ({ page }) => {
    await observeUrls(page);
    await page.addInitScript(() => {
      Object.assign(window, { __pickerCount: 0 });
      Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async () => {
        const state = window as unknown as { __pickerCount: number; __finishWrite: () => void; __gesture: boolean };
        state.__pickerCount += 1;
        state.__gesture = navigator.userActivation.isActive;
        return { createWritable: async () => ({ write: async () => {}, close: () => new Promise<void>(resolve => { state.__finishWrite = resolve; }) }) };
      } });
    });
    await loadExportTrack(page);
    await prepare(page);
    const url = await downloadLink(page).getAttribute('href');
    const save = page.getByRole('button', { name: 'Choose save location' });
    await save.dblclick();
    await expect(save).toBeDisabled();
    await expect(panel(page)).toContainText('Writing to the selected file...');
    expect(await page.evaluate(() => (window as unknown as { __pickerCount: number }).__pickerCount)).toBe(1);
    expect(await page.evaluate(() => (window as unknown as { __gesture: boolean }).__gesture)).toBe(true);
    await page.evaluate(() => (window as unknown as { __finishWrite: () => void }).__finishWrite());
    await expect(panel(page)).toContainText('Finished writing the selected file.');
    await page.getByRole('button', { name: 'Close exported file' }).click();
    await expect(panel(page)).toHaveCount(0);
    await revoked(page, url);
    await expect(page.getByTestId('audio-track-stack-row')).toHaveCount(1);
    await prepare(page);
    expect(await downloadLink(page).getAttribute('href')).not.toBe(url);
    await checkDecoded(page, (await downloadBytes(page)).bytes);
  });

  test('session downloads restore audio; replacement, edits and unmount release URLs', async ({ page }) => {
    await observeUrls(page);
    await loadExportTrack(page);
    await prepare(page);
    const wavUrl = await downloadLink(page).getAttribute('href');
    await prepare(page, 'session');
    await revoked(page, wavUrl);
    const sessionUrl = await downloadLink(page).getAttribute('href');
    const { bytes, filename } = await downloadBytes(page);
    expect(filename).toBe('fallback.jhaudio');
    const session = JSON.parse(bytes.toString());
    expect(session.type).toBe('jhtoolbox-audio-session');
    expect(session.tracks).toHaveLength(1);
    await checkDecoded(page, Buffer.from(session.tracks[0].audioBase64, 'base64'));
    await page.locator('input[type="file"]').setInputFiles({ name: filename, mimeType: 'application/json', buffer: bytes });
    await expect(page.getByRole('button', { name: 'fallback.wav', exact: true })).toBeVisible();
    await expect(panel(page)).toHaveCount(0);
    await revoked(page, sessionUrl);
    await prepare(page);
    const editUrl = await downloadLink(page).getAttribute('href');
    await page.getByRole('button', { name: 'Mute', exact: true }).click();
    await expect(panel(page)).toHaveCount(0);
    await revoked(page, editUrl);
    await prepare(page);
    const finalUrl = await downloadLink(page).getAttribute('href');
    // Next client navigation unmounts the editor without replacing this test realm.
    await page.getByRole('link', { name: /JH.*Toolbox/i }).first().click();
    await expect(page.getByTestId('audio-editor-shell')).toHaveCount(0);
    await revoked(page, finalUrl);
  });

  test('encoding errors retain previous export; close discards late results and duplicate encoding', async ({ page }) => {
    await observeUrls(page);
    await loadExportTrack(page);
    await prepare(page);
    const url = await downloadLink(page).getAttribute('href');
    await page.evaluate(() => {
      const original = Blob.prototype.arrayBuffer;
      Object.assign(window, { __restoreArrayBuffer: () => { Blob.prototype.arrayBuffer = original; } });
      Blob.prototype.arrayBuffer = async () => { throw new Error('synthetic encoding failure'); };
    });
    await submitExport(page, 'session');
    await expect(page.getByTestId('audio-editor-shell').getByRole('alert')).toContainText('synthetic encoding failure');
    expect(await downloadLink(page).getAttribute('href')).toBe(url);
    await expect(page.getByTestId('audio-track-stack-row')).toHaveCount(1);
    await page.evaluate(() => {
      (window as unknown as { __restoreArrayBuffer: () => void }).__restoreArrayBuffer();
      const original = Blob.prototype.arrayBuffer;
      const state = window as unknown as { __encodeCount: number; __finishEncode: () => void };
      state.__encodeCount = 0;
      Blob.prototype.arrayBuffer = async function () {
        state.__encodeCount += 1;
        await new Promise<void>(resolve => { state.__finishEncode = resolve; });
        return original.call(this);
      };
    });
    await page.getByRole('button', { name: 'Save as', exact: true }).click();
    await page.getByRole('button', { name: 'Session file', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).dblclick();
    await expect(page.getByText('Preparing export file...', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save as', exact: true })).toBeDisabled();
    expect(await page.evaluate(() => (window as unknown as { __encodeCount: number }).__encodeCount)).toBe(1);
    await page.getByRole('button', { name: 'Close exported file' }).click();
    await revoked(page, url);
    await page.evaluate(() => (window as unknown as { __finishEncode: () => void }).__finishEncode());
    await expect(page.getByText('Preparing export file...', { exact: true })).toHaveCount(0);
    await expect(panel(page)).toHaveCount(0);
    await expect(page.getByTestId('audio-track-stack-row')).toHaveCount(1);
  });

  test('synthetic shared-tab recording exports WAV, MP3 and a restorable session', async ({ page }) => {
    test.setTimeout(180_000);
    await stubCapture(page);
    await openReadyEditor(page);
    await page.getByTestId('audio-recording-settings').getByRole('button', { name: 'Device sound' }).click();
    await recordFor(page, 400);
    await expect(page.getByTestId('audio-track-stack-row')).toHaveCount(1);
    await prepare(page);
    const wav = await downloadBytes(page);
    const duration = (wav.bytes.length - 44) / (wav.bytes.readUInt32LE(24) * wav.bytes.readUInt16LE(22) * 2);
    expect(duration).toBeGreaterThan(0.2);
    expect(duration).toBeLessThan(3);
    await checkDecoded(page, wav.bytes, duration);
    await prepare(page, 'mp3');
    await checkDecoded(page, (await downloadBytes(page)).bytes, duration);
    await prepare(page, 'session');
    const session = await downloadBytes(page);
    const payload = JSON.parse(session.bytes.toString());
    expect(payload.tracks[0].source).toBe('recording');
    await checkDecoded(page, Buffer.from(payload.tracks[0].audioBase64, 'base64'), duration);
    await page.locator('input[type="file"]').setInputFiles({ name: session.filename, mimeType: 'application/json', buffer: session.bytes });
    await expect(panel(page)).toHaveCount(0);
    await expect(page.getByTestId('audio-track-stack-row')).toHaveCount(1);
  });

  test('mobile Korean download panel fits and reset releases the export', async ({ page }) => {
    await observeUrls(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await loadExportTrack(page);
    await prepare(page);
    const url = await downloadLink(page).getAttribute('href');
    await page.getByRole('button', { name: 'ko', exact: true }).click();
    const link = page.getByRole('link', { name: '파일 다운로드 / 다시 받기' });
    await expect(link).toBeVisible();
    const bounds = await panel(page).boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    await test.info().attach('mobile-download.png', { body: await page.screenshot(), contentType: 'image/png' });
    const pending = page.waitForEvent('download');
    await link.click();
    expect(await (await pending).failure()).toBeNull();
    await expect(panel(page)).toContainText('다운로드를 요청했습니다');
    await page.getByRole('button', { name: '더보기', exact: true }).click();
    await page.getByRole('button', { name: '편집기 초기화', exact: true }).click();
    await expect(panel(page)).toHaveCount(0);
    await revoked(page, url);
  });

  test('MP3 encodes real audio and downloads decodable bytes', async ({ page }) => {
    test.setTimeout(180_000);
    await loadExportTrack(page);
    await prepare(page, 'mp3');
    const { bytes, filename } = await downloadBytes(page);
    expect(filename).toBe('fallback.mp3');
    await checkDecoded(page, bytes);
    const retry = await downloadBytes(page);
    expect(retry.bytes.equals(bytes)).toBe(true);
  });
});
