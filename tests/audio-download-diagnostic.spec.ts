import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const route = '/tools/audio/download-diagnostic';

async function downloadFile(page: Page, kind: 'Blob URL' | 'data URI', destination: string) {
  const event = page.waitForEvent('download');
  await page.getByRole('link', { name: `${kind} 다운로드 / 재시도`, exact: true }).click();
  const download = await event;
  expect(await download.failure()).toBeNull();
  await download.saveAs(destination);
  const bytes = await readFile(destination);
  console.log(JSON.stringify({ filename: download.suggestedFilename(), path: destination, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }));
  return bytes;
}

function checkWav(bytes: Buffer, seconds: number, channels: number) {
  expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
  expect(bytes.toString('ascii', 8, 12)).toBe('WAVE');
  expect(bytes.readUInt16LE(20)).toBe(1);
  expect(bytes.readUInt16LE(22)).toBe(channels);
  expect(bytes.readUInt32LE(24)).toBe(44_100);
  expect(bytes.readUInt16LE(34)).toBe(16);
  expect(bytes.length).toBe(44 + 44_100 * seconds * channels * 2);
  expect(bytes.readUInt32LE(40)).toBe(bytes.length - 44);
  // Decode PCM samples across the saved file, including independent stereo tones.
  for (const frame of [1000, 30_001, Math.floor(seconds * 44_100 / 2) + 11, seconds * 44_100 - 1000]) {
    for (let channel = 0; channel < channels; channel++) {
      const expected = Math.round(Math.sin(2 * Math.PI * (channel ? 660 : 440) * frame / 44_100) * 8192);
      expect(bytes.readInt16LE(44 + (frame * channels + channel) * 2)).toBe(expected);
    }
  }
}

async function generateSmall(page: Page) {
  await page.goto(route);
  await page.getByRole('button', { name: '합성 파일 생성', exact: true }).click();
  await expect(page.getByTestId('fixture-bytes')).toHaveText('176,444');
  await page.getByRole('button', { name: 'data URI 준비', exact: false }).click();
  await expect(page.getByRole('link', { name: 'data URI 다운로드 / 재시도', exact: true })).toBeVisible();
}

test('tiny real downloads are identical, retry is stable, and closing removes links', async ({ page }, info) => {
  const unsolicited: string[] = [];
  page.on('download', download => unsolicited.push(download.suggestedFilename()));
  await generateSmall(page);
  expect(unsolicited).toEqual([]);
  const blob = await downloadFile(page, 'Blob URL', info.outputPath('tiny-blob.wav'));
  const data = await downloadFile(page, 'data URI', info.outputPath('tiny-data.wav'));
  checkWav(blob, 2, 1);
  expect(data.equals(blob)).toBe(true);
  const retry = await downloadFile(page, 'data URI', info.outputPath('tiny-retry.wav'));
  expect(retry.equals(blob)).toBe(true);
  await expect(page.getByTestId('diagnostic-status')).toContainText('실제 저장 여부는 이 페이지에서 확인할 수 없습니다');
  await page.getByRole('button', { name: '취소 / 파일 닫기' }).click();
  await expect(page.getByTestId('diagnostic-file')).toHaveCount(0);
});

for (const item of [
  { id: '180-wav', seconds: 180, format: 'wav' },
  { id: '240-wav', seconds: 240, format: 'wav' },
  { id: '180-mp3', seconds: 180, format: 'mp3' },
  { id: '240-mp3', seconds: 240, format: 'mp3' },
]) {
  test(`${item.id} stereo downloads have identical bytes and decoded duration`, async ({ page }, info) => {
    test.setTimeout(180_000);
    // Only the pinned encoder transport is supplied locally; no audio or download is mocked.
    await page.route('https://unpkg.com/@ffmpeg/core@0.12.9/dist/umd/*', request => request.fulfill({
      path: path.resolve('node_modules/@ffmpeg/core/dist/umd', new URL(request.request().url()).pathname.split('/').pop()!),
      contentType: request.request().url().endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
    }));
    await generateSmall(page);
    const small = await downloadFile(page, 'data URI', info.outputPath('confirmed-small.wav'));
    checkWav(small, 2, 1);
    await page.getByRole('checkbox').check();
    await page.getByLabel('시험 크기 / 형식').selectOption(item.id);
    await expect(page.getByTestId('diagnostic-file')).toHaveCount(0);
    await page.getByRole('button', { name: '합성 파일 생성', exact: true }).click();
    await expect(page.getByTestId('diagnostic-file')).toBeVisible({ timeout: 120_000 });
    const blob = await downloadFile(page, 'Blob URL', info.outputPath(`stereo-blob.${item.format}`));
    await page.getByRole('button', { name: 'data URI 준비', exact: false }).click();
    await expect(page.getByRole('link', { name: 'data URI 다운로드 / 재시도', exact: true })).toBeVisible();
    const data = await downloadFile(page, 'data URI', info.outputPath(`stereo-data.${item.format}`));
    expect(data.equals(blob)).toBe(true);
    if (item.format === 'wav') checkWav(data, item.seconds, 2);
    // Decode bytes read from the actual saved file, never from an app Blob or link.
    const decoded = await page.evaluate(async base64 => {
      const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
      const context = new OfflineAudioContext(2, 1, 44_100);
      const buffer = await context.decodeAudioData(bytes.buffer);
      return { seconds: buffer.duration, channels: buffer.numberOfChannels, sampleRate: buffer.sampleRate };
    }, data.toString('base64'));
    expect(decoded.seconds).toBeCloseTo(item.seconds, 2);
    expect(decoded.channels).toBe(2);
    expect(decoded.sampleRate).toBe(44_100);
    console.log(JSON.stringify({ case: item.id, decoded }));
    await page.getByRole('button', { name: '취소 / 파일 닫기' }).click();
    await expect(page.getByTestId('diagnostic-file')).toHaveCount(0);
  });
}

test('large phase is opt-in; cancellation, encoder failure and retry leave no stale links', async ({ page }) => {
  await page.goto(route);
  await expect(page.getByRole('checkbox')).toBeDisabled();
  await expect(page.locator('option[value="240-wav"]')).toBeDisabled();
  await generateSmall(page);
  await page.getByRole('checkbox').check();
  await page.getByLabel('시험 크기 / 형식').selectOption('240-wav');
  await page.getByRole('button', { name: '합성 파일 생성', exact: true }).click();
  await expect(page.getByRole('button', { name: '합성 파일 생성', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '취소 / 파일 닫기' }).click();
  await expect(page.getByTestId('diagnostic-status')).toContainText('파일과 링크를 정리');
  await expect(page.getByTestId('diagnostic-file')).toHaveCount(0);
  await page.route('https://unpkg.com/@ffmpeg/core@0.12.9/dist/umd/*', request => request.fulfill({ status: 503, body: 'Unavailable' }));
  await page.getByLabel('시험 크기 / 형식').selectOption('180-mp3');
  await page.getByRole('button', { name: '합성 파일 생성', exact: true }).click();
  await expect(page.getByTestId('diagnostic-status')).toContainText('HTTP 503', { timeout: 30_000 });
  await expect(page.getByTestId('diagnostic-file')).toHaveCount(0);
  await page.getByLabel('시험 크기 / 형식').selectOption('2-wav');
  await page.getByRole('button', { name: '합성 파일 생성', exact: true }).click();
  await expect(page.getByTestId('fixture-bytes')).toHaveText('176,444');
});
