import { expect, test } from '@playwright/test';

test('korean locale localizes tool titles, descriptions, and option labels', async ({ page }) => {
  await page.goto('/tools/image/image-resize');
  await page.getByRole('button', { name: 'ko' }).click();

  await expect(page.getByRole('heading', { level: 1, name: '이미지 크기 조정' })).toBeVisible();
  await expect(page.getByText('이미지 크기를 픽셀 단위로 조정합니다.')).toBeVisible();
  await expect(page.getByText('너비')).toBeVisible();
  await expect(page.getByText('높이')).toBeVisible();
  await expect(page.getByText('출력 형식')).toBeVisible();
});

test.describe('mobile shell', () => {
  test.use({
    viewport: { width: 390, height: 844 },
  });

  test('mobile topbar exposes the search trigger', async ({ page }) => {
    await page.goto('/');

    const searchButton = page.getByRole('button', { name: /Tool search|도구 검색|툴 검색/ });
    await expect(searchButton).toBeVisible();

    await searchButton.click();
    await expect(page.getByRole('searchbox')).toBeVisible();
  });
});
