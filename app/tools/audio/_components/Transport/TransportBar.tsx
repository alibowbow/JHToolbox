'use client';

import {
  ChevronLeft,
  ChevronRight,
  Circle,
  Pause,
  Play,
  Redo2,
  Repeat,
  SkipBack,
  SkipForward,
  Undo2,
} from 'lucide-react';
import { useLocale } from '@/components/providers/locale-provider';
import { getAudioEditorCopy } from '../audio-editor-copy';
import { formatTime } from '../audio-editor-utils';

interface TransportBarProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isRecording?: boolean;
  isRecordingPaused?: boolean;
  loopEnabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string | null;
  redoLabel?: string | null;
  onPlayPause: () => void;
  onSeekBy: (delta: number) => void;
  onSeekToStart: () => void;
  onSeekToEnd: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleLoop: () => void;
  onRecordToggle?: () => void;
  onRecordPauseResume?: () => void;
}

export function TransportBar({
  currentTime,
  duration,
  isPlaying,
  isRecording = false,
  isRecordingPaused = false,
  loopEnabled,
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  onPlayPause,
  onSeekBy,
  onSeekToStart,
  onSeekToEnd,
  onUndo,
  onRedo,
  onToggleLoop,
  onRecordToggle,
  onRecordPauseResume,
}: TransportBarProps) {
  const { locale } = useLocale();
  const copy = getAudioEditorCopy(locale);
  const canControlPlayback = duration > 0 && !isRecording;

  return (
    <div data-testid="audio-transport-bar" className="audio-panel flex flex-col gap-3 rounded-[18px] px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          title={undoLabel ? `${copy.transport.undo}: ${undoLabel}` : copy.transport.undo}
          onClick={onUndo}
          disabled={!canUndo}
          className="audio-icon-button audio-focus-ring"
          aria-label={copy.transport.undo}
        >
          <Undo2 size={15} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          title={redoLabel ? `${copy.transport.redo}: ${redoLabel}` : copy.transport.redo}
          onClick={onRedo}
          disabled={!canRedo}
          className="audio-icon-button audio-focus-ring"
          aria-label={copy.transport.redo}
        >
          <Redo2 size={15} strokeWidth={1.5} />
        </button>

        <span className="audio-divider mx-1 hidden h-7 sm:block" />

        <button
          type="button"
          onClick={onSeekToStart}
          className="audio-button-ghost audio-focus-ring h-8 w-8 p-0"
          aria-label={copy.transport.jumpStart}
          disabled={!canControlPlayback}
        >
          <SkipBack size={15} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={() => onSeekBy(-5)}
          className="audio-button-ghost audio-focus-ring h-8 w-8 p-0"
          aria-label={copy.transport.rewind}
          disabled={!canControlPlayback}
        >
          <ChevronLeft size={15} strokeWidth={1.5} />
        </button>

        <button
          type="button"
          onClick={onPlayPause}
          className={`audio-play-button audio-focus-ring ${isPlaying ? 'is-playing' : ''}`}
          aria-label={isPlaying ? copy.transport.pause : copy.transport.play}
          disabled={!canControlPlayback}
        >
          {isPlaying ? <Pause size={18} strokeWidth={1.5} /> : <Play size={18} strokeWidth={1.5} className="ml-0.5" />}
        </button>

        <button
          type="button"
          onClick={() => onSeekBy(5)}
          className="audio-button-ghost audio-focus-ring h-8 w-8 p-0"
          aria-label={copy.transport.forward}
          disabled={!canControlPlayback}
        >
          <ChevronRight size={15} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={onSeekToEnd}
          className="audio-button-ghost audio-focus-ring h-8 w-8 p-0"
          aria-label={copy.transport.jumpEnd}
          disabled={!canControlPlayback}
        >
          <SkipForward size={15} strokeWidth={1.5} />
        </button>

        <button
          type="button"
          onClick={onToggleLoop}
          disabled={duration <= 0}
          className={`audio-icon-button audio-focus-ring ${loopEnabled ? 'text-[var(--accent)]' : ''}`}
          aria-label={copy.transport.loop}
          aria-pressed={loopEnabled}
          title={copy.transport.loop}
        >
          <Repeat size={15} strokeWidth={1.5} />
        </button>

        {onRecordToggle ? (
          <>
            <button
              type="button"
              onClick={onRecordToggle}
              className={`audio-record-button audio-focus-ring ${isRecording ? 'is-recording' : ''}`}
              aria-label={isRecording ? copy.toolbar.stopRecording : copy.toolbar.startRecording}
            >
              <Circle size={14} fill="currentColor" strokeWidth={1.5} />
            </button>
            {isRecording && onRecordPauseResume ? (
              <button
                type="button"
                onClick={onRecordPauseResume}
                className="audio-button-ghost audio-focus-ring h-8 w-8 p-0"
                aria-label={isRecordingPaused ? copy.toolbar.resumeRecording : copy.toolbar.pauseRecording}
              >
                {isRecordingPaused ? (
                  <Play size={15} strokeWidth={1.5} className="ml-0.5" />
                ) : (
                  <Pause size={15} strokeWidth={1.5} />
                )}
              </button>
            ) : null}
          </>
        ) : null}

        <div className="ml-auto flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1">
          <span className="audio-section-kicker hidden sm:inline">{copy.time.label}</span>
          <span data-testid="audio-time-display" className="audio-mono text-[13px] text-[var(--text-primary)]">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
