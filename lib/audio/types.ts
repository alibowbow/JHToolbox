export type AudioExportFormat = 'wav' | 'mp3';

export type AudioSelection = {
  startSec: number;
  endSec: number;
};

export type AudioFadeSettings = {
  fadeInSec: number;
  fadeOutSec: number;
};

export type AudioSpeedSettings = {
  rate: number;
};

export type AudioPitchSettings = {
  semitones: number;
};

export type AudioEqSettings = {
  lowGainDb: number;
  midGainDb: number;
  highGainDb: number;
};

export type AudioPreviewMode = 'play' | 'slice' | 'fade' | 'speed' | 'pitch' | 'eq';

export type AudioPreviewState = {
  mode: AudioPreviewMode;
  startSec: number;
  endSec: number;
  rate: number;
  loopStart?: number;
  loopEnd?: number;
  fade?: AudioFadeSettings;
  pitch?: AudioPitchSettings;
  eq?: AudioEqSettings;
};

export type AudioCommand = {
  label: string;
  execute: (buffer: AudioBuffer) => AudioBuffer;
  undo?: (buffer: AudioBuffer) => AudioBuffer;
};

export type AudioExportOptions = {
  buffer: AudioBuffer;
  format: AudioExportFormat;
  filename?: string;
  quality?: number;
};

export type AudioWaveformTheme = 'light' | 'dark';

export interface AudioWaveformRenderOptions {
  buffer: AudioBuffer;
  canvas: HTMLCanvasElement;
  startSec: number;
  endSec: number;
  selectionStart?: number;
  selectionEnd?: number;
  playheadSec?: number;
  theme: AudioWaveformTheme;
}

export interface AudioEnginePlaybackSnapshot {
  currentSec: number;
  duration: number;
  playing: boolean;
}

export function formatTime(sec: number, showMs = true): string {
  const safeSeconds = Number.isFinite(sec) ? Math.max(0, sec) : 0;
  const totalMilliseconds = Math.round(safeSeconds * 1000);
  const totalSeconds = Math.floor(totalMilliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (!showMs) {
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  const milliseconds = totalMilliseconds % 1000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

export function clampTime(value: number, min: number, max: number): number {
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) ? max : safeMin;
  const safeValue = Number.isFinite(value) ? value : safeMin;
  return Math.min(Math.max(safeValue, safeMin), safeMax);
}
