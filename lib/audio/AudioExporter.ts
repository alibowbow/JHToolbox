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

function downloadBlob(blob: Blob, filename: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  try {
    document.body.appendChild(anchor);
    anchor.click();
    return true;
  } finally {
    anchor.remove();
    // Keep the URL alive long enough for the browser to start the download.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
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

type PickerSaveResult = 'saved' | 'cancelled' | 'unavailable';

async function saveBlobWithPicker(
  blob: Blob,
  filename: string,
  types?: FilePickerAcceptType[],
): Promise<PickerSaveResult> {
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
      // Encoding/mixing can also outlast the required transient activation.
      // An ordinary download still follows the browser's own download policy.
      return 'unavailable';
    }

    throw error;
  }

  // Once a destination is selected, surface write/close failures. Falling back
  // here could hide a failed write or create an unexpected second file.
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
  return 'saved';
}

export async function saveBlobFile(options: {
  blob: Blob;
  filename: string;
  types?: FilePickerAcceptType[];
}) {
  const { blob, filename, types } = options;
  const result = await saveBlobWithPicker(blob, filename, types);
  if (result === 'cancelled') {
    return false;
  }
  return result === 'saved' || downloadBlob(blob, filename);
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

export async function exportAudio(options: AudioExportOptions): Promise<boolean> {
  const { buffer, format, filename, quality } = options;
  const resolvedFilename = resolveFilename(format, filename);

  if (format === 'wav') {
    const wavBlob = createWavBlob(buffer);
    return await saveBlobFile({
      blob: wavBlob,
      filename: resolvedFilename,
      types: getPickerTypes(format),
    });
  }

  const mp3Blob = await encodeMp3Blob(buffer, quality);
  return await saveBlobFile({
    blob: mp3Blob,
    filename: resolvedFilename,
    types: getPickerTypes(format),
  });
}

export function createAudioExportBlob(buffer: AudioBuffer) {
  return createWavBlob(buffer);
}
