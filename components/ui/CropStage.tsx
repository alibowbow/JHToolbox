'use client';

import { useEffect, useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  anchorForHandle,
  buildRectFromAnchor,
  clamp,
  cropEquals,
  normalizeCropRect,
  type CropRect,
  type FrameSize,
  type ResizeHandle,
} from '@/components/ui/crop-math';
import { cx } from '@/lib/utils';

const HANDLES: ResizeHandle[] = ['nw', 'ne', 'sw', 'se'];
const HANDLE_POSITION: Record<ResizeHandle, string> = {
  nw: 'left-0 top-0 cursor-nwse-resize',
  ne: 'left-full top-0 cursor-nesw-resize',
  sw: 'left-0 top-full cursor-nesw-resize',
  se: 'left-full top-full cursor-nwse-resize',
};

type Point = { x: number; y: number };

/**
 * An image or video with a crop box on top. Pointer events cover mouse, pen
 * and touch: drag inside the box to move it, drag a corner to resize, drag
 * elsewhere to draw a new box. Arrow keys nudge the focused box.
 */
export function CropStage({
  frameSize,
  crop,
  aspectRatio,
  onChange,
  testIdPrefix,
  label,
  children,
}: {
  frameSize: FrameSize;
  crop: CropRect;
  aspectRatio: number | null;
  onChange: (crop: CropRect) => void;
  testIdPrefix: string;
  label: string;
  children: ReactNode;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const stopTrackingRef = useRef<(() => void) | null>(null);
  const ready = frameSize.width > 0 && frameSize.height > 0;

  useEffect(() => () => stopTrackingRef.current?.(), []);

  const toFrame = (clientX: number, clientY: number): Point | null => {
    const stage = stageRef.current;
    if (!stage || !ready) {
      return null;
    }
    const bounds = stage.getBoundingClientRect();
    return {
      x: clamp(((clientX - bounds.left) / Math.max(bounds.width, 1)) * frameSize.width, 0, frameSize.width),
      y: clamp(((clientY - bounds.top) / Math.max(bounds.height, 1)) * frameSize.height, 0, frameSize.height),
    };
  };

  const commit = (next: CropRect) => {
    const safe = normalizeCropRect(next, frameSize);
    if (!cropEquals(safe, crop)) {
      onChange(safe);
    }
  };

  const track = (event: ReactPointerEvent<HTMLElement>, onMove: (point: Point) => void) => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    stopTrackingRef.current?.();

    const move = (moveEvent: PointerEvent) => {
      const point = toFrame(moveEvent.clientX, moveEvent.clientY);
      if (point) {
        onMove(point);
      }
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      stopTrackingRef.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    stopTrackingRef.current = stop;
    return true;
  };

  const startDraw = (event: ReactPointerEvent<HTMLDivElement>) => {
    const anchor = toFrame(event.clientX, event.clientY);
    if (anchor) {
      track(event, (point) => commit(buildRectFromAnchor(anchor, point, frameSize, aspectRatio)));
    }
  };

  const startMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = toFrame(event.clientX, event.clientY);
    if (!start) {
      return;
    }
    const startCrop = crop;
    event.currentTarget.focus({ preventScroll: true });
    track(event, (point) =>
      commit({
        ...startCrop,
        x: clamp(startCrop.x + point.x - start.x, 0, Math.max(0, frameSize.width - startCrop.width)),
        y: clamp(startCrop.y + point.y - start.y, 0, Math.max(0, frameSize.height - startCrop.height)),
      }),
    );
  };

  const startResize = (handle: ResizeHandle) => (event: ReactPointerEvent<HTMLDivElement>) => {
    const anchor = anchorForHandle(crop, handle);
    track(event, (point) => commit(buildRectFromAnchor(anchor, point, frameSize, aspectRatio)));
  };

  const nudge = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 1;
    const delta: Record<string, Point> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const move = delta[event.key];
    if (!move) {
      return;
    }
    event.preventDefault();
    commit({
      ...crop,
      x: clamp(crop.x + move.x, 0, Math.max(0, frameSize.width - crop.width)),
      y: clamp(crop.y + move.y, 0, Math.max(0, frameSize.height - crop.height)),
    });
  };

  const box = ready
    ? {
        left: `${(crop.x / frameSize.width) * 100}%`,
        top: `${(crop.y / frameSize.height) * 100}%`,
        width: `${(crop.width / frameSize.width) * 100}%`,
        height: `${(crop.height / frameSize.height) * 100}%`,
      }
    : null;

  return (
    <div
      ref={stageRef}
      className="relative mx-auto w-fit max-w-full touch-none select-none"
      onPointerDown={startDraw}
      data-testid={`${testIdPrefix}-stage`}
    >
      {children}
      {box ? (
        <div className="absolute inset-0 cursor-crosshair">
          <div
            role="group"
            tabIndex={0}
            aria-label={`${label}: ${crop.width} × ${crop.height}`}
            data-testid={`${testIdPrefix}-selection`}
            className="absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgba(15,23,42,0.55)] outline-none focus-visible:ring-2 focus-visible:ring-prime focus-visible:ring-offset-1"
            style={box}
            onPointerDown={startMove}
            onKeyDown={nudge}
          >
            <div className="pointer-events-none absolute inset-0" aria-hidden="true">
              <div className="absolute inset-y-0 left-1/3 w-px bg-white/40" />
              <div className="absolute inset-y-0 left-2/3 w-px bg-white/40" />
              <div className="absolute inset-x-0 top-1/3 h-px bg-white/40" />
              <div className="absolute inset-x-0 top-2/3 h-px bg-white/40" />
            </div>
            <span className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
              {crop.width} × {crop.height}
            </span>
            {HANDLES.map((handle) => (
              <div
                key={handle}
                data-testid={`${testIdPrefix}-handle-${handle}`}
                className={cx('absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center', HANDLE_POSITION[handle])}
                onPointerDown={startResize(handle)}
              >
                <span className="h-3.5 w-3.5 rounded-sm border-2 border-prime bg-white shadow" />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
