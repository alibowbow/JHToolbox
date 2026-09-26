import QRCode from 'qrcode';
import { decodeImage } from '@/lib/processors/image-decode';
import { PDFDocument } from 'pdf-lib';
import { ProcessContext, ProcessedFile } from '@/types/processor';
import { parseBoolean, parseNumber } from '@/lib/utils';
import { describeUrlRejection, validateExternalUrl } from '@/lib/url-safety';
import { detectCms } from '@/lib/cms-detect';
import { pngDimensions } from '@/lib/media-dimensions';
import {
  CaptureError,
  classifyServiceFailure,
  summarizeCaptureFailures,
  type CaptureFailureKind,
} from '@/lib/capture-failure';

/** A validated public http(s) URL; an empty box is an error, not a default site. */
function resolveExternalUrl(rawValue: unknown): string {
  const result = validateExternalUrl(String(rawValue ?? '').trim());
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
  // Give lazy-loaded content below the fold a chance to render before the
  // capture; without it a "full" scroll can come back with blank tails.
  const wait = Math.min(10, Math.max(0, Math.round(opts.waitSeconds ?? 0)));
  if (wait > 0) {
    params.set('screenshot.waitForTimeout', String(wait * 1000));
  }
  return `https://api.microlink.io/?${params.toString()}`;
}

/** One service's failure, carried to the caller so the final error can say why. */
class CandidateFailure extends Error {
  readonly kind: CaptureFailureKind;

  constructor(kind: CaptureFailureKind, detail: string) {
    super(detail);
    this.kind = kind;
  }
}

