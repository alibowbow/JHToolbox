'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from '@/components/providers/locale-provider';
import {
  EditHistory,
  type AudioProjectTrack,
  audioEngine,
  createAudioBuffer,
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
  AUDIO_SESSION_ACCEPT,
  isAudioSessionFile,
  parseAudioSessionFile,
  saveAudioSession,
} from './audio-session';
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
import { TrackTimelineStack as MultiTrackTimeline } from './Tracks/TrackTimelineStack';
import { EditorToolbar } from './Toolbar/EditorToolbar';
import { TransportBar } from './Transport/TransportBar';

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

function createEmptyTrack(trackNumber: number, locale: 'en' | 'ko'): AudioProjectTrack {
  return {
    id: createTrackId('track'),
    name: locale === 'ko' ? `빈 트랙 ${trackNumber}` : `Empty track ${trackNumber}`,
    buffer: null,
    startTime: 0,
    gain: 1,
    muted: false,
    solo: false,
    source: 'empty',
  };
}

function writeBufferSegment(target: AudioBuffer, source: AudioBuffer, offsetSeconds: number) {
  const targetOffset = Math.max(0, Math.round(offsetSeconds * target.sampleRate));

  for (let channelIndex = 0; channelIndex < target.numberOfChannels; channelIndex += 1) {
    const targetChannel = target.getChannelData(channelIndex);
    const sourceChannel = source.getChannelData(Math.min(channelIndex, source.numberOfChannels - 1));

    for (let sampleIndex = 0; sampleIndex < sourceChannel.length; sampleIndex += 1) {
      const writeIndex = targetOffset + sampleIndex;
      if (writeIndex >= targetChannel.length) {
        break;
      }

      targetChannel[writeIndex] = sourceChannel[sampleIndex] ?? 0;
    }
  }
}

function overwriteTrackBuffer(track: AudioProjectTrack, recordingBuffer: AudioBuffer, insertTime: number) {
  if (!track.buffer) {
    return {
      buffer: recordingBuffer,
      startTime: insertTime,
    };
  }

  const existingBuffer = track.buffer;
  const nextStart = Math.min(track.startTime, insertTime);
  const nextEnd = Math.max(track.startTime + existingBuffer.duration, insertTime + recordingBuffer.duration);
  const nextDuration = Math.max(nextEnd - nextStart, recordingBuffer.duration, existingBuffer.duration, 0.05);
  const nextBuffer = createAudioBuffer(
    Math.max(existingBuffer.numberOfChannels, recordingBuffer.numberOfChannels),
    Math.max(1, Math.ceil(nextDuration * existingBuffer.sampleRate)),
    existingBuffer.sampleRate,
  );

  writeBufferSegment(nextBuffer, existingBuffer, track.startTime - nextStart);
  writeBufferSegment(nextBuffer, recordingBuffer, insertTime - nextStart);

  return {
    buffer: nextBuffer,
    startTime: nextStart,
  };
}

function hasTrackSelection(buffer: AudioBuffer | null, selection: AudioSelection) {
  if (!buffer) {
    return false;
  }

  return selection.start > 0.001 || selection.end < Math.max(buffer.duration - 0.001, 0);
}

function getVisibleTrackName(track: AudioProjectTrack | null, locale: 'en' | 'ko') {
  if (!track) {
    return null;
  }

  if (track.source === 'empty') {
    return locale === 'ko' ? '빈 트랙' : 'Empty track';
  }

  return track.name;
}

