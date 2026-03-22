'use client';

import { audioEngine, createWavBlob, type AudioProjectTrack, saveBlobFile } from '@/lib/audio';
import { DEFAULT_EFFECTS, DEFAULT_SELECTION, type AudioEffectTab, type AudioEffectsState, type AudioSelection } from './audio-editor-utils';

export const AUDIO_SESSION_EXTENSION = '.jhaudio';
export const AUDIO_SESSION_ACCEPT = AUDIO_SESSION_EXTENSION;

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

type SerializedAudioSession = {
  type: 'jhtoolbox-audio-session';
  version: 1;
  activeTrackId: string | null;
  projectTime: number;
  zoom: number;
  selection: AudioSelection;
  effects: AudioEffectsState;
  activeTab: AudioEffectTab;
  loopEnabled: boolean;
  tracks: SerializedTrack[];
};

export type AudioEditorSessionState = {
  activeTrackId: string | null;
  projectTime: number;
  zoom: number;
  selection: AudioSelection;
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
      ...track,
      audioBase64: null,
    };
  }

  const wavBlob = createWavBlob(track.buffer);
  const bytes = new Uint8Array(await wavBlob.arrayBuffer());

  return {
    ...track,
    audioBase64: bytesToBase64(bytes),
  };
}

async function deserializeTrack(track: SerializedTrack): Promise<AudioProjectTrack> {
  if (!track.audioBase64) {
    return {
      ...track,
      buffer: null,
    };
  }

  const bytes = base64ToBytes(track.audioBase64);
  const wavBlob = new Blob([bytes], { type: 'audio/wav' });
  const buffer = await audioEngine.decodeBlob(wavBlob);

  return {
    ...track,
    buffer,
  };
}

export function isAudioSessionFile(file: File) {
  return file.name.toLowerCase().endsWith(AUDIO_SESSION_EXTENSION);
}

export async function createAudioSessionBlob(state: AudioEditorSessionState) {
  const tracks = await Promise.all(state.tracks.map((track) => serializeTrack(track)));
  const payload: SerializedAudioSession = {
    type: 'jhtoolbox-audio-session',
    version: 1,
    activeTrackId: state.activeTrackId,
    projectTime: state.projectTime,
    zoom: state.zoom,
    selection: state.selection,
    effects: state.effects,
    activeTab: state.activeTab,
    loopEnabled: state.loopEnabled,
    tracks,
  };

  return new Blob([JSON.stringify(payload)], { type: 'application/json' });
}

export async function saveAudioSession(options: {
  filename: string;
  state: AudioEditorSessionState;
}) {
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
  const payload = JSON.parse(await file.text()) as Partial<SerializedAudioSession>;

  if (payload.type !== 'jhtoolbox-audio-session' || payload.version !== 1 || !Array.isArray(payload.tracks)) {
    throw new Error('Unsupported audio session file.');
  }

  const tracks = await Promise.all(payload.tracks.map((track) => deserializeTrack(track as SerializedTrack)));

  return {
    activeTrackId: payload.activeTrackId ?? tracks[0]?.id ?? null,
    projectTime: Number.isFinite(payload.projectTime) ? Math.max(0, payload.projectTime ?? 0) : 0,
    zoom: Number.isFinite(payload.zoom) ? Math.max(0.75, payload.zoom ?? 1) : 1,
    selection: payload.selection ?? DEFAULT_SELECTION,
    effects: payload.effects ?? DEFAULT_EFFECTS,
    activeTab: payload.activeTab ?? 'fade',
    loopEnabled: Boolean(payload.loopEnabled),
    tracks,
  };
}
