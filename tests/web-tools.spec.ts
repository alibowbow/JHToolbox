import { expect, test, type Page } from '@playwright/test';

const oneByOnePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJm8AAAAASUVORK5CYII=',
  'base64',
);

async function waitForClientReady(page: Page) {
  await page.waitForFunction(() => {
    const transitionRoot = document.querySelector('main > div.relative');
    const style = transitionRoot?.getAttribute('style') ?? '';
    return transitionRoot instanceof HTMLElement && !style.includes('opacity:0');
  });
}

test('webpage capture encodes query parameters before calling the screenshot service', async ({ page }) => {
  let requestedUrl: string | null = null;

  await page.route('**image.thum.io/**', async (route) => {
    requestedUrl = route.request().url();
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: oneByOnePng,
    });
  });

  await page.goto('/tools/web/url-image', { waitUntil: 'domcontentloaded' });
  await waitForClientReady(page);
  const urlInput = page.getByLabel('Target URL');
  await urlInput.fill('https://example.com/path?q=1&x=2');
  await expect(urlInput).toHaveValue('https://example.com/path?q=1&x=2');
  await page.getByRole('button', { name: 'Run tool' }).click();

  await expect.poll(async () => requestedUrl ?? '').toContain(
    encodeURIComponent('https://example.com/path?q=1&x=2'),
  );
});

test('cms detection encodes query parameters before falling back to the mirror service', async ({ page }) => {
  let requestedUrl: string | null = null;

  await page.route('**r.jina.ai/**', async (route) => {
    requestedUrl = route.request().url();
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><head><meta name="generator" content="WordPress"></head><body>CMS</body></html>',
    });
  });

  await page.goto('/tools/web/detect-cms', { waitUntil: 'domcontentloaded' });
  await waitForClientReady(page);
  const urlInput = page.getByLabel('Target URL');
  await urlInput.fill('https://example.com/path?campaign=spring&ref=123');
  await expect(urlInput).toHaveValue('https://example.com/path?campaign=spring&ref=123');
  await page.getByRole('button', { name: 'Run tool' }).click();

  await expect.poll(async () => requestedUrl ?? '').toContain(
    encodeURIComponent('example.com/path?campaign=spring&ref=123'),
  );
});
