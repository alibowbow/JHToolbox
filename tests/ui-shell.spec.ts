import { devices, expect, test, type Page } from '@playwright/test';

async function createDemoVideoBuffer(page: Page) {
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas context was unavailable.');
    }

    const mimeTypes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const mimeType = mimeTypes.find((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!mimeType) {
      throw new Error('WebM recording was unavailable in this browser.');
    }

    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: BlobPart[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });

    let frame = 0;
    const drawFrame = () => {
      const progress = frame / 48;
      const hue = Math.round(progress * 240);

      context.fillStyle = `hsl(${hue} 82% 58%)`;
      context.fillRect(0, 0, canvas.width, canvas.height);

      context.fillStyle = 'rgba(15, 23, 42, 0.82)';
      context.fillRect(44, 40, 552, 72);
      context.fillRect(64 + frame * 6, 160, 180, 96);

      context.fillStyle = 'rgba(255, 255, 255, 0.96)';
      context.font = 'bold 40px Arial, sans-serif';
      context.fillText(`Frame ${frame + 1}`, 80, 88);

      context.fillStyle = '#0f172a';
      context.fillRect(64, 284, 248, 28);
      context.fillStyle = '#ffffff';
      context.fillRect(64 + progress * 220, 284, 28, 28);

      context.strokeStyle = '#f8fafc';
      context.lineWidth = 6;
      context.strokeRect(360, 140, 180, 120);

      frame += 1;
    };

    recorder.start();
    drawFrame();

    const intervalId = window.setInterval(() => {
      drawFrame();
      if (frame >= 48) {
        window.clearInterval(intervalId);
        recorder.stop();
      }
    }, 33);

    await new Promise((resolve) => window.setTimeout(resolve, 1800));
    window.clearInterval(intervalId);
    if (recorder.state !== 'inactive') {
      recorder.stop();
    }
    await stopped;

    const blob = new Blob(chunks, { type: mimeType });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });

  return Buffer.from(bytes);
}

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

test('legacy audio editor routes redirect to the unified audio editor', async ({ page }) => {
  const redirectTargets = [
    '/tools/audio/audio-cut',
    '/tools/audio/audio-recorder',
    '/tools/audio/audio-merge',
    '/tools/audio/audio-fade',
    '/tools/audio/audio-speed-change',
    '/tools/audio/audio-pitch-change',
  ];

  for (const target of redirectTargets) {
    await page.goto(target, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/tools\/audio$/);
  }
});

