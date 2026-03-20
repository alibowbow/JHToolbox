'use client';

import { clampTime, formatTime } from '@/lib/audio';

export type AudioEditorMode = 'editor' | 'batch';
export type AudioTrimMode = 'keep' | 'remove';
export type AudioEffectTab = 'fade' | 'speed' | 'pitch' | 'eq';

export interface AudioSelection {
  start: number;
  end: number;
  trimMode: AudioTrimMode;
}

export interface AudioEffectsState {
  fadeIn: number;
  fadeOut: number;
  speed: number;
  pitch: number;
  low: number;
  mid: number;
  high: number;
}

export { clampTime as clamp, formatTime };

export const AUDIO_ACCEPT = '.mp3,.wav,.m4a,.aac,.ogg,.flac,.webm,.mp4';

export const DEFAULT_EFFECTS: AudioEffectsState = {
  fadeIn: 0.35,
  fadeOut: 0.35,
  speed: 1,
  pitch: 0,
  low: 0,
  mid: 0,
  high: 0,
};

export const DEFAULT_SELECTION: AudioSelection = {
  start: 0,
  end: 0,
  trimMode: 'keep',
};

export function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function normalizeSelection(start: number, end: number, duration: number, trimMode: AudioTrimMode = 'keep'): AudioSelection {
  const safeDuration = Math.max(duration, 0);
  let nextStart = clampTime(Math.min(start, end), 0, safeDuration);
  let nextEnd = clampTime(Math.max(start, end), 0, safeDuration);

  if (safeDuration > 0 && nextStart === nextEnd) {
    nextEnd = clampTime(nextStart + Math.min(0.1, safeDuration), 0, safeDuration);
  }

  return {
    start: Number(nextStart.toFixed(3)),
    end: Number(nextEnd.toFixed(3)),
    trimMode,
  };
}
