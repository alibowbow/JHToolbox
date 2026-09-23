'use client';

import { useEffect, useRef, useState } from 'react';
import { RotateCcw, RotateCw } from 'lucide-react';
import { useLocale } from '@/components/providers/locale-provider';

const COPY = {
  en: { left: 'Rotate left 90°', right: 'Rotate right 90°', half: '180°' },
  ko: { left: '왼쪽으로 90°', right: '오른쪽으로 90°', half: '180°' },
} as const;

/**
 * The picture as it will come out of rotate / flip, updated as the options
 * change. With `onRotate`, quick buttons turn it in 90° steps.
 */
export function ImageTransformPreview({
  imageUrl,
  degrees = 0,
  flipHorizontal = false,
  flipVertical = false,
  onRotate,
}: {
  imageUrl: string;
  degrees?: number;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  onRotate?: (degrees: number) => void;
}) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState(1);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const imageRef = useRef<HTMLImageElement | null>(null);

  // An image that loaded before React saw its load event.
  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) {
      setSize({ width: image.clientWidth, height: image.clientHeight });
    }
  }, [imageUrl]);

  // Shrink the turned picture so its rotated bounding box fits the frame.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !size.width) return;
    const radians = (degrees * Math.PI) / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));
    const boundsWidth = size.width * cos + size.height * sin;
    const boundsHeight = size.width * sin + size.height * cos;
    setFit(Math.min(1, frame.clientWidth / boundsWidth, frame.clientHeight / boundsHeight));
  }, [degrees, size]);

  const turn = (delta: number) => onRotate?.((((degrees + delta) % 360) + 360) % 360);

  return (
    <div className="space-y-2" data-testid="image-transform-preview">
      {onRotate ? (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => turn(-90)} className="btn-ghost h-9 px-3 text-xs">
            <RotateCcw size={14} aria-hidden="true" />
            {copy.left}
          </button>
          <button type="button" onClick={() => turn(90)} className="btn-ghost h-9 px-3 text-xs">
            <RotateCw size={14} aria-hidden="true" />
            {copy.right}
          </button>
          <button type="button" onClick={() => turn(180)} className="btn-ghost h-9 px-3 text-xs">
            {copy.half}
          </button>
        </div>
      ) : null}
      <div ref={frameRef} className="checkerboard flex h-72 items-center justify-center overflow-hidden rounded-xl border border-border sm:h-80">
        <img
          ref={imageRef}
          src={imageUrl}
          alt=""
          draggable={false}
          onLoad={(event) => setSize({ width: event.currentTarget.clientWidth, height: event.currentTarget.clientHeight })}
          className="max-h-full max-w-full transition-transform duration-300"
          style={{
            transform: `rotate(${degrees}deg) scale(${fit * (flipHorizontal ? -1 : 1)}, ${fit * (flipVertical ? -1 : 1)})`,
          }}
        />
      </div>
    </div>
  );
}
