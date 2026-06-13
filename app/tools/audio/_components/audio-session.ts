'use client';

import { createWavBlob, decodeAudioBlobToBuffer, type AudioProjectTrack, saveBlobFile } from '@/lib/audio';
import { DEFAULT_EFFECTS, type AudioEffectTab, type AudioEffectsState } from './audio-editor-utils';

export const AUDIO_SESSION_EXTENSION = '.jhaudio';
export const AUDIO_SESSION_ACCEPT = AUDIO_SESSION_EXTENSION;

export type ProjectSelection = {
  start: number;
  end: number;
};

type SerializedTrack = {
  id: string;
  name: string;
  startTime: number;
  gain: number;
  muted: boolean;
  solo: boolean;
  source: AudioProjectTrack['source'];
  audioBase64: string | null;
};

type SerializedAudioSessionV1 = {
  type: 'jhtoolbox-audio-session';
  version: 1;
  activeTrackId: string | null;
  projectTime: number;
  zoom: number;
  selection: { start: number; end: number; trimMode?: string };
  effects: AudioEffectsState;
  activeTab: AudioEffectTab;
  loopEnabled: boolean;
  tracks: SerializedTrack[];
};

type SerializedAudioSessionV2 = {
  type: 'jhtoolbox-audio-session';
  version: 2;
  activeTrackId: string | null;
  playhead: number;
  zoom: number;
  selection: ProjectSelection | null;
  effects: AudioEffectsState;
  activeTab: AudioEffectTab;
  loopEnabled: boolean;
  tracks: SerializedTrack[];
};

export type AudioEditorSessionState = {
  activeTrackId: string | null;
  playhead: number;
  zoom: number;
  selection: ProjectSelection | null;
  effects: AudioEffectsState;
  activeTab: AudioEffectTab;
  loopEnabled: boolean;
  tracks: AudioProjectTrack[];
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';

  for (let index = 0; index < bytes.length; index += 0x8000) {
    const chunk = bytes.subarray(index, index + 0x8000);
    let chunkBinary = '';

    for (const byte of chunk) {
      chunkBinary += String.fromCharCode(byte);
    }

    binary += chunkBinary;
  }

  return btoa(binary);
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function serializeTrack(track: AudioProjectTrack): Promise<SerializedTrack> {
  if (!track.buffer) {
    return {
      id: track.id,
      name: track.name,
      startTime: track.startTime,
      gain: track.gain,
      muted: track.muted,
      solo: track.solo,
      source: track.source,
      audioBase64: null,
    };
  }

  const wavBlob = createWavBlob(track.buffer);
  const bytes = new Uint8Array(await wavBlob.arrayBuffer());

  return {
    id: track.id,
    name: track.name,
    startTime: track.startTime,
    gain: track.gain,
    muted: track.muted,
    solo: track.solo,
    source: track.source,
    audioBase64: bytesToBase64(bytes),
  };
}

async function deserializeTrack(track: SerializedTrack): Promise<AudioProjectTrack> {
  if (!track.audioBase64) {
    return { ...track, buffer: null };
  }

  const bytes = base64ToBytes(track.audioBase64);
  const wavBlob = new Blob([bytes], { type: 'audio/wav' });
  const buffer = await decodeAudioBlobToBuffer(wavBlob);

  return { ...track, buffer };
}

export function isAudioSessionFile(file: File) {
  return file.name.toLowerCase().endsWith(AUDIO_SESSION_EXTENSION);
}

export async function createAudioSessionBlob(state: AudioEditorSessionState) {
  const tracks = await Promise.all(state.tracks.map((track) => serializeTrack(track)));
  const payload: SerializedAudioSessionV2 = {
    type: 'jhtoolbox-audio-session',
    version: 2,
    activeTrackId: state.activeTrackId,
    playhead: state.playhead,
    zoom: state.zoom,
    selection: state.selection,
    effects: state.effects,
    activeTab: state.activeTab,
    loopEnabled: state.loopEnabled,
    tracks,
  };

  return new Blob([JSON.stringify(payload)], { type: 'application/json' });
}

export async function saveAudioSession(options: { filename: string; state: AudioEditorSessionState }) {
  const blob = await createAudioSessionBlob(options.state);
  const baseName = options.filename.trim() || 'audio-session';
  const filename = baseName.toLowerCase().endsWith(AUDIO_SESSION_EXTENSION)
    ? baseName
    : `${baseName}${AUDIO_SESSION_EXTENSION}`;

  return await saveBlobFile({
    blob,
    filename,
    types: [
      {
        description: 'JHToolbox audio session',
        accept: {
          'application/json': [AUDIO_SESSION_EXTENSION],
        },
      },
    ],
  });
}

export async function parseAudioSessionFile(file: File): Promise<AudioEditorSessionState> {
  const raw = JSON.parse(await file.text()) as { type?: unknown; version?: unknown; tracks?: unknown };

  if (raw.type !== 'jhtoolbox-audio-session' || !Array.isArray(raw.tracks)) {
    throw new Error('Unsupported audio session file.');
  }

  if (raw.version !== 1 && raw.version !== 2) {
    throw new Error('Unsupported audio session version.');
  }

  const tracks = await Promise.all((raw.tracks as SerializedTrack[]).map((track) => deserializeTrack(track)));

  if (raw.version === 2) {
    const payload = raw as Partial<SerializedAudioSessionV2>;
    const activeTrackId = payload.activeTrackId ?? tracks[0]?.id ?? null;
    const selection = payload.selection ?? null;
    return {
      activeTrackId,
      playhead: Number.isFinite(payload.playhead) ? Math.max(0, payload.playhead ?? 0) : 0,
      zoom: Number.isFinite(payload.zoom) ? Math.max(1, payload.zoom ?? 1) : 1,
      selection:
        selection && Number.isFinite(selection.start) && Number.isFinite(selection.end) && selection.end - selection.start > 0.001
          ? { start: Math.max(0, selection.start), end: selection.end }
          : null,
      effects: payload.effects ?? DEFAULT_EFFECTS,
      activeTab: payload.activeTab ?? 'fade',
      loopEnabled: Boolean(payload.loopEnabled),
      tracks,
    };
  }

  // v1 migration: selection used to be active-track local time.
  const payload = raw as Partial<SerializedAudioSessionV1>;
  const activeTrackId = payload.activeTrackId ?? tracks[0]?.id ?? null;
  const activeTrack = tracks.find((track) => track.id === activeTrackId) ?? tracks[0] ?? null;
  const v1Selection = payload.selection;
  let selection: ProjectSelection | null = null;

  if (
    activeTrack?.buffer &&
    v1Selection &&
    Number.isFinite(v1Selection.start) &&
    Number.isFinite(v1Selection.end) &&
    v1Selection.end - v1Selection.start > 0.001
  ) {
    const coversWholeClip = v1Selection.start <= 0.001 && v1Selection.end >= activeTrack.buffer.duration - 0.001;
    if (!coversWholeClip) {
      selection = {
        start: activeTrack.startTime + Math.max(0, v1Selection.start),
        end: activeTrack.startTime + v1Selection.end,
      };
    }
  }

  return {
    activeTrackId,
    playhead: Number.isFinite(payload.projectTime) ? Math.max(0, payload.projectTime ?? 0) : 0,
    zoom: 1,
    selection,
    effects: payload.effects ?? DEFAULT_EFFECTS,
    activeTab: payload.activeTab ?? 'fade',
    loopEnabled: Boolean(payload.loopEnabled),
    tracks,
  };
}
