'use client';

import { useEffect, useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cx } from '@/lib/utils';

/** A box in fractions of the layer (0–1, top-left origin). */
export type FracBox = { x: number; y: number; w: number; h: number };
type Handle = 'nw' | 'ne' | 'sw' | 'se';
type Point = { x: number; y: number };

const HANDLES: Handle[] = ['nw', 'ne', 'sw', 'se'];
const HANDLE_POSITION: Record<Handle, string> = {
  nw: 'left-0 top-0 cursor-nwse-resize',
  ne: 'left-full top-0 cursor-nesw-resize',
  sw: 'left-0 top-full cursor-nesw-resize',
  se: 'left-full top-full cursor-nwse-resize',
};
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function fromCorners(a: Point, b: Point): FracBox {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

function keepInside(box: FracBox): FracBox {
  const w = clamp(box.w, 0, 1);
  const h = clamp(box.h, 0, 1);
  return { x: clamp(box.x, 0, 1 - w), y: clamp(box.y, 0, 1 - h), w, h };
}

/**
 * Boxes over a page or picture that can be moved, resized and (optionally)
 * drawn or removed, by mouse, pen or touch. Arrow keys nudge the focused box;
 * Delete removes it when boxes are removable.
 */
export function BoxLayer({
  boxes,
  onChange,
  selected,
  onSelect,
  allowDraw = false,
  placeOnClick = false,
  removable = false,
  minSize = 0.01,
  renderBox,
  boxClassName,
  labels,
  testIdPrefix,
  children,
}: {
  boxes: FracBox[];
  onChange: (boxes: FracBox[]) => void;
  selected: number | null;
  onSelect: (index: number | null) => void;
  /** Dragging on an empty spot draws a new box. */
  allowDraw?: boolean;
  /** Tapping an empty spot moves the (single) box there. */
  placeOnClick?: boolean;
  removable?: boolean;
  minSize?: number;
  renderBox?: (box: FracBox, index: number) => ReactNode;
  boxClassName?: (index: number, isSelected: boolean) => string;
  labels: { box: (index: number) => string; remove: string };
  testIdPrefix: string;
  children: ReactNode;
}) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const boxesRef = useRef(boxes);
  boxesRef.current = boxes;

  useEffect(() => () => stopRef.current?.(), []);

  const toFraction = (clientX: number, clientY: number): Point | null => {
    const layer = layerRef.current;
    if (!layer) return null;
    const bounds = layer.getBoundingClientRect();
    return {
      x: clamp((clientX - bounds.left) / Math.max(bounds.width, 1), 0, 1),
      y: clamp((clientY - bounds.top) / Math.max(bounds.height, 1), 0, 1),
    };
  };

  const replace = (index: number, box: FracBox) => {
    const next = [...boxesRef.current];
    next[index] = keepInside(box);
    onChange(next);
  };

  const track = (event: ReactPointerEvent<HTMLElement>, onMove: (point: Point) => void, onEnd?: () => void) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return false;
    event.preventDefault();
    event.stopPropagation();
    stopRef.current?.();
    const move = (moveEvent: PointerEvent) => {
      const point = toFraction(moveEvent.clientX, moveEvent.clientY);
      if (point) onMove(point);
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      stopRef.current = null;
      onEnd?.();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    stopRef.current = stop;
    return true;
  };

  const startOnEmpty = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = toFraction(event.clientX, event.clientY);
    if (!start) return;

    if (allowDraw) {
      const index = boxesRef.current.length;
      onChange([...boxesRef.current, { x: start.x, y: start.y, w: 0, h: 0 }]);
      onSelect(index);
      track(
        event,
        (point) => replace(index, fromCorners(start, point)),
        () => {
          const drawn = boxesRef.current[index];
          // A tap draws nothing.
          if (drawn && (drawn.w < minSize || drawn.h < minSize)) {
            onChange(boxesRef.current.filter((_, boxIndex) => boxIndex !== index));
            onSelect(null);
          }
        },
      );
      return;
    }

    if (placeOnClick && boxesRef.current[0]) {
      const box = boxesRef.current[0];
      const centered = { ...box, x: start.x - box.w / 2, y: start.y - box.h / 2 };
      replace(0, centered);
      onSelect(0);
      const origin = keepInside(centered);
      track(event, (point) => replace(0, { ...origin, x: origin.x + point.x - start.x, y: origin.y + point.y - start.y }));
      return;
    }

    onSelect(null);
  };

  const startMove = (index: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = toFraction(event.clientX, event.clientY);
    const origin = boxesRef.current[index];
    if (!start || !origin) return;
    onSelect(index);
    event.currentTarget.focus({ preventScroll: true });
    track(event, (point) => replace(index, { ...origin, x: origin.x + point.x - start.x, y: origin.y + point.y - start.y }));
  };

  const startResize = (index: number, handle: Handle) => (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = boxesRef.current[index];
    if (!box) return;
    onSelect(index);
    const anchor = {
      x: handle === 'nw' || handle === 'sw' ? box.x + box.w : box.x,
      y: handle === 'nw' || handle === 'ne' ? box.y + box.h : box.y,
    };
    track(event, (point) => {
      const next = fromCorners(anchor, point);
      replace(index, { ...next, w: Math.max(next.w, minSize), h: Math.max(next.h, minSize) });
    });
  };

  const remove = (index: number) => {
    onChange(boxesRef.current.filter((_, boxIndex) => boxIndex !== index));
    onSelect(null);
  };

  const handleKey = (index: number) => (event: KeyboardEvent<HTMLDivElement>) => {
    const box = boxesRef.current[index];
    if (!box) return;
    if (removable && (event.key === 'Delete' || event.key === 'Backspace')) {
      event.preventDefault();
      remove(index);
      return;
    }
    const step = event.shiftKey ? 0.02 : 0.005;
    const delta: Record<string, Point> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const move = delta[event.key];
    if (move) {
      event.preventDefault();
      replace(index, { ...box, x: box.x + move.x, y: box.y + move.y });
    }
  };

  return (
    <div
      ref={layerRef}
      className={cx('relative touch-none select-none', allowDraw ? 'cursor-crosshair' : placeOnClick ? 'cursor-pointer' : '')}
      onPointerDown={startOnEmpty}
      data-testid={`${testIdPrefix}-layer`}
    >
      {children}
      {boxes.map((box, index) => {
        const isSelected = selected === index;
        return (
          <div
            key={index}
            role="group"
            tabIndex={0}
            aria-label={labels.box(index)}
            data-testid={`${testIdPrefix}-box`}
            onPointerDown={startMove(index)}
            onKeyDown={handleKey(index)}
            onFocus={() => onSelect(index)}
            className={cx(
              'absolute cursor-move outline-none focus-visible:ring-2 focus-visible:ring-prime focus-visible:ring-offset-1',
              boxClassName?.(index, isSelected),
            )}
            style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
          >
            {renderBox?.(box, index)}
            {isSelected
              ? HANDLES.map((handle) => (
                  <div
                    key={handle}
                    className={cx('absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center', HANDLE_POSITION[handle])}
                    onPointerDown={startResize(index, handle)}
                  >
                    <span className="h-3 w-3 rounded-sm border-2 border-prime bg-white shadow" />
                  </div>
                ))
              : null}
            {removable && isSelected ? (
              <button
                type="button"
                aria-label={labels.remove}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => remove(index)}
                className="absolute -right-3 -top-9 flex h-7 w-7 items-center justify-center rounded-full bg-danger text-white shadow"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
