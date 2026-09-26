'use client';

import { countFrames, encodePcm16Wav, toPcm16 } from '@/lib/audio/pcm-wav';

/** What to record: the microphone, the sound a tab / the computer plays, or both mixed. */
export type RecordingSource = 'mic' | 'device' | 'both';

export interface RecordingSettings {
  source: RecordingSource;
  /** Microphone to use; empty means the browser's default one. */
  micId: string;
  /**
   * Call-style processing: echo cancellation, noise suppression and automatic
   * gain. Browsers turn it on by default, which makes music and room sound
   * thin and "phone-like"; off records the sound as it is.
   */
  voiceEnhance: boolean;
}

export const DEFAULT_RECORDING_SETTINGS: RecordingSettings = { source: 'mic', micId: '', voiceEnhance: false };

export type RecordingErrorCode =
  | 'unsupported'
  | 'device-unsupported'
  | 'no-shared-audio'
  | 'permission'
  | 'no-mic'
  | 'mic-busy';

/** A failure the editor explains in its own words (see `recording.errors` copy). */
export class RecordingError extends Error {
  readonly code: RecordingErrorCode;

  constructor(code: RecordingErrorCode) {
    super(code);
    this.name = 'RecordingError';
    this.code = code;
  }
}

export interface RecordingInput {
  streams: MediaStream[];
  /** The microphone in use, when the browser names it. */
  micLabel: string;
  /** Every live audio track, to notice when the device or the sharing ends. */
  audioTracks: MediaStreamTrack[];
  stop: () => void;
}

export interface RecordingInfo {
  sampleRate: number;
  channels: number;
}

export interface RecordingSessionInfo extends RecordingInfo {
  /** Seconds of audio between two level reports. */
  levelInterval: number;
}

export type WavRecordingResult = { file: File; duration: number; info: RecordingInfo };

export type WavRecordingSession = {
  info: RecordingSessionInfo;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<WavRecordingResult>;
  cleanup: () => Promise<void>;
};

type WavRecordingOptions = {
  outputName: string;
  /** Peak level per channel (0…1), about twenty times a second, also while paused. */
  onLevel?: (peaks: number[]) => void;
};

/**
 * Only desktop Chromium browsers (Chrome, Edge, Whale…) hand a page the sound
 * of a tab or of the whole computer. Phones cannot share their screen from a
 * browser at all, and Firefox / Safari share pictures without sound.
 */
export function canRecordDeviceAudio(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.mediaDevices?.getDisplayMedia !== 'function') {
    return false;
  }
  const userAgent = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)) {
    return false;
  }
  return /Chrome\/|Chromium\/|Edg\//.test(userAgent) && !/Firefox\//.test(userAgent);
}

export function canRecordMicrophone(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
}

/** Microphones the browser lists; names appear once microphone access was granted. */
export async function listMicrophones(): Promise<Array<{ id: string; label: string }>> {
  if (typeof navigator === 'undefined' || typeof navigator.mediaDevices?.enumerateDevices !== 'function') {
    return [];
  }
  const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
  return devices
    .filter((device) => device.kind === 'audioinput' && device.deviceId && device.deviceId !== 'default' && device.deviceId !== 'communications')
    .map((device) => ({ id: device.deviceId, label: device.label }));
}

function micConstraints(settings: RecordingSettings): MediaTrackConstraints {
  return {
    ...(settings.micId ? { deviceId: { exact: settings.micId } } : {}),
    echoCancellation: settings.voiceEnhance,
    noiseSuppression: settings.voiceEnhance,
    autoGainControl: settings.voiceEnhance,
    // Stereo microphones and audio interfaces keep both channels (Chrome only
    // allows stereo capture without echo cancellation).
    channelCount: { ideal: 2 },
    sampleRate: { ideal: 48_000 },
  };
}

async function openMicrophone(settings: RecordingSettings): Promise<MediaStream> {
  if (!canRecordMicrophone()) {
    throw new RecordingError('unsupported');
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: micConstraints(settings), video: false });
  } catch (cause) {
    const name = cause instanceof DOMException ? cause.name : '';
    if (settings.micId && (name === 'OverconstrainedError' || name === 'NotFoundError')) {
      // The chosen microphone is gone (unplugged): use the default one.
      return await openMicrophone({ ...settings, micId: '' });
    }
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new RecordingError('permission');
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      throw new RecordingError('no-mic');
    }
    if (name === 'NotReadableError' || name === 'AbortError') {
      throw new RecordingError('mic-busy');
    }
    throw cause;
  }
}

async function openDeviceAudio(): Promise<MediaStream> {
  if (!canRecordDeviceAudio()) {
    throw new RecordingError('device-unsupported');
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      // Browsers only share sound together with a picture; the picture is dropped.
      video: true,
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, suppressLocalAudioPlayback: false },
      systemAudio: 'include',
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
      preferCurrentTab: false,
      monitorTypeSurfaces: 'include',
    } as DisplayMediaStreamOptions);
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'NotAllowedError') {
      throw new RecordingError('permission');
    }
    throw cause;
  }
  if (stream.getAudioTracks().length === 0) {
    stream.getTracks().forEach((track) => track.stop());
    throw new RecordingError('no-shared-audio');
  }
  stream.getVideoTracks().forEach((track) => {
    track.enabled = false;
  });
  return stream;
}

