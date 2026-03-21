'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale } from '@/components/providers/locale-provider';
import { renderWaveformOffscreen } from '@/lib/audio';
import { clamp } from '../audio-editor-utils';
import { getAudioEditorCopy } from '../audio-editor-copy';
import { PlayheadOverlay } from './PlayheadOverlay';
import { WaveformTimeline } from './WaveformTimeline';

type DragMode = 'selection' | 'start' | 'end';

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
  showPlayhead?: boolean;
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
  showPlayhead = true,
  onSeek,
  onSelectionChange,
}: WaveformCanvasProps) {
  const { locale } = useLocale();
  const copy = getAudioEditorCopy(locale);
  const [baseWidth, setBaseWidth] = useState(0);
  const [dragMode, setDragMode] = useState<DragMode | null>(null);
  const [scrollNode, setScrollNode] = useState<HTMLDivElement | null>(null);
  const [canvasNode, setCanvasNode] = useState<HTMLCanvasElement | null>(null);
  const dragAnchorRef = useRef<number | null>(null);
  const dragStartXRef = useRef<number | null>(null);
  const didDragRef = useRef(false);
  const dragSelectionRef = useRef({ start: 0, end: 0 });
  const theme: 'light' | 'dark' = 'dark';
  const viewportWidth = Math.max(baseWidth || 0, 320);
  const canvasWidth = Math.max(280, Math.round(viewportWidth * zoom));
  const safeDuration = Math.max(duration, 0.001);
  const startPercent = clamp(selectionStart / safeDuration, 0, 1);
  const endPercent = clamp(selectionEnd / safeDuration, 0, 1);
  const playheadPercent = clamp(currentTime / safeDuration, 0, 1);
  const selectionWidth = Math.max((endPercent - startPercent) * 100, 0.4);
  const isFullSelection = duration > 0 && startPercent <= 0.001 && endPercent >= 0.999;
  const needsHorizontalScroll = canvasWidth > viewportWidth + 1;

  useEffect(() => {
    if (!scrollNode || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? 0;
      setBaseWidth(Math.max(280, Math.floor(nextWidth)));
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

    const source = renderWaveformOffscreen(audioBuffer, canvasWidth, height, theme);
    context.drawImage(source as CanvasImageSource, 0, 0, source.width, source.height, 0, 0, canvasWidth, height);
  }, [audioBuffer, canvasNode, canvasWidth, theme]);

  const getPositionFromClientX = (clientX: number) => {
    if (!scrollNode) {
      return { time: 0, x: 0 };
    }

    const rect = scrollNode.getBoundingClientRect();
    const x = clamp(clientX - rect.left + scrollNode.scrollLeft, 0, canvasWidth);
    const ratio = clamp(x / canvasWidth, 0, 1);

    return {
      x,
      time: ratio * safeDuration,
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!audioBuffer) {
      return;
    }

    const { time, x } = getPositionFromClientX(event.clientX);
    const target = event.target as HTMLElement;
    const handle = target.closest<HTMLElement>('[data-waveform-handle]')?.dataset.waveformHandle as DragMode | undefined;
    const startX = startPercent * canvasWidth;
    const endX = endPercent * canvasWidth;
    const thresholdPx = 14;
    const mode: DragMode =
      handle ??
      (Math.abs(x - startX) <= thresholdPx
        ? 'start'
        : Math.abs(x - endX) <= thresholdPx
          ? 'end'
          : 'selection');

    setDragMode(mode);
    dragAnchorRef.current = time;
    dragStartXRef.current = x;
    didDragRef.current = false;
    dragSelectionRef.current = { start: selectionStart, end: selectionEnd };
    event.currentTarget.setPointerCapture(event.pointerId);

  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragMode) {
      return;
    }

    const { time, x } = getPositionFromClientX(event.clientX);
    if (dragStartXRef.current != null && Math.abs(x - dragStartXRef.current) > 4) {
      didDragRef.current = true;
    }

    if (dragMode === 'start') {
      onSelectionChange({ start: time, end: dragSelectionRef.current.end });
      return;
    }

    if (dragMode === 'end') {
      onSelectionChange({ start: dragSelectionRef.current.start, end: time });
      return;
    }

    const anchor = dragAnchorRef.current ?? selectionStart;
    if (didDragRef.current) {
      onSelectionChange({ start: anchor, end: time });
    }
  };

  const resetDragState = () => {
    setDragMode(null);
    dragAnchorRef.current = null;
    dragStartXRef.current = null;
    didDragRef.current = false;
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragMode === 'selection' && !didDragRef.current) {
      const { time } = getPositionFromClientX(event.clientX);
      onSeek(time);
    }

    resetDragState();
  };

  const handlePointerCancel = () => {
    resetDragState();
  };

  return (
    <div className="space-y-0">
      <WaveformTimeline duration={duration} zoom={zoom} />
      <div
        ref={setScrollNode}
        className={`rounded-b-[18px] bg-[var(--waveform-bg)] ${needsHorizontalScroll ? 'overflow-x-auto' : 'overflow-x-hidden'}`}
        data-testid="audio-waveform-scroll"
      >
        <div
          className="relative h-36 min-w-full select-none touch-none"
          style={{ width: `${canvasWidth}px` }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          {isLoading ? <div className="audio-loading-skeleton absolute inset-0" /> : null}
          <canvas ref={setCanvasNode} className="absolute inset-0 h-full w-full" />

          <button
            type="button"
            data-waveform-handle="start"
            data-testid="audio-selection-handle-start"
            className="absolute inset-y-2 z-20 w-4 -translate-x-1/2 cursor-col-resize rounded-full bg-transparent"
            style={{ left: `${startPercent * 100}%` }}
            aria-label="Selection start"
          >
            <span className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 rounded-full bg-[var(--selection-border)]" />
            <span className="absolute left-1/2 top-1.5 h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-[rgba(14,15,17,0.82)] bg-[var(--selection-border)]" />
            <span className="absolute bottom-1.5 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-[rgba(14,15,17,0.82)] bg-[var(--selection-border)]" />
          </button>
          <button
            type="button"
            data-waveform-handle="end"
            data-testid="audio-selection-handle-end"
            className="absolute inset-y-2 z-20 w-4 -translate-x-1/2 cursor-col-resize rounded-full bg-transparent"
            style={{ left: `${endPercent * 100}%` }}
            aria-label="Selection end"
          >
            <span className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 rounded-full bg-[var(--selection-border)]" />
            <span className="absolute left-1/2 top-1.5 h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-[rgba(14,15,17,0.82)] bg-[var(--selection-border)]" />
            <span className="absolute bottom-1.5 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-[rgba(14,15,17,0.82)] bg-[var(--selection-border)]" />
          </button>

          {showPlayhead ? <PlayheadOverlay positionPercent={playheadPercent} currentTime={currentTime} /> : null}

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

          {!isSilent && selectionWidth > 0 && !isFullSelection ? (
            <div
              data-testid="audio-selection-overlay"
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 border-y border-[var(--selection-border)] bg-[var(--selection-bg)]"
              style={{
                left: `${startPercent * 100}%`,
                width: `${selectionWidth}%`,
                boxShadow: 'inset 2px 0 0 var(--selection-border), inset -2px 0 0 var(--selection-border)',
              }}
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
