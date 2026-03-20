'use client';

import { useEffect, useState } from 'react';
import { renderWaveform } from '@/lib/audio';
import { clamp } from '../audio-editor-utils';
import { PlayheadOverlay } from './PlayheadOverlay';
import { WaveformTimeline } from './WaveformTimeline';

type DragMode = 'selection' | 'start' | 'end' | 'playhead';

interface WaveformCanvasProps {
  audioBuffer: AudioBuffer | null;
  fileName: string;
  duration: number;
  currentTime: number;
  selectionStart: number;
  selectionEnd: number;
  zoom: number;
  isSilent: boolean;
  onSeek: (time: number) => void;
  onSelectionChange: (nextSelection: { start: number; end: number }) => void;
}

export function WaveformCanvas({
  audioBuffer,
  fileName,
  duration,
  currentTime,
  selectionStart,
  selectionEnd,
  zoom,
  isSilent,
  onSeek,
  onSelectionChange,
}: WaveformCanvasProps) {
  const [baseWidth, setBaseWidth] = useState(760);
  const [dragMode, setDragMode] = useState<DragMode | null>(null);
  const [scrollNode, setScrollNode] = useState<HTMLDivElement | null>(null);
  const [canvasNode, setCanvasNode] = useState<HTMLCanvasElement | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const canvasWidth = Math.max(baseWidth, Math.round(baseWidth * zoom));
  const safeDuration = Math.max(duration, 0.001);
  const startPercent = clamp(selectionStart / safeDuration, 0, 1);
  const endPercent = clamp(selectionEnd / safeDuration, 0, 1);
  const playheadPercent = clamp(currentTime / safeDuration, 0, 1);
  const selectionWidth = Math.max((endPercent - startPercent) * 100, 0.4);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const syncTheme = () => setTheme(media.matches ? 'dark' : 'light');
    syncTheme();
    media.addEventListener('change', syncTheme);
    return () => media.removeEventListener('change', syncTheme);
  }, []);

  useEffect(() => {
    if (!scrollNode || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? 760;
      setBaseWidth(Math.max(360, Math.floor(nextWidth)));
    });

    observer.observe(scrollNode);
    return () => observer.disconnect();
  }, [scrollNode]);

  useEffect(() => {
    if (!canvasNode) {
      return;
    }

    const height = 180;
    const dpr = window.devicePixelRatio || 1;
    canvasNode.width = Math.round(canvasWidth * dpr);
    canvasNode.height = Math.round(height * dpr);
    canvasNode.style.width = `${canvasWidth}px`;
    canvasNode.style.height = `${height}px`;

    const context = canvasNode.getContext('2d');
    if (!context) {
      return;
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.scale(dpr, dpr);
    context.clearRect(0, 0, canvasWidth, height);

    if (!audioBuffer) {
      context.fillStyle = theme === 'dark' ? 'rgba(15, 23, 42, 0.9)' : 'rgba(248, 250, 252, 0.9)';
      context.fillRect(0, 0, canvasWidth, height);
      return;
    }

    renderWaveform({
      buffer: audioBuffer,
      canvas: canvasNode,
      startSec: 0,
      endSec: audioBuffer.duration,
      selectionStart,
      selectionEnd,
      playheadSec: currentTime,
      theme,
    });
  }, [audioBuffer, canvasNode, canvasWidth, currentTime, selectionEnd, selectionStart, theme]);

  const getTimeFromClientX = (clientX: number) => {
    if (!scrollNode) {
      return 0;
    }

    const rect = scrollNode.getBoundingClientRect();
    const x = clientX - rect.left + scrollNode.scrollLeft;
    const ratio = clamp(x / canvasWidth, 0, 1);
    return ratio * safeDuration;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const time = getTimeFromClientX(event.clientX);
    const target = event.target as HTMLElement;
    const handle = target.closest<HTMLElement>('[data-waveform-handle]')?.dataset.waveformHandle as DragMode | undefined;
    const mode: DragMode =
      handle ?? (Math.abs(time - selectionStart) < 0.35 ? 'start' : Math.abs(time - selectionEnd) < 0.35 ? 'end' : 'selection');

    setDragMode(mode);
    event.currentTarget.setPointerCapture(event.pointerId);

    if (mode === 'playhead') {
      onSeek(time);
      return;
    }

    if (mode === 'selection') {
      onSelectionChange({ start: time, end: Math.min(time + 0.1, safeDuration) });
      onSeek(time);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragMode) {
      return;
    }

    const time = getTimeFromClientX(event.clientX);

    if (dragMode === 'playhead') {
      onSeek(time);
      return;
    }

    if (dragMode === 'start') {
      onSelectionChange({ start: time, end: selectionEnd });
      return;
    }

    if (dragMode === 'end') {
      onSelectionChange({ start: selectionStart, end: time });
      return;
    }

    onSelectionChange({ start: selectionStart, end: time });
  };

  return (
    <div className="space-y-0">
      <WaveformTimeline duration={duration} zoom={zoom} />
      <div
        ref={setScrollNode}
        className="overflow-x-auto rounded-b-2xl border border-border border-t-0 bg-base-elevated"
        data-testid="audio-waveform-scroll"
      >
        <div
          className="relative h-56 min-w-full select-none touch-none"
          style={{ width: `${canvasWidth}px` }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={() => setDragMode(null)}
          onPointerCancel={() => setDragMode(null)}
        >
          <canvas ref={setCanvasNode} className="absolute inset-0 h-full w-full" />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-base/10" />
          <div
            aria-hidden="true"
            className="absolute inset-y-0 bg-prime/10"
            style={{ left: `${startPercent * 100}%`, width: `${selectionWidth}%` }}
          />

          <button
            type="button"
            data-waveform-handle="start"
            className="absolute top-1/2 z-20 h-10 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border border-prime/60 bg-base-elevated text-prime shadow-[0_0_18px_rgba(0,179,214,0.2)]"
            style={{ left: `${startPercent * 100}%` }}
          >
            |
          </button>
          <button
            type="button"
            data-waveform-handle="end"
            className="absolute top-1/2 z-20 h-10 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border border-prime/60 bg-base-elevated text-prime shadow-[0_0_18px_rgba(0,179,214,0.2)]"
            style={{ left: `${endPercent * 100}%` }}
          >
            |
          </button>

          <PlayheadOverlay positionPercent={playheadPercent} currentTime={currentTime} />

          <div className="absolute left-4 top-4 z-10 rounded-full border border-border bg-base-elevated/95 px-3 py-1 text-xs text-ink-muted shadow-card">
            {fileName}
          </div>

          {isSilent ? (
            <div className="absolute inset-x-4 bottom-4 rounded-xl border border-border bg-base-elevated/95 px-3 py-2 text-sm text-ink-muted">
              Silent or very quiet audio detected. You can still trim and export this file.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
