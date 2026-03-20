'use client';

import { FastForward, Pause, Play, Rewind, Square } from 'lucide-react';
import { TimeDisplay } from './TimeDisplay';

interface TransportBarProps {
  currentTime: number;
  duration: number;
  zoom: number;
  isPlaying: boolean;
  loopEnabled: boolean;
  onPlayPause: () => void;
  onStop: () => void;
  onSeekBy: (delta: number) => void;
  onLoopToggle: () => void;
  onZoomChange: (nextZoom: number) => void;
}

export function TransportBar({
  currentTime,
  duration,
  zoom,
  isPlaying,
  loopEnabled,
  onPlayPause,
  onStop,
  onSeekBy,
  onLoopToggle,
  onZoomChange,
}: TransportBarProps) {
  return (
    <div className="workspace-panel p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => onSeekBy(-5)} className="btn-ghost px-3 py-2 text-xs">
            <Rewind size={14} />
            -5s
          </button>
          <button type="button" onClick={onPlayPause} className="btn-primary px-4 py-2 text-xs">
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button type="button" onClick={onStop} className="btn-ghost px-3 py-2 text-xs">
            <Square size={14} />
            Stop
          </button>
          <button type="button" onClick={() => onSeekBy(5)} className="btn-ghost px-3 py-2 text-xs">
            <FastForward size={14} />
            +5s
          </button>
          <button
            type="button"
            onClick={onLoopToggle}
            className={loopEnabled ? 'btn-primary px-3 py-2 text-xs' : 'btn-ghost px-3 py-2 text-xs'}
          >
            Loop {loopEnabled ? 'on' : 'off'}
          </button>
        </div>

        <div className="flex flex-col gap-3 xl:min-w-[24rem]">
          <TimeDisplay currentTime={currentTime} duration={duration} />
          <label className="text-xs uppercase tracking-[0.18em] text-ink-faint">
            Zoom x{zoom.toFixed(1)}
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
