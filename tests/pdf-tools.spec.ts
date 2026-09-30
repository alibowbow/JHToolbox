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
  await page.getByRole('button', { name: 'Download', exact: true }).or(page.getByRole('link', { name: 'Download', exact: true })).first().click();
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
  // Cover "Sample PDF Page 1" (x=48, baseline y=520, 28pt on a 420x594pt page).
  // The box is normally dragged on the page; a link can preset it too.
  await page.goto('/tools/pdf/edit-pdf?editType=highlight&pageNumber=1&x=40&y=510&width=280&height=40');
  await page.locator('input[type="file"]').setInputFiles(samplePdfPath);
  await expect(page.getByTestId('edit-pdf-box')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Run tool' }).click();
  const edited = await downloadFirstResult(page);
  expect(edited.name).toBe('sample-edited.pdf');

  // Render the edited page with the app's own PDF-to-PNG tool (scale 2).
  await page.goto('/tools/pdf/pdf-to-png');
  await page.locator('input[type="file"]').setInputFiles({ name: 'edited.pdf', mimeType: 'application/pdf', buffer: edited.bytes });
  await page.getByRole('button', { name: 'Run tool' }).click();
  await expect(page.getByText('edited-page-1.png')).toBeVisible({ timeout: 30_000 });
  const rendered = await downloadFirstResult(page);

  // PDF to Image renders at 150 DPI by default.
  const scale = 150 / 72;
  const toImage = (x: number, y: number): [number, number] => [Math.round(x * scale), Math.round((594 - y) * scale)];
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
  await expect(page.getByText(/not pages of this 3-page PDF: 9\./)).toBeVisible({ timeout: 30_000 });

  await order.fill('3~1');
  await page.getByRole('button', { name: 'Run pipeline' }).click();
  await expect(page.getByRole('link', { name: 'Download', exact: true }).first()).toBeVisible({ timeout: 30_000 });
  const result = await downloadFirstResult(page);
  const { PDFDocument } = await import('pdf-lib');
  expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(3);
});

function ascii85(bytes: Uint8Array): Uint8Array {
  let text = '';
  for (let offset = 0; offset < bytes.length; offset += 4) {
    const count = Math.min(4, bytes.length - offset);
    let value = 0;
    for (let index = 0; index < 4; index += 1) value = value * 256 + (bytes[offset + index] ?? 0);
    if (count === 4 && value === 0) { text += 'z'; continue; }
    let digits = '';
    for (let index = 0; index < 5; index += 1) {
      digits = String.fromCharCode(value % 85 + 33) + digits;
      value = Math.floor(value / 85);
    }
    text += digits.slice(0, count + 1);
  }
  return new TextEncoder().encode(text + '~>');
}

for (const wrapper of ['ASCII85Decode', 'ASCIIHexDecode']) {
  test(`email PDF job shrinks ${wrapper}-wrapped JPEGs and preserves text`, async ({ page }) => {
    await page.goto('/pipeline?preset=pdfs-for-email');
    await expect(page.getByTestId('pipeline-task')).toBeVisible({ timeout: 60_000 });
    const jpeg = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1200; canvas.height = 800;
      const context = canvas.getContext('2d')!;
      const image = context.createImageData(canvas.width, canvas.height);
      let seed = 42;
      for (let offset = 0; offset < image.data.length; offset += 4) {
        for (let channel = 0; channel < 3; channel += 1) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          image.data[offset + channel] = seed >>> 24;
        }
        image.data[offset + 3] = 255;
      }
      context.putImageData(image, 0, 0);
      return canvas.toDataURL('image/jpeg', 1).split(',')[1];
    }), 'base64');
    const { PDFDocument, PDFName, PDFRawStream } = await import('pdf-lib');
    const source = await PDFDocument.create();
    const image = await source.embedJpg(jpeg);
    const paper = source.addPage([612, 792]);
    paper.drawImage(image, { x: 36, y: 100, width: 540, height: 360 });
    paper.drawText('Text must remain selectable', { x: 36, y: 730 });
    await source.flush();
    const stream = source.context.lookup(image.ref);
    if (!(stream instanceof PDFRawStream)) throw new Error('JPEG stream was not embedded');
    const dict = stream.dict.clone();
    dict.set(PDFName.of('Filter'), source.context.obj([PDFName.of(wrapper), PDFName.of('DCTDecode')]));
    const encoded = wrapper === 'ASCII85Decode' ? ascii85(jpeg) : new TextEncoder().encode(jpeg.toString('hex') + '>');
    source.context.assign(image.ref, PDFRawStream.of(dict, encoded));
    const input = Buffer.from(await source.save());
    await page.locator('input[type="file"]').setInputFiles({ name: 'wrapped.pdf', mimeType: 'application/pdf', buffer: input });
    await page.getByTestId('pipeline-run').click();
    const result = await downloadFirstResult(page);
    expect(result.bytes.length).toBeLessThan(input.length * 0.7);
    const reduced = await PDFDocument.load(result.bytes);
    expect(reduced.getPageCount()).toBe(1);
    const images = reduced.context.enumerateIndirectObjects().filter(([, object]) =>
      object instanceof PDFRawStream && object.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'));
    expect(images).toHaveLength(1);
    const outputImage = images[0][1] as import('pdf-lib').PDFRawStream;
    expect(outputImage.dict.get(PDFName.of('Filter'))).toBe(PDFName.of('DCTDecode'));
    expect(Array.from(outputImage.getContents().slice(0, 2))).toEqual([0xff, 0xd8]);
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const pdfHandle = await pdfjs.getDocument({ data: new Uint8Array(result.bytes), useWorkerFetch: false, isEvalSupported: false }).promise;
    const text = await (await pdfHandle.getPage(1)).getTextContent();
    expect(text.items.map((item) => 'str' in item ? item.str : '').join(' ')).toContain('Text must remain selectable');
    await pdfHandle.destroy();
  });
}

