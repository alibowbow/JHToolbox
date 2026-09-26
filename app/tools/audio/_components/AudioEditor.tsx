'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale } from '@/components/providers/locale-provider';
import {
  ProjectHistory,
  ProjectPlayer,
  type AudioProjectTrack,
  decodeAudioBlobToBuffer,
  exportAudio,
  getMixdownDuration,
  mixAudioTracks,
} from '@/lib/audio';
import {
  DEFAULT_RECORDING_SETTINGS,
  RecordingError,
  canRecordDeviceAudio,
  createWavRecordingSession,
  listMicrophones,
  openRecordingInput,
  type RecordingInput,
  type RecordingSettings,
  type RecordingSessionInfo,
  type WavRecordingSession,
} from '@/lib/processors/audio-recording';
import {
  applyEqToAudioRange,
  applyFadeToAudioRange,
  applyGainToAudioRange,
  applyPitchToAudioRange,
  applyReverbToAudioRange,
  applySpeedToAudioRange,
  extractAudioRange,
  insertAudioAtTime,
  removeAudioRange,
} from './audio-buffer-transforms';
import { getAudioEditorCopy } from './audio-editor-copy';
import {
  AUDIO_SESSION_ACCEPT,
  isAudioSessionFile,
  parseAudioSessionFile,
  saveAudioSession,
  type ProjectSelection,
} from './audio-session';
import {
  type AudioEditorMode,
  type AudioEffectTab,
  type AudioEffectsState,
  AUDIO_ACCEPT,
  DEFAULT_EFFECTS,
  clamp,
  formatTime,
} from './audio-editor-utils';
import { EffectsPanel } from './Effects/EffectsPanel';
import { EmptyStart } from './EmptyStart';
import { RecordingSettingsPanel } from './Recording/RecordingSettingsPanel';
import { SelectionBar } from './Selection/SelectionBar';
import { ShortcutsModal } from './ShortcutsModal';
import { TrackTimelineStack } from './Tracks/TrackTimelineStack';
import { EditorToolbar } from './Toolbar/EditorToolbar';
import { TransportBar } from './Transport/TransportBar';

const DROPPABLE_AUDIO_PATTERN = /\.(mp3|wav|m4a|aac|ogg|flac|webm|mp4|mov|m4v|jhaudio)$/i;
const RECORDING_SETTINGS_KEY = 'jh-audio-recording-settings';

function isDroppableAudioFile(file: File) {
  return file.type.startsWith('audio/') || file.type.startsWith('video/') || DROPPABLE_AUDIO_PATTERN.test(file.name);
}

function readSavedRecordingSettings(): RecordingSettings {
  try {
    const saved = JSON.parse(window.localStorage.getItem(RECORDING_SETTINGS_KEY) ?? 'null') as Partial<RecordingSettings> | null;
    if (!saved || typeof saved !== 'object') {
      return DEFAULT_RECORDING_SETTINGS;
    }
    return {
      source: saved.source === 'device' || saved.source === 'both' ? saved.source : 'mic',
      micId: typeof saved.micId === 'string' ? saved.micId : '',
      voiceEnhance: saved.voiceEnhance === true,
    };
  } catch {
    return DEFAULT_RECORDING_SETTINGS;
  }
}

type WakeLockSentinelLike = { released?: boolean; release: () => Promise<void> };

interface AudioEditorProps {
  mode: AudioEditorMode;
}

const MIN_SELECTION_SEC = 0.001;
const MAX_ZOOM = 32;

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

