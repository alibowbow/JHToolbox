import { devices, expect, test } from '@playwright/test';

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

test('home prioritizes recently used tools instead of quick launch cards', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('jhtoolbox.recentTools', JSON.stringify(['audio-convert', 'pdf-merge']));
  });
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 2, name: 'Recently used' })).toBeVisible();
  await expect(page.getByText('Quick launch')).toHaveCount(0);
  await expect(page.getByText('Audio Converter')).toBeVisible();
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

test('korean locale also localizes newly added screen tools', async ({ page }) => {
  await page.goto('/tools/screen/screenshot-capture');
  await page.getByRole('button', { name: 'ko' }).click();

  await expect(page.getByRole('heading', { level: 2, name: '스크린샷 캡처' })).toBeVisible();
  await expect(page.getByRole('main').getByText('화면 녹화')).toBeVisible();
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

test('video converter preset selects the requested output format in one workflow', async ({ page }) => {
  await page.goto('/tools/video/video-convert?outputFormat=gif');

  await expect(page.getByRole('heading', { level: 2, name: 'Video Converter' })).toBeVisible();
  await expect(page.locator('select').first()).toHaveValue('gif');
  await expect(page.getByText('Progress')).toHaveCount(0);
  await expect(page.getByText('Results')).toHaveCount(0);
});

test('legacy video format routes redirect to the unified video converter', async ({ page }) => {
  await page.goto('/tools/video/mp4-webm');

  await expect(page).toHaveURL(/\/tools\/video\/video-convert\?outputFormat=webm$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Video Converter' })).toBeVisible();
  await expect(page.locator('select').first()).toHaveValue('webm');
});

test('legacy GIF and WEBP routes redirect to the unified video converter', async ({ page }) => {
  await page.goto('/tools/video/video-to-gif');
  await expect(page).toHaveURL(/\/tools\/video\/video-convert\?outputFormat=gif$/);
  await expect(page.locator('select').first()).toHaveValue('gif');

  await page.goto('/tools/video/gif-to-video');
  await expect(page).toHaveURL(/\/tools\/video\/video-convert\?outputFormat=mp4$/);
  await expect(page.locator('select').first()).toHaveValue('mp4');

  await page.goto('/tools/video/video-to-webp');
  await expect(page).toHaveURL(/\/tools\/video\/video-convert\?outputFormat=webp$/);
  await expect(page.locator('select').first()).toHaveValue('webp');
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

  await page.locator('select').first().selectOption('remove');
  await page.locator('input[type="number"]').first().fill('0.20');
  await page.locator('input[type="number"]').nth(1).fill('0.60');
  await expect(page.getByTestId('waveform-start-handle')).toBeVisible();
  await expect(page.getByTestId('waveform-end-handle')).toBeVisible();

  const endHandle = page.getByTestId('waveform-end-handle');
  const endHandleBox = await endHandle.boundingBox();
  if (!endHandleBox) {
    throw new Error('Waveform end handle bounding box was not available.');
  }

  const endHandleCenterX = endHandleBox.x + endHandleBox.width / 2;
  const endHandleCenterY = endHandleBox.y + endHandleBox.height / 2;
  await page.mouse.move(endHandleCenterX, endHandleCenterY);
  await page.mouse.down();
  await page.mouse.move(endHandleCenterX + 42, endHandleCenterY, { steps: 8 });
  await page.mouse.up();
  expect(Number(await page.locator('input[type="number"]').nth(1).inputValue())).toBeGreaterThan(0.6);

  const previewAudio = page.getByTestId('waveform-preview-audio');
  const playheadHandle = page.getByTestId('waveform-playhead-handle');
  const playheadBox = await playheadHandle.boundingBox();
  const scrollAreaBox = await waveformScrollArea.boundingBox();
  if (!playheadBox || !scrollAreaBox) {
    throw new Error('Waveform playhead drag targets were not available.');
  }

  const playheadStartX = playheadBox.x + playheadBox.width / 2;
  const playheadY = playheadBox.y + playheadBox.height / 2;
  const playheadTargetX = scrollAreaBox.x + scrollAreaBox.width * 0.85;
  await page.mouse.move(playheadStartX, playheadY);
  await page.mouse.down();
  await page.mouse.move(playheadTargetX, playheadY, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(200);

  const freePreviewState = await previewAudio.evaluate((element) => {
    const audio = element as HTMLAudioElement;
    return { currentTime: audio.currentTime, paused: audio.paused };
  });
  expect(freePreviewState.currentTime).toBeGreaterThan(1.2);
  expect(typeof freePreviewState.paused).toBe('boolean');

  await page.getByTestId('play-selection-from-start').click();
  await page.waitForTimeout(150);
  const restartedTime = await previewAudio.evaluate((element) => (element as HTMLAudioElement).currentTime);
  expect(restartedTime).toBeGreaterThanOrEqual(0.2);
  expect(restartedTime).toBeLessThan(0.5);
  await previewAudio.evaluate((element) => {
    (element as HTMLAudioElement).pause();
  });
  await expect.poll(async () => previewAudio.evaluate((element) => (element as HTMLAudioElement).paused)).toBe(true);

  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  const zoomedMetrics = await waveformScrollArea.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(zoomedMetrics.scrollWidth).toBeGreaterThan(zoomedMetrics.clientWidth);

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

test('url image allows trimming a long captured page before saving', async ({ page }) => {
  const tallSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="3600" viewBox="0 0 1200 3600">
      <rect width="1200" height="3600" fill="#f8fafc" />
      <rect x="80" y="80" width="1040" height="320" rx="36" fill="#0f172a" />
      <text x="130" y="210" font-size="68" font-family="Arial, sans-serif" fill="#f8fafc">News headline</text>
      <text x="130" y="290" font-size="34" font-family="Arial, sans-serif" fill="#cbd5e1">Primary article content</text>
      <rect x="80" y="520" width="1040" height="1380" rx="40" fill="#ffffff" stroke="#cbd5e1" stroke-width="12" />
      <text x="130" y="700" font-size="46" font-family="Arial, sans-serif" fill="#111827">Story body</text>
      <rect x="80" y="2140" width="1040" height="420" rx="40" fill="#f59e0b" opacity="0.32" />
      <text x="130" y="2360" font-size="54" font-family="Arial, sans-serif" fill="#7c2d12">Ad area</text>
      <rect x="80" y="2700" width="1040" height="720" rx="40" fill="#dbeafe" />
      <text x="130" y="2920" font-size="54" font-family="Arial, sans-serif" fill="#1d4ed8">More news grid</text>
    </svg>
  `;

  await page.route('https://image.thum.io/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: tallSvg,
    });
  });

  await page.goto('/tools/web/url-image');
  await page.getByRole('button', { name: 'Run tool' }).click();

  await expect(page.getByTestId('url-image-cropper')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Download original' })).toBeVisible();

  const startInput = page.getByTestId('url-image-crop-start-input');
  await expect(startInput).toHaveValue('0');
  const startHandle = page.getByTestId('url-image-crop-start-handle');
  const handleBox = await startHandle.boundingBox();
  if (!handleBox) {
    throw new Error('URL image crop start handle bounding box was not available.');
  }

  const handleCenterX = handleBox.x + handleBox.width / 2;
  const handleCenterY = handleBox.y + handleBox.height / 2;
  await page.mouse.move(handleCenterX, handleCenterY);
  await page.mouse.down();
  await page.mouse.move(handleCenterX, handleCenterY + 110, { steps: 10 });
  await page.mouse.up();

  await expect.poll(async () => Number(await startInput.inputValue())).toBeGreaterThan(0);

  await startInput.fill('240');
  await expect(startInput).toHaveValue('240');
  await expect(page.getByText(/Crop height:/)).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('url-image-crop-download').click();
  const download = await downloadPromise;
  expect(await download.suggestedFilename()).toContain('-cropped');
});

test('screen capture tools render the browser capture workbench without a file dropzone', async ({ page }) => {
  await page.goto('/tools/screen/screenshot-capture');

  await expect(page.getByText('Screenshot source')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Capture screenshot' })).toBeVisible();
  await expect(page.getByText('Capture notes')).toBeVisible();
  await expect(page.getByText(/Drag files here|Drop files here/)).toHaveCount(0);
});

test('audio recorder exposes waveform-first export options', async ({ page }) => {
  await page.goto('/tools/audio/audio-recorder');

  await expect(page.getByText('Microphone preview')).toHaveCount(0);
  await expect(page.getByTestId('live-audio-waveform')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start recording' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start capture' })).toHaveCount(0);
  await expect(page.getByText('Progress')).toHaveCount(0);
  await expect(page.locator('select').first()).toHaveValue('keep');
  await expect(page.locator('select').nth(1)).toHaveValue('wav');
  await expect(page.getByRole('button', { name: 'Export edited audio' })).toHaveCount(0);
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

  test('mobile menu button opens the navigation drawer and navigates cleanly', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('mobile-menu-button').click();
    const drawer = page.getByTestId('mobile-menu-drawer');
    await expect(drawer).toBeVisible();
    await drawer.getByRole('link', { name: 'All Tools' }).click();
    await expect(page).toHaveURL(/\/tools$/);
  });

  test('mobile bottom navigation scrolls horizontally so all categories stay reachable', async ({ page }) => {
    await page.goto('/');

    const scroller = page.getByTestId('mobile-bottom-nav-scroll');
    await expect(scroller).toBeVisible();

    const metrics = await scroller.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);

    await scroller.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });

    await expect(scroller.getByRole('link', { name: /Web|웹/ })).toBeVisible();
  });
});

test.describe('mobile capture flows', () => {
  const mobileDevice = devices['iPhone 13'];

  test.use({
    viewport: mobileDevice.viewport,
    userAgent: mobileDevice.userAgent,
    deviceScaleFactor: mobileDevice.deviceScaleFactor,
    isMobile: mobileDevice.isMobile,
    hasTouch: mobileDevice.hasTouch,
  });

  test('screen recorder keeps mobile guidance visible', async ({ page }) => {
    await page.goto('/tools/screen/screen-recorder');

    await expect(page.getByRole('button', { name: 'Start capture' })).toBeVisible();
    await expect(page.getByText(/On supported mobile browsers, choose This Tab/)).toBeVisible();
  });

  test('screen recorder shows the unsupported mobile warning in Korean', async ({ page }) => {
    await page.addInitScript(() => {
      const original = navigator.mediaDevices;
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          ...original,
          getDisplayMedia: undefined,
        },
      });
    });
    await page.goto('/tools/screen/screen-recorder');

    await page.getByRole('button', { name: 'ko' }).click();
    await expect(page.getByText(/이 모바일 브라우저는 화면 공유 API/)).toBeVisible();
  });
});
