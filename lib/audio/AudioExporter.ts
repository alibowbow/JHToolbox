import type { AudioExportOptions, AudioExportFormat } from './types';
import { createWavBlob, encodeWav } from './WavEncoder';

type FFmpegModule = typeof import('@ffmpeg/ffmpeg');
type FFmpegInstance = InstanceType<FFmpegModule['FFmpeg']>;

let sharedFFmpegPromise: Promise<FFmpegInstance> | null = null;

function clampQuality(quality: number | undefined) {
  if (!Number.isFinite(quality ?? Number.NaN)) {
    return 0.82;
  }

  return Math.min(Math.max(quality ?? 0.82, 0), 1);
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[\\/:*?"<>|]+/g, '-').trim();
}

function replaceExtension(filename: string, extension: string) {
  const cleaned = sanitizeFilename(filename || 'audio-export');
  const baseName = cleaned.replace(/\.[^.]+$/, '');
  return `${baseName}.${extension}`;
}

function resolveFilename(format: AudioExportFormat, filename?: string) {
  return replaceExtension(filename ?? 'audio-export', format);
}

function downloadBlob(blob: Blob, filename: string) {
  if (typeof document === 'undefined') {
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function getFFmpegInstance() {
  if (!sharedFFmpegPromise) {
    sharedFFmpegPromise = (async () => {
      const { FFmpeg } = (await import('@ffmpeg/ffmpeg')) as FFmpegModule;
      const ffmpeg = new FFmpeg();
      await ffmpeg.load();
      return ffmpeg;
    })().catch((error) => {
      sharedFFmpegPromise = null;
      throw error;
    });
  }

  return await sharedFFmpegPromise;
}

async function encodeMp3Blob(buffer: AudioBuffer, quality: number | undefined) {
  const ffmpeg = await getFFmpegInstance();
  const inputName = `input-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`;
  const outputName = inputName.replace(/\.wav$/, '.mp3');
  const wavBytes = encodeWav(buffer);

  try {
    await ffmpeg.writeFile(inputName, wavBytes);
    const bitrate = Math.round(128 + clampQuality(quality) * 192);
    await ffmpeg.exec(['-i', inputName, '-codec:a', 'libmp3lame', '-b:a', `${bitrate}k`, outputName]);
    const data = (await ffmpeg.readFile(outputName)) as Uint8Array;
    return new Blob([data as unknown as ArrayBuffer], { type: 'audio/mpeg' });
  } finally {
    await ffmpeg.deleteFile(inputName).catch(() => undefined);
    await ffmpeg.deleteFile(outputName).catch(() => undefined);
  }
}

export async function exportAudio(options: AudioExportOptions): Promise<void> {
  const { buffer, format, filename, quality } = options;
  const resolvedFilename = resolveFilename(format, filename);

  if (format === 'wav') {
    downloadBlob(createWavBlob(buffer), resolvedFilename);
    return;
  }

  const mp3Blob = await encodeMp3Blob(buffer, quality);
  downloadBlob(mp3Blob, resolvedFilename);
}

export function createAudioExportBlob(buffer: AudioBuffer) {
  return createWavBlob(buffer);
}
