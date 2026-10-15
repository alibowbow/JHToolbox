'use client';

import { Film, Music, Type, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { renderWaveformOffscreen } from '@/lib/audio/WaveformRenderer';
import { formatEditorTime } from '@/components/ui/video-editor-utils';
import { cx } from '@/lib/utils';
import {
  clipLength,
  dragMusic,
  dragText,
  dropIndex,
  layoutClips,
  moveClip,
  musicLength,
  nearestSnap,
  snapPoints,
  trimClip,
  type Drag,
  type ItemRef,
  type Project,
} from '@/lib/video-editor/project';
import type { RuntimeAsset } from './engine';
import type { VideoEditorCopy } from './copy';

const SNAP_PIXELS = 8;
const GUTTER = 36;

type DragState =
  | { mode: 'seek'; deselect?: boolean }
  | { mode: 'item'; ref: ItemRef; kind: Drag; x: number; origin: Project; moved: boolean }
  | { mode: 'reorder'; index: number; x: number; origin: Project; moved: boolean };

function niceStep(pxPerSecond: number) {
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  return steps.find((step) => step * pxPerSecond >= 70) ?? 600;
}

/** A music item's waveform, the part of the file it plays. */
function WaveformStrip({ buffer, from, to, width }: { buffer?: AudioBuffer; from: number; to: number; width: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !buffer) return;
    const ratio = window.devicePixelRatio || 1;
    const cssWidth = Math.min(4000, Math.max(1, width));
    canvas.width = Math.max(1, Math.round(cssWidth * ratio));
    canvas.height = Math.round(28 * ratio);
    const context = canvas.getContext('2d');
    if (!context) return;
    const dark = document.documentElement.classList.contains('dark');
    const source = renderWaveformOffscreen(buffer, 2048, canvas.height, dark ? 'dark' : 'light', dark ? '#a7f3d0' : '#047857');
    const sx = (from / buffer.duration) * source.width;
    const sw = Math.max(1, ((to - from) / buffer.duration) * source.width);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source as CanvasImageSource, sx, 0, sw, source.height, 0, 0, canvas.width, canvas.height);
  }, [buffer, from, to, width]);
  return <canvas ref={ref} className="pointer-events-none h-7 w-full" aria-hidden="true" />;
}