async function fetchScreenshotCandidate(screenshotUrl: string, signal?: AbortSignal): Promise<Blob> {
  for (let attempt = 0; ; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(screenshotUrl, { method: 'GET', mode: 'cors', cache: 'no-store', signal });
    } catch (cause) {
      if (signal?.aborted) {
        throw cause;
      }
      // A thrown fetch is a network/CORS failure that will not recover on retry.
      throw new CandidateFailure('network', cause instanceof Error ? cause.message : 'request failed');
    }

    if (response.ok) {
      const blob = await response.blob();
      if (blob.type.startsWith('image/')) {
        return blob;
      }
      // Some services answer 200 with an error payload instead of a picture.
      const failure = classifyServiceFailure(response.status, await blob.text().catch(() => ''));
      throw new CandidateFailure(failure.kind, failure.detail || 'not an image');
    }

    const failure = classifyServiceFailure(response.status, await response.text().catch(() => ''));
    // Only a service hiccup is worth one more try; a timeout would double the
    // wait and a block or a spent quota will not change a second later.
    const transient = failure.kind === 'unknown' && (response.status >= 500 || response.status === 408);
    if (!transient || attempt >= 1) {
      throw new CandidateFailure(failure.kind, failure.detail);
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
}

/**
 * True when a capture is one flat colour: the service's browser showed an empty
 * page (blocked, or still loading). Tiny images and formats the browser cannot
 * decode here are not judged.
 */
async function isBlankCapture(blob: Blob): Promise<boolean> {
  if (typeof createImageBitmap !== 'function') {
    return false;
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return false;
  }
  try {
    if (bitmap.width < 64 || bitmap.height < 64) {
      return false;
    }
    const width = 160;
    const height = Math.min(2400, Math.max(1, Math.round((bitmap.height * width) / bitmap.width)));
    const context =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(width, height).getContext('2d')
        : Object.assign(document.createElement('canvas'), { width, height }).getContext('2d');
    if (!context) {
      return false;
    }
    // Downscaling averages any text or line into visibly different pixels.
    context.drawImage(bitmap, 0, 0, width, height);
    const { data } = context.getImageData(0, 0, width, height);
    for (let index = 4; index < data.length; index += 4) {
      for (let channel = 0; channel < 4; channel += 1) {
        if (Math.abs(data[index + channel] - data[channel]) > 6) {
          return false;
        }
      }
    }
    return true;
  } finally {
    bitmap.close();
  }
}

/**
 * Pixel size of a capture. PNG headers are read directly; any other format
 * (JPEG/WebP from proxies, SVG) is decoded by the browser so it is compared on
 * real height rather than counted as zero.
 */
async function readImageSize(blob: Blob): Promise<{ width: number; height: number } | null> {
  const fromHeader = pngDimensions(new Uint8Array(await blob.arrayBuffer()));
  if (fromHeader || typeof Image === 'undefined') {
    return fromHeader;
  }

  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image.naturalWidth > 0 && image.naturalHeight > 0
      ? { width: image.naturalWidth, height: image.naturalHeight }
      : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function fetchWebsiteScreenshot(url: string, opts: ScreenshotOptions, signal?: AbortSignal): Promise<Blob> {
  const directPrimary = buildScreenshotUrl(url, opts, false);

  // For viewport captures thum.io stays the fast path (and the thum.io-mocked
  // specs keep passing); in a real browser its bare endpoint is usually
  // CORS-blocked and Microlink does the work. For FULL-PAGE captures Microlink
  // goes first: its fullPage rendering is documented, while anonymous thum.io
  // frequently ignores/caps the fullpage segment and would "succeed" with just
  // the top of the scroll. The proxied thum.io request stays as a backstop.
  const candidateUrls = opts.fullPage
    ? [buildMicrolinkUrl(url, opts), directPrimary, buildProxiedUrl(directPrimary)]
    : [directPrimary, buildMicrolinkUrl(url, opts), buildProxiedUrl(directPrimary)];

  // A full-page request must not settle for a viewport-shaped answer: accept a
  // capture that is clearly a scroll (height ≥ 2× width) immediately, otherwise
  // keep trying candidates and return the tallest capture we saw.
  let best: { blob: Blob; height: number } | null = null;
  const failures: CaptureFailureKind[] = [];
  let lastDetail = '';
  for (const candidateUrl of candidateUrls) {
    let blob: Blob;
    try {
      blob = await fetchScreenshotCandidate(candidateUrl, signal);
    } catch (cause) {
      if (!(cause instanceof CandidateFailure)) {
        throw cause;
      }
      failures.push(cause.kind);
      lastDetail = cause.message;
      continue;
    }

    if (await isBlankCapture(blob)) {
      failures.push('blank');
      continue;
    }

    if (!opts.fullPage) {
      return blob;
    }

    const dims = await readImageSize(blob);
    if (dims && dims.height >= dims.width * 2) {
      return blob;
    }
    const height = dims?.height ?? 0;
    if (!best || height > best.height) {
      best = { blob, height };
    }
  }

  if (best) {
    // No candidate produced an unambiguous scroll capture; the page itself may
    // simply be short. Return the tallest capture instead of failing.
    return best.blob;
  }

  throw new CaptureError(summarizeCaptureFailures(failures), lastDetail);
}

/**
 * A capture as a PDF. A tall full-page capture as one giant page is hard to
 * read or print, so it is sliced into A4-proportioned pages from the top down.
 */
async function buildCapturePdf(capture: Blob, splitPages: boolean): Promise<Blob> {
  const bytes = new Uint8Array(await capture.arrayBuffer());
  const pdf = await PDFDocument.create();
  // Proxies can answer with JPEG instead of PNG.
  const image = bytes[0] === 0xff && bytes[1] === 0xd8 ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);

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

  return blobFromBytes(await pdf.save({ useObjectStreams: true }), 'application/pdf');
}

/** One still picture from a shared tab or window, as PNG. Stops the sharing. */
async function grabDisplayFrame(stream: MediaStream): Promise<Blob> {
  const video = document.createElement('video');
  try {
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('The shared tab did not send a picture.')), 10_000);
      const done = () => {
        window.clearTimeout(timer);
        resolve();
      };
      if (typeof video.requestVideoFrameCallback === 'function') {
        video.requestVideoFrameCallback(() => done());
      } else if (video.readyState >= 2 && video.videoWidth > 0) {
        done();
      } else {
        video.addEventListener('loadeddata', done, { once: true });
      }
    });
    // The first frame can predate the tab's last paint; take a later one.
    await new Promise((resolve) => window.setTimeout(resolve, 150));

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context || !canvas.width || !canvas.height) {
      throw new Error('The shared tab did not send a picture.');
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) {
      throw new Error('Failed to create a canvas blob.');
    }
    return blob;
  } finally {
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  }
}

/**
 * The capture tools' output made from a tab the user shared from their own
 * browser: used when the screenshot services cannot open the site.
 */
export async function buildResultFromSharedTab(
  toolId: string,
  stream: MediaStream,
  options: Record<string, string | number | boolean>,
): Promise<ProcessedFile[]> {
  const png = await grabDisplayFrame(stream);
  if (toolId === 'url-pdf') {
    const pdf = await buildCapturePdf(png, parseBoolean(options.splitPages, true));
    return [{ name: 'url-capture.pdf', blob: pdf, mimeType: 'application/pdf' }];
  }
  return [{ name: 'url-capture.png', blob: png, mimeType: 'image/png' }];
}

export async function processWebTool(ctx: ProcessContext): Promise<ProcessedFile[]> {
  const { toolId, files, options, onProgress, signal } = ctx;

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
    const screenshotBlob = await fetchWebsiteScreenshot(
      url,
      {
        width,
        fullPage: captureFullPage,
        waitSeconds,
        maxHeight,
      },
      signal,
    );
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
    const pngBlob = await fetchWebsiteScreenshot(url, { width, fullPage: true, waitSeconds }, signal);

    onProgress({ percent: 75, stage: 'Creating PDF capture' });
    const pdfBlob = await buildCapturePdf(pngBlob, splitPages);
    return [
      {
        name: 'url-capture.pdf',
        blob: pdfBlob,
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

      const bitmap = await decodeImage(file);
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
