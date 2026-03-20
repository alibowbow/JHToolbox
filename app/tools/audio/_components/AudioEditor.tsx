'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from '@/components/providers/locale-provider';
import { LiveAudioWaveform } from '@/components/ui/LiveAudioWaveform';
import { EditHistory, audioEngine, exportAudio } from '@/lib/audio';
import { createWavRecordingSession, type WavRecordingSession } from '@/lib/processors/audio-recording';
import {
  applyFadeToAudioRange,
  applyGainToAudioRange,
  applyPitchToAudioRange,
  applySpeedToAudioRange,
  extractAudioRange,
  isSilentAudioBuffer,
  removeAudioRange,
} from './audio-buffer-transforms';
import { getAudioEditorCopy } from './audio-editor-copy';
import {
  AudioEditorMode,
  AudioEffectTab,
  AudioEffectsState,
  AudioSelection,
  DEFAULT_EFFECTS,
  DEFAULT_SELECTION,
  clamp,
  formatFileSize,
  formatTime,
  normalizeSelection,
} from './audio-editor-utils';
import { EffectsPanel } from './Effects/EffectsPanel';
import { FileDropZone } from './FileDropZone';
import { SelectionBar } from './Selection/SelectionBar';
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

export function AudioEditor({ mode }: AudioEditorProps) {
  const { locale } = useLocale();
  const copy = useMemo(() => getAudioEditorCopy(locale), [locale]);
  const [files, setFiles] = useState<File[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1.25);
  const [selection, setSelection] = useState<AudioSelection>(DEFAULT_SELECTION);
  const [effects, setEffects] = useState<AudioEffectsState>(DEFAULT_EFFECTS);
  const [activeTab, setActiveTab] = useState<AudioEffectTab>('fade');
  const [effectsOpen, setEffectsOpen] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [isSilent, setIsSilent] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingPeaks, setRecordingPeaks] = useState<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef(new EditHistory());
  const bufferRef = useRef<AudioBuffer | null>(null);
  const recordingSessionRef = useRef<WavRecordingSession | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingStartRef = useRef<number | null>(null);

  const activeFile = files[activeIndex] ?? files[0] ?? null;
  const canUndo = historyRef.current.canUndo;
  const canRedo = historyRef.current.canRedo;
  const undoLabel = historyRef.current.undoLabel;
  const redoLabel = historyRef.current.redoLabel;
  const duration = buffer?.duration ?? 0;

  useEffect(() => {
    bufferRef.current = buffer;
  }, [buffer]);

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
    if (typeof window === 'undefined') {
      return;
    }

    const desktopQuery = window.matchMedia('(min-width: 1024px)');
    setEffectsOpen(desktopQuery.matches);
  }, []);

  useEffect(() => {
    const unsubscribeTime = audioEngine.onTimeUpdate((nextTime) => {
      setCurrentTime(nextTime);
    });
    const unsubscribeEnded = audioEngine.onEnded(() => {
      setIsPlaying(false);

      const activeBuffer = bufferRef.current;
      if (activeBuffer && audioEngine.buffer !== activeBuffer) {
        audioEngine.setBuffer(activeBuffer, 0);
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
      return;
    }

    audioEngine.setBuffer(buffer, 0);
  }, [buffer]);

  useEffect(() => {
    if (!buffer || !loopEnabled) {
      audioEngine.setLoop(0, 0);
      return;
    }

    audioEngine.setLoop(selection.start, selection.end);
  }, [buffer, loopEnabled, selection.end, selection.start]);

  useEffect(() => {
    if (!activeFile) {
      setBuffer(null);
      setSelection(DEFAULT_SELECTION);
      setStatusMessage(null);
      setWarningMessage(null);
      setLoadError(null);
      setIsSilent(false);
      historyRef.current.clear();
      setHistoryVersion((value) => value + 1);
      audioEngine.stop();
      return;
    }

    let cancelled = false;

    const loadSelectedFile = async () => {
      setIsLoading(true);
      setLoadError(null);
      setWarningMessage(null);
      setStatusMessage(copy.status.loading(activeFile.name));
      setIsPlaying(false);
      historyRef.current.clear();
      setHistoryVersion((value) => value + 1);

      try {
        const nextBuffer = await audioEngine.loadFile(activeFile);
        if (cancelled) {
          return;
        }

        setBuffer(nextBuffer);
        setSelection((currentSelection) =>
          normalizeSelection(0, nextBuffer.duration, nextBuffer.duration, currentSelection.trimMode),
        );
        setCurrentTime(0);
        setLoopEnabled(false);
        setIsSilent(isSilentAudioBuffer(nextBuffer));
        setStatusMessage(copy.status.loaded(activeFile.name, formatFileSize(activeFile.size)));
      } catch (error) {
        if (cancelled) {
          return;
        }

        setBuffer(null);
        setSelection(DEFAULT_SELECTION);
        setIsSilent(false);
        setLoadError(error instanceof Error ? error.message : copy.status.decodeFailed);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadSelectedFile();

    return () => {
      cancelled = true;
    };
  }, [activeFile, copy]);

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
  }, [buffer, copy, currentTime, selection.trimMode]);

  const clearRecordingTimer = () => {
    if (recordingTimerRef.current != null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
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
    if (isRecording) {
      return;
    }

    fileInputRef.current?.click();
  };

  const syncBufferState = (nextBuffer: AudioBuffer, nextStatus: string) => {
    setBuffer(nextBuffer);
    setCurrentTime(0);
    setSelection(normalizeSelection(0, nextBuffer.duration, nextBuffer.duration, selection.trimMode));
    setStatusMessage(nextStatus);
    setIsPlaying(false);
    audioEngine.setBuffer(nextBuffer, 0);
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
    syncBufferState(nextBuffer, copy.status.effectApplied(label));
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
    syncBufferState(nextBuffer, copy.status.undoApplied);
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
    syncBufferState(nextBuffer, copy.status.redoApplied);
  };

  const handleExport = async (format: 'wav' | 'mp3') => {
    if (!buffer || !activeFile) {
      setLoadError(copy.status.loadFirst);
      return;
    }

    try {
      setStatusMessage(copy.status.exportPreparing(format));
      await exportAudio({
        buffer,
        format,
        filename: activeFile.name,
        quality: 0.82,
      });
      setStatusMessage(copy.status.exportReady(format));
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
        setIsPlaying(false);
        return;
      }

      if (audioEngine.buffer !== buffer) {
        audioEngine.setBuffer(buffer, currentTime);
      } else {
        audioEngine.seekTo(currentTime);
      }

      audioEngine.play(currentTime);
      setIsPlaying(true);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : copy.status.playbackFailed);
    }
  };

  const handleStop = () => {
    if (isRecording) {
      return;
    }

    audioEngine.stop();
    setCurrentTime(0);
    setIsPlaying(false);
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

  const copySelection = async () => {
    const summary = `${formatTime(selection.start)} - ${formatTime(selection.end)} (${formatTime(Math.max(selection.end - selection.start, 0))})`;
    await navigator.clipboard.writeText(summary);
    setStatusMessage(copy.status.selectionCopied);
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

      clearRecordingTimer();
      recordingTimerRef.current = window.setInterval(() => {
        const startedAt = recordingStartRef.current;
        if (!startedAt) {
          return;
        }

        const elapsedSeconds = (Date.now() - startedAt) / 1000;
        setRecordingDuration(elapsedSeconds);
        setStatusMessage(copy.recording.liveStatus(elapsedSeconds));
      }, 100);
    } catch (error) {
      stopRecordingStream();

      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        setLoadError(copy.recording.permissionError);
        return;
      }

      setLoadError(error instanceof Error ? error.message : copy.recording.startError);
    }
  };

  const handleStopRecording = async () => {
    const recordingSession = recordingSessionRef.current;
    if (!recordingSession) {
      setIsRecording(false);
      setStatusMessage(copy.recording.abandoned);
      clearRecordingTimer();
      stopRecordingStream();
      return;
    }

    setStatusMessage(copy.recording.finishing);
    setIsRecording(false);
    clearRecordingTimer();

    try {
      const recording = await recordingSession.stop();
      setRecordingDuration(recording.duration);
      setStatusMessage(copy.recording.ready(recording.file.name));
      setFiles([recording.file]);
      setActiveIndex(0);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : copy.recording.startError);
    } finally {
      recordingSessionRef.current = null;
      recordingStartRef.current = null;
      stopRecordingStream();
    }
  };

  const handleRecordToggle = () => {
    if (isRecording) {
      void handleStopRecording();
      return;
    }

    void handleStartRecording();
  };

  const toolbarTitle = mode === 'batch' ? copy.toolbar.title : copy.toolbar.title;
  const toolbarSubtitle = mode === 'batch' ? copy.toolbar.subtitle : copy.toolbar.subtitle;

  return (
    <div className="space-y-6">
      <EditorToolbar
        title={toolbarTitle}
        subtitle={toolbarSubtitle}
        modeLabel={copy.toolbar.modeLabel}
        canUndo={canUndo}
        canRedo={canRedo}
        undoLabel={undoLabel}
        redoLabel={redoLabel}
        effectsOpen={effectsOpen}
        isRecording={isRecording}
        onOpenFiles={openPicker}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onExportWav={() => void handleExport('wav')}
        onExportMp3={() => void handleExport('mp3')}
        onReset={() => {
          if (buffer) {
            audioEngine.setBuffer(buffer, 0);
          }
          setSelection(buffer ? normalizeSelection(0, buffer.duration, buffer.duration, 'keep') : DEFAULT_SELECTION);
          setEffects(DEFAULT_EFFECTS);
          setActiveTab('fade');
          setZoom(1.25);
          setLoopEnabled(false);
          setStatusMessage(copy.status.resetDefaults);
        }}
        onToggleEffects={() => setEffectsOpen((open) => !open)}
        onRecordToggle={handleRecordToggle}
      />

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.85fr)]">
        <div className="space-y-5">
          <div className="workspace-panel p-5">
            <FileDropZone
              title={copy.fileDrop.title}
              description={copy.fileDrop.description}
              helperText={copy.fileDrop.helperText}
              files={files}
              multiple={false}
              inputRef={fileInputRef}
              onError={(message) => setLoadError(message)}
              onWarning={(message) => setWarningMessage(message)}
              onFiles={(nextFiles) => {
                setFiles(nextFiles);
                setActiveIndex(0);
              }}
            />
          </div>

          {isRecording ? (
            <LiveAudioWaveform
              peaks={recordingPeaks}
              isRecording={isRecording}
              title={copy.recording.liveTitle}
              description={copy.recording.liveDescription}
              statusLabel={copy.recording.liveStatus(recordingDuration)}
            />
          ) : null}

          {buffer && activeFile ? (
            <>
              <div className="editor-stage p-4">
                <WaveformCanvas
                  audioBuffer={buffer}
                  fileName={activeFile.name}
                  duration={duration}
                  currentTime={currentTime}
                  selectionStart={selection.start}
                  selectionEnd={selection.end}
                  zoom={zoom}
                  isSilent={isSilent}
                  onSeek={handleWaveformSeek}
                  onSelectionChange={commitSelection}
                />
              </div>

              <TransportBar
                currentTime={currentTime}
                duration={duration}
                zoom={zoom}
                isPlaying={isPlaying}
                loopEnabled={loopEnabled}
                isRecording={isRecording}
                onPlayPause={() => void handlePlayPause()}
                onStop={handleStop}
                onSeekBy={seekBy}
                onLoopToggle={() => setLoopEnabled((value) => !value)}
                onZoomChange={(nextZoom) => setZoom(clamp(nextZoom, 1, 12))}
                onRecordToggle={handleRecordToggle}
              />

              <SelectionBar
                start={selection.start}
                end={selection.end}
                duration={duration}
                trimMode={selection.trimMode}
                onStartChange={(nextStart) => commitSelection({ start: nextStart, end: selection.end })}
                onEndChange={(nextEnd) => commitSelection({ start: selection.start, end: nextEnd })}
                onTrimModeChange={(nextMode) =>
                  setSelection((currentSelection) => ({ ...currentSelection, trimMode: nextMode }))
                }
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
                onCopySelection={() => void copySelection()}
                onClearSelection={() => {
                  setSelection(
                    buffer ? normalizeSelection(0, buffer.duration, buffer.duration, selection.trimMode) : DEFAULT_SELECTION,
                  );
                  setStatusMessage(copy.status.selectionReset);
                }}
              />
            </>
          ) : (
            <div className="editor-stage border-dashed p-8 text-sm text-ink-muted">{copy.fileDrop.emptyState}</div>
          )}
        </div>

        <div className="space-y-5">
          <EffectsPanel
            activeTab={activeTab}
            effects={effects}
            onTabChange={setActiveTab}
            onChange={(nextEffects) => setEffects((currentEffects) => ({ ...currentEffects, ...nextEffects }))}
            onPreview={handlePreview}
            onApply={handleApplyEffect}
            collapsed={!effectsOpen}
            onToggleCollapsed={() => setEffectsOpen((open) => !open)}
          />

          <div className="workspace-panel p-4">
            <p className="workspace-kicker">{copy.session.kicker}</p>
            <div className="mt-3 space-y-3">
              <div className="rounded-xl border border-border bg-base-subtle/70 px-3 py-2 text-sm text-ink-muted">
                {activeFile ? copy.session.activeFile(activeFile.name) : copy.session.noFile}
              </div>
              <div className="rounded-xl border border-border bg-base-subtle/70 px-3 py-2 text-sm text-ink-muted">
                {buffer ? copy.session.duration(formatTime(duration), buffer.sampleRate) : copy.status.waitingInput}
              </div>
              <div className="rounded-xl border border-border bg-base-subtle/70 px-3 py-2 text-sm text-ink-muted">
                {copy.session.undoDepth(historyRef.current.depth, zoom)}
              </div>
              <div className="rounded-xl border border-border bg-base-subtle/70 px-3 py-3 text-sm text-ink-muted">
                <p className="font-semibold text-ink">{copy.session.shortcutsTitle}</p>
                <p className="mt-1 text-sm text-ink-muted">{copy.session.shortcutsDescription}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void handleExport('wav')} className="btn-ghost px-3 py-2 text-xs">
                    {copy.toolbar.exportWav}
                  </button>
                  <button type="button" onClick={() => void handleExport('mp3')} className="btn-ghost px-3 py-2 text-xs">
                    {copy.toolbar.exportMp3}
                  </button>
                  <Link href="/tools/audio/batch" className="btn-primary px-3 py-2 text-xs">
                    {copy.session.batchLink}
                  </Link>
                </div>
                <p className="mt-2 text-xs text-ink-faint">{copy.session.saveHint}</p>
              </div>
              {warningMessage ? (
                <div className="rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">{warningMessage}</div>
              ) : null}
              {statusMessage ? (
                <div className="rounded-xl border border-prime/25 bg-prime/10 px-3 py-2 text-sm text-prime">{statusMessage}</div>
              ) : null}
              {isLoading ? (
                <div className="rounded-xl border border-border bg-base-subtle/70 px-3 py-2 text-sm text-ink-muted">
                  {copy.status.decoding}
                </div>
              ) : null}
              {loadError ? (
                <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{loadError}</div>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
