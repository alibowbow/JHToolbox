'use client';

import { Play } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from '@/components/providers/locale-provider';
import {
  EditHistory,
  type AudioProjectTrack,
  audioEngine,
  exportAudio,
  getMixdownDuration,
  mixAudioTracks,
} from '@/lib/audio';
import { createWavRecordingSession, type WavRecordingSession } from '@/lib/processors/audio-recording';
import {
  applyFadeToAudioRange,
  applyGainToAudioRange,
  applyPitchToAudioRange,
  applyReverbToAudioRange,
  applySpeedToAudioRange,
  extractAudioRange,
  isSilentAudioBuffer,
  removeAudioRange,
} from './audio-buffer-transforms';
import { getAudioEditorCopy } from './audio-editor-copy';
import {
  type AudioEditorMode,
  type AudioEffectTab,
  type AudioEffectsState,
  type AudioSelection,
  AUDIO_ACCEPT,
  DEFAULT_EFFECTS,
  DEFAULT_SELECTION,
  clamp,
  formatTime,
  normalizeSelection,
} from './audio-editor-utils';
import { EffectsPanel } from './Effects/EffectsPanel';
import { SelectionBar } from './Selection/SelectionBar';
import { TrackListPanel } from './Tracks';
import { EditorToolbar } from './Toolbar/EditorToolbar';
import { TransportBar } from './Transport/TransportBar';
import { WaveformCanvas } from './Waveform/WaveformCanvas';

interface AudioEditorProps {
  mode: AudioEditorMode;
}

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function createTrackId(prefix = 'track') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createProjectTrack(name: string, buffer: AudioBuffer, source: AudioProjectTrack['source']): AudioProjectTrack {
  return {
    id: createTrackId(source === 'recording' ? 'take' : 'track'),
    name,
    buffer,
    startTime: 0,
    gain: 1,
    muted: false,
    solo: false,
    source,
  };
}

function hasTrackSelection(buffer: AudioBuffer | null, selection: AudioSelection) {
  if (!buffer) {
    return false;
  }

  return selection.start > 0.001 || selection.end < Math.max(buffer.duration - 0.001, 0);
}

