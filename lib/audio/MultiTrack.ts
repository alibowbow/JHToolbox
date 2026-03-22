import { createAudioBuffer } from './AudioEngine';

export type AudioProjectTrack = {
  id: string;
  name: string;
  buffer: AudioBuffer;
  startTime: number;
  gain: number;
  muted: boolean;
  solo: boolean;
  source: 'file' | 'recording';
};

function getOfflineAudioContextCtor() {
  return (
    globalThis.OfflineAudioContext ??
    (globalThis as typeof globalThis & { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext ??
    null
  );
}

function getRenderableTracks(tracks: AudioProjectTrack[]) {
  const tracksWithSolo = tracks.filter((track) => track.solo && !track.muted);
  const baseTracks = tracksWithSolo.length > 0 ? tracksWithSolo : tracks.filter((track) => !track.muted);
  return baseTracks.filter((track) => track.buffer.length > 0);
}

export function getTrackDuration(track: AudioProjectTrack) {
  return Math.max(0, track.startTime) + track.buffer.duration;
}

export function getMixdownDuration(tracks: AudioProjectTrack[]) {
  return tracks.reduce((maxDuration, track) => Math.max(maxDuration, getTrackDuration(track)), 0);
}

export async function mixAudioTracks(tracks: AudioProjectTrack[]) {
  const renderableTracks = getRenderableTracks(tracks);
  if (renderableTracks.length === 0) {
    return null;
  }

  const OfflineAudioContextCtor = getOfflineAudioContextCtor();
  const maxChannels = renderableTracks.reduce((count, track) => Math.max(count, track.buffer.numberOfChannels), 1);
  const sampleRate = renderableTracks.reduce((rate, track) => Math.max(rate, track.buffer.sampleRate), 44100);
  const duration = Math.max(getMixdownDuration(renderableTracks), 0.05);
  const frameCount = Math.max(1, Math.ceil(duration * sampleRate));

  if (!OfflineAudioContextCtor) {
    const fallbackBuffer = createAudioBuffer(Math.min(maxChannels, 2), frameCount, sampleRate);

    for (const track of renderableTracks) {
      const offset = Math.max(0, Math.round(track.startTime * sampleRate));

      for (let channelIndex = 0; channelIndex < fallbackBuffer.numberOfChannels; channelIndex += 1) {
        const targetChannel = fallbackBuffer.getChannelData(channelIndex);
        const sourceChannel = track.buffer.getChannelData(Math.min(channelIndex, track.buffer.numberOfChannels - 1));

        for (let sampleIndex = 0; sampleIndex < sourceChannel.length; sampleIndex += 1) {
          const writeIndex = offset + sampleIndex;
          if (writeIndex >= targetChannel.length) {
            break;
          }

          targetChannel[writeIndex] += sourceChannel[sampleIndex] * track.gain;
        }
      }
    }

    return fallbackBuffer;
  }

  const offlineContext = new OfflineAudioContextCtor(Math.min(maxChannels, 2), frameCount, sampleRate);

  for (const track of renderableTracks) {
    const source = offlineContext.createBufferSource();
    const gainNode = offlineContext.createGain();

    source.buffer = track.buffer;
    gainNode.gain.value = track.gain;

    source.connect(gainNode);
    gainNode.connect(offlineContext.destination);
    source.start(Math.max(0, track.startTime));
  }

  return await offlineContext.startRendering();
}