/** Opens what `settings` asks to record. Call it straight from a click. */
export async function openRecordingInput(settings: RecordingSettings): Promise<RecordingInput> {
  const streams: MediaStream[] = [];
  const stop = () => streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
  try {
    // The sharing picker needs the click's user activation, so it goes first.
    if (settings.source !== 'mic') {
      streams.push(await openDeviceAudio());
    }
    if (settings.source !== 'device') {
      streams.push(await openMicrophone(settings));
    }
  } catch (cause) {
    stop();
    throw cause;
  }
  const micTrack = settings.source === 'device' ? undefined : streams.at(-1)?.getAudioTracks()[0];
  return {
    streams,
    micLabel: micTrack?.label ?? '',
    audioTracks: streams.flatMap((stream) => stream.getAudioTracks()),
    stop,
  };
}

// Runs on the audio thread: copies every sample (as 16-bit PCM) in batches to
// the page, so a busy page cannot make the recording skip, and reports levels.
const CAPTURE_PROCESSOR = `
class JhPcmCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const settings = (options && options.processorOptions) || {};
    this.channelCount = settings.channelCount || 1;
    this.batchFrames = settings.batchFrames || 2048;
    this.buffers = [];
    for (let channel = 0; channel < this.channelCount; channel += 1) {
      this.buffers.push(new Int16Array(this.batchFrames));
    }
    this.peaks = new Float32Array(this.channelCount);
    this.filled = 0;
    this.levelFrames = 0;
    this.paused = false;
    this.port.onmessage = (event) => {
      const type = event.data && event.data.type;
      if (type === 'pause') this.paused = true;
      else if (type === 'resume') this.paused = false;
      else if (type === 'flush') {
        this.flush();
        this.port.postMessage({ type: 'flushed' });
      }
    };
  }

  flush() {
    if (this.filled === 0) return;
    const channels = this.buffers.map((buffer) => buffer.slice(0, this.filled));
    this.port.postMessage({ type: 'data', channels, peaks: Array.from(this.peaks) }, channels.map((channel) => channel.buffer));
    this.filled = 0;
    this.peaks.fill(0);
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const frames = input[0].length;
    for (let channel = 0; channel < this.channelCount; channel += 1) {
      const source = input[channel] || input[0];
      let peak = this.peaks[channel];
      for (let index = 0; index < frames; index += 1) {
        const value = source[index] < 0 ? -source[index] : source[index];
        if (value > peak) peak = value;
      }
      this.peaks[channel] = peak > 1 ? 1 : peak;
    }
    if (this.paused) {
      this.levelFrames += frames;
      if (this.levelFrames >= this.batchFrames) {
        this.port.postMessage({ type: 'level', peaks: Array.from(this.peaks) });
        this.levelFrames = 0;
        this.peaks.fill(0);
      }
      return true;
    }
    let offset = 0;
    while (offset < frames) {
      const count = Math.min(frames - offset, this.batchFrames - this.filled);
      for (let channel = 0; channel < this.channelCount; channel += 1) {
        const source = input[channel] || input[0];
        const target = this.buffers[channel];
        for (let index = 0; index < count; index += 1) {
          let sample = source[offset + index];
          if (sample > 1) sample = 1;
          else if (sample < -1) sample = -1;
          target[this.filled + index] = sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767);
        }
      }
      this.filled += count;
      offset += count;
      if (this.filled === this.batchFrames) this.flush();
    }
    return true;
  }
}
registerProcessor('jh-pcm-capture', JhPcmCapture);
`;

const BATCH_FRAMES = 2048;

/** Two channels that carry the same signal (a mono mic opened as stereo) are saved as mono. */
function collapseIdenticalChannels(channelChunks: Int16Array[][]): Int16Array[][] {
  if (channelChunks.length !== 2) {
    return channelChunks;
  }
  const [left, right] = channelChunks;
  for (let chunk = 0; chunk < left.length; chunk += 1) {
    const a = left[chunk];
    const b = right[chunk];
    if (!b || a.length !== b.length) {
      return channelChunks;
    }
    for (let index = 0; index < a.length; index += 1) {
      if (Math.abs(a[index] - b[index]) > 1) {
        return channelChunks;
      }
    }
  }
  return [left];
}

type Capture = {
  node: AudioNode;
  setPaused: (paused: boolean) => void;
  flush: () => Promise<void>;
  dispose: () => void;
};