export function AudioEditor({ mode }: AudioEditorProps) {
  const { locale } = useLocale();
  const copy = useMemo(() => getAudioEditorCopy(locale), [locale]);
  const [projectTracks, setProjectTracks] = useState<AudioProjectTrack[]>([]);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [mixdownBuffer, setMixdownBuffer] = useState<AudioBuffer | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [selection, setSelection] = useState<AudioSelection>(DEFAULT_SELECTION);
  const [effects, setEffects] = useState<AudioEffectsState>(DEFAULT_EFFECTS);
  const [activeTab, setActiveTab] = useState<AudioEffectTab>('fade');
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [isSilent, setIsSilent] = useState(false);
  const [, setHistoryVersion] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingPeaks, setRecordingPeaks] = useState<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef(new EditHistory());
  const bufferRef = useRef<AudioBuffer | null>(null);
  const activeTrackIdRef = useRef<string | null>(null);
  const recordingSessionRef = useRef<WavRecordingSession | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingStartRef = useRef<number | null>(null);
  const recordingPausedRef = useRef(false);
  const recordingAccumulatedDurationRef = useRef(0);

  const activeTrack = useMemo(
    () => projectTracks.find((track) => track.id === activeTrackId) ?? projectTracks[0] ?? null,
    [activeTrackId, projectTracks],
  );
  const buffer = activeTrack?.buffer ?? null;
  const duration = buffer?.duration ?? 0;
  const canUndo = historyRef.current.canUndo;
  const canRedo = historyRef.current.canRedo;
  const undoLabel = historyRef.current.undoLabel;
  const redoLabel = historyRef.current.redoLabel;
  const historyDepth = historyRef.current.depth;
  const hasActiveSelection = hasTrackSelection(buffer, selection);
  const activeTrackName = activeTrack?.name ?? null;
  const projectDuration = mixdownBuffer?.duration ?? getMixdownDuration(projectTracks);
  const canSave = Boolean(buffer) && !isRecording;

  useEffect(() => {
    bufferRef.current = buffer;
  }, [buffer]);

  useEffect(() => {
    if (projectTracks.length === 0) {
      setActiveTrackId(null);
      return;
    }

    if (!activeTrackId || !projectTracks.some((track) => track.id === activeTrackId)) {
      setActiveTrackId(projectTracks[0]?.id ?? null);
    }
  }, [activeTrackId, projectTracks]);

  useEffect(() => {
    if (activeTrackIdRef.current === activeTrackId) {
      return;
    }

    activeTrackIdRef.current = activeTrackId;
    historyRef.current.clear();
    setHistoryVersion((value) => value + 1);
    setLoopEnabled(false);

    if (!buffer) {
      setSelection(DEFAULT_SELECTION);
      setCurrentTime(0);
      setIsSilent(false);
      setIsPlaying(false);
      audioEngine.stop();
      return;
    }

    setSelection(normalizeSelection(0, buffer.duration, buffer.duration, selection.trimMode));
    setCurrentTime(0);
    setIsSilent(isSilentAudioBuffer(buffer));
    setIsPlaying(false);
    audioEngine.setBuffer(buffer, 0);
  }, [activeTrackId, buffer, selection.trimMode]);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current != null) {
        window.clearInterval(recordingTimerRef.current);
      }

      const stream = recordingStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      const recordingSession = recordingSessionRef.current;
      if (recordingSession) {
        void recordingSession.cleanup().catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    const unsubscribeTime = audioEngine.onTimeUpdate((nextTime) => {
      setCurrentTime(nextTime);
    });
    const unsubscribeEnded = audioEngine.onEnded(() => {
      setIsPlaying(false);
      setCurrentTime(0);

      const activeBuffer = bufferRef.current;
      if (activeBuffer && audioEngine.buffer !== activeBuffer) {
        audioEngine.setBuffer(activeBuffer, 0);
        return;
      }

      if (activeBuffer) {
        audioEngine.seekTo(0);
      }
    });

    return () => {
      unsubscribeTime();
      unsubscribeEnded();
    };
  }, []);

  useEffect(() => {
    if (!buffer) {
      setCurrentTime(0);
      setIsPlaying(false);
      setSelection(DEFAULT_SELECTION);
      setIsSilent(false);
      return;
    }

    const clampedTime = clamp(currentTime, 0, buffer.duration);
    setCurrentTime(clampedTime);
    setSelection((currentSelection) =>
      normalizeSelection(currentSelection.start, currentSelection.end || buffer.duration, buffer.duration, currentSelection.trimMode),
    );
    setIsSilent(isSilentAudioBuffer(buffer));
    audioEngine.setBuffer(buffer, clampedTime);
  }, [buffer]);

  useEffect(() => {
    if (!buffer || !loopEnabled) {
      audioEngine.setLoop(0, 0);
      return;
    }

    audioEngine.setLoop(selection.start, selection.end);
  }, [buffer, loopEnabled, selection.end, selection.start]);

  useEffect(() => {
    if (projectTracks.length === 0) {
      setMixdownBuffer(null);
      return;
    }

    if (projectTracks.length === 1) {
      setMixdownBuffer(projectTracks[0]?.buffer ?? null);
      return;
    }

    let cancelled = false;

    const renderMixdown = async () => {
      try {
        const mixed = await mixAudioTracks(projectTracks);
        if (!cancelled) {
          setMixdownBuffer(mixed);
        }
      } catch {
        if (!cancelled) {
          setMixdownBuffer(null);
        }
      }
    };

    void renderMixdown();

    return () => {
      cancelled = true;
    };
  }, [projectTracks]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }

      const primaryModifier = event.metaKey || event.ctrlKey;

      if (primaryModifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        handleUndo();
        return;
      }

      if (primaryModifier && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        handleRedo();
        return;
      }

      if (primaryModifier && event.key.toLowerCase() === 'a' && buffer) {
        event.preventDefault();
        setSelection(normalizeSelection(0, buffer.duration, buffer.duration, selection.trimMode));
        setStatusMessage(copy.status.selectedAll);
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setSelection(DEFAULT_SELECTION);
        setStatusMessage(copy.status.selectionCleared);
        return;
      }

      if (event.code === 'Space') {
        event.preventDefault();
        void handlePlayPause();
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        seekBy(event.shiftKey ? -1 : -0.1);
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        seekBy(event.shiftKey ? 1 : 0.1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [buffer, copy, currentTime, duration, isPlaying, isRecording, selection.trimMode]);

  const clearRecordingTimer = () => {
    if (recordingTimerRef.current != null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const getRecordingElapsed = () => {
    const activeSpan =
      recordingPausedRef.current || recordingStartRef.current == null
        ? 0
        : (Date.now() - recordingStartRef.current) / 1000;

    return recordingAccumulatedDurationRef.current + activeSpan;
  };

  const startRecordingTimer = () => {
    clearRecordingTimer();
    recordingTimerRef.current = window.setInterval(() => {
      const elapsedSeconds = getRecordingElapsed();
      setRecordingDuration(elapsedSeconds);
      setStatusMessage(
        recordingPausedRef.current ? copy.recording.pausedStatus(elapsedSeconds) : copy.recording.liveStatus(elapsedSeconds),
      );
    }, 100);
  };

  const stopRecordingStream = () => {
    const stream = recordingStreamRef.current;
    if (!stream) {
      return;
    }

    stream.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
  };

  const openPicker = () => {
    if (isRecording || !fileInputRef.current) {
      return;
    }

    fileInputRef.current.value = '';
    fileInputRef.current.click();
  };

  const replaceActiveTrackBuffer = (nextBuffer: AudioBuffer, nextStatus: string) => {
    if (!activeTrack) {
      return;
    }

    setProjectTracks((currentTracks) =>
      currentTracks.map((track) => (track.id === activeTrack.id ? { ...track, buffer: nextBuffer } : track)),
    );
    setCurrentTime(0);
    setSelection(normalizeSelection(0, nextBuffer.duration, nextBuffer.duration, selection.trimMode));
    setStatusMessage(nextStatus);
    setIsPlaying(false);
    audioEngine.setBuffer(nextBuffer, 0);
  };

  const importFiles = async (nextFiles: File[]) => {
    if (nextFiles.length === 0) {
      return;
    }

    audioEngine.stop();
    setIsPlaying(false);
    setIsLoading(true);
    setLoadError(null);
    setWarningMessage(
      nextFiles.some((file) => file.size > 100 * 1024 * 1024) ? copy.fileDrop.largeFileWarning : null,
    );

    try {
      const decodedTracks: AudioProjectTrack[] = [];

      for (const file of nextFiles) {
        setStatusMessage(copy.status.loading(file.name));
        const decoded = await audioEngine.decodeFile(file);
        decodedTracks.push(createProjectTrack(file.name, decoded, 'file'));
      }

      setProjectTracks((currentTracks) => [...currentTracks, ...decodedTracks]);
      setActiveTrackId(decodedTracks.at(-1)?.id ?? null);
      setStatusMessage(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : copy.status.decodeFailed);
    } finally {
      setIsLoading(false);
    }
  };

  const updateTrack = (trackId: string, updater: (track: AudioProjectTrack) => AudioProjectTrack) => {
    setProjectTracks((currentTracks) => currentTracks.map((track) => (track.id === trackId ? updater(track) : track)));
  };

  const removeTrack = (trackId: string) => {
    audioEngine.stop();
    setIsPlaying(false);

    setProjectTracks((currentTracks) => {
      const nextTracks = currentTracks.filter((track) => track.id !== trackId);

      if (activeTrackId === trackId) {
        setActiveTrackId(nextTracks[0]?.id ?? null);
      }

      if (nextTracks.length === 0) {
        setSelection(DEFAULT_SELECTION);
        setStatusMessage(null);
        setWarningMessage(null);
        setLoadError(null);
      }

      return nextTracks;
    });
  };

  const applyBufferCommand = (label: string, transform: (currentBuffer: AudioBuffer) => AudioBuffer) => {
    if (!buffer) {
      setLoadError(copy.status.loadFirst);
      return;
    }

    const nextBuffer = historyRef.current.apply(buffer, {
      label,
      execute: transform,
    });

    setHistoryVersion((value) => value + 1);
    replaceActiveTrackBuffer(nextBuffer, copy.status.effectApplied(label));
  };

  const commitSelection = (nextSelection: { start: number; end: number }) => {
    const normalized = normalizeSelection(nextSelection.start, nextSelection.end, duration, selection.trimMode);
    setSelection(normalized);

    if (loopEnabled) {
      audioEngine.setLoop(normalized.start, normalized.end);
    }

    if (currentTime < normalized.start || currentTime > normalized.end) {
      setCurrentTime(normalized.start);
      if (audioEngine.buffer === buffer) {
        audioEngine.seekTo(normalized.start);
      }
    }
  };

  const handleUndo = () => {
    if (!buffer) {
      return;
    }

    const nextBuffer = historyRef.current.undo(buffer);
    if (!nextBuffer) {
      return;
    }

    setHistoryVersion((value) => value + 1);
    replaceActiveTrackBuffer(nextBuffer, copy.status.undoApplied);
  };

  const handleRedo = () => {
    if (!buffer) {
      return;
    }

    const nextBuffer = historyRef.current.redo(buffer);
    if (!nextBuffer) {
      return;
    }

    setHistoryVersion((value) => value + 1);
    replaceActiveTrackBuffer(nextBuffer, copy.status.redoApplied);
  };

  const handleSaveAs = async ({
    format,
    filename,
  }: {
    format: 'wav' | 'mp3';
    filename: string;
  }) => {
    if (!buffer) {
      setLoadError(copy.status.loadFirst);
      return;
    }

    try {
      setStatusMessage(copy.status.exportPreparing(format));
      const exportBuffer =
        projectTracks.length > 1 ? ((await mixAudioTracks(projectTracks)) ?? mixdownBuffer ?? buffer) : buffer;
      const saved = await exportAudio({
        buffer: exportBuffer,
        format,
        filename: filename.trim() || activeTrackName || 'audio-export',
        quality: 0.82,
      });

      if (saved) {
        setStatusMessage(copy.status.exportReady(format));
      } else {
        setStatusMessage(null);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : copy.status.exportFailed);
    }
  };

  const handlePlayPause = async () => {
    if (!buffer || isRecording) {
      return;
    }

    try {
      if (isPlaying) {
        audioEngine.pause();
        setCurrentTime(audioEngine.currentTime);
        setIsPlaying(false);
        return;
      }

      const nextStart = audioEngine.buffer === buffer ? audioEngine.currentTime : currentTime;
      const playbackStart = nextStart >= duration - 0.001 ? 0 : clamp(nextStart, 0, duration);

      if (audioEngine.buffer !== buffer) {
        audioEngine.setBuffer(buffer, playbackStart);
      } else if (Math.abs(audioEngine.currentTime - playbackStart) > 0.001) {
        audioEngine.seekTo(playbackStart);
      }

      setCurrentTime(playbackStart);
      audioEngine.play(playbackStart);
      setIsPlaying(true);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : copy.status.playbackFailed);
    }
  };

  const handlePreviewMix = async () => {
    if (projectTracks.length < 2 || isRecording) {
      return;
    }

    try {
      const mixed = (await mixAudioTracks(projectTracks)) ?? mixdownBuffer;
      if (!mixed) {
        return;
      }

      audioEngine.previewSlice(mixed, 0, mixed.duration);
      setCurrentTime(0);
      setIsPlaying(true);
      setStatusMessage(locale === 'ko' ? '멀티트랙 믹스를 미리 듣는 중입니다.' : 'Previewing the multitrack mix.');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : copy.status.playbackFailed);
    }
  };

  const seekBy = (delta: number) => {
    if (!buffer || isRecording) {
      return;
    }

    const nextTime = clamp(currentTime + delta, 0, duration);
    setCurrentTime(nextTime);

    if (audioEngine.buffer === buffer) {
      audioEngine.seekTo(nextTime);
    }
  };

  const seekToBoundary = (boundary: 'start' | 'end') => {
    if (!buffer || isRecording) {
      return;
    }

    const nextTime = boundary === 'start' ? 0 : duration;
    setCurrentTime(nextTime);
    if (audioEngine.buffer === buffer) {
      audioEngine.seekTo(nextTime);
    }
  };

  const handleWaveformSeek = (time: number) => {
    if (!buffer || isRecording) {
      return;
    }

    const nextTime = clamp(time, 0, duration);
    setCurrentTime(nextTime);

    if (audioEngine.buffer === buffer) {
      audioEngine.seekTo(nextTime);
    }
  };

  const playSelection = async () => {
    if (!buffer || selection.end <= selection.start || isRecording) {
      return;
    }

    audioEngine.previewSlice(buffer, selection.start, selection.end);
    setCurrentTime(selection.start);
    setIsPlaying(true);
  };

  const previewBuffer = () => {
    if (!buffer) {
      return null;
    }

    return extractAudioRange(buffer, selection.start, selection.end);
  };

  const handlePreview = (tab: AudioEffectTab) => {
    if (isRecording) {
      return;
    }

    const segmentBuffer = previewBuffer();
    if (!segmentBuffer) {
      setLoadError(copy.status.loadFirst);
      return;
    }

    if (tab === 'fade') {
      audioEngine.previewWithFade(segmentBuffer, effects.fadeIn, effects.fadeOut);
      setStatusMessage(copy.status.previewFade);
      setIsPlaying(true);
      return;
    }

    if (tab === 'speed') {
      audioEngine.previewWithSpeed(segmentBuffer, effects.speed);
      setStatusMessage(copy.status.previewSpeed);
      setIsPlaying(true);
      return;
    }

    if (tab === 'pitch') {
      audioEngine.previewWithPitch(segmentBuffer, effects.pitch);
      setStatusMessage(copy.status.previewPitch);
      setIsPlaying(true);
      return;
    }

    if (tab === 'amplify') {
      const amplifiedBuffer = applyGainToAudioRange(segmentBuffer, 0, segmentBuffer.duration, effects.gain);
      audioEngine.previewSlice(amplifiedBuffer, 0, amplifiedBuffer.duration);
      setStatusMessage(copy.status.previewAmplify);
      setIsPlaying(true);
      return;
    }

    if (tab === 'reverb') {
      const reverbedBuffer = applyReverbToAudioRange(segmentBuffer, 0, segmentBuffer.duration, effects.reverbDecay, effects.reverbMix);
      audioEngine.previewSlice(reverbedBuffer, 0, reverbedBuffer.duration);
      setStatusMessage(copy.status.previewReverb);
      setIsPlaying(true);
      return;
    }

    audioEngine.previewWithEq(segmentBuffer, {
      lowGainDb: effects.low,
      midGainDb: effects.mid,
      highGainDb: effects.high,
    });
    setStatusMessage(copy.status.previewEq);
    setIsPlaying(true);
  };

  const handleApplyEffect = (tab: AudioEffectTab) => {
    if (isRecording) {
      return;
    }

    if (tab === 'fade') {
      applyBufferCommand(copy.commands.fadeEnvelope, (currentBuffer) =>
        applyFadeToAudioRange(currentBuffer, selection.start, selection.end, effects.fadeIn, effects.fadeOut),
      );
      return;
    }

    if (tab === 'speed') {
      applyBufferCommand(copy.commands.speedChange, (currentBuffer) =>
        applySpeedToAudioRange(currentBuffer, selection.start, selection.end, effects.speed),
      );
      return;
    }

    if (tab === 'pitch') {
      applyBufferCommand(copy.commands.pitchShift, (currentBuffer) =>
        applyPitchToAudioRange(currentBuffer, selection.start, selection.end, effects.pitch),
      );
      return;
    }

    if (tab === 'amplify') {
      applyBufferCommand(copy.commands.amplify, (currentBuffer) =>
        applyGainToAudioRange(currentBuffer, selection.start, selection.end, effects.gain),
      );
      return;
    }

    if (tab === 'reverb') {
      applyBufferCommand(copy.commands.reverb, (currentBuffer) =>
        applyReverbToAudioRange(currentBuffer, selection.start, selection.end, effects.reverbDecay, effects.reverbMix),
      );
      return;
    }

    setStatusMessage(copy.status.eqQueued);
  };

  const handleStartRecording = async () => {
    if (isRecording) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setLoadError(copy.recording.startError);
      return;
    }

    audioEngine.stop();
    setIsPlaying(false);
    setLoadError(null);
    setWarningMessage(null);
    setStatusMessage(copy.recording.starting);
    setRecordingDuration(0);
    setRecordingPeaks([]);
    setIsRecordingPaused(false);
    recordingPausedRef.current = false;
    recordingAccumulatedDurationRef.current = 0;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const recordingSession = await createWavRecordingSession(stream, {
        outputName: `audio-recording-${Date.now()}.wav`,
        onPeak: (peak) => {
          setRecordingPeaks((currentPeaks) => [...currentPeaks.slice(-479), Number(peak.toFixed(4))]);
        },
      });

      recordingStreamRef.current = stream;
      recordingSessionRef.current = recordingSession;
      recordingStartRef.current = Date.now();
      setIsRecording(true);
      setStatusMessage(copy.recording.liveStatus(0));
      startRecordingTimer();
    } catch (error) {
      stopRecordingStream();

      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        setLoadError(copy.recording.permissionError);
        return;
      }

      setLoadError(error instanceof Error ? error.message : copy.recording.startError);
    }
  };

  const handlePauseRecording = async () => {
    const recordingSession = recordingSessionRef.current;
    if (!recordingSession || !isRecording || recordingPausedRef.current) {
      return;
    }

    try {
      await recordingSession.pause();
      recordingAccumulatedDurationRef.current = getRecordingElapsed();
      recordingStartRef.current = null;
      recordingPausedRef.current = true;
      setIsRecordingPaused(true);
      setRecordingDuration(recordingAccumulatedDurationRef.current);
      setStatusMessage(copy.recording.pausedStatus(recordingAccumulatedDurationRef.current));
      clearRecordingTimer();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : copy.recording.startError);
    }
  };

  const handleResumeRecording = async () => {
    const recordingSession = recordingSessionRef.current;
    if (!recordingSession || !isRecording || !recordingPausedRef.current) {
      return;
    }

    try {
      await recordingSession.resume();
      recordingPausedRef.current = false;
      recordingStartRef.current = Date.now();
      setIsRecordingPaused(false);
      setStatusMessage(copy.recording.liveStatus(recordingAccumulatedDurationRef.current));
      startRecordingTimer();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : copy.recording.startError);
    }
  };

  const handleStopRecording = async () => {
    const recordingSession = recordingSessionRef.current;
    if (!recordingSession) {
      setIsRecording(false);
      setIsRecordingPaused(false);
      recordingPausedRef.current = false;
      recordingAccumulatedDurationRef.current = 0;
      recordingStartRef.current = null;
      setStatusMessage(copy.recording.abandoned);
      clearRecordingTimer();
      stopRecordingStream();
      return;
    }

    setStatusMessage(copy.recording.finishing);
    setIsRecording(false);
    setIsRecordingPaused(false);
    clearRecordingTimer();

    try {
      const recording = await recordingSession.stop();
      const nextBuffer = await audioEngine.decodeFile(recording.file);
      const nextTrack = createProjectTrack(recording.file.name, nextBuffer, 'recording');

      setRecordingDuration(recording.duration);
      setProjectTracks((currentTracks) => [...currentTracks, nextTrack]);
      setActiveTrackId(nextTrack.id);
      setStatusMessage(copy.recording.ready(recording.file.name));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : copy.recording.startError);
    } finally {
      recordingSessionRef.current = null;
      recordingStartRef.current = null;
      recordingPausedRef.current = false;
      recordingAccumulatedDurationRef.current = 0;
      stopRecordingStream();
    }
  };

  const handleRecordPauseResume = () => {
    if (!isRecording) {
      return;
    }

    if (isRecordingPaused) {
      void handleResumeRecording();
      return;
    }

    void handlePauseRecording();
  };

  const handleRecordToggle = () => {
    if (isRecording) {
      void handleStopRecording();
      return;
    }

    void handleStartRecording();
  };

  const statusLines = (
    <div className="space-y-2">
      {historyDepth > 0 ? (
        <div className="audio-status-line rounded-[10px] px-3 py-2 text-sm text-[var(--text-secondary)]">
          {copy.session.history(historyDepth)}
        </div>
      ) : null}
      {statusMessage ? (
        <div className="audio-status-line is-success rounded-[10px] px-3 py-2 text-sm">{statusMessage}</div>
      ) : null}
      {warningMessage ? (
        <div className="audio-status-line is-warning rounded-[10px] px-3 py-2 text-sm">{warningMessage}</div>
      ) : null}
      {loadError ? (
        <div className="audio-status-line is-error rounded-[10px] px-3 py-2 text-sm">{loadError}</div>
      ) : null}
    </div>
  );

  const emptyStatePrompt =
    locale === 'ko' ? '오디오를 불러오거나 녹음 버튼을 눌러 시작하세요.' : 'Open audio or press the record button to get started.';
  const emptyStateFeatures =
    locale === 'ko'
      ? ['자르기', '오디오 변환', '녹음', '멀티트랙', '리버브', '앰플리파이', 'EQ']
      : ['Trim', 'Audio convert', 'Record', 'Multitrack', 'Reverb', 'Amplify', 'EQ'];
  const sessionPanel = (
    <div className="audio-surface rounded-[16px] p-4">
      <p className="audio-section-kicker">{copy.session.kicker}</p>
      <div className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
        <div className="audio-status-line rounded-[10px] px-3 py-2">
          {activeTrackName
            ? copy.session.activeTrack?.(activeTrackName) ?? copy.session.activeFile(activeTrackName)
            : copy.session.noFile}
        </div>
        <div className="audio-status-line rounded-[10px] px-3 py-2">
          {buffer ? copy.session.duration(formatTime(duration), buffer.sampleRate) : copy.status.waitingInput}
        </div>
        {projectTracks.length > 1 ? (
          <div className="audio-status-line rounded-[10px] px-3 py-2">
            {locale === 'ko'
              ? `트랙 ${projectTracks.length}개 · 믹스 길이 ${formatTime(projectDuration)}`
              : `${projectTracks.length} tracks · Mix duration ${formatTime(projectDuration)}`}
          </div>
        ) : null}
      </div>
      <div className="mt-3">{statusLines}</div>
    </div>
  );

  return (
    <div
      data-mode={mode}
      className="audio-studio audio-studio-shell flex min-h-[calc(100dvh-5.5rem)] flex-col"
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={AUDIO_ACCEPT}
        onChange={(event) => {
          void importFiles(Array.from(event.target.files ?? []));
          event.currentTarget.value = '';
        }}
        className="hidden"
      />

      <EditorToolbar
        fileName={activeTrackName}
        canSave={canSave}
        loopEnabled={loopEnabled}
        onOpenFiles={openPicker}
        onSaveAs={({ format, filename }) => void handleSaveAs({ format, filename })}
        onReset={() => {
          if (buffer) {
            audioEngine.setBuffer(buffer, 0);
          }
          setSelection(buffer ? normalizeSelection(0, buffer.duration, buffer.duration, 'keep') : DEFAULT_SELECTION);
          setEffects(DEFAULT_EFFECTS);
          setActiveTab('fade');
          setZoom(1);
          setLoopEnabled(false);
          setStatusMessage(copy.status.resetDefaults);
        }}
        onToggleLoop={() => setLoopEnabled((currentValue) => !currentValue)}
      />

      <div className="border-b border-[var(--border)] bg-[var(--topbar-bg)] px-3 py-3 sm:px-4">
        <TransportBar
          currentTime={isRecording ? recordingDuration : currentTime}
          duration={isRecording ? recordingDuration : duration}
          zoom={zoom}
          isPlaying={isPlaying}
          isRecording={isRecording}
          isRecordingPaused={isRecordingPaused}
          canUndo={canUndo}
          canRedo={canRedo}
          undoLabel={undoLabel}
          redoLabel={redoLabel}
          onPlayPause={() => void handlePlayPause()}
          onSeekBy={seekBy}
          onSeekToStart={() => seekToBoundary('start')}
          onSeekToEnd={() => seekToBoundary('end')}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onZoomChange={(nextZoom) => setZoom(clamp(nextZoom, 0.75, 6))}
          onRecordToggle={handleRecordToggle}
          onRecordPauseResume={handleRecordPauseResume}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
        {activeTrack || isRecording ? (
          <section className="audio-panel flex flex-col overflow-hidden rounded-[20px]">
            <WaveformCanvas
              audioBuffer={isRecording ? null : buffer}
              fileName={isRecording ? (locale === 'ko' ? '새 녹음 트랙' : 'New recording track') : activeTrackName ?? 'audio'}
              duration={isRecording ? Math.max(recordingDuration, 0.001) : duration || selection.end || 0}
              currentTime={isRecording ? recordingDuration : currentTime}
              selectionStart={selection.start}
              selectionEnd={selection.end}
              zoom={zoom}
              isSilent={isRecording ? false : isSilent}
              isLoading={isLoading}
              showPlayhead={Boolean(buffer) && !isRecording}
              livePeaks={isRecording ? recordingPeaks : undefined}
              interactive={!isRecording}
              statusLabel={
                isRecording
                  ? isRecordingPaused
                    ? copy.recording.pausedStatus(recordingDuration)
                    : copy.recording.liveStatus(recordingDuration)
                  : null
              }
              onSeek={handleWaveformSeek}
              onSelectionChange={commitSelection}
            />
          </section>
        ) : (
          <div className="audio-panel rounded-[20px] p-6 sm:p-8">
            <div className="mx-auto flex min-h-[180px] max-w-3xl flex-col justify-center gap-4">
              <p className="text-sm text-[var(--text-secondary)]">{emptyStatePrompt}</p>
              <div className="flex flex-wrap gap-2">
                {emptyStateFeatures.map((feature) => (
                  <span
                    key={feature}
                    className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-sm text-[var(--text-secondary)]"
                  >
                    {feature}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {buffer && hasActiveSelection ? (
          <SelectionBar
            start={selection.start}
            end={selection.end}
            duration={duration}
            onStartChange={(nextStart) => commitSelection({ start: nextStart, end: selection.end })}
            onEndChange={(nextEnd) => commitSelection({ start: selection.start, end: nextEnd })}
            onPlaySelection={() => void playSelection()}
            onTrimSelection={() =>
              applyBufferCommand(copy.commands.keepSelection, (currentBuffer) =>
                extractAudioRange(currentBuffer, selection.start, selection.end),
              )
            }
            onRemoveSelection={() =>
              applyBufferCommand(copy.commands.removeSelection, (currentBuffer) =>
                removeAudioRange(currentBuffer, selection.start, selection.end),
              )
            }
            onClearSelection={() => {
              setSelection(buffer ? normalizeSelection(0, buffer.duration, buffer.duration, selection.trimMode) : DEFAULT_SELECTION);
              setStatusMessage(copy.status.selectionReset);
            }}
          />
        ) : null}

        {buffer || projectTracks.length > 0 ? (
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
            <EffectsPanel
              activeTab={activeTab}
              effects={effects}
              onTabChange={setActiveTab}
              onChange={(nextEffects) => setEffects((currentEffects) => ({ ...currentEffects, ...nextEffects }))}
              onPreview={handlePreview}
              onApply={handleApplyEffect}
            />

            <div className="space-y-3">
              {projectTracks.length > 1 ? (
                <button
                  type="button"
                  onClick={() => void handlePreviewMix()}
                  className="audio-button-secondary audio-focus-ring h-9 px-3"
                >
                  <Play size={14} strokeWidth={1.5} />
                  {locale === 'ko' ? '믹스 미리듣기' : 'Preview mix'}
                </button>
              ) : null}

              <TrackListPanel
                tracks={projectTracks.map((track) => ({
                  id: track.id,
                  name: track.name,
                  source: track.source,
                  startTime: track.startTime,
                  gain: track.gain,
                  muted: track.muted,
                  solo: track.solo,
                  isActive: track.id === activeTrack?.id,
                }))}
                emptyMessage={copy.status.waitingInput}
                onSelectTrack={setActiveTrackId}
                onStartTimeChange={(trackId, nextStartTime) =>
                  updateTrack(trackId, (currentTrack) => ({
                    ...currentTrack,
                    startTime: Number(nextStartTime.toFixed(3)),
                  }))
                }
                onGainChange={(trackId, nextGain) =>
                  updateTrack(trackId, (currentTrack) => ({
                    ...currentTrack,
                    gain: Number(nextGain.toFixed(2)),
                  }))
                }
                onMuteToggle={(trackId) =>
                  updateTrack(trackId, (currentTrack) => ({
                    ...currentTrack,
                    muted: !currentTrack.muted,
                  }))
                }
                onSoloToggle={(trackId) =>
                  updateTrack(trackId, (currentTrack) => ({
                    ...currentTrack,
                    solo: !currentTrack.solo,
                  }))
                }
                onRemoveTrack={removeTrack}
              />

              {sessionPanel}
            </div>
          </div>
        ) : (
          <div>{statusLines}</div>
        )}
      </div>
    </div>
  );
}
