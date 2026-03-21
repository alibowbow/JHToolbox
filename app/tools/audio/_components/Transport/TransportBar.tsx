'use client';

import {
  ChevronLeft,
  ChevronRight,
  Circle,
  Pause,
  Play,
  Redo2,
  SkipBack,
  SkipForward,
  Undo2,
} from 'lucide-react';
import { useLocale } from '@/components/providers/locale-provider';
import { getAudioEditorCopy } from '../audio-editor-copy';
import { formatTime, getRangeStyle } from '../audio-editor-utils';

interface TransportBarProps {
  currentTime: number;
  duration: number;
  zoom: number;
  isPlaying: boolean;
  isRecording?: boolean;
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
  onZoomChange: (nextZoom: number) => void;
  onRecordToggle?: () => void;
}

export function TransportBar({
  currentTime,
  duration,
  zoom,
  isPlaying,
  isRecording = false,
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
  onZoomChange,
  onRecordToggle,
}: TransportBarProps) {
  const { locale } = useLocale();
  const copy = getAudioEditorCopy(locale);
  const canControlPlayback = duration > 0 && !isRecording;

  return (
    <div data-testid="audio-transport-bar" className="audio-panel flex flex-col gap-3 rounded-[18px] px-3 py-3 sm:px-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
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

          {onRecordToggle ? (
            <button
              type="button"
              onClick={onRecordToggle}
              className={`audio-record-button audio-focus-ring ${isRecording ? 'is-recording' : ''}`}
              aria-label={isRecording ? copy.toolbar.stopRecording : copy.toolbar.startRecording}
            >
              <Circle size={14} fill="currentColor" strokeWidth={1.5} />
            </button>
          ) : null}

          <div className="ml-1 flex items-center gap-2 rounded-full border border-[var(--border)] bg-[rgba(255,255,255,0.02)] px-2.5 py-1">
            <span className="audio-section-kicker hidden sm:inline">{copy.time.label}</span>
            <span data-testid="audio-time-display" className="audio-mono text-[13px] text-[var(--text-primary)]">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 xl:min-w-[18rem]">
          <span className="audio-range-label">{copy.transport.zoom}</span>
          <input
            type="range"
            min={0.75}
            max={6}
            step={0.25}
            value={zoom}
            onChange={(event) => onZoomChange(Number(event.target.value))}
            style={getRangeStyle(zoom, 0.75, 6)}
            className="audio-range audio-focus-ring"
            aria-label={copy.transport.zoom}
            aria-valuemin={0.75}
            aria-valuemax={6}
            aria-valuenow={zoom}
            disabled={duration <= 0}
          />
          <span className="audio-value min-w-[3.5rem] text-right">x{zoom.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}