export async function createWavRecordingSession(
  streams: MediaStream[],
  { outputName, onLevel }: WavRecordingOptions,
): Promise<WavRecordingSession> {
  const AudioContextCtor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextCtor) {
    throw new Error('AudioContext is unavailable in this browser.');
  }

  const trackSettings = streams.map((stream) => stream.getAudioTracks()[0]?.getSettings() ?? {});
  const deviceRate = trackSettings.map((settings) => settings.sampleRate).find((rate): rate is number => typeof rate === 'number' && rate > 0);
  let audioContext: AudioContext;
  try {
    // Recording at the device's own rate avoids resampling the input.
    audioContext = deviceRate ? new AudioContextCtor({ sampleRate: deviceRate }) : new AudioContextCtor();
  } catch {
    audioContext = new AudioContextCtor();
  }
  await audioContext.resume();
  const sampleRate = audioContext.sampleRate;
  const channelCount = Math.min(2, Math.max(1, ...trackSettings.map((settings) => settings.channelCount ?? 1)));

  // Every source is summed into one bus with the recording's channel layout.
  const bus = audioContext.createGain();
  bus.channelCount = channelCount;
  bus.channelCountMode = 'explicit';
  bus.channelInterpretation = 'speakers';
  const sources = streams.map((stream) => {
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(bus);
    return source;
  });
  const silentGain = audioContext.createGain();
  silentGain.gain.value = 0;
  silentGain.connect(audioContext.destination);

  const chunks: Int16Array[][] = Array.from({ length: channelCount }, () => []);
  const store = (channels: Int16Array[]) => {
    for (let channel = 0; channel < channelCount; channel += 1) {
      chunks[channel].push(channels[channel] ?? channels[0]);
    }
  };

  let capture: Capture;
  let levelFrames = BATCH_FRAMES;
  if (audioContext.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
    const moduleUrl = URL.createObjectURL(new Blob([CAPTURE_PROCESSOR], { type: 'text/javascript' }));
    try {
      await audioContext.audioWorklet.addModule(moduleUrl);
    } finally {
      URL.revokeObjectURL(moduleUrl);
    }
    const node = new AudioWorkletNode(audioContext, 'jh-pcm-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
      processorOptions: { channelCount, batchFrames: BATCH_FRAMES },
    });
    let flushed: (() => void) | null = null;
    node.port.onmessage = (event: MessageEvent<{ type: string; channels?: Int16Array[]; peaks?: number[] }>) => {
      const message = event.data;
      if (message.type === 'data' && message.channels) {
        store(message.channels);
        onLevel?.(message.peaks ?? []);
      } else if (message.type === 'level') {
        onLevel?.(message.peaks ?? []);
      } else if (message.type === 'flushed') {
        flushed?.();
        flushed = null;
      }
    };
    capture = {
      node,
      setPaused: (paused) => node.port.postMessage({ type: paused ? 'pause' : 'resume' }),
      flush: () =>
        new Promise<void>((resolve) => {
          flushed = resolve;
          node.port.postMessage({ type: 'flush' });
          window.setTimeout(resolve, 1500);
        }),
      dispose: () => {
        node.port.onmessage = null;
        node.port.close();
      },
    };
  } else {
    // Browsers without AudioWorklet (Safari before 14.1).
    levelFrames = 4096;
    const processor = audioContext.createScriptProcessor(levelFrames, channelCount, 1);
    let paused = false;
    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer;
      const channels: Int16Array[] = [];
      const peaks: number[] = [];
      for (let channel = 0; channel < channelCount; channel += 1) {
        const samples = input.getChannelData(Math.min(channel, input.numberOfChannels - 1));
        const pcm = new Int16Array(samples.length);
        let peak = 0;
        for (let index = 0; index < samples.length; index += 1) {
          const value = Math.abs(samples[index]);
          if (value > peak) peak = value;
          pcm[index] = toPcm16(samples[index]);
        }
        channels.push(pcm);
        peaks.push(Math.min(1, peak));
      }
      if (!paused) {
        store(channels);
      }
      onLevel?.(peaks);
    };
    capture = {
      node: processor,
      setPaused: (value) => {
        paused = value;
      },
      flush: async () => undefined,
      dispose: () => {
        processor.onaudioprocess = null;
      },
    };
  }

  bus.connect(capture.node);
  capture.node.connect(silentGain);

  let finalized = false;
  let stopPromise: Promise<WavRecordingResult> | null = null;

  const disconnect = async () => {
    if (finalized) {
      return;
    }
    finalized = true;
    capture.dispose();
    sources.forEach((source) => source.disconnect());
    bus.disconnect();
    capture.node.disconnect();
    silentGain.disconnect();
    await audioContext.close().catch(() => undefined);
  };

  return {
    info: { sampleRate, channels: channelCount, levelInterval: levelFrames / sampleRate },
    pause: async () => capture.setPaused(true),
    resume: async () => capture.setPaused(false),
    stop: async () => {
      if (stopPromise) {
        return await stopPromise;
      }
      stopPromise = (async () => {
        await capture.flush();
        await disconnect();
        const channels = collapseIdenticalChannels(chunks);
        const frames = countFrames(channels[0] ?? []);
        return {
          file: new File([encodePcm16Wav(channels, sampleRate)], outputName, { type: 'audio/wav' }),
          duration: frames / Math.max(sampleRate, 1),
          info: { sampleRate, channels: channels.length },
        };
      })();
      return await stopPromise;
    },
    cleanup: async () => {
      await disconnect();
    },
  };
}