export function AudioEditor({ mode }: AudioEditorProps) {
  const { locale } = useLocale();
  const copy = useMemo(() => getAudioEditorCopy(locale), [locale]);
  const [projectTracks, setProjectTracks] = useState<AudioProjectTrack[]>([]);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [mixdownBuffer, setMixdownBuffer] = useState<AudioBuffer | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [projectTime, setProjectTime] = useState(0);
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
  const mixdownBufferRef = useRef<AudioBuffer | null>(null);
  const activeTrackRef = useRef<AudioProjectTrack | null>(null);
  const activeTrackIdRef = useRef<string | null>(null);
  const recordingSessionRef = useRef<WavRecordingSession | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingStartRef = useRef<number | null>(null);
  const recordingPausedRef = useRef(false);
  const recordingAccumulatedDurationRef = useRef(0);
  const recordingTargetTrackIdRef = useRef<string | null>(null);
  const recordingInsertTimeRef = useRef(0);
  const playbackProjectOffsetRef = useRef(0);

  const activeTrack = useMemo(
    () => projectTracks.find((track) => track.id === activeTrackId) ?? projectTracks[0] ?? null,
    [activeTrackId, projectTracks],
  );
  const getTrackById = (trackId: string | null | undefined) =>
    projectTracks.find((track) => track.id === trackId) ?? null;
  const buffer = activeTrack?.buffer ?? null;
  const duration = buffer?.duration ?? 0;
  const canUndo = historyRef.current.canUndo;
  const canRedo = historyRef.current.canRedo;
  const undoLabel = historyRef.current.undoLabel;
  const redoLabel = historyRef.current.redoLabel;
  const historyDepth = historyRef.current.depth;
  const hasActiveSelection = hasTrackSelection(buffer, selection);
  const activeTrackName = getVisibleTrackName(activeTrack, locale);
  const projectDuration = mixdownBuffer?.duration ?? getMixdownDuration(projectTracks);
  const projectCurrentTime = isRecording ? recordingInsertTimeRef.current + recordingDuration : projectTime;
  const canSaveTrack = Boolean(buffer) && !isRecording;
  const canSaveMix = Boolean(projectTracks.some((track) => track.buffer)) && !isRecording;
  const canSaveSession = projectTracks.length > 0 && !isRecording;

  useEffect(() => {
    bufferRef.current = buffer;
  }, [buffer]);

  useEffect(() => {
    mixdownBufferRef.current = mixdownBuffer;
  }, [mixdownBuffer]);

  useEffect(() => {
    activeTrackRef.current = activeTrack;
  }, [activeTrack]);

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

    const nextProjectTime = clamp(projectTime, 0, Math.max(projectDuration, activeTrack?.startTime ?? 0, 0));
    const nextCurrentTime = clamp(nextProjectTime - (activeTrack?.startTime ?? 0), 0, buffer.duration);
    setSelection(normalizeSelection(0, buffer.duration, buffer.duration, selection.trimMode));
    setCurrentTime(nextCurrentTime);
    setIsSilent(isSilentAudioBuffer(buffer));
    setIsPlaying(false);
    playbackProjectOffsetRef.current = activeTrack?.startTime ?? 0;
    audioEngine.setBuffer(buffer, nextCurrentTime);
  }, [activeTrack, activeTrackId, buffer, projectDuration, projectTime, selection.trimMode]);

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
      const activeBuffer = bufferRef.current;
      const activeTrackState = activeTrackRef.current;
      const mixBuffer = mixdownBufferRef.current;

      if (mixBuffer && audioEngine.buffer === mixBuffer) {
        setProjectTime(nextTime);

        if (activeTrackState?.buffer) {
          setCurrentTime(clamp(nextTime - activeTrackState.startTime, 0, activeTrackState.buffer.duration));
        } else {
          setCurrentTime(0);
        }
        return;
      }

      setCurrentTime(nextTime);

      if (activeTrackState && activeBuffer && audioEngine.buffer === activeBuffer) {
        setProjectTime(nextTime + playbackProjectOffsetRef.current);
      }
    });
    const unsubscribeEnded = audioEngine.onEnded(() => {
      setIsPlaying(false);
      const activeBuffer = bufferRef.current;
      const mixBuffer = mixdownBufferRef.current;
      const activeTrackState = activeTrackRef.current;

      if (mixBuffer && audioEngine.buffer === mixBuffer) {
        setProjectTime(0);
        setCurrentTime(0);

        if (activeBuffer) {
          audioEngine.setBuffer(activeBuffer, 0);
        }
        return;
      }

      setCurrentTime(0);
      setProjectTime(activeTrackState?.startTime ?? 0);

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
      if (projectTracks.length === 0) {
        setProjectTime(0);
      }
      setIsPlaying(false);
      setSelection(DEFAULT_SELECTION);
      setIsSilent(false);
      return;
    }

    const nextProjectTime = clamp(projectTime, 0, Math.max(projectDuration, activeTrack?.startTime ?? 0, 0));
    const nextLocalTime = clamp(nextProjectTime - (activeTrack?.startTime ?? 0), 0, buffer.duration);

    setCurrentTime((currentValue) => (Math.abs(currentValue - nextLocalTime) > 0.001 ? nextLocalTime : currentValue));
    setSelection((currentSelection) =>
      normalizeSelection(currentSelection.start, currentSelection.end || buffer.duration, buffer.duration, currentSelection.trimMode),
    );
    setIsSilent(isSilentAudioBuffer(buffer));

    if (audioEngine.buffer !== buffer) {
      playbackProjectOffsetRef.current = activeTrack?.startTime ?? 0;
      audioEngine.setBuffer(buffer, nextLocalTime);
      return;
    }

    if (!isPlaying && Math.abs(audioEngine.currentTime - nextLocalTime) > 0.001) {
      playbackProjectOffsetRef.current = activeTrack?.startTime ?? 0;
      audioEngine.seekTo(nextLocalTime);
    }
  }, [activeTrack?.startTime, buffer, isPlaying, projectDuration, projectTime, projectTracks.length]);

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
    setProjectTime(activeTrack.startTime);
    setSelection(normalizeSelection(0, nextBuffer.duration, nextBuffer.duration, selection.trimMode));
    setStatusMessage(nextStatus);
    setIsPlaying(false);
    audioEngine.setBuffer(nextBuffer, 0);
  };

  const applySessionState = (sessionState: Awaited<ReturnType<typeof parseAudioSessionFile>>) => {
    audioEngine.stop();
    historyRef.current.clear();
    setHistoryVersion((value) => value + 1);
    setProjectTracks(sessionState.tracks);
    setActiveTrackId(sessionState.activeTrackId);
    setProjectTime(sessionState.projectTime);
    setZoom(sessionState.zoom);
    setSelection(sessionState.selection);
    setEffects(sessionState.effects);
    setActiveTab(sessionState.activeTab);
    setLoopEnabled(sessionState.loopEnabled);
    setCurrentTime(0);
    setIsPlaying(false);
    setWarningMessage(null);
    setLoadError(null);
    setStatusMessage(locale === 'ko' ? '\uC624\uB514\uC624 \uC138\uC158\uC744 \uBD88\uB7EC\uC654\uC2B5\uB2C8\uB2E4.' : 'Loaded the audio session.');
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
      if (nextFiles.length === 1 && isAudioSessionFile(nextFiles[0])) {
        const sessionState = await parseAudioSessionFile(nextFiles[0]);
        applySessionState(sessionState);
        return;
      }

      const decodedTracks: AudioProjectTrack[] = [];

      for (const file of nextFiles) {
        setStatusMessage(copy.status.loading(file.name));
        const decoded = await audioEngine.decodeFile(file);
        decodedTracks.push(createProjectTrack(file.name, decoded, 'file'));
      }

      const targetTrack = activeTrackRef.current;

      if (targetTrack && !targetTrack.buffer && decodedTracks.length > 0) {
        const [filledTrack, ...remainingTracks] = decodedTracks;
        setProjectTracks((currentTracks) => {
          const nextTracks: AudioProjectTrack[] = currentTracks.map((track) =>
            track.id === targetTrack.id
              ? {
                  ...track,
                  name: filledTrack.name,
                  buffer: filledTrack.buffer,
                  source: 'file' as const,
                }
              : track,
          );

          return remainingTracks.length > 0 ? [...nextTracks, ...remainingTracks] : nextTracks;
        });
        setActiveTrackId(targetTrack.id);
      } else {
        setProjectTracks((currentTracks) => [...currentTracks, ...decodedTracks]);
        setActiveTrackId(decodedTracks.at(-1)?.id ?? null);
      }
      setStatusMessage(null);
    } catch (error) {
      setStatusMessage(null);
      setLoadError(error instanceof Error ? error.message : copy.status.decodeFailed);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddEmptyTrack = () => {
    const nextTrack = createEmptyTrack(projectTracks.length + 1, locale);
    setProjectTracks((currentTracks) => [...currentTracks, nextTrack]);
    setActiveTrackId(nextTrack.id);
    setStatusMessage(locale === 'ko' ? '\uBE48 \uD2B8\uB799\uC744 \uCD94\uAC00\uD588\uC2B5\uB2C8\uB2E4.' : 'Added an empty track.');
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
        setProjectTime(0);
        setStatusMessage(null);
        setWarningMessage(null);
        setLoadError(null);
      }

      return nextTracks;
    });
  };

  const toggleTrackMute = (trackId: string) => {
    updateTrack(trackId, (currentTrack) => ({
      ...currentTrack,
      muted: !currentTrack.muted,
    }));
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

  const commitSelection = (
    nextSelection: { start: number; end: number },
    targetTrack: AudioProjectTrack | null = activeTrackRef.current,
  ) => {
    const targetDuration = targetTrack?.buffer?.duration ?? duration;
    const normalized = normalizeSelection(nextSelection.start, nextSelection.end, targetDuration, selection.trimMode);
    setSelection(normalized);

    if (loopEnabled) {
      audioEngine.setLoop(normalized.start, normalized.end);
    }

    const trackProjectStart = targetTrack?.startTime ?? 0;
    const selectionProjectStart = trackProjectStart + normalized.start;
    const selectionProjectEnd = trackProjectStart + normalized.end;

    if (projectTime < selectionProjectStart || projectTime > selectionProjectEnd) {
      setCurrentTime(normalized.start);
      setProjectTime(selectionProjectStart);

      if (targetTrack?.buffer && audioEngine.buffer === targetTrack.buffer) {
        audioEngine.seekTo(normalized.start);
      } else if (targetTrack?.buffer) {
        audioEngine.setBuffer(targetTrack.buffer, normalized.start);
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
    target,
  }: {
    format: 'wav' | 'mp3';
    filename: string;
    target: 'track' | 'mix' | 'session';
  }) => {
    if (target === 'session') {
      if (projectTracks.length === 0) {
        setLoadError(copy.status.loadFirst);
        return;
      }

      try {
        setStatusMessage(locale === 'ko' ? '\uC138\uC158 \uD30C\uC77C\uC744 \uC800\uC7A5\uD558\uB294 \uC911\uC785\uB2C8\uB2E4...' : 'Saving the session file...');
        const saved = await saveAudioSession({
          filename: filename.trim() || activeTrackName || 'audio-session',
          state: {
            activeTrackId,
            projectTime,
            zoom,
            selection,
            effects,
            activeTab,
            loopEnabled,
            tracks: projectTracks,
          },
        });

        if (saved) {
          setStatusMessage(locale === 'ko' ? '\uC138\uC158 \uD30C\uC77C\uC744 \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.' : 'Saved the session file.');
        }
        return;
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : copy.status.exportFailed);
        return;
      }
    }

    try {
      setStatusMessage(copy.status.exportPreparing(format));
      const exportBuffer =
        target === 'mix'
          ? ((await mixAudioTracks(projectTracks)) ?? mixdownBuffer ?? buffer)
          : buffer;

      if (!exportBuffer) {
        setLoadError(copy.status.loadFirst);
        return;
      }

      const saved = await exportAudio({
        buffer: exportBuffer,
        format,
        filename:
          filename.trim() ||
          (target === 'mix'
            ? locale === 'ko'
              ? 'audio-mix'
              : 'audio-mix'
            : activeTrackName || 'audio-export'),
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
    if (isRecording) {
      return;
    }

    try {
      const playbackBuffer = buffer ?? mixdownBuffer;
      if (!playbackBuffer) {
        return;
      }

      if (isPlaying) {
        pauseCurrentPlayback();
        return;
      }

      if (!buffer) {
        const nextProjectTime = audioEngine.buffer === playbackBuffer ? audioEngine.currentTime : projectTime;
        const playbackStart = nextProjectTime >= playbackBuffer.duration - 0.001 ? 0 : clamp(nextProjectTime, 0, playbackBuffer.duration);
        playbackProjectOffsetRef.current = 0;
        if (audioEngine.buffer !== playbackBuffer) {
          audioEngine.setBuffer(playbackBuffer, playbackStart);
        } else if (Math.abs(audioEngine.currentTime - playbackStart) > 0.001) {
          audioEngine.seekTo(playbackStart);
        }

        setProjectTime(playbackStart);
        audioEngine.play(playbackStart);
        setIsPlaying(true);
        return;
      }

      const activeStart = activeTrack?.startTime ?? 0;
      const cursorTime = clamp(projectTime - activeStart, 0, duration);
      const nextStart = audioEngine.buffer === buffer ? audioEngine.currentTime : cursorTime;
      const playbackStart = nextStart >= duration - 0.001 ? 0 : clamp(nextStart, 0, duration);
      playbackProjectOffsetRef.current = activeStart;

      if (audioEngine.buffer !== buffer) {
        audioEngine.setBuffer(buffer, playbackStart);
      } else if (Math.abs(audioEngine.currentTime - playbackStart) > 0.001) {
        audioEngine.seekTo(playbackStart);
      }

      setCurrentTime(playbackStart);
      setProjectTime(playbackStart + activeStart);
      audioEngine.play(playbackStart);
      setIsPlaying(true);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : copy.status.playbackFailed);
    }
  };

  const pauseCurrentPlayback = () => {
    audioEngine.pause();
    const pausedTime = audioEngine.currentTime;
    const activeStart = activeTrackRef.current?.startTime ?? playbackProjectOffsetRef.current;
    const activeBuffer = bufferRef.current;
    const currentEngineBuffer = audioEngine.buffer;

    if (activeBuffer && currentEngineBuffer === activeBuffer) {
      setCurrentTime(pausedTime);
      setProjectTime(pausedTime + activeStart);
    } else if (mixdownBufferRef.current && currentEngineBuffer === mixdownBufferRef.current) {
      setProjectTime(pausedTime);
      if (activeTrackRef.current?.buffer) {
        setCurrentTime(clamp(pausedTime - activeStart, 0, activeTrackRef.current.buffer.duration));
      } else {
        setCurrentTime(0);
      }
    } else {
      setProjectTime(pausedTime);
    }

    setIsPlaying(false);
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
      setProjectTime(0);
      setIsPlaying(true);
      setStatusMessage(locale === 'ko' ? '\uBA40\uD2F0\uD2B8\uB799 \uBBF9\uC2A4\uB97C \uBBF8\uB9AC \uB4E3\uB294 \uC911\uC785\uB2C8\uB2E4.' : 'Previewing the multitrack mix.');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : copy.status.playbackFailed);
    }
  };

  const seekToProjectTime = (nextProjectTime: number, targetTrack: AudioProjectTrack | null = activeTrackRef.current) => {
    if (isRecording) {
      return;
    }

    const safeProjectTime = clamp(nextProjectTime, 0, Math.max(projectDuration, 0));
    setProjectTime(safeProjectTime);

    if (targetTrack?.buffer) {
      const localTime = clamp(safeProjectTime - targetTrack.startTime, 0, targetTrack.buffer.duration);
      setCurrentTime(localTime);
      playbackProjectOffsetRef.current = targetTrack.startTime;

      if (audioEngine.buffer === targetTrack.buffer) {
        audioEngine.seekTo(localTime);
      } else {
        audioEngine.setBuffer(targetTrack.buffer, localTime);
      }
      return;
    }

    setCurrentTime(0);
    playbackProjectOffsetRef.current = 0;

    if (mixdownBuffer) {
      if (audioEngine.buffer === mixdownBuffer) {
        audioEngine.seekTo(safeProjectTime);
      } else {
        audioEngine.setBuffer(mixdownBuffer, safeProjectTime);
      }
    }
  };

  const handleMoveTrack = (trackId: string, nextStartTime: number) => {
    if (isPlaying && activeTrackRef.current?.id === trackId) {
      pauseCurrentPlayback();
    }

    updateTrack(trackId, (currentTrack) => ({
      ...currentTrack,
      startTime: Number(nextStartTime.toFixed(3)),
    }));
  };

  const seekBy = (delta: number) => {
    if (isRecording) {
      return;
    }

    seekToProjectTime(projectCurrentTime + delta);
  };

  const seekToBoundary = (boundary: 'start' | 'end') => {
    if (isRecording) {
      return;
    }

    seekToProjectTime(boundary === 'start' ? 0 : projectDuration);
  };

  const handleTimelineSeek = (time: number, trackId?: string) => {
    const targetTrack = trackId ? getTrackById(trackId) : activeTrack;

    if (trackId && trackId !== activeTrackId) {
      setActiveTrackId(trackId);
    }

    seekToProjectTime(time, targetTrack);
  };

  const playSelection = async () => {
    if (!buffer || selection.end <= selection.start || isRecording) {
      return;
    }

    audioEngine.previewSlice(buffer, selection.start, selection.end);
    setCurrentTime(selection.start);
    setProjectTime(selection.start + (activeTrack?.startTime ?? 0));
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

    let targetTrackId = activeTrack?.id ?? null;
    let insertTime = projectTime;
    let createdTrackId: string | null = null;

    if (!targetTrackId) {
      const nextTrack = createEmptyTrack(projectTracks.length + 1, locale);
      targetTrackId = nextTrack.id;
      createdTrackId = nextTrack.id;
      insertTime = nextTrack.startTime;
      setProjectTracks((currentTracks) => [...currentTracks, nextTrack]);
      setActiveTrackId(nextTrack.id);
    }

    recordingTargetTrackIdRef.current = targetTrackId;
    recordingInsertTimeRef.current = Math.max(0, insertTime);
    setProjectTime(Math.max(0, insertTime));

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
      recordingTargetTrackIdRef.current = null;
      recordingInsertTimeRef.current = 0;

      if (createdTrackId) {
        setProjectTracks((currentTracks) => currentTracks.filter((track) => track.id !== createdTrackId));
        setActiveTrackId((currentId) => (currentId === createdTrackId ? null : currentId));
      }

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
      const targetTrackId = recordingTargetTrackIdRef.current;
      const insertTime = recordingInsertTimeRef.current;

      setRecordingDuration(recording.duration);
      setProjectTracks((currentTracks) => {
        if (!targetTrackId) {
          const nextTrack = createProjectTrack(recording.file.name, nextBuffer, 'recording');
          return [...currentTracks, nextTrack];
        }

        if (!currentTracks.some((track) => track.id === targetTrackId)) {
          const nextTrack = createProjectTrack(recording.file.name, nextBuffer, 'recording');
          nextTrack.startTime = insertTime;
          return [...currentTracks, nextTrack];
        }

        return currentTracks.map((track) => {
          if (track.id !== targetTrackId) {
            return track;
          }

          const nextTrackState = overwriteTrackBuffer(track, nextBuffer, insertTime);
          return {
            ...track,
            name: recording.file.name,
            buffer: nextTrackState.buffer,
            startTime: nextTrackState.startTime,
            source: 'recording',
          };
        });
      });
      if (targetTrackId) {
        setActiveTrackId(targetTrackId);
      }
      setProjectTime(insertTime + recording.duration);
      setStatusMessage(copy.recording.ready(recording.file.name));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : copy.recording.startError);
    } finally {
      recordingSessionRef.current = null;
      recordingStartRef.current = null;
      recordingPausedRef.current = false;
      recordingAccumulatedDurationRef.current = 0;
      recordingTargetTrackIdRef.current = null;
      recordingInsertTimeRef.current = 0;
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

  const handleResetProject = () => {
    audioEngine.stop();
    clearRecordingTimer();
    stopRecordingStream();

    const recordingSession = recordingSessionRef.current;
    if (recordingSession) {
      void recordingSession.cleanup().catch(() => undefined);
    }

    recordingSessionRef.current = null;
    recordingStartRef.current = null;
    recordingPausedRef.current = false;
    recordingAccumulatedDurationRef.current = 0;
    recordingTargetTrackIdRef.current = null;
    recordingInsertTimeRef.current = 0;

    historyRef.current.clear();
    setHistoryVersion((value) => value + 1);
    setProjectTracks([]);
    setActiveTrackId(null);
    setMixdownBuffer(null);
    setCurrentTime(0);
    setProjectTime(0);
    setIsPlaying(false);
    setIsLoading(false);
    setStatusMessage(null);
    setWarningMessage(null);
    setLoadError(null);
    setZoom(1);
    setSelection(DEFAULT_SELECTION);
    setEffects(DEFAULT_EFFECTS);
    setActiveTab('fade');
    setLoopEnabled(false);
    setIsSilent(false);
    setIsRecording(false);
    setIsRecordingPaused(false);
    setRecordingDuration(0);
    setRecordingPeaks([]);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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

  const emptyStatePromptText =
    locale === 'ko' ? '\uC624\uB514\uC624\uB97C \uBD88\uB7EC\uC624\uAC70\uB098 \uB179\uC74C \uBC84\uD2BC\uC744 \uB20C\uB7EC \uC2DC\uC791\uD558\uC138\uC694.' : 'Open audio or press the record button to get started.';
  const emptyStateFeatureList =
    locale === 'ko'
      ? ['\uC790\uB974\uAE30', '\uC624\uB514\uC624 \uBCC0\uD658', '\uB179\uC74C', '\uBA40\uD2F0\uD2B8\uB799', '\uB9AC\uBC84\uBE0C', '\uC570\uD50C\uB9AC\uD30C\uC774', 'EQ']
      : ['Trim', 'Audio convert', 'Record', 'Multitrack', 'Reverb', 'Amplify', 'EQ'];

  return (
    <div
      data-mode={mode}
      className="audio-studio audio-studio-shell flex min-h-[calc(100dvh-5.5rem)] flex-col"
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={`${AUDIO_ACCEPT},${AUDIO_SESSION_ACCEPT}`}
        onChange={(event) => {
          void importFiles(Array.from(event.target.files ?? []));
          event.currentTarget.value = '';
        }}
        className="hidden"
      />

      <EditorToolbar
        fileName={activeTrackName}
        canSaveTrack={canSaveTrack}
        canSaveMix={canSaveMix}
        canSaveSession={canSaveSession}
        loopEnabled={loopEnabled}
        onOpenFiles={openPicker}
        onSaveAs={({ format, filename, target }) => void handleSaveAs({ format, filename, target })}
        onReset={handleResetProject}
        onToggleLoop={() => setLoopEnabled((currentValue) => !currentValue)}
      />

      <div className="border-b border-[var(--border)] bg-[var(--topbar-bg)] px-3 py-3 sm:px-4">
        <TransportBar
          currentTime={projectCurrentTime}
          duration={Math.max(projectDuration, duration)}
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
        {projectTracks.length === 0 && !isRecording ? (
          <div className="audio-panel rounded-[20px] p-6 sm:p-8">
            <div className="mx-auto flex min-h-[180px] max-w-3xl flex-col justify-center gap-4">
              <p className="text-sm text-[var(--text-secondary)]">{emptyStatePromptText}</p>
              <div className="flex flex-wrap gap-2">
                {emptyStateFeatureList.map((feature) => (
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
        ) : null}

        {projectTracks.length > 0 ? (
          <MultiTrackTimeline
            tracks={projectTracks.map((track) => ({
              id: track.id,
              name: track.name,
              source: track.source,
              startTime: track.startTime,
              gain: track.gain,
              muted: track.muted,
              solo: track.solo,
              isActive: track.id === activeTrack?.id,
              buffer: track.buffer,
            }))}
            duration={projectDuration || duration}
            currentTime={projectCurrentTime}
            zoom={zoom}
            selectionStart={selection.start}
            selectionEnd={selection.end}
            onSelectTrack={setActiveTrackId}
            onSeek={handleTimelineSeek}
            onSelectionChange={(trackId, nextSelection) => {
              const targetTrack = getTrackById(trackId);

              if (trackId !== activeTrack?.id) {
                setActiveTrackId(trackId);
              }
              commitSelection(nextSelection, targetTrack);
            }}
            onMoveTrack={handleMoveTrack}
            onAddTrack={handleAddEmptyTrack}
            onPreviewMix={projectTracks.length > 1 ? () => void handlePreviewMix() : undefined}
            onMuteToggle={toggleTrackMute}
            onRemoveTrack={removeTrack}
          />
        ) : null}

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

        {statusLines}

        {buffer || projectTracks.length > 0 ? (
          <EffectsPanel
            activeTab={activeTab}
            effects={effects}
            onTabChange={setActiveTab}
            onChange={(nextEffects) => setEffects((currentEffects) => ({ ...currentEffects, ...nextEffects }))}
            onPreview={handlePreview}
            onApply={handleApplyEffect}
          />
        ) : null}
      </div>
    </div>
  );
}