test('legacy audio converter routes redirect to the batch converter', async ({ page }) => {
  await page.goto('/tools/audio/audio-convert?outputFormat=mp3');
  await expect(page).toHaveURL(/\/tools\/audio\/batch$/);

  await page.goto('/tools/audio/m4a-mp3');
  await expect(page).toHaveURL(/\/tools\/audio\/batch\?outputFormat=mp3$/);

  await page.goto('/tools/audio/m4a-wav');
  await expect(page).toHaveURL(/\/tools\/audio\/batch\?outputFormat=wav$/);

  await page.goto('/tools/audio/aac-mp3');
  await expect(page).toHaveURL(/\/tools\/audio\/batch\?outputFormat=mp3$/);

  await page.goto('/tools/audio/webm-mp3');
  await expect(page).toHaveURL(/\/tools\/audio\/batch\?outputFormat=mp3$/);

  await page.goto('/tools/audio/mp4-wav');
  await expect(page).toHaveURL(/\/tools\/audio\/batch\?outputFormat=wav$/);
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

test('video crop editor exposes timeline scrubbing, trim handles, and hides legacy numeric inputs', async ({ page }) => {
  await page.goto('/tools/video/video-crop');

  const videoBuffer = await createDemoVideoBuffer(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'timeline-source.webm',
    mimeType: 'video/webm',
    buffer: videoBuffer,
  });

  await expect(page.getByText('Video editor')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Preview the clip and adjust the edit before you run it.')).toBeVisible();
  await expect(page.getByText('Timeline', { exact: true })).toBeVisible();
  await expect(page.getByText('Crop frame', { exact: true })).toBeVisible();
  await expect(page.getByText('Aspect ratios', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Free' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Square' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Landscape' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Portrait' })).toBeVisible();

  const playhead = page.getByRole('slider', { name: 'Playhead' });
  await playhead.fill('30');
  await expect(playhead).toHaveValue('30');

  const trimStart = page.getByRole('slider', { name: 'Trim start' });
  const trimEnd = page.getByRole('slider', { name: 'Trim end' });
  await trimStart.fill('10');
  await trimEnd.fill('85');
  await expect(trimStart).toHaveValue('10');
  await expect(trimEnd).toHaveValue('85');

  await expect(page.locator('input[type="number"]')).toHaveCount(0);
});

test('video crop ratio presets reshape the crop frame', async ({ page }) => {
  await page.goto('/tools/video/video-crop');

  const videoBuffer = await createDemoVideoBuffer(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'ratio-source.webm',
    mimeType: 'video/webm',
    buffer: videoBuffer,
  });

  const selection = page.getByTestId('video-crop-selection');
  await expect(selection).toBeVisible({ timeout: 60_000 });

  await page.getByRole('button', { name: 'Square' }).click();
  const squareBox = await selection.boundingBox();
  if (!squareBox) {
    throw new Error('Square crop selection box was not available.');
  }

  await page.getByRole('button', { name: 'Landscape' }).click();
  const landscapeBox = await selection.boundingBox();
  if (!landscapeBox) {
    throw new Error('Landscape crop selection box was not available.');
  }

  await page.getByRole('button', { name: 'Portrait' }).click();
  const portraitBox = await selection.boundingBox();
  if (!portraitBox) {
    throw new Error('Portrait crop selection box was not available.');
  }

  expect(squareBox.width / squareBox.height).toBeGreaterThan(0.9);
  expect(landscapeBox.width / landscapeBox.height).toBeGreaterThan(portraitBox.width / portraitBox.height);
});

test('video trim uses the timeline editor without duplicate numeric inputs', async ({ page }) => {
  await page.goto('/tools/video/video-trim');

  const videoBuffer = await createDemoVideoBuffer(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'trim-source.webm',
    mimeType: 'video/webm',
    buffer: videoBuffer,
  });

  await expect(page.getByText('Video editor')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('slider', { name: 'Playhead' })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Trim start' })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Trim end' })).toBeVisible();
  await expect(page.locator('input[type="number"]')).toHaveCount(0);
});

