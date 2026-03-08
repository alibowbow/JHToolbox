import { expect, test } from '@playwright/test';
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
  await page.goto('/tools/ocr/ocr-pdf-to-text');
  await page.locator('input[type="file"]').setInputFiles(samplePdfPath);
  await page.getByRole('button', { name: 'Run tool' }).click();

  await expect(page.getByText('sample.txt')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('pre').first()).toContainText('Sample PDF Page 1', { timeout: 30_000 });
  await expect(page.locator('pre').first()).toContainText('Sample PDF Page 3', { timeout: 30_000 });
});
