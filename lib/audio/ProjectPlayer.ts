'use client';

import { getSharedAudioContext } from './AudioEngine';
import { clampTime } from './types';

export type ProjectPlayerTrack = {
  id: string;
  buffer: AudioBuffer | null;
  startTime: number;
  gain: number;
  muted: boolean;
  solo: boolean;
};

export type ProjectLoopRegion = {
  start: number;
  end: number;
};

type TickListener = (projectSec: number) => void;
type EndedListener = () => void;

type ScheduledTrack = {
  source: AudioBufferSourceNode;
  gainNode: GainNode;
};

const END_EPSILON = 0.005;
const GAIN_RAMP_SEC = 0.012;

function effectiveTrackGain(track: ProjectPlayerTrack, anySolo: boolean) {
  if (track.muted || (anySolo && !track.solo)) {
    return 0;
  }

  return Math.max(0, track.gain);
}

function trackStructureKey(tracks: ProjectPlayerTrack[]) {
  return tracks
    .map((track) => `${track.id}:${track.buffer ? track.buffer.length : 0}:${track.startTime.toFixed(4)}`)
    .join('|');
}

/**
 * Realtime multitrack playback on a shared project timeline.
 *
 * All audible tracks play simultaneously through per-track gain nodes, so
 * mute / solo / gain changes are heard live without an offline mixdown.
 */
export class ProjectPlayer {
  private tracks: ProjectPlayerTrack[] = [];
  private structureKey = '';
  private masterGain: GainNode | null = null;
  private scheduled = new Map<string, ScheduledTrack>();
  private previewNodes: { source: AudioBufferSourceNode; gainNode: GainNode } | null = null;
  private timeSec = 0;
  private startedAtContextSec = 0;
  private isPlaying = false;
  private loopRegion: ProjectLoopRegion | null = null;
  private animationFrameId: number | null = null;
  private tickListeners = new Set<TickListener>();
  private endedListeners = new Set<EndedListener>();
  private previewEndedListeners = new Set<EndedListener>();

  get playing() {
    return this.isPlaying;
  }

  get previewing() {
    return Boolean(this.previewNodes);
  }

  get currentTime() {
    return this.isPlaying ? this.projectedTime() : this.timeSec;
  }

  get duration() {
    return this.tracks.reduce(
      (maxValue, track) => Math.max(maxValue, track.startTime + (track.buffer?.duration ?? 0)),
      0,
    );
  }

  onTick(listener: TickListener) {
    this.tickListeners.add(listener);
    return () => {
      this.tickListeners.delete(listener);
    };
  }

  onEnded(listener: EndedListener) {
    this.endedListeners.add(listener);
    return () => {
      this.endedListeners.delete(listener);
    };
  }

  onPreviewEnded(listener: EndedListener) {
    this.previewEndedListeners.add(listener);
    return () => {
      this.previewEndedListeners.delete(listener);
    };
  }

  /**
   * Update the track set. Gain-only changes are applied to live gain nodes;
   * structural changes (buffers, ids, clip offsets) reschedule playback at
   * the current position.
   */
  syncTracks(tracks: ProjectPlayerTrack[]) {
    const nextKey = trackStructureKey(tracks);
    const structureChanged = nextKey !== this.structureKey;
    this.tracks = tracks.map((track) => ({ ...track }));
    this.structureKey = nextKey;

    if (!this.isPlaying) {
      return;
    }

    if (structureChanged) {
      const resumeAt = clampTime(this.projectedTime(), 0, Math.max(this.duration, 0));
      this.stopScheduledSources();
      if (this.duration <= END_EPSILON) {
        this.finishPlayback(0, false);
        return;
      }
      this.scheduleFrom(Math.min(resumeAt, this.duration));
      return;
    }

    this.applyLiveGains();
  }

  play(fromSec?: number) {
    this.stopPreview(false);
    const duration = this.duration;
    if (duration <= END_EPSILON) {
      return;
    }

    let startAt = clampTime(fromSec ?? this.timeSec, 0, duration);
    if (startAt >= duration - END_EPSILON) {
      startAt = 0;
    }

    if (this.loopRegion) {
      const { start, end } = this.loopRegion;
      if (end - start > 0.01 && (startAt < start || startAt >= end - END_EPSILON)) {
        startAt = start;
      }
    }

    this.stopScheduledSources();
    this.scheduleFrom(startAt);
  }

  pause() {
    if (!this.isPlaying) {
      return;
    }

    const pausedAt = this.projectedTime();
    this.stopScheduledSources();
    this.isPlaying = false;
    this.timeSec = clampTime(pausedAt, 0, this.duration);
    this.stopTicker();
    this.emitTick(this.timeSec);
  }

  stop() {
    this.stopPreview(false);
    this.stopScheduledSources();
    this.isPlaying = false;
    this.timeSec = 0;
    this.stopTicker();
    this.emitTick(0);
  }

  seek(sec: number) {
    const nextTime = clampTime(sec, 0, Math.max(this.duration, 0));

    if (this.isPlaying) {
      this.stopScheduledSources();
      this.scheduleFrom(nextTime);
      return;
    }

    this.timeSec = nextTime;
    this.emitTick(nextTime);
  }

  setLoop(region: ProjectLoopRegion | null) {
    if (!region || region.end - region.start <= 0.01) {
      this.loopRegion = null;
      return;
    }

    this.loopRegion = {
      start: Math.max(0, region.start),
      end: region.end,
    };
  }