function createProjectTrack(
  name: string,
  buffer: AudioBuffer | null,
  source: AudioProjectTrack['source'],
  startTime = 0,
): AudioProjectTrack {
  return {
    id: createTrackId(source === 'recording' ? 'take' : 'track'),
    name,
    buffer,
    startTime,
    gain: 1,
    muted: false,
    solo: false,
    source,
  };
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

/**
 * The audio shortcuts (cut, merge, fade, speed, pitch, record) all open this
 * editor; `?intent=` says which job the user came for.
 */
type AudioIntent = 'cut' | 'merge' | 'fade' | 'speed' | 'pitch' | 'record';
const INTENT_TABS: Partial<Record<AudioIntent, AudioEffectTab>> = { fade: 'fade', speed: 'speed', pitch: 'pitch' };
const INTENT_PROMPTS: Record<string, { en: string; ko: string }> = {
  cut: {
    en: 'Open an audio file, then drag across the waveform to select the part to keep or remove.',
    ko: '오디오 파일을 연 뒤, 파형 위를 드래그해 남기거나 지울 구간을 고르세요.',
  },
  merge: {
    en: 'Open several audio files at once — each becomes a track you can line up and export as one file.',
    ko: '여러 오디오 파일을 한 번에 여세요. 파일마다 트랙이 되고, 이어 붙여 한 파일로 저장할 수 있어요.',
  },
  fade: {
    en: 'Open an audio file — the Fade panel below is ready for fade in / fade out.',
    ko: '오디오 파일을 열면 아래 페이드 패널에서 페이드 인/아웃을 바로 적용할 수 있어요.',
  },
  speed: {
    en: 'Open an audio file — the Speed panel below changes the tempo.',
    ko: '오디오 파일을 열면 아래 속도 패널에서 빠르기를 바꿀 수 있어요.',
  },
  pitch: {
    en: 'Open an audio file — the Pitch panel below shifts the key.',
    ko: '오디오 파일을 열면 아래 피치 패널에서 음높이를 바꿀 수 있어요.',
  },
  record: {
    en: 'Press Start recording. On a computer you can also record just the device’s sound, without the microphone.',
    ko: '녹음 시작을 누르면 바로 녹음돼요. 컴퓨터에서는 마이크 없이 기기 소리만 녹음할 수도 있어요.',
  },
};

function readIntent(value: string | null): AudioIntent | null {
  return value && value in INTENT_PROMPTS ? (value as AudioIntent) : null;
}

export function AudioEditor({ mode }: AudioEditorProps) {
  const searchParams = useSearchParams();
  const intent = readIntent(searchParams?.get('intent') ?? null);
  const { locale } = useLocale();
  const copy = useMemo(() => getAudioEditorCopy(locale), [locale]);

  const [tracks, setTracks] = useState<AudioProjectTrack[]>([]);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selection, setSelection] = useState<ProjectSelection | null>(null);
  const [clipboard, setClipboard] = useState<AudioBuffer | null>(null);
  const [zoom, setZoom] = useState(1);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [effects, setEffects] = useState<AudioEffectsState>(DEFAULT_EFFECTS);
  const [activeTab, setActiveTab] = useState<AudioEffectTab>(() => (intent && INTENT_TABS[intent]) || 'fade');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [, setHistoryVersion] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const dragDepthRef = useRef(0);
  const showShortcutsRef = useRef(false);

  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingSettings, setRecordingSettings] = useState<RecordingSettings>(DEFAULT_RECORDING_SETTINGS);
  const [recordingInfo, setRecordingInfo] = useState<RecordingSessionInfo | null>(null);
  const [microphones, setMicrophones] = useState<Array<{ id: string; label: string }>>([]);
  const [deviceSupported, setDeviceSupported] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const importFilesRef = useRef<(files: File[]) => Promise<void>>(async () => undefined);
  const playerRef = useRef<ProjectPlayer | null>(null);
  const historyRef = useRef(new ProjectHistory());
  const tracksRef = useRef<AudioProjectTrack[]>([]);
  const activeTrackRef = useRef<AudioProjectTrack | null>(null);
  const playheadRef = useRef(0);
  const selectionRef = useRef<ProjectSelection | null>(null);
  const clipboardRef = useRef<AudioBuffer | null>(null);
  const busyRef = useRef(false);

  const recordingSessionRef = useRef<WavRecordingSession | null>(null);
  const recordingInputRef = useRef<RecordingInput | null>(null);
  const inputPeaksRef = useRef<number[]>([]);
  const livePeaksRef = useRef<number[]>([]);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const stopRecordingRef = useRef<() => Promise<void>>(async () => undefined);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingStartRef = useRef<number | null>(null);
  const recordingPausedRef = useRef(false);
  const recordingAccumulatedRef = useRef(0);
  const recordingInsertTimeRef = useRef(0);

  const getPlayer = () => {
    if (!playerRef.current) {
      playerRef.current = new ProjectPlayer();
    }

    return playerRef.current;
  };

  const activeTrack = useMemo(
    () => tracks.find((track) => track.id === activeTrackId) ?? tracks[0] ?? null,
    [activeTrackId, tracks],
  );
  const projectDuration = useMemo(() => getMixdownDuration(tracks), [tracks]);
  const recordingEnd = isRecording ? recordingInsertTimeRef.current + recordingDuration : 0;
  const displayDuration = Math.max(projectDuration, recordingEnd);
  const projectCurrentTime = isRecording ? recordingEnd : playhead;
  const activeTrackName = getVisibleTrackName(activeTrack, locale);

  const canUndo = historyRef.current.canUndo;
  const canRedo = historyRef.current.canRedo;
  const undoLabel = historyRef.current.undoLabel;
  const redoLabel = historyRef.current.redoLabel;

  const canSaveTrack = Boolean(activeTrack?.buffer) && !isRecording;
  const canSaveMix = tracks.some((track) => track.buffer) && !isRecording;
  const canSaveSession = tracks.length > 0 && !isRecording;

  const activeClipStart = activeTrack?.buffer ? Math.max(0, activeTrack.startTime) : 0;
  const activeClipEnd = activeTrack?.buffer ? activeClipStart + activeTrack.buffer.duration : 0;
  const canSplit =
    Boolean(activeTrack?.buffer) &&
    !isRecording &&
    playhead > activeClipStart + 0.01 &&
    playhead < activeClipEnd - 0.01;
  const canPaste = Boolean(clipboard) && !isRecording;

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  useEffect(() => {
    activeTrackRef.current = activeTrack;
  }, [activeTrack]);

  useEffect(() => {
    playheadRef.current = playhead;
  }, [playhead]);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    clipboardRef.current = clipboard;
  }, [clipboard]);

  useEffect(() => {
    showShortcutsRef.current = showShortcuts;
  }, [showShortcuts]);

  // Keep an existing track active.
  useEffect(() => {
    if (tracks.length === 0) {
      if (activeTrackId !== null) {
        setActiveTrackId(null);
      }
      return;
    }

    if (!activeTrackId || !tracks.some((track) => track.id === activeTrackId)) {
      setActiveTrackId(tracks[0]?.id ?? null);
    }
  }, [activeTrackId, tracks]);

  // Feed track changes to the realtime player (live gain / mute / solo).
  useEffect(() => {
    getPlayer().syncTracks(
      tracks.map((track) => ({
        id: track.id,
        buffer: track.buffer,
        startTime: track.startTime,
        gain: track.gain,
        muted: track.muted,
        solo: track.solo,
      })),
    );
  }, [tracks]);

  useEffect(() => {
    const player = getPlayer();
    const unsubscribeTick = player.onTick((nextTime) => {
      setPlayhead(nextTime);
    });
    const unsubscribeEnded = player.onEnded(() => {
      setIsPlaying(false);
      setPlayhead(0);
    });
    const unsubscribePreview = player.onPreviewEnded(() => {
      setIsPlaying(false);
    });

    return () => {
      unsubscribeTick();
      unsubscribeEnded();
      unsubscribePreview();
    };
  }, []);

  useEffect(() => {
    const player = getPlayer();
    player.setLoop(loopEnabled && selection ? selection : null);
  }, [loopEnabled, selection]);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current != null) {
        window.clearInterval(recordingTimerRef.current);
      }

      recordingInputRef.current?.stop();
      void wakeLockRef.current?.release().catch(() => undefined);

      const recordingSession = recordingSessionRef.current;
      if (recordingSession) {
        void recordingSession.cleanup().catch(() => undefined);
      }

      playerRef.current?.dispose();
      playerRef.current = null;
    };
  }, []);

  // Recording preferences are the viewer's own; device sound falls back to
  // the microphone where the browser cannot record it.
  useEffect(() => {
    setRecordingSettings(readSavedRecordingSettings());
    setDeviceSupported(canRecordDeviceAudio());
    setHydrated(true);
    void listMicrophones().then(setMicrophones);
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) {
      return;
    }
    const onDeviceChange = () => void listMicrophones().then(setMicrophones);
    mediaDevices.addEventListener('devicechange', onDeviceChange);
    return () => mediaDevices.removeEventListener('devicechange', onDeviceChange);
  }, []);

  // Stable, so the level meter's animation loop is not restarted on renders.
  const readInputPeaks = useMemo(() => () => inputPeaksRef.current, []);

  const effectiveRecordingSettings: RecordingSettings =
    deviceSupported || recordingSettings.source === 'mic' ? recordingSettings : { ...recordingSettings, source: 'mic' };

  const updateRecordingSettings = (next: RecordingSettings) => {
    setRecordingSettings(next);
    try {
      window.localStorage.setItem(RECORDING_SETTINGS_KEY, JSON.stringify(next));
    } catch {
      // Private mode: the choice lasts for this visit only.
    }
  };

  useEffect(() => {
    if (!isRecording) {
      return;
    }
    const retakeWakeLock = () => {
      if (document.visibilityState === 'visible' && (!wakeLockRef.current || wakeLockRef.current.released)) {
        void acquireWakeLock();
      }
    };
    // Leaving the page would lose the take.
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    document.addEventListener('visibilitychange', retakeWakeLock);
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => {
      document.removeEventListener('visibilitychange', retakeWakeLock);
      window.removeEventListener('beforeunload', warnBeforeLeaving);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- acquireWakeLock only touches refs
  }, [isRecording]);

  const bumpHistory = () => setHistoryVersion((value) => value + 1);

  const syncPlayerTracks = (nextTracks: AudioProjectTrack[]) => {
    getPlayer().syncTracks(
      nextTracks.map((track) => ({
        id: track.id,
        buffer: track.buffer,
        startTime: track.startTime,
        gain: track.gain,
        muted: track.muted,
        solo: track.solo,
      })),
    );
  };

  const commitTracks = (
    label: string,
    nextTracks: AudioProjectTrack[],
    options: {
      activeTrackId?: string | null;
      selection?: ProjectSelection | null;
      playhead?: number;
      status?: string | null;
    } = {},
  ) => {
    historyRef.current.push(label, tracksRef.current);
    bumpHistory();
    setTracks(nextTracks);
    // Sync the player synchronously so playhead clamping below sees the new duration.
    syncPlayerTracks(nextTracks);

    if (options.activeTrackId !== undefined) {
      setActiveTrackId(options.activeTrackId);
    }

    if (options.selection !== undefined) {
      setSelection(options.selection);
    }

    if (options.playhead !== undefined) {
      const nextDuration = getMixdownDuration(nextTracks);
      const nextPlayhead = clamp(options.playhead, 0, Math.max(nextDuration, 0));
      setPlayhead(nextPlayhead);
      getPlayer().seek(nextPlayhead);
    }

    setStatusMessage(options.status !== undefined ? options.status : copy.status.effectApplied(label));
    setLoadError(null);
  };

  const handleUndo = () => {
    const entry = historyRef.current.undo(tracksRef.current);
    if (!entry) {
      return;
    }

    bumpHistory();
    setTracks(entry.tracks);
    syncPlayerTracks(entry.tracks);
    setSelection(null);
    const nextDuration = getMixdownDuration(entry.tracks);
    if (playheadRef.current > nextDuration) {
      setPlayhead(nextDuration);
      getPlayer().seek(nextDuration);
    }
    setStatusMessage(copy.status.undoApplied);
  };

  const handleRedo = () => {
    const entry = historyRef.current.redo(tracksRef.current);
    if (!entry) {
      return;
    }

    bumpHistory();
    setTracks(entry.tracks);
    syncPlayerTracks(entry.tracks);
    setSelection(null);
    const nextDuration = getMixdownDuration(entry.tracks);
    if (playheadRef.current > nextDuration) {
      setPlayhead(nextDuration);
      getPlayer().seek(nextDuration);
    }
    setStatusMessage(copy.status.redoApplied);
  };

  // Files chosen before the editor finished loading sit in the input without
  // a handled change event; import them once mounted.
  useEffect(() => {
    const input = fileInputRef.current;
    if (input?.files && input.files.length > 0) {
      const pending = Array.from(input.files);
      input.value = '';
      window.setTimeout(() => void importFilesRef.current(pending), 0);
    }
  }, []);

  const openPicker = () => {
    if (isRecording || !fileInputRef.current) {
      return;
    }

    fileInputRef.current.value = '';
    fileInputRef.current.click();
  };

  const applySessionState = (sessionState: Awaited<ReturnType<typeof parseAudioSessionFile>>) => {
    getPlayer().stop();
    historyRef.current.clear();
    bumpHistory();
    setTracks(sessionState.tracks);
    setActiveTrackId(sessionState.activeTrackId);
    setZoom(clamp(sessionState.zoom, 1, MAX_ZOOM));
    setSelection(sessionState.selection);
    setEffects(sessionState.effects);
    setActiveTab(sessionState.activeTab);
    setLoopEnabled(sessionState.loopEnabled);
    setIsPlaying(false);
    const nextDuration = getMixdownDuration(sessionState.tracks);
    const nextPlayhead = clamp(sessionState.playhead, 0, Math.max(nextDuration, 0));
    setPlayhead(nextPlayhead);
    setWarningMessage(null);
    setLoadError(null);
    setStatusMessage(locale === 'ko' ? '오디오 세션을 불러왔습니다.' : 'Loaded the audio session.');
  };

  const importFiles = async (nextFiles: File[]) => {
    if (nextFiles.length === 0) {
      return;
    }

    const player = getPlayer();
    player.pause();
    player.stopPreview(false);
    setIsPlaying(false);
    setLoadError(null);
    setWarningMessage(nextFiles.some((file) => file.size > 100 * 1024 * 1024) ? copy.fileDrop.largeFileWarning : null);

    try {
      if (nextFiles.length === 1 && isAudioSessionFile(nextFiles[0])) {
        const sessionState = await parseAudioSessionFile(nextFiles[0]);
        applySessionState(sessionState);
        return;
      }

      const decodedTracks: AudioProjectTrack[] = [];

      for (const file of nextFiles) {
        setStatusMessage(copy.status.loading(file.name));
        const decoded = await decodeAudioBlobToBuffer(file);
        decodedTracks.push(createProjectTrack(file.name, decoded, 'file'));
      }

      const targetTrack = activeTrackRef.current;
      let nextTracks: AudioProjectTrack[];
      let nextActiveId: string | null;

      if (targetTrack && !targetTrack.buffer && decodedTracks.length > 0) {
        const [filledTrack, ...remainingTracks] = decodedTracks;
        nextTracks = tracksRef.current.map((track) =>
          track.id === targetTrack.id
            ? { ...track, name: filledTrack.name, buffer: filledTrack.buffer, source: 'file' as const }
            : track,
        );
        if (remainingTracks.length > 0) {
          nextTracks = [...nextTracks, ...remainingTracks];
        }
        nextActiveId = targetTrack.id;
      } else {
        nextTracks = [...tracksRef.current, ...decodedTracks];
        nextActiveId = decodedTracks.at(-1)?.id ?? activeTrackId;
      }

      commitTracks(copy.commands.importAudio, nextTracks, {
        activeTrackId: nextActiveId,
        selection: null,
        status: null,
      });
    } catch (error) {
      setStatusMessage(null);
      setLoadError(error instanceof Error ? error.message : copy.status.decodeFailed);
    }
  };
  importFilesRef.current = importFiles;

  const handleAddEmptyTrack = () => {
    const nextTrack = createProjectTrack(
      locale === 'ko' ? `빈 트랙 ${tracks.length + 1}` : `Empty track ${tracks.length + 1}`,
      null,
      'empty',
    );
    commitTracks(copy.commands.addTrack, [...tracksRef.current, nextTrack], {
      activeTrackId: nextTrack.id,
      status: locale === 'ko' ? '빈 트랙을 추가했습니다.' : 'Added an empty track.',
    });
  };

  const updateTrackLive = (trackId: string, updater: (track: AudioProjectTrack) => AudioProjectTrack) => {
    setTracks((currentTracks) => currentTracks.map((track) => (track.id === trackId ? updater(track) : track)));
  };

  const handleRemoveTrack = (trackId: string) => {
    const nextTracks = tracksRef.current.filter((track) => track.id !== trackId);
    commitTracks(copy.commands.deleteTrack, nextTracks, {
      activeTrackId: activeTrackId === trackId ? nextTracks[0]?.id ?? null : undefined,
      selection: null,
      status: null,
    });

    if (nextTracks.length === 0) {
      getPlayer().stop();
      setIsPlaying(false);
      setPlayhead(0);
      setWarningMessage(null);
    }
  };

  const handleMoveTrackStart = (trackId: string) => {
    void trackId;
    historyRef.current.push(copy.commands.moveClip, tracksRef.current);
    bumpHistory();
  };

  const handleRenameTrack = (trackId: string, nextName: string) => {
    const name = nextName.trim();
    if (!name) {
      return;
    }

    updateTrackLive(trackId, (track) => (track.name === name ? track : { ...track, name }));
  };

  const handleReorderTrack = (trackId: string, direction: 'up' | 'down') => {
    const current = [...tracksRef.current];
    const fromIndex = current.findIndex((track) => track.id === trackId);
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;

    if (fromIndex < 0 || toIndex < 0 || toIndex >= current.length) {
      return;
    }

    [current[fromIndex], current[toIndex]] = [current[toIndex], current[fromIndex]];
    commitTracks(copy.commands.reorderTrack, current, { status: null });
  };

  const handleDroppedFiles = (droppedFiles: File[]) => {
    const audioFiles = droppedFiles.filter(isDroppableAudioFile);
    if (audioFiles.length === 0) {
      setLoadError(copy.fileDrop.dropNotAudio);
      return;
    }

    void importFiles(audioFiles);
  };

  const handleMoveTrack = (trackId: string, nextStartTime: number) => {
    updateTrackLive(trackId, (track) => ({ ...track, startTime: Math.max(0, nextStartTime) }));
  };

  const seekTo = (time: number, trackId?: string) => {
    if (isRecording) {
      return;
    }

    if (trackId && trackId !== activeTrackId) {
      setActiveTrackId(trackId);
    }

    const player = getPlayer();
    if (player.previewing) {
      player.stopPreview(false);
      setIsPlaying(false);
    }
    player.seek(clamp(time, 0, Math.max(projectDuration, 0)));
  };

  const seekBy = (delta: number) => {
    seekTo(playheadRef.current + delta);
  };

  const handlePlayPause = () => {
    if (isRecording) {
      return;
    }

    const player = getPlayer();

    if (isPlaying) {
      if (player.previewing) {
        player.stopPreview(false);
      } else {
        player.pause();
      }
      setIsPlaying(false);
      return;
    }

    if (projectDuration <= 0) {
      return;
    }

    try {
      player.play(playheadRef.current);
      setIsPlaying(true);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : copy.status.playbackFailed);
    }
  };

  const getEditRange = () => {
    const track = activeTrackRef.current;
    if (!track?.buffer) {
      return null;
    }

    const clipStart = Math.max(0, track.startTime);
    const clipEnd = clipStart + track.buffer.duration;
    const currentSelection = selectionRef.current;
    const projectStart = currentSelection ? clamp(currentSelection.start, clipStart, clipEnd) : clipStart;
    const projectEnd = currentSelection ? clamp(currentSelection.end, clipStart, clipEnd) : clipEnd;

    if (projectEnd - projectStart < MIN_SELECTION_SEC) {
      return null;
    }

    return {
      track,
      buffer: track.buffer,
      clipStart,
      clipEnd,
      projectStart,
      projectEnd,
      localStart: projectStart - clipStart,
      localEnd: projectEnd - clipStart,
    };
  };

  const runBufferEdit = async (
    label: string,
    transform: (buffer: AudioBuffer, localStart: number, localEnd: number) => AudioBuffer | Promise<AudioBuffer>,
    options: { requireSelection?: boolean; after?: (range: NonNullable<ReturnType<typeof getEditRange>>) => void } = {},
  ) => {
    if (busyRef.current || isRecording) {
      return;
    }

    if (options.requireSelection && !selectionRef.current) {
      setLoadError(copy.status.selectionRequired);
      return;
    }

    const range = getEditRange();
    if (!range) {
      setLoadError(selectionRef.current ? copy.status.selectionRequired : copy.status.trackRequired);
      return;
    }

    busyRef.current = true;
    try {
      const nextBuffer = await transform(range.buffer, range.localStart, range.localEnd);
      commitTracks(
        label,
        tracksRef.current.map((track) => (track.id === range.track.id ? { ...track, buffer: nextBuffer } : track)),
      );
      options.after?.(range);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : copy.status.exportFailed);
    } finally {
      busyRef.current = false;
    }
  };

  const handleSelectionChange = (trackId: string, nextSelection: ProjectSelection) => {
    if (trackId !== activeTrackId) {
      setActiveTrackId(trackId);
    }

    if (nextSelection.end - nextSelection.start < MIN_SELECTION_SEC) {
      return;
    }

    setSelection({
      start: Math.min(nextSelection.start, nextSelection.end),
      end: Math.max(nextSelection.start, nextSelection.end),
    });
  };

  const adjustSelectionBound = (bound: 'start' | 'end', value: number) => {
    const track = activeTrackRef.current;
    if (!track?.buffer) {
      return;
    }

    const clipStart = Math.max(0, track.startTime);
    const clipEnd = clipStart + track.buffer.duration;
    const current = selectionRef.current ?? { start: clipStart, end: clipEnd };
    const clamped = clamp(value, clipStart, clipEnd);
    const next =
      bound === 'start'
        ? { start: Math.min(clamped, current.end - MIN_SELECTION_SEC), end: current.end }
        : { start: current.start, end: Math.max(clamped, current.start + MIN_SELECTION_SEC) };

    setSelection({
      start: clamp(Math.min(next.start, next.end), clipStart, clipEnd),
      end: clamp(Math.max(next.start, next.end), clipStart, clipEnd),
    });
  };

  const handleSelectAll = () => {
    const track = activeTrackRef.current;
    if (!track?.buffer) {
      return;
    }

    const clipStart = Math.max(0, track.startTime);
    setSelection({ start: clipStart, end: clipStart + track.buffer.duration });
    setStatusMessage(copy.status.selectedAll);
  };

  const handleClearSelection = () => {
    setSelection(null);
    setStatusMessage(copy.status.selectionCleared);
  };

  const playSelection = () => {
    const range = getEditRange();
    if (!range || !selectionRef.current || isRecording) {
      return;
    }

    const segment = extractAudioRange(range.buffer, range.localStart, range.localEnd);
    getPlayer().previewBuffer(segment);
    setIsPlaying(true);
  };

  const handleCopySelection = () => {
    const range = getEditRange();
    if (!range || !selectionRef.current) {
      setLoadError(copy.status.selectionRequired);
      return;
    }

    setClipboard(extractAudioRange(range.buffer, range.localStart, range.localEnd));
    setStatusMessage(copy.status.copied);
    setLoadError(null);
  };

  const handleCutSelection = () => {
    const range = getEditRange();
    if (!range || !selectionRef.current) {
      setLoadError(copy.status.selectionRequired);
      return;
    }

    setClipboard(extractAudioRange(range.buffer, range.localStart, range.localEnd));
    void runBufferEdit(
      copy.commands.cutSelection,
      (buffer, localStart, localEnd) => removeAudioRange(buffer, localStart, localEnd),
      {
        requireSelection: true,
        after: (editRange) => {
          setSelection(null);
          seekTo(editRange.projectStart);
          setStatusMessage(copy.status.cutDone);
        },
      },
    );
  };

  const handleRemoveSelection = () => {
    void runBufferEdit(
      copy.commands.removeSelection,
      (buffer, localStart, localEnd) => removeAudioRange(buffer, localStart, localEnd),
      {
        requireSelection: true,
        after: (editRange) => {
          setSelection(null);
          seekTo(editRange.projectStart);
        },
      },
    );
  };

  const handleTrimSelection = () => {
    const range = getEditRange();
    if (!range || !selectionRef.current) {
      setLoadError(copy.status.selectionRequired);
      return;
    }

    const trimmed = extractAudioRange(range.buffer, range.localStart, range.localEnd);
    commitTracks(
      copy.commands.keepSelection,
      tracksRef.current.map((track) =>
        track.id === range.track.id ? { ...track, buffer: trimmed, startTime: range.projectStart } : track,
      ),
      { selection: null, playhead: range.projectStart },
    );
  };

  const handlePaste = () => {
    const clip = clipboardRef.current;
    if (!clip || isRecording) {
      setLoadError(copy.status.clipboardEmpty);
      return;
    }

    const pasteAt = playheadRef.current;
    const target = activeTrackRef.current;

    if (!target) {
      const nextTrack = createProjectTrack(locale === 'ko' ? '붙여넣은 클립' : 'Pasted clip', clip, 'file', pasteAt);
      commitTracks(copy.commands.paste, [...tracksRef.current, nextTrack], {
        activeTrackId: nextTrack.id,
        status: copy.status.pasted,
      });
      return;
    }

    if (!target.buffer) {
      commitTracks(
        copy.commands.paste,
        tracksRef.current.map((track) =>
          track.id === target.id ? { ...track, buffer: clip, startTime: pasteAt, source: 'file' as const } : track,
        ),
        { status: copy.status.pasted },
      );
      return;
    }

    const clipStart = Math.max(0, target.startTime);
    const localAt = clamp(pasteAt - clipStart, 0, target.buffer.duration);
    const nextBuffer = insertAudioAtTime(target.buffer, clip, localAt);
    commitTracks(
      copy.commands.paste,
      tracksRef.current.map((track) => (track.id === target.id ? { ...track, buffer: nextBuffer } : track)),
      { status: copy.status.pasted, playhead: clipStart + localAt + clip.duration },
    );
  };

  const handleSplit = () => {
    const track = activeTrackRef.current;
    if (!track?.buffer || isRecording) {
      setLoadError(copy.status.trackRequired);
      return;
    }

    const clipStart = Math.max(0, track.startTime);
    const clipEnd = clipStart + track.buffer.duration;
    const splitAt = playheadRef.current;

    if (splitAt <= clipStart + 0.01 || splitAt >= clipEnd - 0.01) {
      setLoadError(copy.status.splitOutside);
      return;
    }

    const localSplit = splitAt - clipStart;
    const firstBuffer = extractAudioRange(track.buffer, 0, localSplit);
    const secondBuffer = extractAudioRange(track.buffer, localSplit, track.buffer.duration);
    const secondTrack: AudioProjectTrack = {
      ...track,
      id: createTrackId('track'),
      name: `${track.name} (2)`,
      buffer: secondBuffer,
      startTime: splitAt,
    };

    const nextTracks: AudioProjectTrack[] = [];
    for (const item of tracksRef.current) {
      if (item.id === track.id) {
        nextTracks.push({ ...item, buffer: firstBuffer });
        nextTracks.push(secondTrack);
      } else {
        nextTracks.push(item);
      }
    }

    commitTracks(copy.commands.split, nextTracks, { selection: null, status: copy.status.splitDone });
  };

  const previewEffect = async (tab: AudioEffectTab) => {
    if (isRecording || busyRef.current) {
      return;
    }

    const range = getEditRange();
    if (!range) {
      setLoadError(copy.status.loadFirst);
      return;
    }

    const segment = extractAudioRange(range.buffer, range.localStart, range.localEnd);

    try {
      let processed = segment;
      let status: string = copy.status.previewFade;

      if (tab === 'fade') {
        processed = applyFadeToAudioRange(segment, 0, segment.duration, effects.fadeIn, effects.fadeOut);
        status = copy.status.previewFade;
      } else if (tab === 'speed') {
        processed = applySpeedToAudioRange(segment, 0, segment.duration, effects.speed);
        status = copy.status.previewSpeed;
      } else if (tab === 'pitch') {
        processed = applyPitchToAudioRange(segment, 0, segment.duration, effects.pitch);
        status = copy.status.previewPitch;
      } else if (tab === 'amplify') {
        processed = applyGainToAudioRange(segment, 0, segment.duration, effects.gain);
        status = copy.status.previewAmplify;
      } else if (tab === 'reverb') {
        processed = applyReverbToAudioRange(segment, 0, segment.duration, effects.reverbDecay, effects.reverbMix);
        status = copy.status.previewReverb;
      } else {
        processed = await applyEqToAudioRange(segment, 0, segment.duration, {
          lowGainDb: effects.low,
          midGainDb: effects.mid,
          highGainDb: effects.high,
        });
        status = copy.status.previewEq;
      }

      getPlayer().previewBuffer(processed);
      setIsPlaying(true);
      setStatusMessage(status);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : copy.status.playbackFailed);
    }
  };

  const applyEffect = (tab: AudioEffectTab) => {
    if (tab === 'fade') {
      void runBufferEdit(copy.commands.fadeEnvelope, (buffer, localStart, localEnd) =>
        applyFadeToAudioRange(buffer, localStart, localEnd, effects.fadeIn, effects.fadeOut),
      );
      return;
    }

    if (tab === 'speed') {
      void runBufferEdit(copy.commands.speedChange, (buffer, localStart, localEnd) =>
        applySpeedToAudioRange(buffer, localStart, localEnd, effects.speed),
      );
      return;
    }

    if (tab === 'pitch') {
      void runBufferEdit(copy.commands.pitchShift, (buffer, localStart, localEnd) =>
        applyPitchToAudioRange(buffer, localStart, localEnd, effects.pitch),
      );
      return;
    }

    if (tab === 'amplify') {
      void runBufferEdit(copy.commands.amplify, (buffer, localStart, localEnd) =>
        applyGainToAudioRange(buffer, localStart, localEnd, effects.gain),
      );
      return;
    }

    if (tab === 'reverb') {
      void runBufferEdit(copy.commands.reverb, (buffer, localStart, localEnd) =>
        applyReverbToAudioRange(buffer, localStart, localEnd, effects.reverbDecay, effects.reverbMix),
      );
      return;
    }

    void runBufferEdit(copy.commands.eq, (buffer, localStart, localEnd) =>
      applyEqToAudioRange(buffer, localStart, localEnd, {
        lowGainDb: effects.low,
        midGainDb: effects.mid,
        highGainDb: effects.high,
      }),
    );
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
      if (tracksRef.current.length === 0) {
        setLoadError(copy.status.loadFirst);
        return;
      }

      try {
        setStatusMessage(locale === 'ko' ? '세션 파일을 저장하는 중입니다...' : 'Saving the session file...');
        const saved = await saveAudioSession({
          filename: filename.trim() || activeTrackName || 'audio-session',
          state: {
            activeTrackId,
            playhead: playheadRef.current,
            zoom,
            selection: selectionRef.current,
            effects,
            activeTab,
            loopEnabled,
            tracks: tracksRef.current,
          },
        });

        setStatusMessage(saved ? (locale === 'ko' ? '세션 파일을 저장했습니다.' : 'Saved the session file.') : null);
        return;
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : copy.status.exportFailed);
        return;
      }
    }

    try {
      setStatusMessage(copy.status.exportPreparing(format));
      const exportBuffer =
        target === 'mix' ? await mixAudioTracks(tracksRef.current) : activeTrackRef.current?.buffer ?? null;

      if (!exportBuffer) {
        setLoadError(copy.status.loadFirst);
        return;
      }

      const saved = await exportAudio({
        buffer: exportBuffer,
        format,
        filename: filename.trim() || (target === 'mix' ? 'audio-mix' : activeTrackName || 'audio-export'),
        quality: 0.82,
      });

      setStatusMessage(saved ? copy.status.exportReady(format) : null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : copy.status.exportFailed);
    }
  };

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

    return recordingAccumulatedRef.current + activeSpan;
  };

  const startRecordingTimer = () => {
    clearRecordingTimer();
    // The time readout shows the progress; the status line stays quiet so
    // screen readers are not flooded ten times a second.
    recordingTimerRef.current = window.setInterval(() => {
      setRecordingDuration(getRecordingElapsed());
    }, 100);
  };

  const stopRecordingStream = () => {
    recordingInputRef.current?.stop();
    recordingInputRef.current = null;
  };

  // The screen stays on while recording (a phone set down would otherwise
  // lock and stop the microphone). Browsers drop the lock when the page is
  // hidden, so it is taken again on return.
  const acquireWakeLock = async () => {
    const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } })
      .wakeLock;
    try {
      wakeLockRef.current = (await wakeLock?.request('screen')) ?? null;
    } catch {
      wakeLockRef.current = null;
    }
  };

  const releaseWakeLock = () => {
    void wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = null;
  };

  const refreshMicrophones = async () => {
    setMicrophones(await listMicrophones());
  };

  const handleStartRecording = async () => {
    if (isRecording) {
      return;
    }

    const player = getPlayer();
    player.pause();
    player.stopPreview(false);
    setIsPlaying(false);
    setLoadError(null);
    setWarningMessage(null);
    setStatusMessage(copy.recording.starting);
    setRecordingDuration(0);
    setIsRecordingPaused(false);
    recordingPausedRef.current = false;
    recordingAccumulatedRef.current = 0;
    recordingInsertTimeRef.current = Math.max(0, playheadRef.current);
    inputPeaksRef.current = [];
    livePeaksRef.current = [];

    let input: RecordingInput | null = null;
    try {
      // Opened first, while the click still counts as a user gesture.
      input = await openRecordingInput(effectiveRecordingSettings);
      const recordingSession = await createWavRecordingSession(input.streams, {
        outputName: `audio-recording-${Date.now()}.wav`,
        onLevel: (peaks) => {
          inputPeaksRef.current = peaks;
          if (!recordingPausedRef.current) {
            livePeaksRef.current.push(peaks.length > 0 ? Math.max(...peaks) : 0);
          }
        },
      });

      recordingInputRef.current = input;
      recordingSessionRef.current = recordingSession;
      input.audioTracks.forEach((track) =>
        track.addEventListener(
          'ended',
          () => {
            if (recordingSessionRef.current === recordingSession) {
              setWarningMessage(copy.recorder.ended);
              void stopRecordingRef.current();
            }
          },
          { once: true },
        ),
      );
      setRecordingInfo(recordingSession.info);
      recordingStartRef.current = Date.now();
      setIsRecording(true);
      setStatusMessage(null);
      startRecordingTimer();
      void acquireWakeLock();
      // Microphone names appear once access is granted.
      void refreshMicrophones();
    } catch (error) {
      input?.stop();
      setStatusMessage(null);
      setLoadError(
        error instanceof RecordingError
          ? copy.recorder.errors[error.code]
          : error instanceof Error
            ? error.message
            : copy.recording.startError,
      );
    }
  };

  const handlePauseRecording = async () => {
    const recordingSession = recordingSessionRef.current;
    if (!recordingSession || !isRecording || recordingPausedRef.current) {
      return;
    }

    try {
      await recordingSession.pause();
      recordingAccumulatedRef.current = getRecordingElapsed();
      recordingStartRef.current = null;
      recordingPausedRef.current = true;
      setIsRecordingPaused(true);
      setRecordingDuration(recordingAccumulatedRef.current);
      setStatusMessage(copy.recording.pausedStatus(recordingAccumulatedRef.current));
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
      setStatusMessage(null);
      startRecordingTimer();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : copy.recording.startError);
    }
  };

  const handleStopRecording = async () => {
    const recordingSession = recordingSessionRef.current;
    setIsRecording(false);
    setIsRecordingPaused(false);
    clearRecordingTimer();

    if (!recordingSession) {
      recordingPausedRef.current = false;
      recordingAccumulatedRef.current = 0;
      recordingStartRef.current = null;
      setStatusMessage(copy.recording.abandoned);
      stopRecordingStream();
      return;
    }

    setStatusMessage(copy.recording.finishing);

    try {
      const recording = await recordingSession.stop();
      stopRecordingStream();
      const nextBuffer = await decodeAudioBlobToBuffer(recording.file);
      const insertTime = recordingInsertTimeRef.current;
      const nextTrack = createProjectTrack(recording.file.name, nextBuffer, 'recording', insertTime);

      setRecordingDuration(recording.duration);
      commitTracks(copy.commands.recordTake, [...tracksRef.current, nextTrack], {
        activeTrackId: nextTrack.id,
        playhead: insertTime + recording.duration,
        status: `${copy.recording.ready(recording.file.name)} · ${copy.recorder.quality(recording.info.sampleRate, recording.info.channels)}`,
      });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : copy.recording.startError);
    } finally {
      recordingSessionRef.current = null;
      recordingStartRef.current = null;
      recordingPausedRef.current = false;
      recordingAccumulatedRef.current = 0;
      recordingInsertTimeRef.current = 0;
      inputPeaksRef.current = [];
      livePeaksRef.current = [];
      setRecordingInfo(null);
      stopRecordingStream();
      releaseWakeLock();
    }
  };
  stopRecordingRef.current = handleStopRecording;

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
    getPlayer().stop();
    clearRecordingTimer();
    stopRecordingStream();
    releaseWakeLock();
    setRecordingInfo(null);

    const recordingSession = recordingSessionRef.current;
    if (recordingSession) {
      void recordingSession.cleanup().catch(() => undefined);
    }

    recordingSessionRef.current = null;
    recordingStartRef.current = null;
    recordingPausedRef.current = false;
    recordingAccumulatedRef.current = 0;
    recordingInsertTimeRef.current = 0;

    historyRef.current.clear();
    bumpHistory();
    setTracks([]);
    setActiveTrackId(null);
    setPlayhead(0);
    setIsPlaying(false);
    setStatusMessage(null);
    setWarningMessage(null);
    setLoadError(null);
    setZoom(1);
    setSelection(null);
    setClipboard(null);
    setEffects(DEFAULT_EFFECTS);
    setActiveTab('fade');
    setLoopEnabled(false);
    setIsRecording(false);
    setIsRecordingPaused(false);
    setRecordingDuration(0);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const keyHandlerRef = useRef<(event: KeyboardEvent) => void>(() => undefined);

  keyHandlerRef.current = (event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) {
      return;
    }

    const primaryModifier = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();

    if (primaryModifier && key === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        handleRedo();
      } else {
        handleUndo();
      }
      return;
    }

    if (primaryModifier && key === 'y') {
      event.preventDefault();
      handleRedo();
      return;
    }

    if (primaryModifier && key === 'a') {
      event.preventDefault();
      handleSelectAll();
      return;
    }

    if (primaryModifier && key === 'c') {
      if (selectionRef.current) {
        event.preventDefault();
        handleCopySelection();
      }
      return;
    }

    if (primaryModifier && key === 'x') {
      if (selectionRef.current) {
        event.preventDefault();
        handleCutSelection();
      }
      return;
    }

    if (primaryModifier && key === 'v') {
      if (clipboardRef.current) {
        event.preventDefault();
        handlePaste();
      }
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (selectionRef.current) {
        event.preventDefault();
        handleRemoveSelection();
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      if (showShortcutsRef.current) {
        setShowShortcuts(false);
        return;
      }
      handleClearSelection();
      return;
    }

    if (event.key === '?') {
      event.preventDefault();
      setShowShortcuts((value) => !value);
      return;
    }

    if (event.code === 'Space') {
      event.preventDefault();
      handlePlayPause();
      return;
    }

    if (!primaryModifier && key === 's') {
      event.preventDefault();
      handleSplit();
      return;
    }

    if (!primaryModifier && key === 'l') {
      event.preventDefault();
      setLoopEnabled((value) => !value);
      return;
    }

    if (!primaryModifier && key === 'r') {
      event.preventDefault();
      handleRecordToggle();
      return;
    }

    if (!primaryModifier && key === 'm') {
      event.preventDefault();
      const track = activeTrackRef.current;
      if (track) {
        updateTrackLive(track.id, (current) => ({ ...current, muted: !current.muted }));
      }
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      seekTo(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      seekTo(projectDuration);
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

  useEffect(() => {
    const listener = (event: KeyboardEvent) => keyHandlerRef.current(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  const emptyStatePromptText =
    INTENT_PROMPTS[intent ?? '']?.[locale] ??
    (locale === 'ko'
      ? '마이크나 기기 소리를 녹음하거나, 오디오 파일을 열어 편집하세요.'
      : 'Record your microphone or the device’s sound, or open audio files to edit.');
  const isEmpty = tracks.length === 0 && !isRecording;
  const projectTitle = activeTrackName ?? copy.studio.untitled;
  const projectSubtitle = tracks.length > 0 ? `${copy.studio.tracks(tracks.length)} · ${formatTime(projectDuration)}` : null;
  const effectsTarget = selection
    ? copy.studio.effectsTargetSelection(formatTime(selection.start), formatTime(selection.end))
    : copy.studio.effectsTargetTrack(activeTrackName ?? copy.studio.untitled);
  const transportStatus =
    isRecording && recordingInfo
      ? `${statusMessage ?? ''}${statusMessage ? ' · ' : ''}${copy.recorder.quality(recordingInfo.sampleRate, recordingInfo.channels)}`
      : statusMessage;
  const recordingSettingsPanel = (
    <RecordingSettingsPanel
      settings={effectiveRecordingSettings}
      onChange={updateRecordingSettings}
      microphones={microphones}
      deviceSupported={deviceSupported}
    />
  );
  const banners = [
    loadError ? { tone: 'is-error', text: loadError, dismiss: () => setLoadError(null) } : null,
    warningMessage ? { tone: 'is-warning', text: warningMessage, dismiss: () => setWarningMessage(null) } : null,
  ].filter((banner): banner is { tone: string; text: string; dismiss: () => void } => banner !== null);

  return (
    <div
      data-mode={mode}
      data-testid="audio-editor-shell"
      data-ready={hydrated ? 'true' : undefined}
      className="audio-studio audio-studio-shell relative flex min-h-[calc(100dvh-3.5rem)] flex-col"
      onDragEnter={(event) => {
        if (isRecording || !Array.from(event.dataTransfer.types).includes('Files')) {
          return;
        }
        event.preventDefault();
        dragDepthRef.current += 1;
        setIsDragOver(true);
      }}
      onDragOver={(event) => {
        if (isRecording || !Array.from(event.dataTransfer.types).includes('Files')) {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(event) => {
        if (!isDragOver) {
          return;
        }
        event.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) {
          setIsDragOver(false);
        }
      }}
      onDrop={(event) => {
        if (isRecording) {
          return;
        }
        event.preventDefault();
        dragDepthRef.current = 0;
        setIsDragOver(false);
        handleDroppedFiles(Array.from(event.dataTransfer.files ?? []));
      }}
    >
      {isDragOver ? (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-black/40 p-6 backdrop-blur-[2px]">
          <div className="rounded-2xl border-2 border-dashed border-[var(--accent)] bg-[var(--bg-surface)] px-8 py-6 text-center shadow-xl">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{copy.fileDrop.dropOverlayTitle}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{copy.fileDrop.dropOverlayHint}</p>
          </div>
        </div>
      ) : null}

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
        title={projectTitle}
        subtitle={projectSubtitle}
        fileName={activeTrackName}
        empty={isEmpty}
        canSaveTrack={canSaveTrack}
        canSaveMix={canSaveMix}
        canSaveSession={canSaveSession}
        canUndo={canUndo}
        canRedo={canRedo}
        undoLabel={undoLabel}
        redoLabel={redoLabel}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenFiles={openPicker}
        onSaveAs={({ format, filename, target }) => void handleSaveAs({ format, filename, target })}
        onReset={handleResetProject}
        onShowShortcuts={() => setShowShortcuts(true)}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
        {banners.map((banner) => (
          <div
            key={banner.tone}
            role={banner.tone === 'is-error' ? 'alert' : 'status'}
            className={`audio-status-line ${banner.tone} flex items-start gap-3 px-3.5 py-2.5 text-sm`}
          >
            <p className="min-w-0 flex-1 leading-relaxed">{banner.text}</p>
            <button
              type="button"
              onClick={banner.dismiss}
              className="audio-focus-ring -my-0.5 shrink-0 rounded-md px-1.5 text-xs font-medium opacity-80 hover:opacity-100"
              aria-label={copy.studio.dismiss}
            >
              ✕
            </button>
          </div>
        ))}

        {isEmpty ? (
          <EmptyStart
            prompt={emptyStatePromptText}
            recordingSettings={recordingSettingsPanel}
            onRecord={() => void handleStartRecording()}
            onOpen={openPicker}
          />
        ) : (
          <>
            <TrackTimelineStack
              tracks={tracks.map((track) => ({
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
              projectDuration={projectDuration}
              currentTime={projectCurrentTime}
              isPlaying={isPlaying}
              zoom={zoom}
              selection={selection}
              recording={
                isRecording
                  ? {
                      active: true,
                      paused: isRecordingPaused,
                      insertTime: recordingInsertTimeRef.current,
                      elapsed: recordingDuration,
                      peaks: livePeaksRef.current,
                      peakInterval: recordingInfo?.levelInterval,
                    }
                  : null
              }
              canPaste={canPaste}
              canSplit={canSplit}
              onZoomChange={(nextZoom) => setZoom(clamp(nextZoom, 1, MAX_ZOOM))}
              onSelectTrack={setActiveTrackId}
              onSeek={seekTo}
              onSelectionChange={handleSelectionChange}
              onMoveTrackStart={handleMoveTrackStart}
              onMoveTrack={handleMoveTrack}
              onRenameTrack={handleRenameTrack}
              onReorderTrack={handleReorderTrack}
              onAddTrack={handleAddEmptyTrack}
              onPaste={handlePaste}
              onSplit={handleSplit}
              onMuteToggle={(trackId) => updateTrackLive(trackId, (track) => ({ ...track, muted: !track.muted }))}
              onSoloToggle={(trackId) => updateTrackLive(trackId, (track) => ({ ...track, solo: !track.solo }))}
              onGainChange={(trackId, nextGain) =>
                updateTrackLive(trackId, (track) => ({ ...track, gain: clamp(nextGain, 0, 2) }))
              }
              onRemoveTrack={handleRemoveTrack}
            />

            {tracks.length > 0 ? (
              <EffectsPanel
                activeTab={activeTab}
                effects={effects}
                targetLabel={effectsTarget}
                onTabChange={setActiveTab}
                onChange={(nextEffects) => setEffects((currentEffects) => ({ ...currentEffects, ...nextEffects }))}
                onPreview={(tab) => void previewEffect(tab)}
                onApply={applyEffect}
              />
            ) : null}
          </>
        )}
      </div>

      {isEmpty ? null : (
        <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 px-3 pb-3 md:bottom-0 md:px-4 md:pb-4">
          <div className="audio-transport">
            {selection ? (
              <SelectionBar
                start={selection.start}
                end={selection.end}
                onStartChange={(nextStart) => adjustSelectionBound('start', nextStart)}
                onEndChange={(nextEnd) => adjustSelectionBound('end', nextEnd)}
                onPlaySelection={playSelection}
                onTrimSelection={handleTrimSelection}
                onRemoveSelection={handleRemoveSelection}
                onCutSelection={handleCutSelection}
                onCopySelection={handleCopySelection}
                onClearSelection={handleClearSelection}
              />
            ) : null}
            <TransportBar
              currentTime={projectCurrentTime}
              duration={displayDuration}
              isPlaying={isPlaying}
              isRecording={isRecording}
              isRecordingPaused={isRecordingPaused}
              loopEnabled={loopEnabled}
              statusText={transportStatus}
              readInputPeaks={readInputPeaks}
              recordingSettings={recordingSettingsPanel}
              onPlayPause={handlePlayPause}
              onSeekBy={seekBy}
              onSeekToStart={() => seekTo(0)}
              onSeekToEnd={() => seekTo(projectDuration)}
              onToggleLoop={() => setLoopEnabled((currentValue) => !currentValue)}
              onRecordToggle={handleRecordToggle}
              onRecordPauseResume={handleRecordPauseResume}
            />
          </div>
        </div>
      )}

      {showShortcuts ? <ShortcutsModal locale={locale} onClose={() => setShowShortcuts(false)} /> : null}
    </div>
  );
}