test('audio editor route exposes the unified editor workspace', async ({ page }) => {
  await page.goto('/tools/audio');

  await expect(page).toHaveURL(/\/tools\/audio$/);
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open audio' })).toBeVisible();
  await expect(page.getByTestId('audio-transport-bar')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Start recording' })).toHaveCount(1);
  await expect(page.getByText('Preview and apply focused processing')).toHaveCount(0);
  await expect(page.getByText('Selected range', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('audio-selection-bar')).toHaveCount(0);
  await page.locator('input[type="file"]').setInputFiles('tests/fixtures/sample.wav');
  await expect(page.getByRole('button', { name: 'Save WAV' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Save MP3' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Start recording' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start recording' })).toHaveCount(1);
  await expect(page.locator('button[aria-label="Play"], button[aria-label="Pause"]')).toHaveCount(1);
  await expect(page.getByTestId('audio-playhead')).toHaveCount(0);

  const waveformMetrics = await page.getByTestId('audio-waveform-scroll').evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(waveformMetrics.scrollWidth - waveformMetrics.clientWidth).toBeLessThanOrEqual(8);

  const waveformBox = await page.getByTestId('audio-waveform-scroll').boundingBox();
  if (!waveformBox) {
    throw new Error('Audio waveform area was not available.');
  }

  await page.mouse.move(waveformBox.x + 100, waveformBox.y + 60);
  await page.mouse.down();
  await page.mouse.move(waveformBox.x + 340, waveformBox.y + 60, { steps: 12 });
  await page.mouse.up();

  await expect(page.getByText('Selected range', { exact: true })).toHaveCount(1);
  await expect(page.getByTestId('audio-selection-bar')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Keep' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(1);
  await expect(page.getByText('Selected range')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keep' })).toBeVisible();

  const selectionOverlay = await page.getByTestId('audio-selection-overlay').boundingBox();
  const startHandle = await page.getByTestId('audio-selection-handle-start').boundingBox();
  const endHandle = await page.getByTestId('audio-selection-handle-end').boundingBox();
  if (!selectionOverlay || !startHandle || !endHandle) {
    throw new Error('Audio selection overlay or handles were not available.');
  }

  const startHandleCenter = startHandle.x + startHandle.width / 2;
  const endHandleCenter = endHandle.x + endHandle.width / 2;
  expect(Math.abs(startHandleCenter - selectionOverlay.x)).toBeLessThanOrEqual(4);
  expect(Math.abs(endHandleCenter - (selectionOverlay.x + selectionOverlay.width))).toBeLessThanOrEqual(4);

  await page.getByRole('button', { name: 'More actions' }).click();
  await expect(page.getByRole('button', { name: 'Show effects' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Show effects' }).click();
  await expect(page.getByText('Preview and apply focused processing')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Amplify' })).toBeVisible();
  await expect(page.getByText('Preview and apply focused processing')).toBeVisible();

  await page.getByRole('button', { name: 'More actions' }).click();
  await expect(page.getByRole('link', { name: 'Open file conversion' })).toBeVisible();
});

test('audio editor localizes save, record, and conversion actions in korean mode', async ({ page }) => {
  await page.goto('/tools/audio');
  await page.getByRole('button', { name: 'ko' }).click();

  await expect(page.getByTestId('audio-transport-bar')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '녹음 시작' })).toHaveCount(1);
  await expect(page.getByText('선택 구간', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('audio-selection-bar')).toHaveCount(0);
  await page.locator('input[type="file"]').setInputFiles('tests/fixtures/sample.wav');

  await expect(page.getByRole('button', { name: '오디오 열기' })).toBeVisible();
  await expect(page.getByRole('button', { name: '녹음 시작' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'WAV 저장' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'MP3 저장' })).toHaveCount(1);
  await expect(page.locator('button[aria-label="재생"], button[aria-label="Play"]')).toHaveCount(1);
  await expect(page.locator('button[aria-label="녹음 시작"], button[aria-label="Start recording"]')).toHaveCount(1);
  await expect(page.getByTestId('audio-playhead')).toHaveCount(0);

  const waveformBox = await page.getByTestId('audio-waveform-scroll').boundingBox();
  if (!waveformBox) {
    throw new Error('Audio waveform area was not available.');
  }

  await page.mouse.move(waveformBox.x + 100, waveformBox.y + 60);
  await page.mouse.down();
  await page.mouse.move(waveformBox.x + 340, waveformBox.y + 60, { steps: 12 });
  await page.mouse.up();

  await expect(page.getByText('선택 구간', { exact: true })).toHaveCount(1);
  await expect(page.getByTestId('audio-selection-bar')).toHaveCount(1);
  await expect(page.getByText('선택 구간', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '더보기' }).click();
  await expect(page.getByRole('button', { name: '효과 열기' })).toHaveCount(1);
  await page.getByRole('button', { name: '효과 열기' }).click();
  await expect(page.getByRole('button', { name: '앰플리파이' })).toBeVisible();

  await page.getByRole('button', { name: '더보기' }).click();
  await expect(page.getByRole('link', { name: '파일 변환 열기' })).toBeVisible();
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

test('pdf menu lists url full page to pdf and opens the pdf route', async ({ page }) => {
  await page.goto('/tools/pdf');

  const pdfToolCard = page.locator('a[href="/tools/pdf/url-pdf"]').first();
  await expect(pdfToolCard).toBeVisible();
  await expect(pdfToolCard).toContainText('URL Full Page to PDF');

  await pdfToolCard.click();
  await expect(page).toHaveURL(/\/tools\/pdf\/url-pdf$/);
  await expect(page.getByRole('heading', { level: 2, name: 'URL Full Page to PDF' })).toBeVisible();
});

test('pdf category surfaces the newly added document workflows', async ({ page }) => {
  await page.goto('/tools/pdf');

  await expect(page.locator('a[href="/tools/pdf/pdf-to-word"]').first()).toContainText('PDF to Word');
  await expect(page.locator('a[href="/tools/pdf/word-to-pdf"]').first()).toContainText('Word to PDF');
  await expect(page.locator('a[href="/tools/pdf/html-to-pdf"]').first()).toContainText('HTML to PDF');
  await expect(page.locator('a[href="/tools/pdf/edit-pdf"]').first()).toContainText('Edit PDF');
  await expect(page.locator('a[href="/tools/pdf/pdf-compare"]').first()).toContainText('Compare PDF');
});

test('pdf compare generates a readable diff report from two uploads', async ({ page }) => {
  await page.goto('/tools/pdf/pdf-compare');

  await page.locator('input[type="file"]').setInputFiles(['tests/fixtures/sample.pdf', 'tests/fixtures/sample.pdf']);
  await page.getByRole('button', { name: 'Run tool' }).click();

  await expect(page.getByText('sample-vs-sample.txt')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('PDF Compare Report')).toBeVisible();
  await expect(page.getByText('Changed pages: 0')).toBeVisible();
});

test('html to pdf renders an uploaded html file without server conversion', async ({ page }) => {
  await page.goto('/tools/pdf/html-to-pdf');

  await page.locator('input[type="file"]').setInputFiles({
    name: 'sample.html',
    mimeType: 'text/html',
    buffer: Buffer.from(`
      <!doctype html>
      <html>
        <body style="font-family: Arial, sans-serif; padding: 40px; background: #f8fafc;">
          <h1>Browser HTML export</h1>
          <p>Local HTML should render into PDF pages.</p>
        </body>
      </html>
    `),
  });

  await page.getByRole('button', { name: 'Run tool' }).click();
  await expect(page.getByText('sample.pdf')).toBeVisible({ timeout: 60_000 });
});

test('html to pdf offers common canvas width presets instead of only raw pixel entry', async ({ page }) => {
  await page.goto('/tools/pdf/html-to-pdf');

  await expect(page.getByText('Common canvas widths')).toBeVisible();
  await page.getByTestId('option-preset-width-mobile').click();
  await expect(page.locator('input[type="number"]').first()).toHaveValue('390');
});

test('image resize presets fill both width and height together', async ({ page }) => {
  await page.goto('/tools/image/image-resize');

  await expect(page.getByText('Recommended sizes')).toBeVisible();
  await page.getByTestId('option-preset-width-story').click();
  await expect(page.locator('input[type="number"]').first()).toHaveValue('1080');
  await expect(page.locator('input[type="number"]').nth(1)).toHaveValue('1920');
});

test('tool options can save, reapply, and reset a preset', async ({ page }) => {
  await page.goto('/tools/image/image-resize');

  const widthInput = page.locator('input[type="number"]').first();
  const heightInput = page.locator('input[type="number"]').nth(1);

  await widthInput.fill('777');
  await heightInput.fill('555');

  await page.getByTestId('tool-save-preset').click();

  await widthInput.fill('320');
  await heightInput.fill('240');

  await page.getByTestId('tool-apply-preset').click();
  await expect(widthInput).toHaveValue('777');
  await expect(heightInput).toHaveValue('555');

  await page.getByTestId('tool-reset-options').click();
  await expect(widthInput).toHaveValue('1280');
  await expect(heightInput).toHaveValue('720');
});

test('tool options restore the last successful run settings on revisit', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'jhtoolbox.toolOptionMemory',
      JSON.stringify({
        'image-resize': {
          lastRun: { width: 640, height: 360, format: 'image/webp' },
        },
      }),
    );
  });

  await page.goto('/tools/image/image-resize');

  await expect(page.locator('input[type="number"]').first()).toHaveValue('640');
  await expect(page.locator('input[type="number"]').nth(1)).toHaveValue('360');
  await expect(page.locator('select').first()).toHaveValue('image/webp');
  await expect(page.getByTestId('tool-option-memory-restored')).toBeVisible();
});

test('image tools show a before and after comparison for single-image results', async ({ page }) => {
  await page.goto('/tools/image/image-resize');

  const samplePng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAACAAAAAYCAYAAACbU/80AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAN9SURBVEhLDc4hC7aIAQBgf45pyfQmk8kwhANZcMUywxAGcsErlhmGMJAFVywzDGEgX3DFciaT6U0m/8jdE57+BOEff/z2ByI+xCSkZOQUlFTUNLR09AyMTMwsrGzsHJxc3Hx5eAnCnwSI+BCTkJKRU1BSUdPQ0tEzMDIxs7CysXNwcnHz5eElCP8kQMSHmISUjJyCkoqahpaOnoGRiZmFlY2dg5OLmy8PL0H4ZwEiPsQkpGTkFJRU1DS0dPQMjEzMLKxs7BycXNx8eXgJwlKAiA8xCSkZOQUlFTUNLR09AyMTMwsrGzsHJxc3Xx5egvAvAkR8iElIycgpKKmoaWjp6BkYmZhZWNnYOTi5uPny8BKEfxUg4kNMQkpGTkFJRU1DS0fPwMjEzMLKxs7BycXNl4eXIPybABEfYhJSMnIKSipqGlo6egZGJmYWVjZ2Dk4ubr48vAThzwJEfIhJSMnIKSipqGlo6egZGJmYWVjZ2Dk4ubj58vAShL8IEPEhJiElI6egpKKmoaWjZ2BkYmZhZWPn4OTi5svDSxB2AkR8iElIycgpKKmoaWjp6BkYmZhZWNnYOTi5uPny8BKEfxcg4kNMQkpGTkFJRU1DS0fPwMjEzMLKxs7BycXNl4eXIPyHABEfYhJSMnIKSipqGlo6egZGJmYWVjZ2Dk4ubr48vAThPwWI+BCTkJKRU1BSUdPQ0tEzMDIxs7CysXNwcnHz5eElCP8lQMSHmISUjJyCkoqahpaOnoGRiZmFlY2dg5OLmy8PL0H4bwEiPsQkpGTkFJRU1DS0dPQMjEzMLKxs7BycXNx8eXgJwlmAiA8xCSkZOQUlFTUNLR09AyMTMwsrGzsHJxc3Xx5egvA/AkR8iElIycgpKKmoaWjp6BkYmZhZWNnYOTi5uPny8BKE/xUg4kNMQkpGTkFJRU1DS0fPwMjEzMLKxs7BycXNl4eXIPyfABEfYhJSMnIKSipqGlo6egZGJmYWVjZ2Dk4ubr48vAThDwEiPsQkpGTkFJRU1DS0dPQMjEzMLKxs7BycXNx8eXgJwv8LEPEhJiElI6egpKKmoaWjZ2BkYmZhZWPn4OTi5svDSxAeAkR8iElIycgpKKmoaWjp6BkYmZhZWNnYOTi5uPny8BKEvwoQ8SEmISUjp6CkoqahpaNnYGRiZmFlY+fg5OLmy8P764/ffgeL3ET5fTaOFgAAAABJRU5ErkJggg==',
    'base64',
  );

  await page.locator('input[type="file"]').setInputFiles({
    name: 'compare-source.png',
    mimeType: 'image/png',
    buffer: samplePng,
  });

  await page.getByRole('button', { name: 'Run tool' }).click();

  await expect(page.getByTestId('before-after-compare')).toBeVisible({ timeout: 60_000 });
  const slider = page.getByTestId('before-after-compare-slider');
  await slider.fill('72');
  await expect(slider).toHaveValue('72');
});

test('image crop supports fixed ratios and freeform drag editing before processing', async ({ page }) => {
  await page.goto('/tools/image/image-crop');

  await page.locator('input[type="file"]').setInputFiles({
    name: 'sample-crop.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">' +
        '<rect width="1200" height="800" fill="#e2e8f0" />' +
        '<rect x="80" y="80" width="400" height="240" fill="#0f172a" />' +
        '<rect x="620" y="120" width="460" height="560" fill="#38bdf8" />' +
        '<rect x="120" y="430" width="380" height="250" fill="#f97316" />' +
        '</svg>',
    ),
  });

  await expect(page.getByTestId('image-crop-editor')).toBeVisible();
  await page.getByTestId('image-crop-preset-16-9').click();
  await expect(page.getByTestId('image-crop-metrics')).toContainText('1200px');

  const selection = page.getByTestId('image-crop-selection');
  const ratioBox = await selection.boundingBox();
  if (!ratioBox) {
    throw new Error('Image crop selection box was not available.');
  }

  const ratioHandle = page.getByTestId('image-crop-handle-se');
  const ratioHandleBox = await ratioHandle.boundingBox();
  if (!ratioHandleBox) {
    throw new Error('Image crop resize handle was not available.');
  }

  await ratioHandle.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;
    const targetX = startX - 140;
    const targetY = startY - 100;

    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: startX, clientY: startY, button: 0 }));
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: targetX, clientY: targetY, buttons: 1 }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: targetX, clientY: targetY, button: 0 }));
  });

  const resizedBox = await selection.boundingBox();
  if (!resizedBox) {
    throw new Error('Image crop selection box was not available after resizing.');
  }
  expect(Math.abs(resizedBox.width - ratioBox.width)).toBeGreaterThan(10);

  await page.getByTestId('image-crop-preset-free').click();
  const stage = page.getByTestId('image-crop-stage');
  const stageBox = await stage.boundingBox();
  if (!stageBox) {
    throw new Error('Image crop stage was not available.');
  }

  await page.mouse.move(stageBox.x + stageBox.width - 24, stageBox.y + stageBox.height - 24);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + stageBox.width * 0.55, stageBox.y + stageBox.height * 0.55, { steps: 12 });
  await page.mouse.up();

  const freeformBox = await selection.boundingBox();
  if (!freeformBox) {
    throw new Error('Image crop selection box was not available after freeform drawing.');
  }
  expect(freeformBox.width).toBeLessThan(stageBox.width);
  expect(freeformBox.height).toBeLessThan(stageBox.height);
  await expect(page.getByText('Options')).toHaveCount(0);
  await expect(page.locator('input[type="number"]')).toHaveCount(0);
});
test('url-based tools start from direct input without showing the upload dropzone', async ({ page }) => {
  await page.goto('/tools/pdf/url-pdf');

  await expect(page.getByText('Direct input')).toBeVisible();
  await expect(page.locator('input[type="text"]').first()).toHaveValue('');
  await expect(page.locator('input[type="text"]').first()).toHaveAttribute('placeholder', 'https://example.com');
  await expect(page.getByText(/Drag files here|Drop files here/)).toHaveCount(0);
});

