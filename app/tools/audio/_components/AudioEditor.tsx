'use client';

import { useEffect, useRef, useState } from 'react';
import { EditHistory, audioEngine, exportAudio } from '@/lib/audio';
import { extractAudioRange, removeAudioRange, applyFadeToAudioRange, applyPitchToAudioRange, applySpeedToAudioRange, isSilentAudioBuffer } from './audio-buffer-transforms';
import { AudioEditorMode, AudioEffectTab, AudioEffectsState, AudioSelection, DEFAULT_EFFECTS, DEFAULT_SELECTION, clamp, formatTime, formatFileSize, normalizeSelection } from './audio-editor-utils';
import { FileDropZone } from './FileDropZone';
import { EditorToolbar } from './Toolbar/EditorToolbar';
import { WaveformCanvas } from './Waveform/WaveformCanvas';
import { TransportBar } from './Transport/TransportBar';
import { SelectionBar } from './Selection/SelectionBar';
import { EffectsPanel } from './Effects/EffectsPanel';

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef(new EditHistory());
  const bufferRef = useRef<AudioBuffer | null>(null);

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
      setStatusMessage(`Loading ${activeFile.name}...`);
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
        setStatusMessage(`Loaded ${activeFile.name} (${formatFileSize(activeFile.size)}).`);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setBuffer(null);
        setSelection(DEFAULT_SELECTION);
        setIsSilent(false);
        setLoadError(error instanceof Error ? error.message : 'Unable to decode this audio file in the browser.');
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
  }, [activeFile]);

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
        setStatusMessage('Selected the entire waveform.');
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setSelection(DEFAULT_SELECTION);
        setStatusMessage('Selection cleared.');
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
  }, [buffer, currentTime, selection.trimMode]);

  const openPicker = () => fileInputRef.current?.click();

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
      setLoadError('Load an audio file first.');
      return;
    }

    const nextBuffer = historyRef.current.apply(buffer, {
      label,
      execute: transform,
    });

    setHistoryVersion((value) => value + 1);
    syncBufferState(nextBuffer, `${label} applied.`);
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
    syncBufferState(nextBuffer, 'Undo applied.');
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
    syncBufferState(nextBuffer, 'Redo applied.');
  };

  const handleExport = async (format: 'wav' | 'mp3') => {
    if (!buffer || !activeFile) {
      setLoadError('Load an audio file first.');
      return;
    }

    try {
      setStatusMessage(`Preparing ${format.toUpperCase()} export...`);
      await exportAudio({
        buffer,
        format,
        filename: activeFile.name,
        quality: 0.82,
      });
      setStatusMessage(`${format.toUpperCase()} export is ready.`);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Audio export failed.');
    }
  };

  const handlePlayPause = async () => {
    if (!buffer) {
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
      setLoadError(error instanceof Error ? error.message : 'Playback failed.');
    }
  };

  const handleStop = () => {
    audioEngine.stop();
    setCurrentTime(0);
    setIsPlaying(false);
  };

  const seekBy = (delta: number) => {
    if (!buffer) {
      return;
    }

    const nextTime = clamp(currentTime + delta, 0, duration);
    setCurrentTime(nextTime);

    if (audioEngine.buffer === buffer) {
      audioEngine.seekTo(nextTime);
    }
  };

  const handleWaveformSeek = (time: number) => {
    if (!buffer) {
      return;
    }

    const nextTime = clamp(time, 0, duration);
    setCurrentTime(nextTime);

    if (audioEngine.buffer === buffer) {
      audioEngine.seekTo(nextTime);
    }
  };

  const playSelection = async () => {
    if (!buffer || selection.end <= selection.start) {
      return;
    }

    audioEngine.previewSlice(buffer, selection.start, selection.end);
    setCurrentTime(selection.start);
    setIsPlaying(true);
  };

  const copySelection = async () => {
    const summary = `${formatTime(selection.start)} - ${formatTime(selection.end)} (${formatTime(Math.max(selection.end - selection.start, 0))})`;
    await navigator.clipboard.writeText(summary);
    setStatusMessage('Selection times copied.');
  };

  const previewBuffer = () => {
    if (!buffer) {
      return null;
    }

    return extractAudioRange(buffer, selection.start, selection.end);
  };

  const handlePreview = (tab: AudioEffectTab) => {
    const segmentBuffer = previewBuffer();
    if (!segmentBuffer) {
      setLoadError('Load an audio file first.');
      return;
    }

    if (tab === 'fade') {
      audioEngine.previewWithFade(segmentBuffer, effects.fadeIn, effects.fadeOut);
      setStatusMessage('Previewing fade on the selected range.');
      setIsPlaying(true);
      return;
    }

    if (tab === 'speed') {
      audioEngine.previewWithSpeed(segmentBuffer, effects.speed);
      setStatusMessage('Previewing speed change on the selected range.');
      setIsPlaying(true);
      return;
    }

    if (tab === 'pitch') {
      audioEngine.previewWithPitch(segmentBuffer, effects.pitch);
      setStatusMessage('Previewing pitch shift on the selected range.');
      setIsPlaying(true);
      return;
    }

    audioEngine.previewWithEq(segmentBuffer, {
      lowGainDb: effects.low,
      midGainDb: effects.mid,
      highGainDb: effects.high,
    });
    setStatusMessage('Previewing EQ on the selected range.');
    setIsPlaying(true);
  };

  const handleApplyEffect = (tab: AudioEffectTab) => {
    if (tab === 'fade') {
      applyBufferCommand('Fade envelope', (currentBuffer) =>
        applyFadeToAudioRange(currentBuffer, selection.start, selection.end, effects.fadeIn, effects.fadeOut),
      );
      return;
    }

    if (tab === 'speed') {
      applyBufferCommand('Speed change', (currentBuffer) =>
        applySpeedToAudioRange(currentBuffer, selection.start, selection.end, effects.speed),
      );
      return;
    }

    if (tab === 'pitch') {
      applyBufferCommand('Pitch shift', (currentBuffer) =>
        applyPitchToAudioRange(currentBuffer, selection.start, selection.end, effects.pitch),
      );
      return;
    }

    setStatusMessage('EQ preview is live now. Offline EQ apply is queued for the next audio-editor pass.');
  };

  return (
    <div className="space-y-6">
      <EditorToolbar
        title={mode === 'batch' ? 'Batch convert and preview audio files' : 'A focused audio editor for trimming, effects, and review'}
        subtitle={
          mode === 'batch'
            ? 'Use the dedicated converter workspace for format changes, and keep this page for editor-first audio work.'
            : 'Single-file editor mode with waveform selection, effect previews, undo/redo, and local export.'
        }
        modeLabel={mode === 'batch' ? 'Audio batch workspace' : 'Audio editor workspace'}
        canUndo={canUndo}
        canRedo={canRedo}
        undoLabel={undoLabel}
        redoLabel={redoLabel}
        effectsOpen={effectsOpen}
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
          setStatusMessage('Editor reset to defaults.');
        }}
        onToggleEffects={() => setEffectsOpen((open) => !open)}
      />

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.85fr)]">
        <div className="space-y-5">
          <div className="workspace-panel p-5">
            <FileDropZone
              title="Import audio"
              description="Bring in an audio file for timeline editing, preview, and export."
              helperText="Supported formats: MP3, WAV, M4A, AAC, OGG, FLAC, WEBM, and MP4 audio tracks."
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
                onPlayPause={() => void handlePlayPause()}
                onStop={handleStop}
                onSeekBy={seekBy}
                onLoopToggle={() => setLoopEnabled((value) => !value)}
                onZoomChange={(nextZoom) => setZoom(clamp(nextZoom, 1, 12))}
              />

              <SelectionBar
                start={selection.start}
                end={selection.end}
                duration={duration}
                trimMode={selection.trimMode}
                onStartChange={(nextStart) => commitSelection({ start: nextStart, end: selection.end })}
                onEndChange={(nextEnd) => commitSelection({ start: selection.start, end: nextEnd })}
                onTrimModeChange={(nextMode) => setSelection((currentSelection) => ({ ...currentSelection, trimMode: nextMode }))}
                onPlaySelection={() => void playSelection()}
                onTrimSelection={() =>
                  applyBufferCommand('Keep selection', (currentBuffer) => extractAudioRange(currentBuffer, selection.start, selection.end))
                }
                onRemoveSelection={() =>
                  applyBufferCommand('Remove selection', (currentBuffer) => removeAudioRange(currentBuffer, selection.start, selection.end))
                }
                onCopySelection={() => void copySelection()}
                onClearSelection={() => {
                  setSelection(buffer ? normalizeSelection(0, buffer.duration, buffer.duration, selection.trimMode) : DEFAULT_SELECTION);
                  setStatusMessage('Selection reset to the full file.');
                }}
              />
            </>
          ) : (
            <div className="editor-stage border-dashed p-8 text-sm text-ink-muted">
              Drop an audio file to start building the editor timeline.
            </div>
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
            <p className="workspace-kicker">Session</p>
            <div className="mt-3 space-y-3">
              <div className="rounded-xl border border-border bg-base-subtle/70 px-3 py-2 text-sm text-ink-muted">
                {activeFile ? `Active file: ${activeFile.name}` : 'No file loaded yet.'}
              </div>
              <div className="rounded-xl border border-border bg-base-subtle/70 px-3 py-2 text-sm text-ink-muted">
                {buffer ? `Duration: ${formatTime(duration)} | Sample rate: ${buffer.sampleRate.toLocaleString()} Hz` : 'Waiting for audio input.'}
              </div>
              <div className="rounded-xl border border-border bg-base-subtle/70 px-3 py-2 text-sm text-ink-muted">
                Undo depth: {historyRef.current.depth} | Zoom: x{zoom.toFixed(1)}
              </div>
              {warningMessage ? (
                <div className="rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">{warningMessage}</div>
              ) : null}
              {statusMessage ? (
                <div className="rounded-xl border border-prime/25 bg-prime/10 px-3 py-2 text-sm text-prime">{statusMessage}</div>
              ) : null}
              {isLoading ? (
                <div className="rounded-xl border border-border bg-base-subtle/70 px-3 py-2 text-sm text-ink-muted">
                  Decoding audio buffer and preparing waveform preview...
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
