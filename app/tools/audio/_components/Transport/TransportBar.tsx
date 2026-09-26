'use client';

import { ChevronUp, Pause, Play, Repeat, RotateCcw, RotateCw, SkipBack, SkipForward, Square } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocale } from '@/components/providers/locale-provider';
import { getAudioEditorCopy } from '../audio-editor-copy';
import { formatTime } from '../audio-editor-utils';
import { LevelMeter } from '../Recording/LevelMeter';

interface TransportBarProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isRecording?: boolean;
  isRecordingPaused?: boolean;
  loopEnabled: boolean;
  /** One line about what just happened (status or recording format). */
  statusText?: string | null;
  /** Latest input peaks while recording, for the level meter. */
  readInputPeaks?: () => number[];
  /** Recording settings, shown in a panel above the record button. */
  recordingSettings?: ReactNode;
  onPlayPause: () => void;
  onSeekBy: (delta: number) => void;
  onSeekToStart: () => void;
  onSeekToEnd: () => void;
  onToggleLoop: () => void;
  onRecordToggle?: () => void;
  onRecordPauseResume?: () => void;
}

/** Record, play and time: docked at the bottom of the screen. */
export function TransportBar({
  currentTime,
  duration,
  isPlaying,
  isRecording = false,
  isRecordingPaused = false,
  loopEnabled,
  statusText,
  readInputPeaks,
  recordingSettings,
  onPlayPause,
  onSeekBy,
  onSeekToStart,
  onSeekToEnd,
  onToggleLoop,
  onRecordToggle,
  onRecordPauseResume,
}: TransportBarProps) {
  const { locale } = useLocale();
  const copy = getAudioEditorCopy(locale);
  const canControlPlayback = duration > 0 && !isRecording;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!settingsOpen) {
      return;
    }
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !settingsRef.current?.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (isRecording) {
      setSettingsOpen(false);
    }
  }, [isRecording]);

  const seekButton = 'audio-icon-button audio-focus-ring h-9 w-9';

  return (
    <div
      data-testid="audio-transport-bar"
      className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-2 py-2 sm:gap-x-3 sm:px-3 md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
    >
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {onRecordToggle ? (
          <div ref={settingsRef} className="relative flex items-center gap-1">
            <button
              type="button"
              onClick={onRecordToggle}
              className={`audio-record-button audio-focus-ring ${isRecording ? 'is-recording' : ''}`}
              aria-label={isRecording ? copy.toolbar.stopRecording : copy.toolbar.startRecording}
              title={isRecording ? copy.toolbar.stopRecording : copy.toolbar.startRecording}
            >
              {isRecording ? <Square size={14} fill="currentColor" strokeWidth={0} /> : <span className="h-3.5 w-3.5 rounded-full bg-current" />}
            </button>
            {isRecording && onRecordPauseResume ? (
              <button
                type="button"
                onClick={onRecordPauseResume}
                className="audio-icon-button audio-focus-ring h-9 w-9"
                aria-label={isRecordingPaused ? copy.toolbar.resumeRecording : copy.toolbar.pauseRecording}
                title={isRecordingPaused ? copy.toolbar.resumeRecording : copy.toolbar.pauseRecording}
              >
                {isRecordingPaused ? <Play size={16} strokeWidth={1.75} className="ml-0.5" /> : <Pause size={16} strokeWidth={1.75} />}
              </button>
            ) : null}
            {!isRecording && recordingSettings ? (
              <>
                <button
                  type="button"
                  onClick={() => setSettingsOpen((open) => !open)}
                  className="audio-icon-button audio-focus-ring h-9 w-7"
                  aria-label={copy.recorder.settings}
                  aria-expanded={settingsOpen}
                  title={copy.recorder.settings}
                >
                  <ChevronUp size={15} strokeWidth={1.75} className={settingsOpen ? '' : 'rotate-180'} />
                </button>
                {settingsOpen ? (
                  <div className="audio-menu absolute bottom-[calc(100%+0.75rem)] left-0 z-50 w-[min(22rem,calc(100vw-2rem))] p-4">
                    <p className="mb-3 text-sm font-semibold text-[var(--text-primary)]">{copy.recorder.settings}</p>
                    {recordingSettings}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}

        <span className="audio-divider hidden h-7 sm:block" />

        <div className="flex min-w-0 flex-col leading-none">
          {isRecording ? (
            <span className={`mb-1 text-[11px] font-semibold ${isRecordingPaused ? 'text-[var(--status-warning)]' : 'text-red-500'}`}>
              ● {isRecordingPaused ? copy.recorder.paused : copy.recorder.live}
            </span>
          ) : null}
          <span data-testid="audio-time-display" className="audio-mono whitespace-nowrap text-[15px] font-semibold text-[var(--text-primary)] sm:text-[17px]">
            {formatTime(currentTime)}
            <span className="text-[13px] font-normal text-[var(--text-tertiary)] sm:text-[14px]"> / {formatTime(duration)}</span>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-0.5 md:justify-self-center">
        <button type="button" onClick={onSeekToStart} className={`${seekButton} hidden sm:inline-flex`} aria-label={copy.transport.jumpStart} disabled={!canControlPlayback}>
          <SkipBack size={16} strokeWidth={1.75} />
        </button>
        <button type="button" onClick={() => onSeekBy(-5)} className={`${seekButton} hidden md:inline-flex`} aria-label={copy.transport.rewind} disabled={!canControlPlayback}>
          <RotateCcw size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={onPlayPause}
          className={`audio-play-button audio-focus-ring mx-1 ${isPlaying ? 'is-playing' : ''}`}
          aria-label={isPlaying ? copy.transport.pause : copy.transport.play}
          disabled={!canControlPlayback}
        >
          {isPlaying ? <Pause size={18} strokeWidth={2} fill="currentColor" /> : <Play size={18} strokeWidth={2} fill="currentColor" className="ml-0.5" />}
        </button>
        <button type="button" onClick={() => onSeekBy(5)} className={`${seekButton} hidden md:inline-flex`} aria-label={copy.transport.forward} disabled={!canControlPlayback}>
          <RotateCw size={16} strokeWidth={1.75} />
        </button>
        <button type="button" onClick={onSeekToEnd} className={`${seekButton} hidden sm:inline-flex`} aria-label={copy.transport.jumpEnd} disabled={!canControlPlayback}>
          <SkipForward size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={onToggleLoop}
          disabled={duration <= 0 || isRecording}
          className={seekButton}
          aria-label={copy.transport.loop}
          aria-pressed={loopEnabled}
          title={copy.transport.loop}
        >
          <Repeat size={16} strokeWidth={1.75} />
        </button>
      </div>

      <div className="flex min-w-0 basis-full items-center justify-end gap-3 md:basis-auto md:justify-self-stretch">
        <p className="min-w-0 flex-1 truncate text-xs text-[var(--text-tertiary)] md:text-right" aria-live="polite">
          {statusText}
        </p>
        {isRecording && readInputPeaks ? <LevelMeter readPeaks={readInputPeaks} label={copy.recorder.level} /> : null}
      </div>
    </div>
  );
}
