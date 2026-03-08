import QRCode from 'qrcode';
import { PDFDocument } from 'pdf-lib';
import { ProcessContext, ProcessedFile } from '@/types/processor';
import { parseBoolean, parseNumber } from '@/lib/utils';

function blobFromBytes(bytes: Uint8Array, mimeType: string): Blob {
  return new Blob([Uint8Array.from(bytes).buffer], { type: mimeType });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, body] = dataUrl.split(',');
  const mimeType = header.match(/:(.*?);/)?.[1] ?? 'application/octet-stream';
  const decoded = atob(body);
  const bytes = new Uint8Array(decoded.length);

  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }

  return blobFromBytes(bytes, mimeType);
}

async function fetchHtmlForUrl(url: string): Promise<string> {
  const direct = await fetch(url, { method: 'GET', mode: 'cors' }).catch(() => null);
  if (direct?.ok) {
    return await direct.text();
  }

  const cleanUrl = url.replace(/^https?:\/\//, '');
  const mirror = await fetch(`https://r.jina.ai/http://${cleanUrl}`, { method: 'GET' });
  if (!mirror.ok) {
    throw new Error('Unable to fetch HTML for this URL. The target may block CORS or remote access.');
  }

  return await mirror.text();
}

function normalizeUrl(url: string) {
  const trimmed = url.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return new URL(withProtocol).toString();
}

function buildScreenshotUrl(url: string, width: number, captureFullPage: boolean) {
  const normalizedUrl = normalizeUrl(url);
  const fullPageSegment = captureFullPage ? 'fullpage/' : '';
  return `https://image.thum.io/get/png/noanimate/${fullPageSegment}width/${width}/${normalizedUrl}`;
}

async function fetchWebsiteScreenshot(url: string, width: number, captureFullPage: boolean): Promise<Blob> {
  const screenshotUrl = buildScreenshotUrl(url, width, captureFullPage);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(screenshotUrl, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
    }).catch((cause) => {
      lastError = cause instanceof Error ? cause : new Error('Screenshot fetch failed.');
      return null;
    });

    if (response?.ok) {
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) {
        throw new Error('The remote screenshot service returned an unexpected response.');
      }

      return blob;
    }

    lastError = new Error(`Screenshot fetch failed with status ${response?.status ?? 'unknown'}.`);
    await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
  }

  throw lastError ?? new Error('Unable to capture a rendered webpage screenshot for this URL.');
}

function detectCmsFromHtml(html: string): string[] {
  const lowerHtml = html.toLowerCase();
  const matches: string[] = [];

  const patterns: Array<[string, RegExp]> = [
    ['WordPress', /wp-content|wp-json|wordpress/i],
    ['Shopify', /cdn\.shopify|shopify-section|shopify/i],
    ['Wix', /wix\.com|wix-static/i],
    ['Squarespace', /squarespace|static\.squarespace/i],
    ['Drupal', /drupal-settings-json|drupal/i],
    ['Joomla', /joomla|com_content/i],
    ['Ghost', /ghost\/.+\.js|ghost-content-api/i],
    ['Next.js', /_next\/|next-head/i],
    ['Nuxt', /__nuxt|nuxt/i],
  ];

  patterns.forEach(([name, pattern]) => {
    if (pattern.test(lowerHtml)) {
      matches.push(name);
    }
  });

  return matches;
}

export async function processWebTool(ctx: ProcessContext): Promise<ProcessedFile[]> {
  const { toolId, files, options, onProgress } = ctx;

  if (toolId === 'qr-generator') {
    const content = String(options.content ?? 'https://example.com');
    const size = Math.max(64, parseNumber(options.size, 320));

    onProgress({ percent: 40, stage: 'Generating QR code' });
    const dataUrl = await QRCode.toDataURL(content, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
    });

    return [
      {
        name: 'qr-code.png',
        blob: dataUrlToBlob(dataUrl),
        mimeType: 'image/png',
        previewUrl: dataUrl,
      },
    ];
  }

  if (toolId === 'url-image') {
    const url = String(options.url ?? 'https://example.com');
    const width = Math.max(320, parseNumber(options.width, 1200));
    const captureFullPage = parseBoolean(options.captureFullPage, true);

    onProgress({ percent: 10, stage: 'Capturing webpage screenshot' });
    const screenshotBlob = await fetchWebsiteScreenshot(url, width, captureFullPage);
    onProgress({ percent: 85, stage: 'Preparing image download' });

    return [
      {
        name: 'url-capture.png',
        blob: screenshotBlob,
        mimeType: 'image/png',
      },
    ];
  }

  if (toolId === 'url-pdf') {
    const url = String(options.url ?? 'https://example.com');
    const width = Math.max(320, parseNumber(options.width, 1200));

    onProgress({ percent: 10, stage: 'Capturing webpage screenshot' });
    const pngBlob = await fetchWebsiteScreenshot(url, width, true);
    const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());

    onProgress({ percent: 75, stage: 'Creating PDF capture' });
    const pdf = await PDFDocument.create();
    const image = await pdf.embedPng(pngBytes);
    const page = pdf.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });

    const bytes = await pdf.save({ useObjectStreams: true });
    return [
      {
        name: 'url-capture.pdf',
        blob: blobFromBytes(bytes, 'application/pdf'),
        mimeType: 'application/pdf',
      },
    ];
  }

  if (toolId === 'detect-cms') {
    const url = String(options.url ?? 'https://example.com');
    onProgress({ percent: 20, stage: 'Inspecting page HTML' });

    const html = await fetchHtmlForUrl(url);
    const detectedCms = detectCmsFromHtml(html);
    const report = {
      url,
      detected: detectedCms,
      htmlLength: html.length,
      checkedAt: new Date().toISOString(),
      note: 'Results may be limited when a site blocks cross-origin fetching or mirrors.',
    };

    const text = JSON.stringify(report, null, 2);
    return [
      {
        name: 'cms-detection.json',
        blob: new Blob([text], { type: 'application/json' }),
        mimeType: 'application/json',
        textContent: text,
        metadata: {
          candidates: detectedCms.join(', ') || 'Unknown',
        },
      },
    ];
  }

  if (toolId === 'image-metadata') {
    const outputFiles: ProcessedFile[] = [];
    const exifr: any = await import('exifr');

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      onProgress({ percent: (index / files.length) * 100, stage: 'Reading metadata' });

      const bitmap = await createImageBitmap(file);
      const basicMetadata = {
        name: file.name,
        size: file.size,
        type: file.type,
        width: bitmap.width,
        height: bitmap.height,
      };
      bitmap.close();

      const exif = (await exifr.parse(file).catch(() => null)) ?? {};
      const merged = {
        ...basicMetadata,
        ...exif,
      };
      const text = JSON.stringify(merged, null, 2);

      outputFiles.push({
        name: `${file.name.replace(/\.[^/.]+$/, '')}-metadata.json`,
        blob: new Blob([text], { type: 'application/json' }),
        mimeType: 'application/json',
        textContent: text,
        metadata: {
          width: basicMetadata.width,
          height: basicMetadata.height,
          bytes: basicMetadata.size,
        },
      });
    }

    return outputFiles;
  }

  return [];
}
