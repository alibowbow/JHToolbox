import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/** A 64x64 PNG whose left half is opaque red and right half fully transparent. */
async function createHalfTransparentPng(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.fillStyle = 'rgb(220, 20, 20)';
    context.fillRect(0, 0, 32, 64);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  return Buffer.from(base64, 'base64');
}

async function samplePixel(page: Page, bytes: Buffer, mimeType: string, x: number, y: number) {
  return await page.evaluate(
    async ({ base64, type, px, py }) => {
      const binary = atob(base64);
      const data = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([data], { type }));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      return Array.from(context.getImageData(px, py, 1, 1).data);
    },
    { base64: bytes.toString('base64'), type: mimeType, px: x, py: y },
  );
}

test('png-jpg paints transparent areas white instead of black', async ({ page }) => {
  await page.goto('/tools/image/png-jpg');
  const png = await createHalfTransparentPng(page);

  await page.locator('input[type="file"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'Run tool' }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('logo.jpg');
  const jpg = readFileSync((await download.path())!);

  const [r, g, b] = await samplePixel(page, jpg, 'image/jpeg', 48, 32);
  expect(Math.min(r, g, b)).toBeGreaterThan(235);

  const [red, green, blue] = await samplePixel(page, jpg, 'image/jpeg', 12, 32);
  expect(red).toBeGreaterThan(180);
  expect(Math.max(green, blue)).toBeLessThan(80);
});

test('image tools keep a JPG input as JPG', async ({ page }) => {
  await page.goto('/tools/image/image-rotate');
  const jpeg = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 20;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#4f46e5';
    context.fillRect(0, 0, 40, 20);
    return canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
  });
  await page.locator('input[type="file"]').setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg, 'base64') });
  await page.getByRole('button', { name: 'Run tool' }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('photo-rotated.jpg');
});

test('image text lands where it was placed in the preview', async ({ page }) => {
  await page.goto('/tools/image/image-add-text');
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 400;
    const context = canvas.getContext('2d')!;
    context.fillStyle = 'rgb(20, 40, 160)';
    context.fillRect(0, 0, 800, 400);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('input[type="file"]').setInputFiles({ name: 'banner.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.getByLabel('Text', { exact: true }).fill('████');
  await page.getByLabel('Font size').fill('80');

  // Tap the middle-right of the picture: the text's top-left moves there.
  await expect(page.getByTestId('image-add-text-item')).toBeVisible({ timeout: 30_000 });
  const stage = page.getByTestId('image-add-text-stage');
  const box = (await stage.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.getByRole('button', { name: 'Run tool' }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).first().click();
  const bytes = readFileSync((await (await downloadPromise).path())!);
  const placed = await samplePixel(page, bytes, 'image/png', 440, 240);
  const oldDefault = await samplePixel(page, bytes, 'image/png', 40, 80);
  expect(placed[0]).toBeGreaterThan(200);
  expect(oldDefault[0]).toBeLessThan(60);
});

test('a result can go straight into another tool', async ({ page }) => {
  await page.goto('/tools/image/image-resize');
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 200;
    canvas.getContext('2d')!.fillRect(0, 0, 300, 200);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('input[type="file"]').setInputFiles({ name: 'chart.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.getByRole('button', { name: 'Run tool' }).click();

  await page.getByTestId('continue-menu-button').first().click();
  await page.getByRole('menuitem', { name: /Compress Image/ }).click();

  await expect(page).toHaveURL(/\/tools\/image\/image-compress$/);
  // The resized result is already added — no download and re-upload.
  await expect(page.getByText(/^chart-\d+x\d+\.png$/)).toBeVisible();
});
