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

function getCacheKey(width: number, height: number, theme: AudioWaveformRenderOptions['theme']) {
  return `${width}x${height}:${theme}`;
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

function drawWaveformBase(
  canvas: WaveformCanvas,
  buffer: AudioBuffer,
  theme: AudioWaveformRenderOptions['theme'],
) {
  const context = getCanvasContext(canvas);
  if (!context) {
    return;
  }

  const width = canvas.width;
  const height = canvas.height;
  const channels = getChannelData(buffer);
  const halfHeight = height / 2;
  const centerLine = Math.round(halfHeight);
  const sampleCount = buffer.length;
  const samplesPerPixel = Math.max(1, Math.floor(sampleCount / Math.max(width, 1)));
  const palette = {
    background: theme === 'dark' ? '#0A1A19' : 'rgba(248, 250, 252, 1)',
    grid: theme === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(100, 116, 139, 0.12)',
    waveform: theme === 'dark' ? '#00D4C850' : 'rgba(0, 179, 214, 0.86)',
    silence: theme === 'dark' ? 'rgba(255, 255, 255, 0.14)' : 'rgba(100, 116, 139, 0.28)',
    waveformActive: theme === 'dark' ? '#00D4C8' : 'rgba(0, 179, 214, 1)',
  };

  context.clearRect(0, 0, width, height);
  context.fillStyle = palette.background;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = palette.grid;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, centerLine);
  context.lineTo(width, centerLine);
  context.stroke();

  for (let column = 0; column < width; column += 1) {
    const startSample = column * samplesPerPixel;
    const endSample = Math.min(startSample + samplesPerPixel, sampleCount);
    let peak = 0;

    for (const channel of channels) {
      for (let sampleIndex = startSample; sampleIndex < endSample; sampleIndex += 1) {
        const value = Math.abs(channel[sampleIndex] ?? 0);
        if (value > peak) {
          peak = value;
        }
      }
    }

    const barHeight = Math.max(1, peak * (height * 0.9));
    const x = column;
    const y = Math.round(halfHeight - barHeight / 2);

    context.fillStyle = peak > 0.001 ? palette.waveform : palette.silence;
    context.fillRect(x, y, 1, Math.max(1, Math.round(barHeight)));
  }
}

export function renderWaveformOffscreen(
  buffer: AudioBuffer,
  width: number,
  height: number,
  theme: AudioWaveformRenderOptions['theme'] = 'dark',
): WaveformCanvas {
  const safeWidth = Math.max(1, Math.floor(width));
  const safeHeight = Math.max(1, Math.floor(height));
  const sourceWidth = getSourceWidth(buffer, safeWidth);
  const cacheKey = getCacheKey(sourceWidth, safeHeight, theme);
  const bufferCache = getWaveformMap(buffer);
  const cached = bufferCache.get(cacheKey);

  if (cached) {
    return cached.canvas;
  }

  const canvas = createCanvas(sourceWidth, safeHeight);
  canvas.width = sourceWidth;
  canvas.height = safeHeight;
  drawWaveformBase(canvas, buffer, theme);

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

  if (selectionRight > selectionLeft) {
    context.save();
    context.beginPath();
    context.rect(selectionLeft, 0, Math.max(1, selectionRight - selectionLeft), height);
    context.clip();
    context.drawImage(source as CanvasImageSource, sourceStart, 0, sourceSliceWidth, source.height, 0, 0, width, height);
    context.fillStyle = theme === 'dark' ? 'rgba(0, 212, 200, 0.55)' : 'rgba(0, 179, 214, 0.55)';
    context.globalCompositeOperation = 'source-atop';
    context.fillRect(selectionLeft, 0, Math.max(1, selectionRight - selectionLeft), height);
    context.restore();
  }

  context.fillStyle = theme === 'dark' ? 'rgba(5, 8, 9, 0.42)' : 'rgba(248, 250, 252, 0.55)';
  context.fillRect(0, 0, Math.max(0, selectionLeft), height);
  context.fillRect(Math.max(0, selectionRight), 0, Math.max(0, width - selectionRight), height);

  context.fillStyle = theme === 'dark' ? 'rgba(0, 212, 200, 0.1)' : 'rgba(0, 179, 214, 0.08)';
  context.fillRect(selectionLeft, 0, Math.max(0, selectionRight - selectionLeft), height);

  context.strokeStyle = theme === 'dark' ? '#00D4C880' : 'rgba(0, 179, 214, 0.72)';
  context.lineWidth = 2;
  context.strokeRect(
    Math.max(0, selectionLeft),
    1,
    Math.max(1, selectionRight - selectionLeft),
    Math.max(1, height - 2),
  );

  if (playheadLeft != null) {
    context.fillStyle = theme === 'dark' ? '#00D4C8' : '#2DD4BF';
    context.fillRect(Math.max(0, playheadLeft - 0.75), 0, 1.5, height);
  }
}
