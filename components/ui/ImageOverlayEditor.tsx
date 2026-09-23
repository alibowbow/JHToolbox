'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useLocale } from '@/components/providers/locale-provider';

type Overlay =
  | { kind: 'text'; text: string; fontSize: number; color: string; opacity: number }
  | { kind: 'image'; url: string; scale: number; opacity: number };

const COPY = {
  en: { hint: 'Drag the text or tap where it should go.', label: 'Overlay position' },
  ko: { hint: '글자를 끌어 옮기거나, 둘 곳을 눌러 보세요.', label: '올릴 위치' },
} as const;

/**
 * The picture with its text or watermark drawn where it will be saved. Drag
 * (mouse or touch) or tap to place it; arrow keys nudge. Positions are in the
 * picture's own pixels, top-left corner of the overlay.
 */
export function ImageOverlayEditor({
  imageUrl,
  overlay,
  position,
  onPositionChange,
  testIdPrefix = 'image-overlay',
}: {
  imageUrl: string;
  overlay: Overlay;
  position: { x: number; y: number };
  onPositionChange: (position: { x: number; y: number }) => void;
  testIdPrefix?: string;
}) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [display, setDisplay] = useState({ width: 0, height: 0 });
  const [overlayNatural, setOverlayNatural] = useState({ width: 0, height: 0 });
  const stopRef = useRef<(() => void) | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const overlayImageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => () => stopRef.current?.(), []);

  // Images that finished loading before React saw their load event.
  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) {
      setNatural({ width: image.naturalWidth, height: image.naturalHeight });
    }
  }, [imageUrl]);
  const overlayUrl = overlay.kind === 'image' ? overlay.url : null;
  useEffect(() => {
    const image = overlayImageRef.current;
    if (image?.complete && image.naturalWidth > 0) {
      setOverlayNatural({ width: image.naturalWidth, height: image.naturalHeight });
    }
  }, [overlayUrl]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setDisplay({ width: stage.clientWidth, height: stage.clientHeight }));
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const scale = natural.width ? display.width / natural.width : 0;
  const overlayWidth =
    overlay.kind === 'image' && overlayNatural.width ? Math.max(32, overlayNatural.width * overlay.scale) : 0;

  const toImagePoint = (clientX: number, clientY: number) => {
    const stage = stageRef.current;
    if (!stage || !scale) return null;
    const bounds = stage.getBoundingClientRect();
    return { x: (clientX - bounds.left) / scale, y: (clientY - bounds.top) / scale };
  };

  const clampPosition = (x: number, y: number) => ({
    x: Math.round(Math.min(Math.max(0, x), Math.max(0, natural.width - 1))),
    y: Math.round(Math.min(Math.max(0, y), Math.max(0, natural.height - 1))),
  });

  const drag = (event: ReactPointerEvent<HTMLElement>, grabOffset: { x: number; y: number }) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    stopRef.current?.();
    const move = (moveEvent: PointerEvent) => {
      const point = toImagePoint(moveEvent.clientX, moveEvent.clientY);
      if (point) onPositionChange(clampPosition(point.x - grabOffset.x, point.y - grabOffset.y));
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      stopRef.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    stopRef.current = stop;
  };

  const startOnOverlay = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = toImagePoint(event.clientX, event.clientY);
    if (point) drag(event, { x: point.x - position.x, y: point.y - position.y });
  };

  const startOnStage = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = toImagePoint(event.clientX, event.clientY);
    if (!point) return;
    onPositionChange(clampPosition(point.x, point.y));
    drag(event, { x: 0, y: 0 });
  };

  const nudge = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 1;
    const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = delta[event.key];
    if (move) {
      event.preventDefault();
      onPositionChange(clampPosition(position.x + move[0], position.y + move[1]));
    }
  };

  return (
    <div className="space-y-2" data-testid={`${testIdPrefix}-editor`}>
      <p className="text-xs text-ink-faint">{copy.hint}</p>
      <div className="checkerboard flex justify-center overflow-hidden rounded-xl border border-border">
        <div ref={stageRef} className="relative touch-none select-none" onPointerDown={startOnStage} data-testid={`${testIdPrefix}-stage`}>
          <img
            ref={imageRef}
            src={imageUrl}
            alt=""
            draggable={false}
            onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            className="block max-h-[28rem] max-w-full"
          />
          {scale ? (
            <div
              role="group"
              tabIndex={0}
              aria-label={`${copy.label}: ${position.x}, ${position.y}`}
              data-testid={`${testIdPrefix}-item`}
              onPointerDown={startOnOverlay}
              onKeyDown={nudge}
              className="absolute cursor-move whitespace-pre outline-dashed outline-1 outline-offset-2 outline-white/70 focus-visible:outline-2 focus-visible:outline-prime"
              style={{ left: position.x * scale, top: position.y * scale, opacity: overlay.opacity }}
            >
              {overlay.kind === 'text' ? (
                <span
                  className="block font-bold"
                  style={{ fontSize: overlay.fontSize * scale, lineHeight: 1.25, color: overlay.color }}
                >
                  {overlay.text}
                </span>
              ) : (
                <img
                  ref={overlayImageRef}
                  src={overlay.url}
                  alt=""
                  draggable={false}
                  onLoad={(event) =>
                    setOverlayNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })
                  }
                  className="block max-w-none"
                  style={{ width: overlayWidth ? overlayWidth * scale : undefined }}
                />
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
