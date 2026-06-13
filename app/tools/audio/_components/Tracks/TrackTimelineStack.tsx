'use client';

import {
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Focus,
  FolderPlus,
  GripVertical,
  Maximize2,
  Mic,
  Music4,
  Scissors,
  Trash2,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from '@/components/providers/locale-provider';
import { useTheme } from '@/components/providers/theme-provider';
import { renderWaveformOffscreen } from '@/lib/audio';
import { clamp, formatTime, getRangeStyle } from '../audio-editor-utils';

export type TimelineTrackSource = 'file' | 'recording' | 'empty';

export interface TimelineTrack {
  id: string;
  name: string;
  source: TimelineTrackSource;
  startTime: number;
  gain: number;
  muted: boolean;
  solo: boolean;
  isActive: boolean;
  buffer: AudioBuffer | null;
}

export interface TimelineSelection {
  start: number;
  end: number;
}

export interface TimelineRecordingState {
  active: boolean;
  paused: boolean;
  insertTime: number;
  elapsed: number;
}

interface TrackTimelineStackProps {
  tracks: TimelineTrack[];
  projectDuration: number;
  currentTime: number;
  isPlaying: boolean;
  zoom: number;
  selection: TimelineSelection | null;
  recording?: TimelineRecordingState | null;
  canPaste: boolean;
  canSplit: boolean;
  onZoomChange: (nextZoom: number) => void;
  onSelectTrack: (trackId: string) => void;
  onSeek: (time: number, trackId?: string) => void;
  onSelectionChange: (trackId: string, nextSelection: TimelineSelection) => void;
  onMoveTrackStart: (trackId: string) => void;
  onMoveTrack: (trackId: string, nextStartTime: number) => void;
  onRenameTrack: (trackId: string, nextName: string) => void;
  onReorderTrack: (trackId: string, direction: 'up' | 'down') => void;
  onAddTrack: () => void;
  onPaste: () => void;
  onSplit: () => void;
  onMuteToggle: (trackId: string) => void;
  onSoloToggle: (trackId: string) => void;
  onGainChange: (trackId: string, nextGain: number) => void;
  onRemoveTrack: (trackId: string) => void;
}

type Interaction =
  | { kind: 'scrub' }
  | {
      kind: 'move-clip';
      trackId: string;
      originStartTime: number;
      originClientX: number;
      ppsAtStart: number;
      clipDuration: number;
      moved: boolean;
    }
  | {
      kind: 'select-pending';
      trackId: string;
      anchor: number;
      clipStart: number;
      clipEnd: number;
      originX: number;
    }
  | { kind: 'select'; trackId: string; anchor: number; clipStart: number; clipEnd: number }
  | { kind: 'select-handle'; trackId: string; fixed: number; clipStart: number; clipEnd: number };

const HEADER_W = 176;
const LANE_PAD = 16;
const LANE_H = 96;
const MIN_ZOOM = 1;
const MAX_ZOOM = 32;
const DRAG_THRESHOLD_PX = 4;

const RULER_STEPS = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

function getTimelineCopy(locale: string) {
  if (locale === 'ko') {
    return {
      timeline: '멀티트랙',
      addTrack: '트랙 추가',
      empty: '트랙이 아직 없습니다.',
      emptyTrack: '빈 트랙',
      start: '시작',
      file: '파일',
      recording: '녹음',
      emptySource: '빈 트랙',
      mute: '뮤트',
      unmute: '뮤트 해제',
      solo: '솔로',
      unsolo: '솔로 해제',
      gain: '게인',
      remove: '삭제',
      dragTrack: '트랙 이동',
      playhead: '재생 헤드 이동',
      zoomIn: '확대',
      zoomOut: '축소',
      zoomFit: '화면에 맞추기',
      zoomSelection: '선택 구간 확대',
      paste: '플레이헤드에 붙여넣기',
      split: '플레이헤드에서 분할',
      recordingLane: '녹음 중...',
      renameHint: '더블클릭해서 이름 바꾸기',
      renameLabel: '트랙 이름',
      moveUp: '트랙 위로',
      moveDown: '트랙 아래로',
    };
  }

  return {
    timeline: 'Multitrack',
    addTrack: 'Add track',
    empty: 'No tracks yet.',
    emptyTrack: 'Empty track',
    start: 'Start',
    file: 'File',
    recording: 'Recording',
    emptySource: 'Empty',
    mute: 'Mute',
    unmute: 'Unmute',
    solo: 'Solo',
    unsolo: 'Solo off',
    gain: 'Gain',
    remove: 'Delete',
    dragTrack: 'Move track',
    playhead: 'Move playhead',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    zoomFit: 'Fit to view',
    zoomSelection: 'Zoom to selection',
    paste: 'Paste at playhead',
    split: 'Split at playhead',
    recordingLane: 'Recording...',
    renameHint: 'Double-click to rename',
    renameLabel: 'Track name',
    moveUp: 'Move track up',
    moveDown: 'Move track down',
  };
}

function getSourceIcon(source: TimelineTrackSource) {
  return source === 'recording' ? Mic : Music4;
}

function pickRulerStep(pixelsPerSecond: number) {
  for (const step of RULER_STEPS) {
    if (step * pixelsPerSecond >= 64) {
      return step;
    }
  }

  return RULER_STEPS[RULER_STEPS.length - 1];
}

function ClipWaveformWindow({
  buffer,
  clipWidth,
  windowLeft,
  windowWidth,
  height,
  theme,
  muted,
}: {
  buffer: AudioBuffer;
  clipWidth: number;
  windowLeft: number;
  windowWidth: number;
  height: number;
  theme: 'light' | 'dark';
  muted: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || windowWidth <= 0) {
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(windowWidth * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${windowWidth}px`;
    canvas.style.height = `${height}px`;

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.scale(dpr, dpr);
    context.clearRect(0, 0, windowWidth, height);

    const source = renderWaveformOffscreen(buffer, Math.max(256, Math.round(Math.min(clipWidth, 8192))), height, theme);
    const sourceWidth = source.width;
    const sx = clamp(windowLeft / Math.max(clipWidth, 1), 0, 1) * sourceWidth;
    const sw = Math.max(1, clamp(windowWidth / Math.max(clipWidth, 1), 0, 1) * sourceWidth);
    context.drawImage(source as CanvasImageSource, sx, 0, sw, source.height, 0, 0, windowWidth, height);

    if (muted) {
      context.fillStyle = theme === 'dark' ? 'rgba(2, 6, 23, 0.52)' : 'rgba(255, 255, 255, 0.44)';
      context.fillRect(0, 0, windowWidth, height);
    }
  }, [buffer, clipWidth, height, muted, theme, windowLeft, windowWidth]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute bottom-0"
      style={{ left: `${windowLeft}px`, top: '20px' }}
    />
  );
}

export function TrackTimelineStack({
  tracks,
  projectDuration,
  currentTime,
  isPlaying,
  zoom,
  selection,
  recording,
  canPaste,
  canSplit,
  onZoomChange,
  onSelectTrack,
  onSeek,
  onSelectionChange,
  onMoveTrackStart,
  onMoveTrack,
  onRenameTrack,
  onReorderTrack,
  onAddTrack,
  onPaste,
  onSplit,
  onMuteToggle,
  onSoloToggle,
  onGainChange,
  onRemoveTrack,
}: TrackTimelineStackProps) {
  const { locale } = useLocale();
  const { theme } = useTheme();
  const copy = getTimelineCopy(locale);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(960);
  const [scrollLeft, setScrollLeft] = useState(0);
  const scrollFrameRef = useRef<number | null>(null);
  const [interaction, setInteraction] = useState<Interaction | null>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const prevPpsRef = useRef<number | null>(null);
  const pendingFocusTimeRef = useRef<number | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const hoverFrameRef = useRef<number | null>(null);
  const hoverClientXRef = useRef(0);
  const [editingTrack, setEditingTrack] = useState<{ id: string; value: string } | null>(null);

  const recordingActive = Boolean(recording?.active);
  const recordingEnd = recordingActive ? (recording?.insertTime ?? 0) + (recording?.elapsed ?? 0) : 0;

  const safeDuration = Math.max(
    projectDuration + Math.max(0.5, projectDuration * 0.04),
    currentTime + 0.5,
    recordingEnd + 1,
    4,
  );

  const laneWidth = Math.round(Math.max(320, viewportWidth - HEADER_W) * clamp(zoom, MIN_ZOOM, MAX_ZOOM));
  const contentWidth = Math.max(laneWidth - LANE_PAD * 2, 160);
  const pixelsPerSecond = contentWidth / safeDuration;

  const timeToLaneX = (time: number) => LANE_PAD + time * pixelsPerSecond;
  const playheadLaneX = timeToLaneX(clamp(currentTime, 0, safeDuration));

  useEffect(() => {
    interactionRef.current = interaction ?? null;
  }, [interaction]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? 0;
      if (nextWidth > 0) {
        setViewportWidth(Math.floor(nextWidth));
      }
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Keep the visible center anchored when zoom changes; a pending focus time
  // (e.g. zoom-to-selection) takes priority over center preservation.
  useLayoutEffect(() => {
    const node = viewportRef.current;
    const prevPps = prevPpsRef.current;
    prevPpsRef.current = pixelsPerSecond;

    if (!node) {
      return;
    }

    const focusTime = pendingFocusTimeRef.current;
    if (focusTime != null) {
      pendingFocusTimeRef.current = null;
      node.scrollLeft = Math.max(0, HEADER_W + LANE_PAD + focusTime * pixelsPerSecond - viewportWidth / 2);
      setScrollLeft(node.scrollLeft);
      return;
    }

    if (prevPps == null || Math.abs(prevPps - pixelsPerSecond) < 0.0001) {
      return;
    }

    const centerTime = (node.scrollLeft + viewportWidth / 2 - HEADER_W - LANE_PAD) / prevPps;
    const nextScroll = centerTime * pixelsPerSecond + HEADER_W + LANE_PAD - viewportWidth / 2;
    node.scrollLeft = Math.max(0, nextScroll);
    setScrollLeft(node.scrollLeft);
  }, [pixelsPerSecond, viewportWidth]);

  // Ctrl/Cmd + wheel zooms; needs a non-passive listener to prevent page zoom.
  useEffect(() => {
    const node = viewportRef.current;
    if (!node) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.25 : 0.8;
      onZoomChange(clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM));
    };

    node.addEventListener('wheel', handleWheel, { passive: false });
    return () => node.removeEventListener('wheel', handleWheel);
  }, [onZoomChange, zoom]);

  // Follow the playhead during playback unless the user is interacting.
  useEffect(() => {
    const node = viewportRef.current;
    if (!node || !isPlaying || interactionRef.current) {
      return;
    }

    const playheadAbs = HEADER_W + playheadLaneX;
    const viewStart = node.scrollLeft + HEADER_W + 24;
    const viewEnd = node.scrollLeft + viewportWidth - 48;

    if (playheadAbs < viewStart || playheadAbs > viewEnd) {
      node.scrollLeft = Math.max(0, playheadAbs - HEADER_W - viewportWidth * 0.25);
      setScrollLeft(node.scrollLeft);
    }
  }, [isPlaying, playheadLaneX, viewportWidth]);

  const handleScroll = () => {
    if (scrollFrameRef.current != null) {
      return;
    }

    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      setScrollLeft(viewportRef.current?.scrollLeft ?? 0);
    });
  };

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current != null) {
        cancelAnimationFrame(scrollFrameRef.current);
      }
      if (hoverFrameRef.current != null) {
        cancelAnimationFrame(hoverFrameRef.current);
      }
    };
  }, []);

  const getTimeFromClientX = (clientX: number) => {
    const node = viewportRef.current;
    if (!node) {
      return 0;
    }

    const rect = node.getBoundingClientRect();
    const innerX = clientX - rect.left + node.scrollLeft;
    return clamp((innerX - HEADER_W - LANE_PAD) / pixelsPerSecond, 0, safeDuration);
  };

  // Magnetic snapping: clip edges, project bounds, playhead, and selection
  // bounds attract drags within an 8px radius. Hold Alt to bypass.
  const collectSnapTargets = (excludeTrackId?: string) => {
    const targets: number[] = [0, Math.max(projectDuration, 0), clamp(currentTime, 0, safeDuration)];

    for (const track of tracks) {
      if (track.id === excludeTrackId || !track.buffer) {
        continue;
      }
      const start = Math.max(0, track.startTime);
      targets.push(start, start + track.buffer.duration);
    }

    if (selection) {
      targets.push(selection.start, selection.end);
    }

    return targets;
  };

  const snapToTargets = (time: number, targets: number[], disabled: boolean) => {
    if (disabled) {
      return time;
    }

    const threshold = 8 / pixelsPerSecond;
    let best = time;
    let bestDistance = threshold;

    for (const target of targets) {
      const distance = Math.abs(time - target);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = target;
      }
    }

    return best;
  };

  const zoomToSelection = () => {
    if (!selection || selection.end - selection.start < 0.01) {
      return;
    }

    const selectionLength = selection.end - selection.start;
    const base = Math.max(320, viewportWidth - HEADER_W);
    const targetContent = (viewportWidth - HEADER_W) * 0.8 * (safeDuration / selectionLength);
    const nextZoom = clamp((targetContent + LANE_PAD * 2) / base, MIN_ZOOM, MAX_ZOOM);
    const focusTime = (selection.start + selection.end) / 2;

    if (Math.abs(nextZoom - zoom) < 0.001) {
      const node = viewportRef.current;
      if (node) {
        node.scrollLeft = Math.max(0, HEADER_W + LANE_PAD + focusTime * pixelsPerSecond - viewportWidth / 2);
        setScrollLeft(node.scrollLeft);
      }
      return;
    }

    pendingFocusTimeRef.current = focusTime;
    onZoomChange(nextZoom);
  };

  useEffect(() => {
    if (!interaction) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const time = getTimeFromClientX(event.clientX);
      const current = interactionRef.current;
      if (!current) {
        return;
      }

      const snapDisabled = event.altKey;

      if (current.kind === 'scrub') {
        const snapped = snapToTargets(time, collectSnapTargets(), snapDisabled);
        onSeek(clamp(snapped, 0, Math.max(projectDuration, 0)));
        return;
      }

      if (current.kind === 'move-clip') {
        if (!current.moved) {
          onMoveTrackStart(current.trackId);
          setInteraction({ ...current, moved: true });
        }

        // Delta-based dragging keeps the clip glued to the pointer even when
        // the timeline scale shifts as the project duration grows.
        let nextStart = Math.max(0, current.originStartTime + (event.clientX - current.originClientX) / current.ppsAtStart);

        if (!snapDisabled) {
          const targets = collectSnapTargets(current.trackId);
          const threshold = 8 / pixelsPerSecond;
          let bestAdjust = 0;
          let bestDistance = threshold;

          for (const target of targets) {
            const startDelta = target - nextStart;
            if (Math.abs(startDelta) < bestDistance) {
              bestDistance = Math.abs(startDelta);
              bestAdjust = startDelta;
            }
            const endDelta = target - (nextStart + current.clipDuration);
            if (Math.abs(endDelta) < bestDistance) {
              bestDistance = Math.abs(endDelta);
              bestAdjust = endDelta;
            }
          }

          nextStart = Math.max(0, nextStart + bestAdjust);
        }

        onMoveTrack(current.trackId, Number(nextStart.toFixed(3)));
        return;
      }

      if (current.kind === 'select-pending') {
        const node = viewportRef.current;
        const rect = node?.getBoundingClientRect();
        const innerX = rect ? event.clientX - rect.left + (node?.scrollLeft ?? 0) : 0;
        if (Math.abs(innerX - current.originX) < DRAG_THRESHOLD_PX) {
          return;
        }

        const next: Interaction = {
          kind: 'select',
          trackId: current.trackId,
          anchor: current.anchor,
          clipStart: current.clipStart,
          clipEnd: current.clipEnd,
        };
        setInteraction(next);
        interactionRef.current = next;
      }

      const active = interactionRef.current;
      if (!active || (active.kind !== 'select' && active.kind !== 'select-handle')) {
        return;
      }

      const selectionTargets = [active.clipStart, active.clipEnd, clamp(currentTime, 0, safeDuration)];
      const snapped = snapToTargets(time, selectionTargets, snapDisabled);
      const clamped = clamp(snapped, active.clipStart, active.clipEnd);
      const anchor = active.kind === 'select' ? active.anchor : active.fixed;

      onSelectionChange(active.trackId, {
        start: Math.min(anchor, clamped),
        end: Math.max(anchor, clamped),
      });
    };

    const handlePointerUp = () => {
      const current = interactionRef.current;
      if (current?.kind === 'select-pending') {
        // A click (no drag) on a clip moves the playhead to the clicked time.
        onSeek(clamp(current.anchor, 0, Math.max(projectDuration, 0)), current.trackId);
      }

      setInteraction(null);
      interactionRef.current = null;
      setHoverTime(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interaction, pixelsPerSecond, projectDuration, safeDuration]);

  const rulerStep = pickRulerStep(pixelsPerSecond);
  const rulerTicks = useMemo(() => {
    const count = Math.floor(safeDuration / rulerStep) + 1;
    return Array.from({ length: Math.min(count, 2000) }, (_, index) => index * rulerStep);
  }, [rulerStep, safeDuration]);

  const windowStart = Math.max(0, scrollLeft - viewportWidth * 0.5);
  const windowEnd = scrollLeft + viewportWidth * 1.5;

  const showPlayhead = tracks.length > 0 || recordingActive;

  return (
    <section data-testid="audio-track-timeline-stack" className="audio-panel overflow-hidden rounded-[20px]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <p className="audio-section-kicker mb-0">{copy.timeline}</p>
          <span className="audio-mono text-xs text-[var(--text-tertiary)]">{formatTime(Math.max(projectDuration, 0))}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-1.5 py-1">
            <button
              type="button"
              onClick={() => onZoomChange(clamp(zoom / 1.5, MIN_ZOOM, MAX_ZOOM))}
              disabled={zoom <= MIN_ZOOM}
              className="audio-icon-button audio-focus-ring h-7 w-7"
              aria-label={copy.zoomOut}
              title={copy.zoomOut}
            >
              <ZoomOut size={13} strokeWidth={1.5} />
            </button>
            <span className="audio-mono min-w-[3rem] text-center text-[11px] text-[var(--text-secondary)]">
              x{zoom >= 10 ? zoom.toFixed(0) : zoom.toFixed(1)}
            </span>
            <button
              type="button"
              onClick={() => onZoomChange(clamp(zoom * 1.5, MIN_ZOOM, MAX_ZOOM))}
              disabled={zoom >= MAX_ZOOM}
              className="audio-icon-button audio-focus-ring h-7 w-7"
              aria-label={copy.zoomIn}
              title={copy.zoomIn}
            >
              <ZoomIn size={13} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={() => onZoomChange(MIN_ZOOM)}
              disabled={zoom <= MIN_ZOOM}
              className="audio-icon-button audio-focus-ring h-7 w-7"
              aria-label={copy.zoomFit}
              title={copy.zoomFit}
            >
              <Maximize2 size={13} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={zoomToSelection}
              disabled={!selection || selection.end - selection.start < 0.01}
              className="audio-icon-button audio-focus-ring h-7 w-7"
              aria-label={copy.zoomSelection}
              title={copy.zoomSelection}
            >
              <Focus size={13} strokeWidth={1.5} />
            </button>
          </div>
          <button
            type="button"
            onClick={onSplit}
            disabled={!canSplit}
            className="audio-button-secondary audio-focus-ring h-8 px-2.5 text-xs"
            aria-label={copy.split}
            title={copy.split}
          >
            <Scissors size={13} strokeWidth={1.5} />
            <span className="hidden sm:inline">{copy.split}</span>
          </button>
          <button
            type="button"
            onClick={onPaste}
            disabled={!canPaste}
            className="audio-button-secondary audio-focus-ring h-8 px-2.5 text-xs"
            aria-label={copy.paste}
            title={copy.paste}
          >
            <ClipboardPaste size={13} strokeWidth={1.5} />
            <span className="hidden sm:inline">{copy.paste}</span>
          </button>
          <button type="button" onClick={onAddTrack} className="audio-button-secondary audio-focus-ring h-8 px-2.5 text-xs">
            <FolderPlus size={13} strokeWidth={1.5} />
            {copy.addTrack}
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        data-testid="audio-waveform-scroll"
        className="overflow-x-auto overflow-y-hidden bg-[var(--waveform-bg)]"
        onScroll={handleScroll}
      >
        <div className="relative" style={{ width: `${HEADER_W + laneWidth}px` }}>
          {/* Ruler */}
          <div className="flex border-b border-[var(--border)]">
            <div
              className="sticky left-0 z-30 flex h-7 shrink-0 items-center border-r border-[var(--border)] bg-[var(--topbar-bg)] px-3"
              style={{ width: `${HEADER_W}px` }}
            >
              <span className="audio-section-kicker mb-0">{copy.timeline}</span>
            </div>
            <div
              className="relative h-7 cursor-ew-resize select-none"
              style={{ width: `${laneWidth}px` }}
              onPointerDown={(event) => {
                event.preventDefault();
                onSeek(clamp(getTimeFromClientX(event.clientX), 0, Math.max(projectDuration, 0)));
                setInteraction({ kind: 'scrub' });
              }}
            >
              {rulerTicks.map((tick) => (
                <span
                  key={tick}
                  className="absolute bottom-0 top-0 flex flex-col justify-between"
                  style={{ left: `${timeToLaneX(tick)}px` }}
                >
                  <span className="audio-mono mt-0.5 -translate-x-1 text-[10px] leading-none text-[var(--text-tertiary)]">
                    {formatTime(tick, rulerStep < 1)}
                  </span>
                  <span className="block h-1.5 w-px bg-[var(--border-strong)]" />
                </span>
              ))}
            </div>
          </div>

          {/* Lanes */}
          <div
            className="relative"
            onPointerMove={(event) => {
              if (interactionRef.current) {
                return;
              }

              hoverClientXRef.current = event.clientX;
              if (hoverFrameRef.current != null) {
                return;
              }

              hoverFrameRef.current = requestAnimationFrame(() => {
                hoverFrameRef.current = null;
                if (!interactionRef.current) {
                  setHoverTime(getTimeFromClientX(hoverClientXRef.current));
                }
              });
            }}
            onPointerLeave={() => setHoverTime(null)}
          >
            {hoverTime != null && !interaction && showPlayhead ? (
              <div
                className="pointer-events-none absolute bottom-0 top-0 z-10"
                style={{ left: `${HEADER_W + timeToLaneX(hoverTime)}px` }}
              >
                <span className="absolute inset-y-0 left-0 w-px bg-[var(--text-tertiary)] opacity-40" />
                <span className="audio-mono absolute left-1.5 top-1 whitespace-nowrap rounded border border-[var(--border)] bg-[var(--bg-surface)] px-1 py-0.5 text-[10px] text-[var(--text-secondary)]">
                  {formatTime(hoverTime)}
                </span>
              </div>
            ) : null}

            {showPlayhead ? (
              <div
                data-testid="audio-playhead"
                className="absolute bottom-0 top-0 z-20 w-4 -translate-x-1/2 cursor-ew-resize"
                style={{ left: `${HEADER_W + playheadLaneX}px` }}
              >
                <button
                  type="button"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setInteraction({ kind: 'scrub' });
                  }}
                  className="absolute inset-y-0 left-1/2 w-4 -translate-x-1/2 bg-transparent"
                  aria-label={copy.playhead}
                >
                  <span className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-[var(--playhead)]" />
                  <span className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 rounded-full border border-[var(--bg-base)] bg-[var(--playhead)]" />
                </button>
              </div>
            ) : null}

            {tracks.length === 0 && !recordingActive ? (
              <div className="flex">
                <div
                  className="sticky left-0 z-30 shrink-0 border-r border-[var(--border)] bg-[var(--bg-surface)]"
                  style={{ width: `${HEADER_W}px` }}
                />
                <div className="px-4 py-8 text-sm text-[var(--text-secondary)]">{copy.empty}</div>
              </div>
            ) : null}

            {tracks.map((track, trackIndex) => {
              const buffer = track.buffer;
              const clipDuration = buffer?.duration ?? 0;
              const clipStart = Math.max(0, track.startTime);
              const clipEnd = clipStart + clipDuration;
              const clipLeft = timeToLaneX(clipStart);
              const clipWidth = buffer ? Math.max(clipDuration * pixelsPerSecond, 24) : 0;

              const selOverlapStart = selection ? Math.max(selection.start, clipStart) : null;
              const selOverlapEnd = selection ? Math.min(selection.end, clipEnd) : null;
              const hasSelectionOnClip =
                track.isActive &&
                buffer != null &&
                selOverlapStart != null &&
                selOverlapEnd != null &&
                selOverlapEnd - selOverlapStart > 0.0005;

              const selStartPct = hasSelectionOnClip && clipDuration > 0 ? ((selOverlapStart! - clipStart) / clipDuration) * 100 : 0;
              const selEndPct = hasSelectionOnClip && clipDuration > 0 ? ((selOverlapEnd! - clipStart) / clipDuration) * 100 : 100;

              const SourceIcon = getSourceIcon(track.source);
              const trackLabel = track.source === 'empty' ? `${copy.emptyTrack} ${trackIndex + 1}` : track.name;

              const clipAbsLeft = HEADER_W + clipLeft;
              const winLeft = clamp(windowStart - clipAbsLeft, 0, Math.max(clipWidth - 1, 0));
              const winWidth = clamp(windowEnd - clipAbsLeft, 0, clipWidth) - winLeft;

              return (
                <div
                  key={track.id}
                  data-testid="audio-track-stack-row"
                  className={`flex border-b border-[var(--border)] ${track.isActive ? '' : 'opacity-95'}`}
                >
                  {/* Mixer cell */}
                  <div
                    className={`sticky left-0 z-30 shrink-0 border-r px-3 py-2 ${
                      track.isActive
                        ? 'border-[var(--accent)] bg-[var(--bg-surface)]'
                        : 'border-[var(--border)] bg-[var(--bg-surface)]'
                    }`}
                    style={{ width: `${HEADER_W}px` }}
                  >
                    <div className="flex items-center gap-1">
                      {editingTrack?.id === track.id ? (
                        <input
                          autoFocus
                          type="text"
                          value={editingTrack.value}
                          aria-label={copy.renameLabel}
                          onChange={(event) => setEditingTrack({ id: track.id, value: event.target.value })}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              onRenameTrack(track.id, editingTrack.value);
                              setEditingTrack(null);
                            }
                            if (event.key === 'Escape') {
                              setEditingTrack(null);
                            }
                          }}
                          onBlur={() => {
                            onRenameTrack(track.id, editingTrack.value);
                            setEditingTrack(null);
                          }}
                          className="audio-field audio-focus-ring h-6 min-w-0 flex-1 px-1.5 text-[12px]"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSelectTrack(track.id)}
                          onDoubleClick={() => {
                            if (track.source !== 'empty') {
                              setEditingTrack({ id: track.id, value: track.name });
                            }
                          }}
                          className={`min-w-0 flex-1 truncate text-left text-[13px] font-medium transition ${
                            track.isActive
                              ? 'text-[var(--text-primary)]'
                              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                          title={`${trackLabel} · ${copy.renameHint}`}
                        >
                          {trackLabel}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onReorderTrack(track.id, 'up')}
                        disabled={trackIndex === 0}
                        className="audio-focus-ring inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[var(--border)] text-[var(--text-tertiary)] transition hover:text-[var(--text-primary)] disabled:opacity-30"
                        aria-label={copy.moveUp}
                        title={copy.moveUp}
                      >
                        <ChevronUp size={11} strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onReorderTrack(track.id, 'down')}
                        disabled={trackIndex === tracks.length - 1}
                        className="audio-focus-ring inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[var(--border)] text-[var(--text-tertiary)] transition hover:text-[var(--text-primary)] disabled:opacity-30"
                        aria-label={copy.moveDown}
                        title={copy.moveDown}
                      >
                        <ChevronDown size={11} strokeWidth={1.5} />
                      </button>
                      <SourceIcon size={12} strokeWidth={1.5} className="shrink-0 text-[var(--text-tertiary)]" />
                    </div>
                    <p className="audio-mono mt-0.5 text-[10px] text-[var(--text-tertiary)]">
                      {copy.start} {formatTime(clipStart, false)}
                      {buffer ? ` · ${formatTime(clipDuration, false)}` : ` · ${copy.emptySource}`}
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onMuteToggle(track.id)}
                        className={`audio-focus-ring inline-flex h-6 w-6 items-center justify-center rounded-md border text-[10px] font-semibold transition ${
                          track.muted
                            ? 'border-[var(--accent)] bg-[rgba(0,212,200,0.14)] text-[var(--accent)]'
                            : 'border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                        aria-label={track.muted ? copy.unmute : copy.mute}
                        aria-pressed={track.muted}
                        title={track.muted ? copy.unmute : copy.mute}
                      >
                        {track.muted ? <VolumeX size={12} strokeWidth={1.5} /> : <Volume2 size={12} strokeWidth={1.5} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => onSoloToggle(track.id)}
                        className={`audio-focus-ring inline-flex h-6 w-6 items-center justify-center rounded-md border text-[10px] font-semibold transition ${
                          track.solo
                            ? 'border-[var(--accent)] bg-[rgba(0,212,200,0.14)] text-[var(--accent)]'
                            : 'border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                        aria-label={track.solo ? copy.unsolo : copy.solo}
                        aria-pressed={track.solo}
                        title={track.solo ? copy.unsolo : copy.solo}
                      >
                        S
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={2}
                        step={0.05}
                        value={track.gain}
                        onChange={(event) => onGainChange(track.id, Number(event.target.value))}
                        style={getRangeStyle(track.gain, 0, 2)}
                        className="audio-range audio-focus-ring min-w-0 flex-1"
                        aria-label={`${copy.gain} ${trackLabel}`}
                        title={`${copy.gain} ${track.gain.toFixed(2)}`}
                      />
                      <button
                        type="button"
                        onClick={() => onRemoveTrack(track.id)}
                        className="audio-focus-ring inline-flex h-6 w-6 items-center justify-center rounded-md border border-[rgba(255,77,77,0.35)] text-[var(--status-recording)] transition hover:bg-[rgba(255,77,77,0.12)]"
                        aria-label={copy.remove}
                        title={copy.remove}
                      >
                        <Trash2 size={12} strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>

                  {/* Lane */}
                  <div
                    className="relative"
                    style={{ width: `${laneWidth}px`, height: `${LANE_H}px` }}
                    onPointerDown={(event) => {
                      const target = event.target as HTMLElement;
                      if (target.closest('[data-track-clip]')) {
                        return;
                      }

                      event.preventDefault();
                      onSelectTrack(track.id);
                      onSeek(clamp(getTimeFromClientX(event.clientX), 0, Math.max(projectDuration, 0)), track.id);
                      setInteraction({ kind: 'scrub' });
                    }}
                  >
                    <div
                      className="pointer-events-none absolute inset-y-1 opacity-20"
                      style={{
                        left: `${LANE_PAD}px`,
                        right: `${LANE_PAD}px`,
                        backgroundImage:
                          'linear-gradient(to right, var(--border) 0, var(--border) 1px, transparent 1px, transparent 100%)',
                        backgroundSize: `${Math.max(rulerStep * pixelsPerSecond, 24)}px 100%`,
                      }}
                    />
                    <div className="pointer-events-none absolute inset-x-4 top-1/2 h-px -translate-y-1/2 bg-[var(--border)] opacity-60" />

                    {buffer ? (
                      <div
                        data-track-clip
                        data-testid="audio-track-waveform-surface"
                        className={`absolute inset-y-1 select-none overflow-hidden rounded-[10px] ${
                          track.isActive
                            ? 'bg-[rgba(0,212,200,0.10)] ring-1 ring-[var(--accent)]'
                            : 'bg-[rgba(0,212,200,0.05)] ring-1 ring-[rgba(127,127,127,0.25)]'
                        }`}
                        style={{ left: `${clipLeft}px`, width: `${clipWidth}px` }}
                        onPointerDown={(event) => {
                          const target = event.target as HTMLElement;
                          if (target.closest('[data-selection-handle]') || target.closest('[data-track-grip]')) {
                            return;
                          }

                          event.preventDefault();
                          event.stopPropagation();
                          onSelectTrack(track.id);

                          const node = viewportRef.current;
                          const rect = node?.getBoundingClientRect();
                          const originX = rect ? event.clientX - rect.left + (node?.scrollLeft ?? 0) : 0;
                          const anchor = clamp(getTimeFromClientX(event.clientX), clipStart, clipEnd);
                          setInteraction({
                            kind: 'select-pending',
                            trackId: track.id,
                            anchor,
                            clipStart,
                            clipEnd,
                            originX,
                          });
                        }}
                      >
                        {/* Grip strip: drag to move the clip in time */}
                        <div
                          data-track-grip
                          data-testid="audio-track-drag-handle"
                          className={`absolute inset-x-0 top-0 z-10 flex h-5 cursor-grab items-center gap-1 px-2 text-[10px] ${
                            track.isActive
                              ? 'bg-[rgba(0,212,200,0.18)] text-[var(--text-primary)]'
                              : 'bg-[rgba(127,127,127,0.14)] text-[var(--text-secondary)]'
                          }`}
                          onPointerDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onSelectTrack(track.id);
                            setInteraction({
                              kind: 'move-clip',
                              trackId: track.id,
                              originStartTime: clipStart,
                              originClientX: event.clientX,
                              ppsAtStart: pixelsPerSecond,
                              clipDuration,
                              moved: false,
                            });
                          }}
                          title={copy.dragTrack}
                        >
                          <GripVertical size={10} strokeWidth={1.5} className="shrink-0" />
                          <span className="truncate">{trackLabel}</span>
                        </div>

                        <ClipWaveformWindow
                          buffer={buffer}
                          clipWidth={clipWidth}
                          windowLeft={winLeft}
                          windowWidth={winWidth}
                          height={LANE_H - 8 - 20}
                          theme={theme}
                          muted={track.muted}
                        />

                        {track.isActive ? (
                          <>
                            {hasSelectionOnClip ? (
                              <div
                                data-testid="audio-selection-overlay"
                                className="pointer-events-none absolute inset-y-0 bg-[var(--selection-bg)]"
                                style={{
                                  left: `${selStartPct}%`,
                                  width: `${Math.max(selEndPct - selStartPct, 0.4)}%`,
                                  boxShadow: 'inset 2px 0 0 var(--selection-border), inset -2px 0 0 var(--selection-border)',
                                }}
                              />
                            ) : null}

                            <button
                              type="button"
                              data-selection-handle="start"
                              data-testid="audio-selection-handle-start"
                              className="absolute inset-y-1 z-10 w-4 -translate-x-1/2 cursor-col-resize rounded-full bg-transparent"
                              style={{ left: hasSelectionOnClip ? `${selStartPct}%` : '8px' }}
                              aria-label="Selection start"
                              onPointerDown={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                onSelectTrack(track.id);
                                setInteraction({
                                  kind: 'select-handle',
                                  trackId: track.id,
                                  fixed: hasSelectionOnClip ? selOverlapEnd! : clipEnd,
                                  clipStart,
                                  clipEnd,
                                });
                              }}
                            >
                              <span className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 rounded-full bg-[var(--selection-border)]" />
                              <span className="absolute left-1/2 top-1.5 h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-[var(--waveform-handle-outline)] bg-[var(--selection-border)]" />
                              <span className="absolute bottom-1.5 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-[var(--waveform-handle-outline)] bg-[var(--selection-border)]" />
                            </button>
                            <button
                              type="button"
                              data-selection-handle="end"
                              data-testid="audio-selection-handle-end"
                              className="absolute inset-y-1 z-10 w-4 -translate-x-1/2 cursor-col-resize rounded-full bg-transparent"
                              style={{ left: hasSelectionOnClip ? `${selEndPct}%` : 'calc(100% - 8px)' }}
                              aria-label="Selection end"
                              onPointerDown={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                onSelectTrack(track.id);
                                setInteraction({
                                  kind: 'select-handle',
                                  trackId: track.id,
                                  fixed: hasSelectionOnClip ? selOverlapStart! : clipStart,
                                  clipStart,
                                  clipEnd,
                                });
                              }}
                            >
                              <span className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 rounded-full bg-[var(--selection-border)]" />
                              <span className="absolute left-1/2 top-1.5 h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-[var(--waveform-handle-outline)] bg-[var(--selection-border)]" />
                              <span className="absolute bottom-1.5 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-[var(--waveform-handle-outline)] bg-[var(--selection-border)]" />
                            </button>
                          </>
                        ) : null}
                      </div>
                    ) : (
                      <div
                        data-testid="audio-track-empty-lane"
                        className={`absolute inset-y-1 flex items-center rounded-[10px] border border-dashed px-4 text-sm ${
                          track.isActive
                            ? 'border-[var(--accent)] text-[var(--text-primary)]'
                            : 'border-[var(--border)] text-[var(--text-secondary)]'
                        }`}
                        style={{ left: `${LANE_PAD}px`, right: `${LANE_PAD}px` }}
                      >
                        {copy.emptyTrack}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {recordingActive ? (
              <div data-testid="audio-recording-lane" className="flex border-b border-[var(--border)]">
                <div
                  className="sticky left-0 z-30 flex shrink-0 items-center gap-2 border-r border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2"
                  style={{ width: `${HEADER_W}px` }}
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full bg-[var(--status-recording)] ${recording?.paused ? '' : 'animate-pulse'}`}
                  />
                  <span className="text-[13px] text-[var(--text-secondary)]">{copy.recordingLane}</span>
                </div>
                <div className="relative" style={{ width: `${laneWidth}px`, height: `${LANE_H}px` }}>
                  <div
                    className="absolute inset-y-2 rounded-[10px] bg-[rgba(255,77,77,0.16)] ring-1 ring-[rgba(255,77,77,0.45)]"
                    style={{
                      left: `${timeToLaneX(recording?.insertTime ?? 0)}px`,
                      width: `${Math.max((recording?.elapsed ?? 0) * pixelsPerSecond, 6)}px`,
                    }}
                  >
                    <span className="audio-mono absolute left-2 top-1 text-[10px] text-[var(--status-recording)]">
                      {formatTime(recording?.elapsed ?? 0)}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
