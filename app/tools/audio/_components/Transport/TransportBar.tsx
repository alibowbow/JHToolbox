'use client';

import { FastForward, Mic, Pause, Play, Rewind, Square } from 'lucide-react';
import { useLocale } from '@/components/providers/locale-provider';
import { getAudioEditorCopy } from '../audio-editor-copy';
import { TimeDisplay } from './TimeDisplay';

interface TransportBarProps {
  currentTime: number;
  duration: number;
  zoom: number;
  isPlaying: boolean;
  loopEnabled: boolean;
  isRecording?: boolean;
  onPlayPause: () => void;
  onStop: () => void;
  onSeekBy: (delta: number) => void;
  onLoopToggle: () => void;
  onZoomChange: (nextZoom: number) => void;
  onRecordToggle?: () => void;
}

export function TransportBar({
  currentTime,
  duration,
  zoom,
  isPlaying,
  loopEnabled,
  isRecording = false,
  onPlayPause,
  onStop,
  onSeekBy,
  onLoopToggle,
  onZoomChange,
  onRecordToggle,
}: TransportBarProps) {
  const { locale } = useLocale();
  const copy = getAudioEditorCopy(locale);

  return (
    <div className="workspace-panel p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => onSeekBy(-5)} className="btn-ghost px-3 py-2 text-xs">
            <Rewind size={14} />
            {copy.transport.rewind}
          </button>
          <button type="button" onClick={onPlayPause} className="btn-primary px-4 py-2 text-xs">
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            {isPlaying ? copy.transport.pause : copy.transport.play}
          </button>
          <button type="button" onClick={onStop} className="btn-ghost px-3 py-2 text-xs">
            <Square size={14} />
            {copy.transport.stop}
          </button>
          <button type="button" onClick={() => onSeekBy(5)} className="btn-ghost px-3 py-2 text-xs">
            <FastForward size={14} />
            {copy.transport.forward}
          </button>
          {onRecordToggle ? (
            <button
              type="button"
              onClick={onRecordToggle}
              className={isRecording ? 'btn-primary px-3 py-2 text-xs' : 'btn-ghost px-3 py-2 text-xs'}
            >
              <Mic size={14} />
              {isRecording ? copy.toolbar.stopRecording : copy.toolbar.startRecording}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onLoopToggle}
            className={loopEnabled ? 'btn-primary px-3 py-2 text-xs' : 'btn-ghost px-3 py-2 text-xs'}
          >
            {loopEnabled ? copy.transport.loopOn : copy.transport.loopOff}
          </button>
        </div>

        <div className="flex flex-col gap-3 xl:min-w-[24rem]">
          <TimeDisplay currentTime={currentTime} duration={duration} />
          <label className="text-xs uppercase tracking-[0.18em] text-ink-faint">
            {copy.transport.zoom} x{zoom.toFixed(1)}
            <input
              type="range"
              min={1}
              max={12}
              step={0.25}
              value={zoom}
              onChange={(event) => onZoomChange(Number(event.target.value))}
              className="mt-2 w-full accent-cyan-400"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
