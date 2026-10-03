import { getFfmpeg } from '@/lib/processors/ffmpeg-client';
import type { AudioExportOptions, AudioExportFormat } from './types';
import { createWavBlob, encodeWav } from './WavEncoder';

export type FilePickerAcceptType = {
  description?: string;
  accept: Record<string, string[]>;
};
type SaveFilePickerOptions = {
  suggestedName?: string;
  excludeAcceptAllOption?: boolean;
  types?: FilePickerAcceptType[];
};
type FileSystemWritableFileStreamLike = {
  write: (data: Blob | BufferSource | string) => Promise<void>;
  close: () => Promise<void>;
  abort?: () => Promise<void>;
};
type FileSystemFileHandleLike = {
  createWritable: () => Promise<FileSystemWritableFileStreamLike>;
};
type WindowWithSaveFilePicker = Window & {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandleLike>;
};

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

function getPickerTypes(format: AudioExportFormat): FilePickerAcceptType[] {
  if (format === 'mp3') {
    return [
      {
        description: 'MP3 audio',
        accept: {
          'audio/mpeg': ['.mp3'],
        },
      },
    ];
  }

  return [
    {
      description: 'WAV audio',
      accept: {
        'audio/wav': ['.wav'],
      },
    },
  ];
}

export type PickerSaveResult = 'saved' | 'cancelled' | 'unavailable';

export type PreparedAudioFile = {
  blob: Blob;
  filename: string;
  types?: FilePickerAcceptType[];
};

/** Call directly from a fresh user click on an already prepared file. */
export async function saveBlobFile({ blob, filename, types }: PreparedAudioFile): Promise<PickerSaveResult> {
  if (typeof window === 'undefined') {
    return 'unavailable';
  }

  const pickerWindow = window as WindowWithSaveFilePicker;
  if (typeof pickerWindow.showSaveFilePicker !== 'function') {
    return 'unavailable';
  }

  let handle: FileSystemFileHandleLike;
  try {
    handle = await pickerWindow.showSaveFilePicker({
      suggestedName: filename,
      excludeAcceptAllOption: false,
      types,
    });
  } catch (error) {
    // Check the name rather than instanceof: errors can cross browser realms.
    const name = error && typeof error === 'object' && 'name' in error ? error.name : undefined;
    if (name === 'AbortError') {
      return 'cancelled';
    }
    if (name === 'SecurityError' || name === 'NotAllowedError' || name === 'NotSupportedError') {
      // Some embedded browsers expose the API but cannot open its dialog.
      // The UI retains its visible download link; never trigger a hidden download.
      return 'unavailable';
    }

    throw error;
  }

  // Once a destination is selected, surface write/close failures. Falling back
  // here could hide a failed write or create an unexpected second file.
  const writable = await handle.createWritable();
  try {
    await writable.write(blob);
    await writable.close();
    return 'saved';
  } catch (error) {
    // Release an unfinished stream without masking the original failure.
    await writable.abort?.().catch(() => undefined);
    throw error;
  }
}

async function encodeMp3Blob(buffer: AudioBuffer, quality: number | undefined) {
  // Reuse the shared ffmpeg.wasm client (blob-URL core loading + Cache Storage)
  // instead of a second instance that failed to load cross-origin.
  const { ffmpeg } = await getFfmpeg();
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

/** Encode only. The editor owns the Blob until the user replaces or closes it. */
export async function exportAudio(options: AudioExportOptions): Promise<PreparedAudioFile> {
  const { buffer, format, filename, quality } = options;
  const blob = format === 'wav' ? createWavBlob(buffer) : await encodeMp3Blob(buffer, quality);
  return { blob, filename: resolveFilename(format, filename), types: getPickerTypes(format) };
}

export function createAudioExportBlob(buffer: AudioBuffer) {
  return createWavBlob(buffer);
}
