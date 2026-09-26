import { devices, expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';

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
  await expect(page.getByTestId('audio-recording-lane')).toBeVisible();
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
  await expect(page.getByTestId('audio-track-stack-row')).toHaveCount(2, { timeout: 30_000 });
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

test.describe('on a phone', () => {
  const phone = devices['iPhone 13'];
  test.use({
    viewport: phone.viewport,
    userAgent: phone.userAgent,
    deviceScaleFactor: phone.deviceScaleFactor,
    isMobile: phone.isMobile,
    hasTouch: phone.hasTouch,
  });

  test('device sound points to the phone screen recorder instead', async ({ page }) => {
    await openReadyEditor(page);
    const settings = page.getByTestId('audio-recording-settings');

    await expect(settings.getByRole('button', { name: 'Device sound' })).toBeDisabled();
    await expect(settings.getByText('Only the sound playing on a phone')).toBeVisible();
    await expect(settings.getByText(/Screen Recording/)).toBeVisible();
    await expect(settings.getByRole('link', { name: /Extract Audio/ })).toHaveAttribute('href', '/tools/video/extract-audio');
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
