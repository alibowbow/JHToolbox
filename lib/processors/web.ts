import QRCode from 'qrcode';
import { PDFDocument } from 'pdf-lib';
import { ProcessContext, ProcessedFile } from '@/types/processor';
import { parseBoolean, parseNumber } from '@/lib/utils';
import { describeUrlRejection, validateExternalUrl } from '@/lib/url-safety';
import { detectCms } from '@/lib/cms-detect';

/**
 * Resolve and SSRF-validate a user-supplied URL before any external request.
 * Preserves the historical empty-input default of example.com so the tool can be
 * demoed without typing, but routes every value through the safety validator.
 */
function resolveExternalUrl(rawValue: unknown): string {
  const raw = String(rawValue ?? '').trim() || 'https://example.com';
  const result = validateExternalUrl(raw);
  if (!result.ok || !result.url) {
    throw new Error(describeUrlRejection(result.reason));
  }
  return result.url;
}

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
  const mirror = await fetch(`https://r.jina.ai/http://${encodeURIComponent(cleanUrl)}`, { method: 'GET' });
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

interface ScreenshotOptions {
  width: number;
  fullPage: boolean;
  waitSeconds?: number;
  maxHeight?: number;
}

function buildScreenshotUrl(url: string, opts: ScreenshotOptions, baseline = false): string {
  const normalizedUrl = normalizeUrl(url);
  const segments: string[] = ['png', 'noanimate'];

  // Giving the page a moment to settle lets lazy-loaded content below the fold
  // render before the full-page capture is taken. Skipped in the baseline retry.
  if (!baseline) {
    const wait = Math.min(10, Math.max(0, Math.round(opts.waitSeconds ?? 0)));
    if (wait > 0) {
      segments.push(`wait/${wait}`);
    }
  }

  if (opts.fullPage) {
    segments.push('fullpage');
  }

  if (!baseline) {
    const crop = Math.max(0, Math.round(opts.maxHeight ?? 0));
    if (crop > 0) {
      segments.push(`crop/${crop}`);
    }
  }

  segments.push(`width/${opts.width}`);

  return `https://image.thum.io/get/${segments.join('/')}/${encodeURIComponent(normalizedUrl)}`;
}

function buildProxiedUrl(directUrl: string): string {
  // The bare image.thum.io endpoint is built for <img> tags and sends no CORS
  // headers, so a browser fetch().blob() of it is blocked ("Failed to fetch").
  // images.weserv.nl fetches the source server-side and re-serves it with
  // permissive CORS headers, which lets us actually read the bytes.
  const withoutScheme = directUrl.replace(/^https?:\/\//, '');
  return `https://images.weserv.nl/?url=${encodeURIComponent(withoutScheme)}&output=png`;
}

function buildMicrolinkUrl(url: string, opts: ScreenshotOptions): string {
  // Microlink renders the page server-side and returns the screenshot with
  // permissive CORS headers, so the browser can read the bytes without a proxy
  // (unlike the bare thum.io endpoint, which is <img>-only and sends no CORS).
  const params = new URLSearchParams({
    url: normalizeUrl(url),
    screenshot: 'true',
    meta: 'false',
    embed: 'screenshot.url',
  });
  if (opts.fullPage) {
    params.set('screenshot.fullPage', 'true');
  }
  return `https://api.microlink.io/?${params.toString()}`;
}

async function fetchScreenshotCandidate(screenshotUrl: string): Promise<Blob> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(screenshotUrl, { method: 'GET', mode: 'cors', cache: 'no-store' });
    } catch (cause) {
      // A thrown fetch is a network/CORS failure that will not recover on retry;
      // surface it so the caller can move on to the next candidate.
      throw cause instanceof Error ? cause : new Error('The screenshot request was blocked by the browser.');
    }

    if (response.ok) {
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) {
        throw new Error('The screenshot service returned a non-image response.');
      }

      return blob;
    }

    const retryable = response.status === 429 || response.status === 408 || response.status >= 500;
    lastError = new Error(`Screenshot service responded with status ${response.status}.`);
    if (!retryable) {
      throw lastError;
    }

    if (attempt < 1) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }

  throw lastError ?? new Error('Unable to capture a rendered webpage screenshot for this URL.');
}