export function Timeline({
  project,
  assets,
  time,
  playing,
  pxPerSecond,
  selected,
  copy,
  onSelect,
  onSeek,
  onLive,
  onCommit,
}: {
  project: Project;
  assets: Record<string, RuntimeAsset>;
  time: number;
  playing: boolean;
  pxPerSecond: number;
  selected: ItemRef | null;
  copy: VideoEditorCopy;
  onSelect: (ref: ItemRef | null) => void;
  onSeek: (time: number) => void;
  /** A change while dragging (not yet an undo step). */
  onLive: (next: Project) => void;
  /** The end of a drag: `origin` is what undo goes back to. */
  onCommit: (origin: Project, next: Project) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [guide, setGuide] = useState<number | null>(null);
  const [reorder, setReorder] = useState<{ index: number; dx: number; to: number } | null>(null);

  const placed = layoutClips(project);
  const duration = placed.length ? placed[placed.length - 1].end : 0;
  const lastItemEnd = Math.max(
    duration,
    ...project.texts.map((item) => item.end),
    ...project.music.map((item) => item.offset + musicLength(item)),
  );
  const contentWidth = (lastItemEnd + 6) * pxPerSecond;
  const x = (seconds: number) => seconds * pxPerSecond;
  const step = niceStep(pxPerSecond);

  // Keep the playhead in view while playing.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !playing) return;
    const px = GUTTER + x(time);
    if (px > scroller.scrollLeft + scroller.clientWidth - 40) scroller.scrollLeft = px - 80;
    else if (px < scroller.scrollLeft + GUTTER) scroller.scrollLeft = Math.max(0, px - 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follows the playhead only
  }, [time, playing]);

  const timeAt = (clientX: number) => {
    const scroller = scrollRef.current;
    if (!scroller) return 0;
    const rect = scroller.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left + scroller.scrollLeft - GUTTER) / pxPerSecond);
  };

  const begin = (state: DragState) => (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = state;
    if (state.mode === 'seek') {
      onSeek(timeAt(event.clientX));
      if (state.deselect) onSelect(null);
    }
    if (state.mode === 'item') onSelect(state.ref);
    if (state.mode === 'reorder') onSelect({ kind: 'clip', id: project.clips[state.index].id });
  };

  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.mode === 'seek') {
      onSeek(timeAt(event.clientX));
      return;
    }
    const dx = event.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < 3) return;
    drag.moved = true;
    const delta = dx / pxPerSecond;
    const threshold = SNAP_PIXELS / pxPerSecond;

    if (drag.mode === 'reorder') {
      const origin = layoutClips(drag.origin)[drag.index];
      const to = dropIndex(drag.origin, origin.start + (origin.end - origin.start) / 2 + delta, drag.index);
      setReorder({ index: drag.index, dx, to });
      return;
    }

    const { ref, kind, origin } = drag;
    if (ref.kind === 'text') {
      const item = origin.texts.find((entry) => entry.id === ref.id);
      if (!item) return;
      const result = dragText(item, kind, delta, snapPoints(origin, time, ref), threshold);
      setGuide(result.guide);
      onLive({ ...origin, texts: origin.texts.map((entry) => (entry.id === ref.id ? result.item : entry)) });
    } else if (ref.kind === 'music') {
      const item = origin.music.find((entry) => entry.id === ref.id);
      if (!item) return;
      const result = dragMusic(item, kind, delta, assets[item.assetId]?.info.duration ?? item.out, snapPoints(origin, time, ref), threshold);
      setGuide(result.guide);
      onLive({ ...origin, music: origin.music.map((entry) => (entry.id === ref.id ? result.item : entry)) });
    } else {
      const entry = layoutClips(origin).find((candidate) => candidate.clip.id === ref.id);
      if (!entry) return;
      let shift = delta;
      let stuck: number | null = null;
      if (kind === 'end') {
        // The end edge sticks to the playhead, texts and music.
        const points = snapPoints({ ...origin, clips: [] }, time).filter((point) => point > entry.start);
        const snap = nearestSnap([entry.end + delta], points, threshold);
        if (snap) {
          shift += snap.shift;
          stuck = snap.point;
        }
      }
      const next = trimClip(origin, ref.id, kind === 'start' ? 'start' : 'end', shift, assets[entry.clip.assetId]?.info);
      const after = layoutClips(next).find((candidate) => candidate.clip.id === ref.id);
      setGuide(stuck !== null && after && Math.abs(after.end - stuck) < 0.002 ? stuck : null);
      onLive(next);
    }
  };

  const end = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setGuide(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!drag || drag.mode === 'seek' || !drag.moved) {
      setReorder(null);
      return;
    }
    if (drag.mode === 'reorder') {
      const to = reorder?.to ?? drag.index;
      setReorder(null);
      if (to !== drag.index) onCommit(drag.origin, moveClip(drag.origin, drag.index, to));
      return;
    }
    onCommit(drag.origin, project);
  };

  const handlers = { onPointerMove: move, onPointerUp: end, onPointerCancel: end };
  const isSelected = (kind: ItemRef['kind'], id: string) => selected?.kind === kind && selected.id === id;

  const edges = (ref: ItemRef, tone: string) =>
    (['start', 'end'] as const).map((edge) => (
      <span
        key={edge}
        role="slider"
        tabIndex={-1}
        aria-label={`${edge === 'start' ? copy.starts : copy.ends}`}
        aria-valuenow={0}
        onPointerDown={withX({ mode: 'item', ref, kind: edge, x: 0, origin: project, moved: false })}
        {...handlers}
        className={cx(
          'absolute inset-y-0 z-10 flex w-2.5 cursor-ew-resize touch-none items-center justify-center',
          tone,
          edge === 'start' ? 'left-0 rounded-l-[5px]' : 'right-0 rounded-r-[5px]',
        )}
        data-testid={`ve-edge-${ref.kind}-${edge}`}
      >
        <span className="h-4 w-0.5 rounded-full bg-white/90" />
      </span>
    ));

  // Pointer positions are measured from where each drag begins.
  const withX = (state: DragState) => (event: ReactPointerEvent<HTMLElement>) => {
    if ('x' in state) (state as { x: number }).x = event.clientX;
    begin(state)(event);
  };

  return (
    <div className="select-none rounded-xl border border-border bg-base-subtle/60" data-testid="ve-timeline">
      <div ref={scrollRef} className="relative overflow-x-auto overflow-y-hidden">
        <div className="relative" style={{ width: GUTTER + contentWidth, minWidth: '100%' }}>
          {/* Ruler */}
          <div
            className="relative h-6 cursor-pointer border-b border-border"
            style={{ marginLeft: GUTTER }}
            onPointerDown={begin({ mode: 'seek' })}
            {...handlers}
            data-testid="ve-ruler"
          >
            {Array.from({ length: Math.ceil((lastItemEnd + 6) / step) + 1 }, (_, index) => index * step).map((tick) => (
              <span key={tick} className="absolute top-0 h-full border-l border-border-bright pl-1 text-[10px] tabular-nums text-ink-faint" style={{ left: x(tick) }}>
                {formatEditorTime(tick).replace(/\.\d+$/, '')}
              </span>
            ))}
          </div>

          {/* Text track */}
          <div className="relative flex h-9 items-center border-b border-border">
            <span className="sticky left-0 z-20 flex h-full w-9 shrink-0 items-center justify-center bg-base-subtle text-ink-faint" title={copy.textTrack}>
              <Type size={14} aria-hidden="true" />
            </span>
            <div className="relative h-full flex-1" onPointerDown={begin({ mode: 'seek', deselect: true })} {...handlers}>
              {project.texts.map((item) => {
                const ref = { kind: 'text' as const, id: item.id };
                return (
                  <div
                    key={item.id}
                    onPointerDown={withX({ mode: 'item', ref, kind: 'move', x: 0, origin: project, moved: false })}
                    {...handlers}
                    className={cx(
                      'absolute inset-y-1 cursor-grab touch-none overflow-hidden rounded-md border px-3 text-[11px] font-semibold leading-[26px] active:cursor-grabbing',
                      isSelected('text', item.id) ? 'border-amber-300 bg-amber-500/40 text-ink' : 'border-amber-500/50 bg-amber-500/20 text-amber-800 dark:text-amber-200',
                    )}
                    style={{ left: x(item.start), width: Math.max(8, x(item.end - item.start)) }}
                    data-testid={`ve-text-${item.id}`}
                  >
                    <span className="pointer-events-none block truncate">{item.text || '…'}</span>
                    {isSelected('text', item.id) ? edges(ref, 'bg-amber-500') : null}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Main track */}
          <div className="relative flex h-16 items-center border-b border-border">
            <span className="sticky left-0 z-20 flex h-full w-9 shrink-0 items-center justify-center bg-base-subtle text-ink-faint" title={copy.mainTrack}>
              <Film size={14} aria-hidden="true" />
            </span>
            <div className="relative h-full flex-1" onPointerDown={begin({ mode: 'seek', deselect: true })} {...handlers}>
              {placed.map((entry) => {
                const { clip } = entry;
                const asset = assets[clip.assetId];
                const ref = { kind: 'clip' as const, id: clip.id };
                const frames = asset?.frames ?? [];
                const inside = frames.filter(([t]) => t >= clip.in && t <= clip.out);
                const shown = inside.length ? inside : frames.slice(0, 1);
                const dragging = reorder?.index === entry.index;
                return (
                  <div
                    key={clip.id}
                    onPointerDown={withX({ mode: 'reorder', index: entry.index, x: 0, origin: project, moved: false })}
                    {...handlers}
                    className={cx(
                      'absolute inset-y-1 cursor-grab touch-none overflow-hidden rounded-md border-2 bg-base-elevated active:cursor-grabbing',
                      isSelected('clip', clip.id) ? 'border-white ring-2 ring-prime' : 'border-sky-500/60',
                      dragging && 'z-30 opacity-80 shadow-lg',
                    )}
                    style={{ left: x(entry.start), width: Math.max(6, x(clipLength(clip)) - 2), transform: dragging ? `translateX(${reorder?.dx ?? 0}px)` : undefined }}
                    data-testid={`ve-clip-${entry.index}`}
                  >
                    <div className="pointer-events-none absolute inset-0 flex">
                      {asset?.info.kind === 'image' ? (
                        // eslint-disable-next-line @next/next/no-img-element -- object URL
                        <img src={asset.url} alt="" className="h-full w-full object-cover opacity-90" draggable={false} />
                      ) : (
                        shown.map(([t, src]) => (
                          // eslint-disable-next-line @next/next/no-img-element -- data URL frames
                          <img key={t} src={src} alt="" className="h-full min-w-0 flex-1 object-cover" draggable={false} />
                        ))
                      )}
                    </div>
                    <span className="pointer-events-none absolute bottom-0.5 left-1.5 flex items-center gap-1 rounded bg-black/55 px-1 text-[10px] font-medium tabular-nums text-white">
                      {formatEditorTime(clipLength(clip))}
                      {clip.speed !== 1 ? ` · ${clip.speed}x` : ''}
                      {asset?.info.kind === 'video' && clip.volume === 0 ? <VolumeX size={10} aria-hidden="true" /> : null}
                    </span>
                    {isSelected('clip', clip.id) ? edges(ref, 'bg-white/90 [&>span]:bg-slate-700') : null}
                  </div>
                );
              })}
              {reorder && reorder.to !== reorder.index ? (
                <span
                  className="pointer-events-none absolute inset-y-0 z-40 w-1 -translate-x-1/2 rounded bg-prime"
                  style={{
                    left: x(
                      (() => {
                        const others = placed.filter((entry) => entry.index !== reorder.index);
                        const lengthBefore = others.slice(0, reorder.to).reduce((sum, entry) => sum + (entry.end - entry.start), 0);
                        return lengthBefore;
                      })(),
                    ),
                  }}
                  data-testid="ve-drop-marker"
                />
              ) : null}
            </div>
          </div>

          {/* Music track */}
          <div className="relative flex h-12 items-center">
            <span className="sticky left-0 z-20 flex h-full w-9 shrink-0 items-center justify-center bg-base-subtle text-ink-faint" title={copy.musicTrack}>
              <Music size={14} aria-hidden="true" />
            </span>
            <div className="relative h-full flex-1" onPointerDown={begin({ mode: 'seek', deselect: true })} {...handlers}>
              {project.music.map((item) => {
                const ref = { kind: 'music' as const, id: item.id };
                const asset = assets[item.assetId];
                const length = musicLength(item);
                return (
                  <div
                    key={item.id}
                    onPointerDown={withX({ mode: 'item', ref, kind: 'move', x: 0, origin: project, moved: false })}
                    {...handlers}
                    className={cx(
                      'absolute inset-y-1 cursor-grab touch-none overflow-hidden rounded-md border-2 bg-emerald-500/15 active:cursor-grabbing',
                      isSelected('music', item.id) ? 'border-emerald-300' : 'border-emerald-500/60',
                    )}
                    style={{ left: x(item.offset), width: Math.max(8, x(length)) }}
                    data-testid={`ve-music-${item.id}`}
                  >
                    <span className="pointer-events-none absolute left-3 top-0 z-[1] truncate text-[10px] font-semibold text-emerald-800 dark:text-emerald-200">{asset?.info.name}</span>
                    <div className="absolute inset-x-0 bottom-0.5">
                      <WaveformStrip buffer={asset?.buffer} from={item.in} to={item.out} width={x(length)} />
                    </div>
                    {isSelected('music', item.id) ? edges(ref, 'bg-emerald-500') : null}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Project end, playhead and snap guide over every track. */}
          <div className="pointer-events-none absolute inset-y-0" style={{ left: GUTTER, right: 0 }} aria-hidden="true">
            {duration > 0 ? <div className="absolute inset-y-6 border-l border-dashed border-ink-faint/60" style={{ left: x(duration) }} /> : null}
            <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-ink" style={{ left: x(time) }} data-testid="ve-playhead">
              <span className="absolute -left-[5px] top-0 h-3 w-3 rounded-full bg-ink" />
            </div>
            {guide !== null ? <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-amber-400" style={{ left: x(guide) }} data-testid="ve-guide" /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
