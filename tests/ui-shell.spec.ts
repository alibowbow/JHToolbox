import { expect, test } from '@playwright/test';

test('theme toggle changes the global theme without hydration errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  await page.addInitScript(() => {
    window.localStorage.setItem('jhtoolbox.theme', 'dark');
  });
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: /Every file workflow/ })).toBeVisible();

  const initialTheme = await page.evaluate(() => document.documentElement.dataset.theme);
  const initialBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await page.getByRole('button', { name: 'Toggle theme' }).click();

  const nextTheme = initialTheme === 'dark' ? 'light' : 'dark';
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe(nextTheme);

  const nextBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(nextBackground).not.toBe(initialBackground);

  const hydrationErrors = consoleErrors.filter((entry) =>
    /hydration failed|did not match what was rendered on the server|server html/i.test(entry),
  );
  expect(hydrationErrors).toEqual([]);
});

test('korean locale localizes tool titles, descriptions, and option labels', async ({ page }) => {
  await page.goto('/tools/image/image-resize');
  await page.getByRole('button', { name: 'ko' }).click();

  await expect(page.getByRole('heading', { level: 2, name: '이미지 크기 조정' })).toBeVisible();
  await expect(page.getByText('이미지 크기를 원하는 가로와 세로 값으로 조정합니다.')).toBeVisible();
  await expect(page.getByText('너비')).toBeVisible();
  await expect(page.getByText('높이')).toBeVisible();
  await expect(page.getByText('출력 포맷')).toBeVisible();
});

test('sidebar navigation remains stable after visiting a tool detail page', async ({ page }) => {
  await page.goto('/tools/pdf/pdf-merge');

  const targets = [
    { href: '/tools/image', expected: 'Image Tools' },
    { href: '/tools', expected: 'Focus views' },
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

test('audio converter quick action preset selects MP3 and keeps empty panels hidden', async ({ page }) => {
  await page.goto('/tools/audio/audio-convert?outputFormat=mp3');

  await expect(page.getByRole('heading', { level: 2, name: 'Audio Converter' })).toBeVisible();
  await expect(page.locator('select').first()).toHaveValue('mp3');
  await expect(page.getByText('Progress')).toHaveCount(0);
  await expect(page.getByText('Results')).toHaveCount(0);
});

test('audio cutter shows waveform editing before processing and exports a trimmed file', async ({ page }) => {
  await page.goto('/tools/audio/audio-cut');

  await page.locator('input[type="file"]').setInputFiles('tests/fixtures/sample.wav');

  await expect(
    page.getByText('Drag on the waveform to set a selection. Space toggles playback and arrow keys nudge the playhead.'),
  ).toBeVisible();
  await expect(page.getByText('Selection length')).toBeVisible();
  await expect(page.getByText('Results')).toHaveCount(0);
  await expect(page.getByTestId('waveform-selection-overlay')).toBeVisible();
  await expect(page.getByTestId('play-selection-from-start')).toBeVisible();

  const waveformScrollArea = page.getByTestId('waveform-scroll-area');
  const waveformWidth = await waveformScrollArea.evaluate((element) => Math.round(element.getBoundingClientRect().width));
  expect(waveformWidth).toBeGreaterThan(600);

  await page.getByTestId('waveform-zoom-slider').evaluate((element) => {
    const slider = element as HTMLInputElement;
    slider.value = '8';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const zoomedMetrics = await waveformScrollArea.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(zoomedMetrics.scrollWidth).toBeGreaterThan(zoomedMetrics.clientWidth);

  await page.locator('select').first().selectOption('remove');
  await page.locator('input[type="number"]').first().fill('0.20');
  await page.locator('input[type="number"]').nth(1).fill('0.60');

  const previewAudio = page.getByTestId('waveform-preview-audio');
  await previewAudio.evaluate((element) => {
    const audio = element as HTMLAudioElement;
    audio.currentTime = 0.8;
    audio.dispatchEvent(new Event('seeking'));
  });
  await expect
    .poll(() => previewAudio.evaluate((element) => Number((element as HTMLAudioElement).currentTime.toFixed(2))))
    .toBeCloseTo(0.6, 1);

  await previewAudio.evaluate((element) => {
    const audio = element as HTMLAudioElement;
    audio.currentTime = 0.05;
    audio.dispatchEvent(new Event('seeking'));
  });
  await expect
    .poll(() => previewAudio.evaluate((element) => Number((element as HTMLAudioElement).currentTime.toFixed(2))))
    .toBeCloseTo(0.2, 1);

  await previewAudio.evaluate((element) => {
    (element as HTMLAudioElement).currentTime = 0.55;
  });
  await page.getByTestId('play-selection-from-start').click();
  await page.waitForTimeout(150);
  const restartedTime = await previewAudio.evaluate((element) => (element as HTMLAudioElement).currentTime);
  expect(restartedTime).toBeGreaterThanOrEqual(0.2);
  expect(restartedTime).toBeLessThan(0.4);
  await page.getByRole('button', { name: 'Pause' }).click();

  await page.locator('input[type="number"]').nth(1).fill('1.00');
  await page.getByRole('button', { name: 'Run tool' }).click();

  await expect(page.getByText('sample-output.wav')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Download' })).toBeVisible();
});

test('pdf rearrange shows page editor controls before processing', async ({ page }) => {
  await page.goto('/tools/pdf/pdf-rearrange');

  await page.locator('input[type="file"]').setInputFiles('tests/fixtures/sample.pdf');

  await expect(page.getByText(/Visible pages: 3/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Selected pages: 0/)).toBeVisible();

  await page.getByRole('button', { name: 'Remove page 1' }).click();
  await expect(page.getByText(/Visible pages: 2/)).toBeVisible();

  await page.getByRole('button', { name: 'Run tool' }).click();
  await expect(page.getByText('sample-rearranged.pdf')).toBeVisible({ timeout: 60_000 });
});

test('url-based tools start from direct input without showing the upload dropzone', async ({ page }) => {
  await page.goto('/tools/web/url-pdf');

  await expect(page.getByText('Direct input')).toBeVisible();
  await expect(page.locator('input[type="text"]').first()).toHaveValue('https://example.com');
  await expect(page.getByText(/Drag files here|Drop files here/)).toHaveCount(0);
});

test.describe('mobile shell', () => {
  test.use({
    viewport: { width: 390, height: 844 },
  });

  test('mobile topbar exposes the search trigger', async ({ page }) => {
    await page.goto('/');

    const searchButton = page.getByRole('button', {
      name: /Tool search|도구 검색/,
    });
    await expect(searchButton).toBeVisible();

    await searchButton.click();
    await expect(page.getByRole('searchbox')).toBeVisible();
  });
});
