'use client';

import { useEffect, useState } from 'react';
import { useLocale } from '@/components/providers/locale-provider';
import { renderWaveform } from '@/lib/audio';
import { clamp } from '../audio-editor-utils';
import { getAudioEditorCopy } from '../audio-editor-copy';
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
  isLoading?: boolean;
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
  isLoading = false,
  onSeek,
  onSelectionChange,
}: WaveformCanvasProps) {
  const { locale } = useLocale();
  const copy = getAudioEditorCopy(locale);
  const [baseWidth, setBaseWidth] = useState(760);
  const [dragMode, setDragMode] = useState<DragMode | null>(null);
  const [scrollNode, setScrollNode] = useState<HTMLDivElement | null>(null);
  const [canvasNode, setCanvasNode] = useState<HTMLCanvasElement | null>(null);
  const theme: 'light' | 'dark' = 'dark';
  const canvasWidth = Math.max(baseWidth, Math.round(baseWidth * zoom));
  const safeDuration = Math.max(duration, 0.001);
  const startPercent = clamp(selectionStart / safeDuration, 0, 1);
  const endPercent = clamp(selectionEnd / safeDuration, 0, 1);
  const playheadPercent = clamp(currentTime / safeDuration, 0, 1);
  const selectionWidth = Math.max((endPercent - startPercent) * 100, 0.4);

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

    const height = 144;
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
      context.fillStyle = '#0A1A19';
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
        className="overflow-x-auto rounded-b-[18px] bg-[var(--waveform-bg)]"
        data-testid="audio-waveform-scroll"
      >
        <div
          className="relative h-36 min-w-full select-none touch-none"
          style={{ width: `${canvasWidth}px` }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={() => setDragMode(null)}
          onPointerCancel={() => setDragMode(null)}
        >
          {isLoading ? <div className="audio-loading-skeleton absolute inset-0" /> : null}
          <canvas ref={setCanvasNode} className="absolute inset-0 h-full w-full" />

          <button
            type="button"
            data-waveform-handle="start"
            className="absolute inset-y-2 z-20 w-1.5 -translate-x-1/2 rounded-full bg-[var(--selection-border)]"
            style={{ left: `${startPercent * 100}%` }}
            aria-label="Selection start"
          />
          <button
            type="button"
            data-waveform-handle="end"
            className="absolute inset-y-2 z-20 w-1.5 -translate-x-1/2 rounded-full bg-[var(--selection-border)]"
            style={{ left: `${endPercent * 100}%` }}
            aria-label="Selection end"
          />

          <PlayheadOverlay positionPercent={playheadPercent} currentTime={currentTime} />

          <div className="audio-mono absolute left-3 top-3 z-10 rounded-md border border-[var(--border)] bg-[rgba(30,32,35,0.94)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)]">
            {fileName}
          </div>

          {isSilent ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="flex w-full max-w-sm items-center gap-3 px-6">
                <span className="h-px flex-1 bg-[rgba(255,255,255,0.14)]" />
                <span className="audio-mono text-[11px] text-[var(--text-secondary)]">
                  {copy.waveform.silentNotice}
                </span>
                <span className="h-px flex-1 bg-[rgba(255,255,255,0.14)]" />
              </div>
            </div>
          ) : null}

          {!isSilent && selectionWidth > 0 ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 border-y border-[var(--selection-border)] bg-[var(--selection-bg)]"
              style={{ left: `${startPercent * 100}%`, width: `${selectionWidth}%` }}
            />
          ) : null}

          {isLoading ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="audio-mono text-[12px] text-[var(--text-secondary)]">{copy.waveform.loading}</span>
            </div>
          ) : null}

          {!isSilent ? (
            <div className="pointer-events-none absolute inset-x-4 bottom-3">
              <p className="text-[11px] text-[var(--text-tertiary)]">{copy.waveform.dragHint}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
