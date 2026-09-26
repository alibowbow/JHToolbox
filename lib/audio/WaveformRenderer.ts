import { clampTime, type AudioWaveformRenderOptions } from './types';

type WaveformCanvas = HTMLCanvasElement | OffscreenCanvas;

type CachedWaveform = {
  canvas: WaveformCanvas;
  width: number;
  height: number;
};

const waveformCache = new WeakMap<AudioBuffer, Map<string, CachedWaveform>>();

function hasOffscreenCanvas(): boolean {
  return typeof OffscreenCanvas !== 'undefined';
}

function createCanvas(width: number, height: number): WaveformCanvas {
  if (hasOffscreenCanvas()) {
    return new OffscreenCanvas(width, height);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function getCanvasContext(canvas: WaveformCanvas) {
  return canvas.getContext('2d');
}

function getCacheKey(width: number, height: number, theme: AudioWaveformRenderOptions['theme'], color: string) {
  return `${width}x${height}:${theme}:${color}`;
}

/** Default waveform colour per theme (the brand indigo). */
export function defaultWaveformColor(theme: AudioWaveformRenderOptions['theme']) {
  return theme === 'dark' ? '#818cf8' : '#4f46e5';
}

function getSourceWidth(buffer: AudioBuffer, requestedWidth: number) {
  const durationWidth = Math.ceil(buffer.duration * 180);
  return Math.max(requestedWidth, Math.min(8192, Math.max(1024, durationWidth)));
}

function getWaveformMap(buffer: AudioBuffer) {
  let bufferCache = waveformCache.get(buffer);
  if (!bufferCache) {
    bufferCache = new Map<string, CachedWaveform>();
    waveformCache.set(buffer, bufferCache);
  }

  return bufferCache;
}

function getChannelData(buffer: AudioBuffer) {
  return Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
}

/**
 * Peak outline in a lighter tone with the RMS (loudness) body in full colour,
 * on a transparent background so the clip behind it shows its track colour.
 */
function drawWaveformBase(
  canvas: WaveformCanvas,
  buffer: AudioBuffer,
  theme: AudioWaveformRenderOptions['theme'],
  color: string,
) {
  const context = getCanvasContext(canvas);
  if (!context) {
    return;
  }

  const width = canvas.width;
  const height = canvas.height;
  const channels = getChannelData(buffer);
  const halfHeight = height / 2;
  const sampleCount = buffer.length;
  const samplesPerPixel = Math.max(1, Math.floor(sampleCount / Math.max(width, 1)));
  // Long buffers: sample a bounded number of frames per column.
  const stride = Math.max(1, Math.floor(samplesPerPixel / 256));

  context.clearRect(0, 0, width, height);
  context.fillStyle = theme === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.12)';
  context.fillRect(0, Math.floor(halfHeight), width, 1);

  const peaks = new Float32Array(width);
  const levels = new Float32Array(width);
  for (let column = 0; column < width; column += 1) {
    const startSample = column * samplesPerPixel;
    const endSample = Math.min(startSample + samplesPerPixel, sampleCount);
    let peak = 0;
    let sumSquares = 0;
    let count = 0;

    for (const channel of channels) {
      for (let sampleIndex = startSample; sampleIndex < endSample; sampleIndex += stride) {
        const value = channel[sampleIndex] ?? 0;
        const magnitude = value < 0 ? -value : value;
        if (magnitude > peak) {
          peak = magnitude;
        }
        sumSquares += value * value;
        count += 1;
      }
    }

    peaks[column] = Math.min(1, peak);
    levels[column] = count > 0 ? Math.min(1, Math.sqrt(sumSquares / count)) : 0;
  }

  const scale = height * 0.46;
  context.globalAlpha = 0.45;
  context.fillStyle = color;
  for (let column = 0; column < width; column += 1) {
    const extent = Math.max(0.5, peaks[column] * scale);
    context.fillRect(column, halfHeight - extent, 1, extent * 2);
  }
  context.globalAlpha = 1;
  for (let column = 0; column < width; column += 1) {
    const extent = Math.max(0.5, levels[column] * scale * 1.2);
    context.fillRect(column, halfHeight - extent, 1, extent * 2);
  }
}

export function renderWaveformOffscreen(
  buffer: AudioBuffer,
  width: number,
  height: number,
  theme: AudioWaveformRenderOptions['theme'] = 'dark',
  color: string = defaultWaveformColor(theme),
): WaveformCanvas {
  const safeWidth = Math.max(1, Math.floor(width));
  const safeHeight = Math.max(1, Math.floor(height));
  const sourceWidth = getSourceWidth(buffer, safeWidth);
  const cacheKey = getCacheKey(sourceWidth, safeHeight, theme, color);
  const bufferCache = getWaveformMap(buffer);
  const cached = bufferCache.get(cacheKey);

  if (cached) {
    return cached.canvas;
  }

  const canvas = createCanvas(sourceWidth, safeHeight);
  canvas.width = sourceWidth;
  canvas.height = safeHeight;
  drawWaveformBase(canvas, buffer, theme, color);

  bufferCache.set(cacheKey, { canvas, width: sourceWidth, height: safeHeight });
  return canvas;
}

export function renderWaveform(opts: AudioWaveformRenderOptions): void {
  const { buffer, canvas, startSec, endSec, selectionStart, selectionEnd, playheadSec, theme } = opts;
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  const width = Math.max(1, canvas.width);
  const height = Math.max(1, canvas.height);
  const safeDuration = Math.max(buffer.duration, 0.0001);
  const safeStart = clampTime(startSec, 0, safeDuration);
  const safeEnd = clampTime(Math.max(endSec, safeStart + 0.0001), safeStart + 0.0001, safeDuration);
  const source = renderWaveformOffscreen(buffer, width, height, theme);
  const sourceWidth = source.width;
  const sourceStart = Math.floor((safeStart / safeDuration) * sourceWidth);
  const sourceEnd = Math.max(sourceStart + 1, Math.floor((safeEnd / safeDuration) * sourceWidth));
  const sourceSliceWidth = Math.max(1, sourceEnd - sourceStart);

  context.clearRect(0, 0, width, height);
  context.drawImage(source as CanvasImageSource, sourceStart, 0, sourceSliceWidth, source.height, 0, 0, width, height);

  const selectionStartSec = selectionStart ?? safeStart;
  const selectionEndSec = selectionEnd ?? safeEnd;
  const normalizedSelectionStart = Math.min(selectionStartSec, selectionEndSec);
  const normalizedSelectionEnd = Math.max(selectionStartSec, selectionEndSec);
  const selectionLeft = ((clampTime(normalizedSelectionStart, safeStart, safeEnd) - safeStart) / (safeEnd - safeStart)) * width;
  const selectionRight = ((clampTime(normalizedSelectionEnd, safeStart, safeEnd) - safeStart) / (safeEnd - safeStart)) * width;
  const playheadLeft = playheadSec == null ? null : ((clampTime(playheadSec, safeStart, safeEnd) - safeStart) / (safeEnd - safeStart)) * width;
  const hasPartialSelection =
    selectionStart != null &&
    selectionEnd != null &&
    normalizedSelectionEnd - normalizedSelectionStart < safeEnd - safeStart - 0.0005;

  if (hasPartialSelection && selectionRight > selectionLeft) {
    context.save();
    context.beginPath();
    context.rect(selectionLeft, 0, Math.max(1, selectionRight - selectionLeft), height);
    context.clip();
    context.drawImage(source as CanvasImageSource, sourceStart, 0, sourceSliceWidth, source.height, 0, 0, width, height);
    context.fillStyle = theme === 'dark' ? 'rgba(129, 140, 248, 0.28)' : 'rgba(79, 70, 229, 0.22)';
    context.globalCompositeOperation = 'source-atop';
    context.fillRect(selectionLeft, 0, Math.max(1, selectionRight - selectionLeft), height);
    context.restore();
  }

  if (hasPartialSelection) {
    context.fillStyle = theme === 'dark' ? 'rgba(4, 8, 10, 0.8)' : 'rgba(248, 250, 252, 0.68)';
    context.fillRect(0, 0, Math.max(0, selectionLeft), height);
    context.fillRect(Math.max(0, selectionRight), 0, Math.max(0, width - selectionRight), height);

    context.fillStyle = theme === 'dark' ? 'rgba(129, 140, 248, 0.06)' : 'rgba(79, 70, 229, 0.06)';
    context.fillRect(selectionLeft, 0, Math.max(0, selectionRight - selectionLeft), height);

    context.strokeStyle = theme === 'dark' ? 'rgba(165, 180, 252, 0.85)' : 'rgba(79, 70, 229, 0.85)';
    context.lineWidth = 2;
    context.strokeRect(
      Math.max(0, selectionLeft),
      1,
      Math.max(1, selectionRight - selectionLeft),
      Math.max(1, height - 2),
    );
  }

  if (playheadLeft != null) {
    context.fillStyle = theme === 'dark' ? '#a5b4fc' : '#4f46e5';
    context.fillRect(Math.max(0, playheadLeft - 0.75), 0, 1.5, height);
  }
}
