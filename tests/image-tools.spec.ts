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