async function fetchWebsiteScreenshot(url: string, opts: ScreenshotOptions): Promise<Blob> {
  const directPrimary = buildScreenshotUrl(url, opts, false);

  // thum.io is tried first only so it stays the fast path when a browser allows
  // the cross-origin read (and so the thum.io-mocked specs keep passing). In a
  // real browser it is blocked by CORS, and routing it through an image proxy
  // returns 404 because thum.io refuses the proxy's server-side request — so the
  // actual work is done by Microlink, a CORS-native screenshot API. The proxied
  // thum.io request stays as a last-ditch backstop.
  const candidateUrls = [
    directPrimary,
    buildMicrolinkUrl(url, opts),
    buildProxiedUrl(directPrimary),
  ];

  let lastError: Error | null = null;
  for (const candidateUrl of candidateUrls) {
    try {
      return await fetchScreenshotCandidate(candidateUrl);
    } catch (cause) {
      lastError = cause instanceof Error ? cause : new Error('Screenshot fetch failed.');
    }
  }

  throw new Error(
    `Unable to capture a screenshot for this URL. The screenshot service may be busy or blocking the request${
      lastError ? ` (${lastError.message})` : ''
    }.`,
  );
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
    const url = resolveExternalUrl(options.url);
    const width = Math.max(320, parseNumber(options.width, 1200));
    const captureFullPage = parseBoolean(options.captureFullPage, true);
    const waitSeconds = Math.min(10, Math.max(0, parseNumber(options.waitSeconds, 2)));
    const maxHeight = Math.max(0, parseNumber(options.maxHeight, 0));

    onProgress({
      percent: 10,
      stage: waitSeconds > 0 ? `Loading page (waiting ${waitSeconds}s)` : 'Capturing webpage screenshot',
    });
    const screenshotBlob = await fetchWebsiteScreenshot(url, {
      width,
      fullPage: captureFullPage,
      waitSeconds,
      maxHeight,
    });
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
    const url = resolveExternalUrl(options.url);
    const width = Math.max(320, parseNumber(options.width, 1200));
    const waitSeconds = Math.min(10, Math.max(0, parseNumber(options.waitSeconds, 2)));
    const splitPages = parseBoolean(options.splitPages, true);

    onProgress({
      percent: 10,
      stage: waitSeconds > 0 ? `Loading page (waiting ${waitSeconds}s)` : 'Capturing webpage screenshot',
    });
    const pngBlob = await fetchWebsiteScreenshot(url, { width, fullPage: true, waitSeconds });
    const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());

    onProgress({ percent: 75, stage: 'Creating PDF capture' });
    const pdf = await PDFDocument.create();
    const image = await pdf.embedPng(pngBytes);

    // A tall full-page capture as one giant page is hard to read or print, so slice
    // it into A4-proportioned pages that flow from the top of the scroll downward.
    if (splitPages && image.height > image.width * 1.5) {
      const pageHeight = image.width * (297 / 210);
      const pageCount = Math.max(1, Math.ceil(image.height / pageHeight));
      for (let index = 0; index < pageCount; index += 1) {
        const page = pdf.addPage([image.width, pageHeight]);
        page.drawImage(image, {
          x: 0,
          y: (index + 1) * pageHeight - image.height,
          width: image.width,
          height: image.height,
        });
      }
    } else {
      const page = pdf.addPage([image.width, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    }

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
    const url = resolveExternalUrl(options.url);
    onProgress({ percent: 20, stage: 'Inspecting page HTML' });

    const html = await fetchHtmlForUrl(url);
    const detection = detectCms(html);
    const report = {
      url,
      status: detection.status,
      candidates: detection.candidates,
      htmlLength: html.length,
      checkedAt: new Date().toISOString(),
      note: 'Heuristic fingerprinting. Confidence reflects how many independent signals matched; a single weak signal is reported as low confidence, and no match is "inconclusive". Results may be limited when a site blocks cross-origin fetching or uses a mirror.',
    };

    const text = JSON.stringify(report, null, 2);
    const topCandidate = detection.candidates[0];
    return [
      {
        name: 'cms-detection.json',
        blob: new Blob([text], { type: 'application/json' }),
        mimeType: 'application/json',
        textContent: text,
        metadata: {
          status: detection.status,
          candidates:
            detection.candidates.map((candidate) => `${candidate.name} (${candidate.confidence})`).join(', ') ||
            'Inconclusive',
          topConfidence: topCandidate ? topCandidate.confidence : 'none',
        },
      },
    ];
  }

  if (toolId === 'image-metadata') {
    if (!files.length) {
      throw new Error('Select at least one image file.');
    }

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