test('a ready-made job runs from its own view', async ({ page }) => {
  await page.goto('/pipeline');
  await expect(page.locator('[data-testid="pipeline-builder"][data-ready="true"]')).toBeVisible({ timeout: 60_000 });

  await page.getByTestId('pipeline-preset-submission-pdf').click();
  const task = page.getByTestId('pipeline-task');
  await expect(task.getByRole('heading', { name: 'One submission PDF with page numbers' })).toBeVisible();
  // Only the job is left on the page: the builder steps aside.
  await expect(page.getByRole('heading', { name: 'Build your own' })).toHaveCount(0);
  await expect(task.getByLabel('First page number')).toHaveValue('1');

  const pdf = readFileSync(samplePdfPath);
  await task.locator('input[type="file"]').setInputFiles([
    { name: 'part-1.pdf', mimeType: 'application/pdf', buffer: pdf },
    { name: 'part-2.pdf', mimeType: 'application/pdf', buffer: pdf },
  ]);
  await page.getByTestId('pipeline-run').click();

  const result = await downloadFirstResult(page);
  expect(result.name).toBe('merged-numbered.pdf');
  const { PDFDocument } = await import('pdf-lib');
  expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(6);

  await page.getByRole('button', { name: 'All jobs' }).click();
  await expect(page.getByTestId('pipeline-task')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Build your own' })).toBeVisible();
});

test('photos ready to post: only large photos shrink, all become JPG', async ({ page }) => {
  await page.goto('/pipeline?preset=photos-for-posting');
  await expect(page.locator('[data-testid="pipeline-builder"][data-ready="true"]')).toBeVisible({ timeout: 60_000 });
  const task = page.getByTestId('pipeline-task');
  const longest = task.getByLabel('Longest side (px)');
  await expect(longest).toHaveValue('1920');
  await longest.fill('1200');

  const png = async (width: number, height: number) =>
    Buffer.from(
      await page.evaluate(
        ({ w, h }) => {
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const context = canvas.getContext('2d')!;
          context.fillStyle = 'rgb(40, 120, 200)';
          context.fillRect(0, 0, w, h);
          return canvas.toDataURL('image/png').split(',')[1];
        },
        { w: width, h: height },
      ),
      'base64',
    );
  await task.locator('input[type="file"]').setInputFiles([
    { name: 'wide.png', mimeType: 'image/png', buffer: await png(3000, 1000) },
    { name: 'small.png', mimeType: 'image/png', buffer: await png(800, 600) },
  ]);
  await page.getByTestId('pipeline-run').click();

  const downloads = page.getByRole('link', { name: 'Download', exact: true });
  await expect(downloads).toHaveCount(2, { timeout: 30_000 });
  const sizes: number[][] = [];
  for (const index of [0, 1]) {
    const downloadPromise = page.waitForEvent('download');
    await downloads.nth(index).click();
    const bytes = readFileSync((await (await downloadPromise).path())!);
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]); // JPEG
    sizes.push(
      await page.evaluate(async (base64) => {
        const data = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([data], { type: 'image/jpeg' }));
        return [bitmap.width, bitmap.height];
      }, bytes.toString('base64')),
    );
  }
  expect(sizes).toEqual([
    [1200, 400],
    [800, 600],
  ]);

  // Editing the steps carries the job, with what was set, into the builder.
  await page.getByRole('button', { name: 'Edit the steps' }).click();
  await expect(page.getByTestId('pipeline-task')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Resize Image' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Compress Image' })).toBeVisible();
  await expect(page.getByLabel('Width', { exact: true })).toHaveValue('1200');
  await expect(page.getByLabel('Height', { exact: true })).toHaveValue('1200');
});

