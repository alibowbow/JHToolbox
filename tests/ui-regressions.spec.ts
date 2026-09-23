import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('tools directory tab selection stays put and persists across reloads', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/tools');
  await expect(page.getByRole('heading', { name: 'PDF Tools' })).toBeVisible();

  await page.getByRole('button', { name: 'Image', exact: true }).click();

  // The selection used to bounce between the new and previous tab forever, so
  // sample the content repeatedly instead of asserting a single snapshot.
  for (let sample = 0; sample < 12; sample += 1) {
    await expect(page.getByRole('heading', { name: 'Image Tools' })).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'PDF Tools' })).toHaveCount(0);
    await page.waitForTimeout(100);
  }

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Image Tools' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'PDF Tools' })).toHaveCount(0);

  expect(pageErrors).toEqual([]);
});

test('tool cards respond to hover with a lifted border and shadow', async ({ page }) => {
  await page.goto('/tools');
  const card = page.locator('a[href="/tools/pdf/pdf-merge"] article').first();
  await expect(card).toBeVisible();

  const styleOf = () =>
    card.evaluate((node) => {
      const computed = getComputedStyle(node);
      return { border: computed.borderColor, shadow: computed.boxShadow, transform: computed.transform };
    });

  const atRest = await styleOf();
  await card.hover();
  await expect.poll(async () => (await styleOf()).border).not.toBe(atRest.border);
  const hovered = await styleOf();
  expect(hovered.shadow).not.toBe(atRest.shadow);
  expect(hovered.transform).not.toBe('none');
});

test('keyboard users get one tab stop per link and a visible focus ring', async ({ page }) => {
  await page.goto('/tools');
  await expect(page.getByRole('heading', { name: 'PDF Tools' })).toBeVisible();

  // Framer's whileTap used to make the inner motion element a second tab stop.
  const focusedTags: string[] = [];
  for (let press = 0; press < 30; press += 1) {
    await page.keyboard.press('Tab');
    focusedTags.push(await page.evaluate(() => document.activeElement?.tagName ?? ''));
  }
  expect(focusedTags.filter((tag) => tag === 'DIV' || tag === 'ARTICLE')).toEqual([]);

  await page.goto('/tools/image/image-resize');
  await page.keyboard.press('Tab');
  const run = page.getByRole('button', { name: 'Run tool' });
  await run.focus();
  // Component box-shadows used to erase the shadow-based ring entirely.
  await expect
    .poll(() => run.evaluate((node) => `${getComputedStyle(node).outlineStyle} ${getComputedStyle(node).outlineWidth}`))
    .toBe('solid 2px');
});

test('file picker is reachable by keyboard and shows focus on the drop area', async ({ page }) => {
  await page.goto('/tools/pdf/pdf-compress');
  const input = page.locator('input[type="file"]');
  await expect(input).toHaveCount(1);

  let reached = false;
  for (let press = 0; press < 40 && !reached; press += 1) {
    await page.keyboard.press('Tab');
    reached = await input.evaluate((node) => node === document.activeElement);
  }
  expect(reached).toBe(true);

  const dropArea = page.locator('label', { has: input });
  await expect.poll(() => dropArea.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('solid');
});

test('dropping files skips the ones the tool cannot open', async ({ page }) => {
  await page.goto('/tools/pdf/pdf-merge');
  const dropArea = page.locator('label', { has: page.locator('input[type="file"]') });
  await expect(dropArea).toBeVisible();

  await dropArea.evaluate((node) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['not a pdf'], 'photo.png', { type: 'image/png' }));
    transfer.items.add(new File(['%PDF-1.4'], 'report.pdf', { type: 'application/pdf' }));
    node.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
  });

  await expect(page.getByText('Skipped files this tool cannot open: photo.png')).toBeVisible();
  await expect(page.getByText('report.pdf').first()).toBeVisible();
  await expect(page.getByText('photo.png', { exact: true })).toHaveCount(0);
});

test('image OCR defaults to Korean + English', async ({ page }) => {
  await page.goto('/tools/ocr/ocr-image-to-text');
  await expect(page.getByLabel('OCR language')).toHaveValue('kor+eng');
});

test('full-page capture keeps looking when a service returns only the first screen', async ({ page }) => {
  await page.goto('/tools/web/url-image');
  const makeImage = (width: number, height: number, type: string) =>
    page.evaluate(
      ({ w, h, mime }) => {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#e2e8f0';
        context.fillRect(0, 0, w, h);
        return canvas.toDataURL(mime, 0.8).split(',')[1];
      },
      { w: width, h: height, mime: type },
    );
  // The real scroll comes back as JPEG: its size is not in a PNG header, so it
  // must be decoded rather than counted as zero height.
  const viewportOnly = Buffer.from(await makeImage(1200, 800, 'image/png'), 'base64');
  const fullScroll = Buffer.from(await makeImage(1200, 3000, 'image/jpeg'), 'base64');

  const requested: string[] = [];
  await page.route('https://api.microlink.io/**', async (route) => {
    requested.push('microlink');
    await route.fulfill({ status: 200, contentType: 'image/png', body: viewportOnly });
  });
  await page.route('https://image.thum.io/**', async (route) => {
    requested.push('thum.io');
    await route.fulfill({ status: 200, contentType: 'image/jpeg', body: fullScroll });
  });
  await page.route('https://images.weserv.nl/**', async (route) => {
    requested.push('weserv');
    await route.fulfill({ status: 404, body: '' });
  });

  await page.getByRole('textbox').first().fill('https://example.com');
  await page.getByRole('button', { name: 'Run tool' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download original' }).click();
  const download = await downloadPromise;
  const bytes = readFileSync((await download.path())!);

  expect(bytes.equals(fullScroll)).toBe(true);
  expect(requested).toEqual(['microlink', 'thum.io']);
});
