import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import path from 'path';

const samplePdfPath = path.join(__dirname, 'fixtures', 'sample.pdf');

test('pdf-to-png processes a PDF without worker errors', async ({ page }) => {
  const pageErrors: string[] = [];

  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  await page.goto('/tools/pdf/pdf-to-png');
  await page.locator('input[type="file"]').setInputFiles(samplePdfPath);
  await page.getByRole('button', { name: 'Run tool' }).click();

  await expect(page.getByText('sample-page-1.png')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/GlobalWorkerOptions\.workerSrc/)).toHaveCount(0);
  expect(pageErrors).not.toContainEqual(expect.stringContaining('GlobalWorkerOptions.workerSrc'));
});

test('ocr pdf-to-text extracts text from the sample PDF', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://127.0.0.1:3100',
  });
  await page.goto('/tools/ocr/ocr-pdf-to-text');
  await page.locator('input[type="file"]').setInputFiles(samplePdfPath);
  await page.getByRole('button', { name: 'Run tool' }).click();

  await expect(page.getByText('sample.txt')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('pre').first()).toContainText('Sample PDF Page 1', { timeout: 30_000 });
  await expect(page.locator('pre').first()).toContainText('Sample PDF Page 3', { timeout: 30_000 });
  await page.getByTestId('result-copy-text').click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('Sample PDF Page 1');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('Sample PDF Page 3');
});

async function downloadFirstResult(page: Page): Promise<{ name: string; bytes: Buffer }> {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).first().click();
  const download = await downloadPromise;
  return { name: download.suggestedFilename(), bytes: readFileSync((await download.path())!) };
}

/** Decodes an image in the browser and returns RGBA for each requested point. */
async function readPixels(page: Page, png: Buffer, points: Array<[number, number]>) {
  return await page.evaluate(
    async ({ base64, pts }) => {
      const data = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([data], { type: 'image/png' }));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      return pts.map(([x, y]) => Array.from(context.getImageData(x, y, 1, 1).data));
    },
    { base64: png.toString('base64'), pts: points },
  );
}

test('edit-pdf highlight is yellow and keeps the text under it legible', async ({ page }) => {
  await page.goto('/tools/pdf/edit-pdf');
  await page.locator('input[type="file"]').setInputFiles(samplePdfPath);
  await page.getByLabel('Edit type').selectOption('highlight');
  // Cover "Sample PDF Page 1" (x=48, baseline y=520, 28pt on a 420x594pt page).
  await page.getByLabel('X', { exact: true }).fill('40');
  await page.getByLabel('Y', { exact: true }).fill('510');
  await page.getByLabel('Width', { exact: true }).fill('280');
  await page.getByLabel('Height', { exact: true }).fill('40');
  await page.getByRole('button', { name: 'Run tool' }).click();
  const edited = await downloadFirstResult(page);
  expect(edited.name).toBe('sample-edited.pdf');

  // Render the edited page with the app's own PDF-to-PNG tool (scale 2).
  await page.goto('/tools/pdf/pdf-to-png');
  await page.locator('input[type="file"]').setInputFiles({ name: 'edited.pdf', mimeType: 'application/pdf', buffer: edited.bytes });
  await page.getByRole('button', { name: 'Run tool' }).click();
  await expect(page.getByText('edited-page-1.png')).toBeVisible({ timeout: 30_000 });
  const rendered = await downloadFirstResult(page);

  const toImage = (x: number, y: number): [number, number] => [x * 2, (594 - y) * 2];
  // Blank paper inside the highlight, right of the text.
  const [[r, g, b]] = await readPixels(page, rendered.bytes, [toImage(312, 530)]);
  expect(r).toBeGreaterThan(220);
  expect(g).toBeGreaterThan(190);
  expect(b).toBeLessThan(160);

  // Darkest glyph pixel under the highlight: multiply blending keeps ink dark,
  // whereas a plain translucent fill washes it out to ~145 luminance.
  const glyphPoints: Array<[number, number]> = [];
  for (let x = 50; x < 300; x += 1) {
    for (let y = 521; y < 540; y += 2) {
      glyphPoints.push(toImage(x, y));
    }
  }
  const glyphPixels = await readPixels(page, rendered.bytes, glyphPoints);
  const darkest = Math.min(...glyphPixels.map(([pr, pg, pb]) => 0.2126 * pr + 0.7152 * pg + 0.0722 * pb));
  expect(darkest).toBeLessThan(90);
});

test('pdf-rearrange removes deleted pages and reports which ones', async ({ page }) => {
  await page.goto('/tools/pdf/pdf-rearrange');
  await page.locator('input[type="file"]').setInputFiles(samplePdfPath);
  await expect(page.getByText(/Visible pages: 3/)).toBeVisible({ timeout: 60_000 });

  await page.getByRole('button', { name: 'Remove page 2' }).click();
  await expect(page.getByText(/Visible pages: 2/)).toBeVisible();
  await page.getByRole('button', { name: 'Run tool' }).click();

  const result = await downloadFirstResult(page);
  expect(result.name).toBe('sample-rearranged.pdf');
  const { PDFDocument } = await import('pdf-lib');
  expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(2);

  const removedTerm = page.locator('dt', { hasText: /removed pages/i });
  await expect(removedTerm).toBeVisible();
  await expect(removedTerm.locator('xpath=following-sibling::dd[1]')).toHaveText('2');
});

test('pipeline rearrange refuses page numbers the PDF does not have', async ({ page }) => {
  await page.goto('/pipeline');
  await page.locator('input[type="file"]').setInputFiles(samplePdfPath);
  await page.getByLabel('Add step').selectOption('pdf-rearrange');

  const order = page.getByLabel('Pages to keep, in order');
  await order.fill('3,9');
  await page.getByRole('button', { name: 'Run pipeline' }).click();
  await expect(page.getByText(/Failed at step: .*not pages of this 3-page PDF: 9\./)).toBeVisible({ timeout: 30_000 });

  await order.fill('3~1');
  await page.getByRole('button', { name: 'Run pipeline' }).click();
  await expect(page.getByText('Pipeline complete.')).toBeVisible({ timeout: 30_000 });
  const result = await downloadFirstResult(page);
  const { PDFDocument } = await import('pdf-lib');
  expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(3);
});
