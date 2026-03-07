import { expect, test } from '@playwright/test';

test('theme toggle changes the global theme and keeps hero copy readable', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('header').getByText('Premium browser utilities for documents, media, and data.')).toHaveCount(0);

  const initialTheme = await page.evaluate(() => document.documentElement.dataset.theme);
  const initialBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await page.getByRole('button', { name: 'Toggle theme' }).click();

  const nextTheme = initialTheme === 'dark' ? 'light' : 'dark';
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe(nextTheme);

  const nextBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(nextBackground).not.toBe(initialBackground);

  const heroColors = await page
    .locator('main section')
    .first()
    .locator('p')
    .first()
    .evaluate((node) => ({
      color: getComputedStyle(node).color,
      background: getComputedStyle(document.body).backgroundColor,
    }));

  expect(heroColors.color).not.toBe(heroColors.background);
});

test('korean locale localizes tool titles, descriptions, and option labels', async ({ page }) => {
  await page.goto('/tools/image/image-resize');
  await page.getByRole('button', { name: 'ko' }).click();

  await expect(page.getByRole('heading', { level: 1, name: '\uC774\uBBF8\uC9C0 \uD06C\uAE30 \uC870\uC815' })).toBeVisible();
  await expect(page.getByText('\uC774\uBBF8\uC9C0 \uD06C\uAE30\uB97C \uD53D\uC140 \uB2E8\uC704\uB85C \uC870\uC815\uD569\uB2C8\uB2E4.')).toBeVisible();
  await expect(page.getByText('\uB108\uBE44')).toBeVisible();
  await expect(page.getByText('\uB192\uC774')).toBeVisible();
  await expect(page.getByText('\uCD9C\uB825 \uD615\uC2DD')).toBeVisible();
});

test('sidebar navigation remains stable after visiting a tool detail page', async ({ page }) => {
  await page.goto('/tools/pdf/pdf-merge');

  const targets = [
    { href: '/tools/image', expected: 'Image Tools' },
    { href: '/tools', expected: 'All tools' },
    { href: '/', expected: 'Every file workflow,' },
    { href: '/tools/web', expected: 'Web Tools' },
    { href: '/tools/pdf', expected: 'PDF Tools' },
  ];

  for (let cycle = 0; cycle < 2; cycle += 1) {
    for (const target of targets) {
      await Promise.all([
        page.waitForURL(`**${target.href === '/' ? '/' : target.href}`),
        page.locator(`nav a[href="${target.href}"]`).first().click(),
      ]);

      await expect(page.locator('main')).toContainText(target.expected);
    }
  }
});

test.describe('mobile shell', () => {
  test.use({
    viewport: { width: 390, height: 844 },
  });

  test('mobile topbar exposes the search trigger', async ({ page }) => {
    await page.goto('/');

    const searchButton = page.getByRole('button', {
      name: /Tool search|\uB3C4\uAD6C \uAC80\uC0C9|\uD234 \uAC80\uC0C9/,
    });
    await expect(searchButton).toBeVisible();

    await searchButton.click();
    await expect(page.getByRole('searchbox')).toBeVisible();
  });
});