test('url pdf captures the full page scroll before generating the pdf', async ({ page }) => {
  const tinyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9n+wAAAABJRU5ErkJggg==',
    'base64',
  );
  let requestedCaptureUrl = '';

  await page.route('https://image.thum.io/**', async (route) => {
    requestedCaptureUrl = route.request().url();
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: tinyPng,
    });
  });

  await page.goto('/tools/pdf/url-pdf');
  await page.getByRole('button', { name: 'Run tool' }).click();

  await expect(page.getByText('url-capture.pdf')).toBeVisible({ timeout: 60_000 });
  expect(requestedCaptureUrl).toContain('/fullpage/');
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
  await expect(page.getByTestId('url-image-crop-preset-free')).toBeVisible();

  await page.getByTestId('url-image-crop-preset-4-3').click();
  const selection = page.getByTestId('url-image-crop-selection');
  const initialBox = await selection.boundingBox();
  if (!initialBox) {
    throw new Error('URL image crop selection box was not available.');
  }

  await selection.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;
    const targetY = startY + 80;

    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: startX, clientY: startY, button: 0 }));
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: startX, clientY: targetY, buttons: 1 }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: startX, clientY: targetY, button: 0 }));
  });

  const movedBox = await selection.boundingBox();
  if (!movedBox) {
    throw new Error('URL image crop selection box disappeared after dragging.');
  }
  expect(Math.abs(movedBox.y - initialBox.y)).toBeGreaterThan(5);
  await expect(page.getByText('Crop width')).toBeVisible();

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

test('audio recorder legacy route redirects to the unified editor', async ({ page }) => {
  await page.goto('/tools/audio/audio-recorder');

  await expect(page).toHaveURL(/\/tools\/audio$/);
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
