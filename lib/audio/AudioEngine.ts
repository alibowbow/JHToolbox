'use client';

import { clampTime, type AudioEqSettings, type AudioFadeSettings, type AudioPitchSettings, type AudioPreviewMode } from './types';

type TimeUpdateListener = (currentSec: number) => void;
type EndedListener = () => void;

type PlaybackPlan = {
  buffer: AudioBuffer;
  startSec: number;
  endSec: number;
  rate: number;
  mode: AudioPreviewMode;
  loopStart?: number;
  loopEnd?: number;
  fade?: AudioFadeSettings;
  pitch?: AudioPitchSettings;
  eq?: AudioEqSettings;
};

type ActivePlayback = {
  plan: PlaybackPlan;
  source: AudioBufferSourceNode;
  cleanupNodes: Array<{
    disconnect: () => void;
  }>;
  startedAtContextSec: number;
};

let sharedContext: AudioContext | null = null;

function getAudioContextCtor() {
  return (
    globalThis.AudioContext ??
    (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
    null
  );
}

function getAudioContext() {
  const ctor = getAudioContextCtor();
  if (!ctor) {
    throw new Error('AudioContext is unavailable in this environment.');
  }

  if (!sharedContext || sharedContext.state === 'closed') {
    sharedContext = new ctor();
  }

  return sharedContext;
}

function createEmptyAudioBuffer(duration = 0.01, sampleRate = 44100) {
  const context = getAudioContext();
  return context.createBuffer(2, Math.max(1, Math.ceil(duration * sampleRate)), sampleRate);
}

export function createAudioBuffer(numberOfChannels: number, length: number, sampleRate: number) {
  const context = getAudioContext();
  return context.createBuffer(
    Math.max(1, Math.floor(numberOfChannels)),
    Math.max(1, Math.floor(length)),
    Math.max(1, Math.floor(sampleRate)),
  );
}

export function createAudioBufferLike(source: AudioBuffer, length = source.length) {
  return createAudioBuffer(source.numberOfChannels, length, source.sampleRate);
}

export function cloneAudioBuffer(source: AudioBuffer) {
  const clone = createAudioBufferLike(source);

  for (let channelIndex = 0; channelIndex < source.numberOfChannels; channelIndex += 1) {
    clone.copyToChannel(source.getChannelData(channelIndex), channelIndex);
  }

  return clone;
}

function clampPlaybackRate(rate: number) {
  if (!Number.isFinite(rate) || rate <= 0) {
    return 1;
  }

  return Math.min(Math.max(rate, 0.1), 8);
}

function semitonesToRate(semitones: number) {
  return Math.pow(2, semitones / 12);
}

function normalizeLoopRange(startSec: number, endSec: number, duration: number) {
  const safeStart = clampTime(Math.min(startSec, endSec), 0, duration);
  const safeEnd = clampTime(Math.max(startSec, endSec), safeStart + 0.001, duration);
  return { startSec: safeStart, endSec: safeEnd };
}

export class AudioEngine {
  private static instance: AudioEngine | null = null;

  static getInstance() {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }

    return AudioEngine.instance;
  }

  private currentBuffer: AudioBuffer | null = null;
  private currentTimeSec = 0;
  private loopRange: { startSec: number; endSec: number } | null = null;
  private activePlayback: ActivePlayback | null = null;
  private timeUpdateListeners = new Set<TimeUpdateListener>();
  private endedListeners = new Set<EndedListener>();
  private animationFrameId: number | null = null;

  private constructor() {}

  get buffer() {
    return this.currentBuffer;
  }

  get duration() {
    return this.currentBuffer?.duration ?? 0;
  }

  get sampleRate() {
    return this.currentBuffer?.sampleRate ?? (sharedContext?.sampleRate ?? 44100);
  }

  get currentTime() {
    return this.currentTimeSec;
  }

  get playing() {
    return Boolean(this.activePlayback);
  }

  onTimeUpdate(callback: TimeUpdateListener) {
    this.timeUpdateListeners.add(callback);
    callback(this.currentTimeSec);
    return () => {
      this.timeUpdateListeners.delete(callback);
    };
  }

  onEnded(callback: EndedListener) {
    this.endedListeners.add(callback);
    return () => {
      this.endedListeners.delete(callback);
    };
  }

  async loadFile(file: File) {
    return await this.loadBlob(file);
  }

  async loadBlob(blob: Blob) {
    const context = getAudioContext();
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = await this.decodeAudioData(context, arrayBuffer);

    this.setBuffer(buffer);
    return buffer;
  }

  setBuffer(buffer: AudioBuffer, currentTimeSec = 0) {
    this.stopPlayback(true, false);
    this.currentBuffer = buffer;
    this.currentTimeSec = clampTime(currentTimeSec, 0, buffer.duration);
    this.loopRange = null;
    this.emitTimeUpdate();
  }

  play(startSec = this.currentTimeSec) {
    if (!this.currentBuffer) {
      return;
    }

    const buffer = this.currentBuffer;
    const start = clampTime(startSec, 0, buffer.duration);
    const range = this.loopRange ? normalizeLoopRange(this.loopRange.startSec, this.loopRange.endSec, buffer.duration) : null;
    const plan: PlaybackPlan = {
      buffer,
      startSec: range ? clampTime(start, range.startSec, range.endSec) : start,
      endSec: range ? range.endSec : buffer.duration,
      rate: 1,
      mode: 'play',
      loopStart: range?.startSec,
      loopEnd: range?.endSec,
    };

    this.startPlayback(plan);
  }

  pause() {
    if (!this.activePlayback) {
      return;
    }

    this.currentTimeSec = this.getProjectedTime();
    this.stopPlayback(false);
    this.emitTimeUpdate();
  }

  stop() {
    this.stopPlayback(true);
    this.currentTimeSec = 0;
    this.emitTimeUpdate();
  }

  seekTo(sec: number) {
    if (!this.currentBuffer) {
      return;
    }

    const nextTime = clampTime(sec, 0, this.currentBuffer.duration);
    this.currentTimeSec = nextTime;

    if (this.activePlayback) {
      const plan = this.activePlayback.plan;
      const nextPlan = {
        ...plan,
        startSec: clampTime(nextTime, plan.startSec, plan.endSec),
      };
      this.stopPlayback(false);
      this.startPlayback(nextPlan);
      return;
    }

    this.emitTimeUpdate();
  }

  setLoop(startSec: number, endSec: number) {
    if (!this.currentBuffer || endSec <= startSec) {
      this.loopRange = null;
      return;
    }

    this.loopRange = normalizeLoopRange(startSec, endSec, this.currentBuffer.duration);

    if (this.playing && this.activePlayback?.plan.mode === 'play') {
      const restartAt = this.currentTimeSec;
      this.stopPlayback(false);
      this.play(restartAt);
    }
  }

  previewSlice(buffer: AudioBuffer, startSec: number, endSec: number) {
    const range = normalizeLoopRange(startSec, endSec, buffer.duration);
    this.currentBuffer = buffer;
    this.currentTimeSec = range.startSec;
    this.loopRange = null;
    this.startPlayback({
      buffer,
      startSec: range.startSec,
      endSec: range.endSec,
      rate: 1,
      mode: 'slice',
    });
  }

  previewWithFade(buffer: AudioBuffer, fadeInSec: number, fadeOutSec: number) {
    this.currentBuffer = buffer;
    this.currentTimeSec = 0;
    this.loopRange = null;
    this.startPlayback({
      buffer,
      startSec: 0,
      endSec: buffer.duration,
      rate: 1,
      mode: 'fade',
      fade: {
        fadeInSec: Math.max(0, fadeInSec),
        fadeOutSec: Math.max(0, fadeOutSec),
      },
    });
  }

  previewWithSpeed(buffer: AudioBuffer, rate: number) {
    this.currentBuffer = buffer;
    this.currentTimeSec = 0;
    this.loopRange = null;
    this.startPlayback({
      buffer,
      startSec: 0,
      endSec: buffer.duration,
      rate: clampPlaybackRate(rate),
      mode: 'speed',
    });
  }

  previewWithPitch(buffer: AudioBuffer, semitones: number) {
    this.currentBuffer = buffer;
    this.currentTimeSec = 0;
    this.loopRange = null;
    this.startPlayback({
      buffer,
      startSec: 0,
      endSec: buffer.duration,
      rate: clampPlaybackRate(semitonesToRate(semitones)),
      mode: 'pitch',
      pitch: { semitones },
    });
  }

  previewWithEq(buffer: AudioBuffer, eq: AudioEqSettings) {
    this.currentBuffer = buffer;
    this.currentTimeSec = 0;
    this.loopRange = null;
    this.startPlayback({
      buffer,
      startSec: 0,
      endSec: buffer.duration,
      rate: 1,
      mode: 'eq',
      eq,
    });
  }

  private async decodeAudioData(context: AudioContext, arrayBuffer: ArrayBuffer) {
    try {
      return await context.decodeAudioData(arrayBuffer.slice(0));
    } catch {
      return await new Promise<AudioBuffer>((resolve, reject) => {
        context.decodeAudioData(
          arrayBuffer.slice(0),
          (decoded) => resolve(decoded),
          (error) => reject(error),
        );
      });
    }
  }

  private startPlayback(plan: PlaybackPlan) {
    const context = getAudioContext();
    this.stopPlayback(false);
    this.currentBuffer = plan.buffer;
    this.currentTimeSec = clampTime(plan.startSec, 0, plan.buffer.duration);

    const source = context.createBufferSource();
    source.buffer = plan.buffer;
    source.playbackRate.value = plan.rate;

    const cleanupNodes: ActivePlayback['cleanupNodes'] = [];
    let outputNode: AudioNode = source;

    if (plan.eq) {
      const lowShelf = context.createBiquadFilter();
      lowShelf.type = 'lowshelf';
      lowShelf.frequency.value = 120;
      lowShelf.gain.value = plan.eq.lowGainDb;

      const midPeak = context.createBiquadFilter();
      midPeak.type = 'peaking';
      midPeak.frequency.value = 1000;
      midPeak.Q.value = 0.9;
      midPeak.gain.value = plan.eq.midGainDb;

      const highShelf = context.createBiquadFilter();
      highShelf.type = 'highshelf';
      highShelf.frequency.value = 8000;
      highShelf.gain.value = plan.eq.highGainDb;

      source.connect(lowShelf);
      lowShelf.connect(midPeak);
      midPeak.connect(highShelf);
      outputNode = highShelf;
      cleanupNodes.push(lowShelf, midPeak, highShelf);
    }

    if (plan.fade) {
      const gainNode = context.createGain();
      const durationSec = Math.max(plan.endSec - plan.startSec, 0.001);
      const fadeIn = Math.min(plan.fade.fadeInSec, durationSec / 2);
      const fadeOut = Math.min(plan.fade.fadeOutSec, durationSec / 2);
      const now = context.currentTime;

      gainNode.gain.setValueAtTime(0, now);
      if (fadeIn > 0) {
        gainNode.gain.linearRampToValueAtTime(1, now + fadeIn);
      } else {
        gainNode.gain.setValueAtTime(1, now);
      }

      if (fadeOut > 0) {
        gainNode.gain.setValueAtTime(1, Math.max(now, now + durationSec - fadeOut));
        gainNode.gain.linearRampToValueAtTime(0, now + durationSec);
      }

      outputNode.connect(gainNode);
      outputNode = gainNode;
      cleanupNodes.push(gainNode);
    }

    outputNode.connect(context.destination);

    const shouldLoop = typeof plan.loopStart === 'number' && typeof plan.loopEnd === 'number' && plan.loopEnd > plan.loopStart;
    source.loop = shouldLoop;
    if (shouldLoop) {
      const loopStart = plan.loopStart ?? 0;
      const loopEnd = plan.loopEnd ?? plan.endSec;
      source.loopStart = loopStart;
      source.loopEnd = loopEnd;
    }

    const durationSec = Math.max(plan.endSec - plan.startSec, 0.001);
    const stopAfterSec = shouldLoop ? null : durationSec / Math.max(plan.rate, 0.0001);
    const startOffset = clampTime(plan.startSec, 0, plan.buffer.duration);
    const startWhen = context.currentTime;
    source.start(startWhen, startOffset);
    if (stopAfterSec != null) {
      source.stop(startWhen + stopAfterSec);
    }

    source.onended = () => {
      if (this.activePlayback?.source !== source) {
        return;
      }

      this.currentTimeSec = shouldLoop ? this.currentTimeSec : plan.endSec;
      this.stopPlayback(false);
      this.emitTimeUpdate();
      this.emitEnded();
    };

    this.activePlayback = {
      plan,
      source,
      cleanupNodes,
      startedAtContextSec: startWhen,
    };

    this.ensureTicker();
    this.emitTimeUpdate();

    void context.resume().catch(() => undefined);
  }

  private stopPlayback(resetTime: boolean, resetLoop = true) {
    const active = this.activePlayback;
    if (!active) {
      if (resetTime) {
        this.currentTimeSec = 0;
      }

      if (resetLoop) {
        this.loopRange = resetTime ? null : this.loopRange;
      }

      this.stopTicker();
      return;
    }

    this.activePlayback = null;
    active.source.onended = null;

    try {
      active.source.stop();
    } catch {
      // Ignore stop errors when the source already ended.
    }

    for (const node of active.cleanupNodes) {
      try {
        node.disconnect();
      } catch {
        // Ignore disconnect errors during cleanup.
      }
    }

    try {
      active.source.disconnect();
    } catch {
      // Ignore disconnect errors during cleanup.
    }

    if (resetTime) {
      this.currentTimeSec = 0;
    }

    if (resetLoop) {
      this.loopRange = resetTime ? null : this.loopRange;
    }

    this.stopTicker();
  }

  private getProjectedTime() {
    const active = this.activePlayback;
    if (!active) {
      return this.currentTimeSec;
    }

    const context = getAudioContext();
    const elapsed = Math.max(0, context.currentTime - active.startedAtContextSec);
    const rawTime = active.plan.startSec + elapsed * active.plan.rate;

    if (typeof active.plan.loopStart === 'number' && typeof active.plan.loopEnd === 'number' && active.plan.loopEnd > active.plan.loopStart) {
      const loopLength = Math.max(active.plan.loopEnd - active.plan.loopStart, 0.001);
      return active.plan.loopStart + ((rawTime - active.plan.loopStart) % loopLength + loopLength) % loopLength;
    }

    return Math.min(rawTime, active.plan.endSec);
  }

  private ensureTicker() {
    if (this.animationFrameId != null || typeof requestAnimationFrame === 'undefined') {
      return;
    }

    const tick = () => {
      if (!this.activePlayback) {
        this.stopTicker();
        return;
      }

      const nextTime = this.getProjectedTime();
      if (Math.abs(nextTime - this.currentTimeSec) > 0.001) {
        this.currentTimeSec = nextTime;
        this.emitTimeUpdate();
      }

      this.animationFrameId = requestAnimationFrame(tick);
    };

    this.animationFrameId = requestAnimationFrame(tick);
  }

  private stopTicker() {
    if (this.animationFrameId == null || typeof cancelAnimationFrame === 'undefined') {
      this.animationFrameId = null;
      return;
    }

    cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
  }

  private emitTimeUpdate() {
    for (const callback of this.timeUpdateListeners) {
      callback(this.currentTimeSec);
    }
  }

  private emitEnded() {
    for (const callback of this.endedListeners) {
      callback();
    }
  }
}

export const audioEngine = AudioEngine.getInstance();

export function createSilentPreviewBuffer() {
  return createEmptyAudioBuffer();
}
