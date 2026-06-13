import { expect, test } from '@playwright/test';
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
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
});

test('split at playhead creates a second clip and cut/paste works through the clipboard', async ({ page }) => {
  await page.goto('/tools/audio', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('main')).toBeVisible({ timeout: 60_000 });

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