  /** One-shot audition of a processed buffer. Does not move the project playhead. */
  previewBuffer(buffer: AudioBuffer) {
    if (this.isPlaying) {
      this.pause();
    }

    this.stopPreview(false);

    const context = getSharedAudioContext();
    const source = context.createBufferSource();
    const gainNode = context.createGain();
    source.buffer = buffer;
    gainNode.gain.value = 1;
    source.connect(gainNode);
    gainNode.connect(this.ensureMasterGain());

    source.onended = () => {
      if (this.previewNodes?.source !== source) {
        return;
      }
      this.stopPreview(true);
    };

    this.previewNodes = { source, gainNode };
    source.start();
    void context.resume().catch(() => undefined);
  }

  stopPreview(emit = true) {
    const preview = this.previewNodes;
    if (!preview) {
      return;
    }

    this.previewNodes = null;
    preview.source.onended = null;

    try {
      preview.source.stop();
    } catch {
      // The source may already have ended.
    }

    try {
      preview.source.disconnect();
      preview.gainNode.disconnect();
    } catch {
      // Ignore disconnect failures during cleanup.
    }

    if (emit) {
      this.emitPreviewEnded();
    }
  }

  dispose() {
    this.stop();
    this.tickListeners.clear();
    this.endedListeners.clear();
    this.previewEndedListeners.clear();

    if (this.masterGain) {
      try {
        this.masterGain.disconnect();
      } catch {
        // Ignore disconnect failures during cleanup.
      }
      this.masterGain = null;
    }
  }

  private ensureMasterGain() {
    const context = getSharedAudioContext();
    if (!this.masterGain) {
      this.masterGain = context.createGain();
      this.masterGain.gain.value = 1;
      this.masterGain.connect(context.destination);
    }

    return this.masterGain;
  }

  private scheduleFrom(fromSec: number) {
    const context = getSharedAudioContext();
    const master = this.ensureMasterGain();
    const anySolo = this.tracks.some((track) => track.solo && !track.muted);
    const now = context.currentTime;

    for (const track of this.tracks) {
      const buffer = track.buffer;
      if (!buffer || buffer.length === 0) {
        continue;
      }

      const clipStart = Math.max(0, track.startTime);
      const clipEnd = clipStart + buffer.duration;
      if (fromSec >= clipEnd - END_EPSILON) {
        continue;
      }

      const source = context.createBufferSource();
      const gainNode = context.createGain();
      source.buffer = buffer;
      gainNode.gain.value = effectiveTrackGain(track, anySolo);
      source.connect(gainNode);
      gainNode.connect(master);

      if (fromSec < clipStart) {
        source.start(now + (clipStart - fromSec), 0);
      } else {
        source.start(now, fromSec - clipStart);
      }

      this.scheduled.set(track.id, { source, gainNode });
    }

    this.timeSec = fromSec;
    this.startedAtContextSec = now;
    this.isPlaying = true;
    this.ensureTicker();
    this.emitTick(fromSec);
    void context.resume().catch(() => undefined);
  }

  private applyLiveGains() {
    if (this.scheduled.size === 0) {
      return;
    }

    const context = getSharedAudioContext();
    const anySolo = this.tracks.some((track) => track.solo && !track.muted);

    for (const track of this.tracks) {
      const node = this.scheduled.get(track.id);
      if (!node) {
        continue;
      }

      const nextGain = effectiveTrackGain(track, anySolo);
      node.gainNode.gain.setTargetAtTime(nextGain, context.currentTime, GAIN_RAMP_SEC);
    }
  }

  private stopScheduledSources() {
    for (const node of this.scheduled.values()) {
      try {
        node.source.stop();
      } catch {
        // The source may already have ended.
      }

      try {
        node.source.disconnect();
        node.gainNode.disconnect();
      } catch {
        // Ignore disconnect failures during cleanup.
      }
    }

    this.scheduled.clear();
  }

  private projectedTime() {
    const context = getSharedAudioContext();
    return this.timeSec + Math.max(0, context.currentTime - this.startedAtContextSec);
  }

  private finishPlayback(restingTime: number, emitEnded = true) {
    this.stopScheduledSources();
    this.isPlaying = false;
    this.timeSec = restingTime;
    this.stopTicker();
    this.emitTick(restingTime);
    if (emitEnded) {
      this.emitEnded();
    }
  }

  private ensureTicker() {
    if (this.animationFrameId != null || typeof requestAnimationFrame === 'undefined') {
      return;
    }

    const tick = () => {
      if (!this.isPlaying) {
        this.stopTicker();
        return;
      }

      const projected = this.projectedTime();
      const loop = this.loopRegion;

      if (loop && loop.end - loop.start > 0.01 && projected >= loop.end - END_EPSILON) {
        this.stopScheduledSources();
        this.scheduleFrom(loop.start);
        this.animationFrameId = requestAnimationFrame(tick);
        return;
      }

      if (projected >= this.duration - END_EPSILON) {
        this.finishPlayback(0);
        return;
      }

      this.emitTick(projected);
      this.animationFrameId = requestAnimationFrame(tick);
    };

    this.animationFrameId = requestAnimationFrame(tick);
  }

  private stopTicker() {
    if (this.animationFrameId != null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.animationFrameId);
    }

    this.animationFrameId = null;
  }

  private emitTick(sec: number) {
    for (const listener of this.tickListeners) {
      listener(sec);
    }
  }

  private emitEnded() {
    for (const listener of this.endedListeners) {
      listener();
    }
  }

  private emitPreviewEnded() {
    for (const listener of this.previewEndedListeners) {
      listener();
    }
  }
}
