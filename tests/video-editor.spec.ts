import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/** A mono 16-bit WAV of a tone, `seconds` long. */
function toneWav(seconds: number) {
  const rate = 8000;
  const frames = Math.round(seconds * rate);
  const wav = Buffer.alloc(44 + frames * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + frames * 2, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(frames * 2, 40);
  for (let index = 0; index < frames; index += 1) {
    wav.writeInt16LE(Math.round(Math.sin((index / rate) * 2 * Math.PI * 440) * 16000), 44 + index * 2);
  }
  return wav;
}

/** A 4-second WebM with a tone, and a portrait PNG, made in the page. */
async function makeMedia(page: Page) {
  const encoded = await page.evaluate(async () => {
    const toBase64 = async (blob: Blob) => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let text = '';
      for (let index = 0; index < bytes.length; index += 1) text += String.fromCharCode(bytes[index]);
      return btoa(text);
    };
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const context = canvas.getContext('2d')!;
    const stream = canvas.captureStream(30);
    const audio = new AudioContext();
    const tone = audio.createOscillator();
    tone.frequency.value = 220;
    const destination = audio.createMediaStreamDestination();
    tone.connect(destination);
    tone.start();
    destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
    const type = ['video/webm;codecs=vp8,opus', 'video/webm'].find((candidate) => MediaRecorder.isTypeSupported(candidate))!;
    const recorder = new MediaRecorder(stream, { mimeType: type });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const stopped = new Promise((resolve) => (recorder.onstop = resolve));
    recorder.start(200);
    let frame = 0;
    const timer = setInterval(() => {
      context.fillStyle = `hsl(${(frame * 6) % 360} 70% 50%)`;
      context.fillRect(0, 0, 640, 360);
      context.fillStyle = '#fff';
      context.font = 'bold 64px sans-serif';
      context.fillText(`Clip ${frame++}`, 40, 120);
    }, 33);
    await new Promise((resolve) => setTimeout(resolve, 4000));
    recorder.stop();
    await stopped;
    clearInterval(timer);
    tone.stop();

    const photo = document.createElement('canvas');
    photo.width = 1080;
    photo.height = 1350;
    const paint = photo.getContext('2d')!;
    paint.fillStyle = '#7c3aed';
    paint.fillRect(0, 0, 1080, 1350);
    const png = await new Promise<Blob>((resolve) => photo.toBlob((blob) => resolve(blob!), 'image/png'));
    return { video: await toBase64(new Blob(chunks)), photo: await toBase64(png) };
  });
  return { video: Buffer.from(encoded.video, 'base64'), photo: Buffer.from(encoded.photo, 'base64') };
}

async function openEditor(page: Page) {
  await page.goto('/tools/video/video-editor');
  await expect(page.locator('[data-testid="video-editor"][data-ready="true"]')).toBeVisible({ timeout: 60_000 });
  const media = await makeMedia(page);
  await page.getByTestId('ve-media-input').setInputFiles([
    { name: 'clip.webm', mimeType: 'video/webm', buffer: media.video },
    { name: 'photo.png', mimeType: 'image/png', buffer: media.photo },
    { name: 'song.wav', mimeType: 'audio/wav', buffer: toneWav(5) },
  ]);
  await expect(page.getByTestId('ve-clip-1')).toBeVisible({ timeout: 30_000 });
}

const total = async (page: Page) => (await page.getByTestId('ve-time').textContent())!.split('/')[1].trim();

test('video editor: clips line up, split, reorder, speed, delete, undo', async ({ page }) => {
  await openEditor(page);
  // Video (about 4 s) then the photo (3 s), and the song on the music track.
  await expect(page.locator('[data-testid^="ve-music-m"]')).toHaveCount(1);
  const start = await total(page);

  // Split the video at 2 s.
  await page.getByTestId('ve-preview').click({ position: { x: 4, y: 4 } });
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.getByTestId('ve-split').click();
  await expect(page.getByTestId('ve-clip-2')).toBeVisible();
  expect(await total(page)).toBe(start);

  // Drag the photo (last) to the front.
  const photo = (await page.getByTestId('ve-clip-2').boundingBox())!;
  const first = (await page.getByTestId('ve-clip-0').boundingBox())!;
  const y = photo.y + photo.height / 2;
  await page.mouse.move(photo.x + photo.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(first.x + 8, y, { steps: 8 });
  await expect(page.getByTestId('ve-drop-marker')).toBeVisible();
  await page.mouse.up();
  await expect(page.getByTestId('ve-clip-0').locator('img')).toHaveAttribute('src', /^blob:/);

  // Twice as fast: the second clip, and with it the whole edit, gets shorter.
  await page.getByTestId('ve-clip-1').click();
  await page.getByTestId('ve-speed').getByRole('button', { name: '2x', exact: true }).click();
  const faster = await total(page);
  expect(faster).not.toBe(start);

  // Delete it, then undo twice: the speed change and the delete are undone.
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('ve-clip-2')).toHaveCount(0);
  await page.getByTestId('ve-undo').click();
  await expect(page.getByTestId('ve-clip-2')).toBeVisible();
  await page.getByTestId('ve-undo').click();
  expect(await total(page)).toBe(start);
  await page.getByTestId('ve-redo').click();
  expect(await total(page)).toBe(faster);
});

test('video editor: text, 9:16 and export to a playable video with sound', async ({ page }) => {
  test.setTimeout(180_000);
  await openEditor(page);
  await page.getByTestId('ve-preview').click({ position: { x: 4, y: 4 } });
  await page.getByTestId('ve-aspect').getByRole('button', { name: '9:16' }).click();
  expect(await page.getByTestId('ve-preview').evaluate((canvas: HTMLCanvasElement) => [canvas.width, canvas.height])).toEqual([720, 1280]);
  await page.getByTestId('ve-transition').getByRole('button', { name: 'Fade' }).click();

  await page.getByTestId('ve-add-text').click();
  await page.getByTestId('ve-text-input').fill('Hello');
  await expect(page.locator('[data-testid^="ve-text-t"]').filter({ hasText: 'Hello' })).toBeVisible();

  const projectSeconds = await total(page);
  const download = page.waitForEvent('download', { timeout: 120_000 });
  await page.getByTestId('ve-export').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^video-edit-\d+\.(mp4|webm)$/);
  await expect(page.getByTestId('ve-export-done')).toBeVisible();

  const bytes = readFileSync((await file.path())!);
  const result = await page.evaluate(async ({ base64, type }) => {
    const data = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const video = document.createElement('video');
    video.muted = true;
    video.src = URL.createObjectURL(new Blob([data], { type }));
    await new Promise((resolve) => (video.onloadedmetadata = resolve));
    let duration = video.duration;
    if (!Number.isFinite(duration)) {
      video.currentTime = 1e6;
      await new Promise((resolve) => (video.ontimeupdate = resolve));
      duration = video.duration;
    }
    const sound = await new AudioContext().decodeAudioData(data.buffer.slice(0)).then((buffer) => buffer.duration, () => 0);
    return { width: video.videoWidth, height: video.videoHeight, duration, sound };
  }, { base64: bytes.toString('base64'), type: file.suggestedFilename().endsWith('mp4') ? 'video/mp4' : 'video/webm' });

  const [minutes, seconds] = projectSeconds.split(':').map(Number);
  const expected = minutes * 60 + seconds;
  expect([result.width, result.height]).toEqual([720, 1280]);
  expect(result.duration).toBeGreaterThan(expected - 0.6);
  expect(result.duration).toBeLessThan(expected + 1.5);
  expect(result.sound).toBeGreaterThan(expected - 1);
});
