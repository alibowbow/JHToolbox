import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

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
        // Page content: a flat single colour would count as a blank capture.
        context.fillStyle = '#1e293b';
        context.fillRect(40, 40, w - 80, 120);
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

// ---- Webpage capture failures (every capture service is mocked) ----

async function waitForClientReady(page: Page) {
  await page.waitForFunction(() => {
    const transitionRoot = document.querySelector('main > div.relative');
    const style = transitionRoot?.getAttribute('style') ?? '';
    return transitionRoot instanceof HTMLElement && !style.includes('opacity:0');
  });
}

/** A shared tab for getDisplayMedia: a painted canvas stands in for the browser's picker. */
async function stubTabSharing(page: Page) {
  await page.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 400;
      const context = canvas.getContext('2d')!;
      const paint = () => {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, 640, 400);
        context.fillStyle = '#1d4ed8';
        context.fillRect(40, 40, 280, 120);
      };
      paint();
      window.setInterval(paint, 50);
      return canvas.captureStream(30);
    };
  });
}

async function runCapture(page: Page, url: string, toolPath = '/tools/web/url-image') {
  await page.goto(toolPath, { waitUntil: 'domcontentloaded' });
  await waitForClientReady(page);
  await page.getByLabel('Target URL').fill(url);
  await page.getByRole('button', { name: 'Run tool' }).click();
}

test('a site that turns the capture servers away says so and can be captured from a shared tab', async ({ page }) => {
  await page.route('**api.microlink.io/**', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'fail', code: 'EPROXYNEEDED', message: 'EPROXYNEEDED, the target URL needs a proxy.' }),
    }),
  );
  // The bare thum.io endpoint is CORS-blocked in a real browser.
  await page.route('**image.thum.io/**', (route) => route.abort('failed'));
  await page.route('**images.weserv.nl/**', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: '{"status":"error","code":404,"message":"The image does not exist."}' }),
  );
  await stubTabSharing(page);

  await runCapture(page, 'www.ruliweb.com');
  await expect(page.getByText('The screenshot servers could not get into this site.')).toBeVisible();

  const fallback = page.getByTestId('capture-fallback');
  await expect(fallback.getByRole('link', { name: /Open in a new tab/ })).toHaveAttribute('href', 'https://www.ruliweb.com/');
  await fallback.getByRole('button', { name: /Capture that tab/ }).click();

  await expect(page.getByTestId('url-image-cropper')).toBeVisible();
  await expect(page.getByText('The screenshot servers could not get into this site.')).toHaveCount(0);
  await expect(fallback).toHaveCount(0);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download original' }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('url-capture.png');
});

async function mockBlockedSite(page: Page) {
  await page.route('**api.microlink.io/**', (route) =>
    route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ status: 'fail', code: 'EPROXYNEEDED' }) }),
  );
  await page.route('**image.thum.io/**', (route) => route.abort('failed'));
  await page.route('**images.weserv.nl/**', (route) => route.fulfill({ status: 404, body: '' }));
}

test('url to pdf falls back to a shared tab as well', async ({ page }) => {
  await mockBlockedSite(page);
  await stubTabSharing(page);

  await runCapture(page, 'https://www.ruliweb.com', '/tools/pdf/url-pdf');
  await page.getByTestId('capture-fallback').getByRole('button', { name: /Capture that tab/ }).click();

  await expect(page.getByText('url-capture.pdf')).toBeVisible();
  await expect(page.getByText('The screenshot servers could not get into this site.')).toHaveCount(0);
});

test('a capture that came back wrong can be redone from a shared tab', async ({ page }) => {
  // The service "succeeds" with whatever the site showed it (a block page, a cookie wall…).
  const servicePicture = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJm8AAAAASUVORK5CYII=',
    'base64',
  );
  for (const pattern of ['**api.microlink.io/**', '**image.thum.io/**']) {
    await page.route(pattern, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: servicePicture }));
  }
  await page.route('**images.weserv.nl/**', (route) => route.fulfill({ status: 404, body: '' }));
  await stubTabSharing(page);

  await runCapture(page, 'https://example.com');
  await expect(page.getByTestId('url-image-cropper')).toBeVisible();
  await expect(page.getByTestId('capture-fallback')).toHaveCount(0);

  await page.getByRole('button', { name: /Capture looks wrong/ }).click();
  await page.getByTestId('capture-fallback').getByRole('button', { name: /Capture that tab/ }).click();

  await expect(page.getByText(/640\s*×\s*400/)).toBeVisible();
  await expect(page.getByTestId('capture-fallback')).toHaveCount(0);
});

test('a spent free quota is reported without retrying', async ({ page }) => {
  let microlinkCalls = 0;
  await page.route('**api.microlink.io/**', (route) => {
    microlinkCalls += 1;
    return route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'fail', code: 'ERATE', message: 'ERATE, daily rate limit reached.' }),
    });
  });
  await page.route('**image.thum.io/**', (route) => route.abort('failed'));
  await page.route('**images.weserv.nl/**', (route) => route.fulfill({ status: 429, body: 'Too Many Requests' }));

  await runCapture(page, 'https://example.com');
  await expect(page.getByText('The free screenshot services have reached their usage limit.')).toBeVisible();
  expect(microlinkCalls).toBe(1);
});

test('a blank capture is reported instead of saved', async ({ page }) => {
  await page.goto('/tools/web/url-image', { waitUntil: 'domcontentloaded' });
  const blank = Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 900;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, 1200, 900);
      return canvas.toDataURL('image/png').split(',')[1];
    }),
    'base64',
  );
  for (const pattern of ['**api.microlink.io/**', '**images.weserv.nl/**']) {
    await page.route(pattern, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: blank }));
  }
  await page.route('**image.thum.io/**', (route) => route.abort('failed'));

  await runCapture(page, 'https://example.com');
  await expect(page.getByText('The capture came back blank.')).toBeVisible();
  await expect(page.getByTestId('capture-fallback')).toBeVisible();
  await expect(page.getByTestId('url-image-cropper')).toHaveCount(0);
});