test('a job on the home page opens ready to use', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pipeline-preset-id-copy').click();
  await expect(page).toHaveURL(/\/pipeline\?preset=id-copy$/);
  const task = page.getByTestId('pipeline-task');
  await expect(task.getByRole('heading', { name: 'ID or bankbook copy for submission' })).toBeVisible({ timeout: 60_000 });
  await expect(task.getByLabel(/Watermark text/)).toHaveValue('COPY · for submission only');
});

test('pdf-delete-page understands page ranges', async ({ page }) => {
  await page.goto('/tools/pdf/pdf-delete-page');
  await page.locator('input[type="file"]').setInputFiles(samplePdfPath);
  await page.getByLabel('Pages to delete').fill('2-3');
  await page.getByRole('button', { name: 'Run tool' }).click();

  const result = await downloadFirstResult(page);
  const { PDFDocument } = await import('pdf-lib');
  expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(1);
});

test('pdf-split can split by page ranges', async ({ page }) => {
  await page.goto('/tools/pdf/pdf-split');
  await page.locator('input[type="file"]').setInputFiles(samplePdfPath);
  await page.getByLabel('Page ranges').fill('1-2, 3');
  await page.getByRole('button', { name: 'Run tool' }).click();

  await expect(page.getByText('sample-pages-1-2.pdf')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('sample-page-3.pdf')).toBeVisible();
});

test('pdf-redact removes the covered text from the file, not just the view', async ({ page }) => {
  await page.goto('/tools/pdf/pdf-redact?regions=' + encodeURIComponent(JSON.stringify([{ page: 1, x: 0, y: 0, w: 1, h: 0.5 }])));
  await page.locator('input[type="file"]').setInputFiles(samplePdfPath);
  await page.getByRole('button', { name: 'Run tool' }).click();

  const result = await downloadFirstResult(page);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(result.bytes),
    useWorkerFetch: false,
    isEvalSupported: false,
    standardFontDataUrl: path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts/'),
  }).promise;
  expect(doc.numPages).toBe(3);
  const pageText = async (pageNumber: number) =>
    ((await (await doc.getPage(pageNumber)).getTextContent()).items as Array<{ str?: string }>).map((item) => item.str ?? '').join(' ');
  // The boxed page has no text left to copy or extract; untouched pages keep theirs.
  expect(await pageText(1)).not.toContain('Sample PDF Page 1');
  expect(await pageText(2)).toContain('Sample PDF Page 2');
});

test('pdf-delete-page picks pages from thumbnails', async ({ page }) => {
  await page.goto('/tools/pdf/pdf-delete-page');
  await page.locator('input[type="file"]').setInputFiles(samplePdfPath);
  await page.getByTestId('pdf-page-picker').getByRole('button', { name: 'Page 1', exact: true }).click();
  await page.getByTestId('pdf-page-picker').getByRole('button', { name: 'Page 3', exact: true }).click();
  await expect(page.getByLabel('Pages to delete')).toHaveValue('1, 3');
  await page.getByRole('button', { name: 'Run tool' }).click();

  const result = await downloadFirstResult(page);
  const { PDFDocument } = await import('pdf-lib');
  expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(1);
});

test('pdf-redact boxes are drawn on the page preview', async ({ page }) => {
  await page.goto('/tools/pdf/pdf-redact');
  await page.locator('input[type="file"]').setInputFiles(samplePdfPath);
  const layer = page.getByTestId('pdf-redact-layer');
  await expect(layer).toBeVisible({ timeout: 30_000 });
  const box = (await layer.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 20, box.y + box.height * 0.3, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId('pdf-redact-box')).toHaveCount(1);
  await page.getByRole('button', { name: 'Run tool' }).click();
  await expect(page.getByText('sample-redacted.pdf')).toBeVisible({ timeout: 30_000 });
});

test('pdf-sign places the signature where the page is tapped', async ({ page }) => {
  await page.goto('/tools/pdf/pdf-sign');
  await page.locator('input[type="file"]').setInputFiles(samplePdfPath);
  const layer = page.getByTestId('pdf-sign-layer');
  await expect(layer).toBeVisible({ timeout: 30_000 });
  const stamp = page.getByTestId('pdf-sign-box');
  const before = (await stamp.boundingBox())!;
  const box = (await layer.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.2);
  const after = (await stamp.boundingBox())!;
  expect(Math.abs(after.y - before.y)).toBeGreaterThan(50);
  await page.getByRole('button', { name: 'Run tool' }).click();
  await expect(page.getByText('sample-signed.pdf')).toBeVisible({ timeout: 30_000 });
});
