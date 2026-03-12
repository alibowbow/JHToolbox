'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useLocale } from '@/components/providers/locale-provider';
import { cx } from '@/lib/utils';

export type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type CropEditorImageSize = {
  width: number;
  height: number;
};

type CropEditorAspectPreset = {
  id: string;
  label: string;
  ratio: number | null;
};

type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se';

type CropEditorProps = {
  crop: CropRect;
  previewUrl: string;
  onCropChange: (nextCrop: CropRect) => void;
  onImageReady?: (size: CropEditorImageSize) => void;
  resetOnImageLoad?: boolean;
  testIdPrefix?: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundCropRect(crop: CropRect): CropRect {
  return {
    x: Math.round(crop.x),
    y: Math.round(crop.y),
    width: Math.round(crop.width),
    height: Math.round(crop.height),
  };
}

function cropEquals(left: CropRect, right: CropRect) {
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;
}

function getMinimumCropSize(imageSize: CropEditorImageSize) {
  return Math.max(24, Math.round(Math.min(imageSize.width, imageSize.height) * 0.08));
}

function normalizeCropRect(crop: CropRect, imageSize: CropEditorImageSize) {
  if (!imageSize.width || !imageSize.height) {
    return roundCropRect({ x: 0, y: 0, width: 0, height: 0 });
  }

  const minSize = getMinimumCropSize(imageSize);
  const safeWidth = clamp(crop.width || imageSize.width, 1, imageSize.width);
  const safeHeight = clamp(crop.height || imageSize.height, 1, imageSize.height);
  const width = safeWidth >= imageSize.width ? imageSize.width : clamp(safeWidth, Math.min(minSize, imageSize.width), imageSize.width);
  const height =
    safeHeight >= imageSize.height ? imageSize.height : clamp(safeHeight, Math.min(minSize, imageSize.height), imageSize.height);
  const x = clamp(crop.x, 0, Math.max(0, imageSize.width - width));
  const y = clamp(crop.y, 0, Math.max(0, imageSize.height - height));

  return roundCropRect({ x, y, width, height });
}

function getFullImageCrop(imageSize: CropEditorImageSize): CropRect {
  return {
    x: 0,
    y: 0,
    width: imageSize.width,
    height: imageSize.height,
  };
}

function getCropFromAspectRatio(imageSize: CropEditorImageSize, ratio: number, currentCrop: CropRect) {
  if (!imageSize.width || !imageSize.height) {
    return roundCropRect({ x: 0, y: 0, width: 0, height: 0 });
  }

  const minimumSize = getMinimumCropSize(imageSize);
  const centerX = currentCrop.x + currentCrop.width / 2;
  const centerY = currentCrop.y + currentCrop.height / 2;
  const currentArea = Math.max(currentCrop.width * currentCrop.height, minimumSize * minimumSize);

  let width = Math.sqrt(currentArea * ratio);
  let height = width / ratio;

  if (width > imageSize.width) {
    width = imageSize.width;
    height = width / ratio;
  }

  if (height > imageSize.height) {
    height = imageSize.height;
    width = height * ratio;
  }

  const minimumHeight = Math.min(imageSize.height, minimumSize);
  const minimumWidth = Math.min(imageSize.width, minimumHeight * ratio);
  if (width < minimumWidth) {
    width = minimumWidth;
    height = width / ratio;
  }

  if (height < minimumHeight) {
    height = minimumHeight;
    width = height * ratio;
  }

  const x = clamp(centerX - width / 2, 0, Math.max(0, imageSize.width - width));
  const y = clamp(centerY - height / 2, 0, Math.max(0, imageSize.height - height));

  return normalizeCropRect({ x, y, width, height }, imageSize);
}

function aspectRatioMatches(crop: CropRect, ratio: number) {
  if (!crop.width || !crop.height) {
    return false;
  }

  return Math.abs(crop.width / crop.height - ratio) < 0.02;
}

function buildRectFromAnchor(
  anchor: { x: number; y: number },
  pointer: { x: number; y: number },
  imageSize: CropEditorImageSize,
  aspectRatio: number | null,
) {
  const minSize = getMinimumCropSize(imageSize);
  const horizontalDirection = pointer.x >= anchor.x ? 1 : -1;
  const verticalDirection = pointer.y >= anchor.y ? 1 : -1;
  const maxWidth = horizontalDirection > 0 ? imageSize.width - anchor.x : anchor.x;
  const maxHeight = verticalDirection > 0 ? imageSize.height - anchor.y : anchor.y;

  if (!aspectRatio) {
    const width = clamp(Math.abs(pointer.x - anchor.x), Math.min(minSize, Math.max(maxWidth, 1)), Math.max(maxWidth, 1));
    const height = clamp(
      Math.abs(pointer.y - anchor.y),
      Math.min(minSize, Math.max(maxHeight, 1)),
      Math.max(maxHeight, 1),
    );

    const x = horizontalDirection > 0 ? anchor.x : anchor.x - width;
    const y = verticalDirection > 0 ? anchor.y : anchor.y - height;
    return normalizeCropRect({ x, y, width, height }, imageSize);
  }

  const widthLimit = Math.max(1, Math.min(maxWidth, maxHeight * aspectRatio));
  const heightLimit = widthLimit / aspectRatio;
  const minimumHeight = Math.min(heightLimit, minSize);
  const minimumWidth = minimumHeight * aspectRatio;
  let width = Math.max(Math.abs(pointer.x - anchor.x), Math.abs(pointer.y - anchor.y) * aspectRatio, minimumWidth);
  width = clamp(width, minimumWidth, widthLimit);
  const height = width / aspectRatio;

  const x = horizontalDirection > 0 ? anchor.x : anchor.x - width;
  const y = verticalDirection > 0 ? anchor.y : anchor.y - height;

  return normalizeCropRect({ x, y, width, height }, imageSize);
}

export function ImageCropEditor({
  crop,
  previewUrl,
  onCropChange,
  onImageReady,
  resetOnImageLoad = false,
  testIdPrefix = 'image-crop',
}: CropEditorProps) {
  const { messages } = useLocale();
  const frameRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const cleanupInteractionRef = useRef<(() => void) | null>(null);
  const [imageSize, setImageSize] = useState<CropEditorImageSize>({ width: 0, height: 0 });
  const [selectedAspectId, setSelectedAspectId] = useState('free');

  const aspectPresets = useMemo<CropEditorAspectPreset[]>(
    () => [
      { id: 'free', label: messages.workbench.cropFreeform, ratio: null },
      { id: '1-1', label: '1:1', ratio: 1 },
      { id: '16-9', label: '16:9', ratio: 16 / 9 },
      { id: '4-3', label: '4:3', ratio: 4 / 3 },
      { id: '3-2', label: '3:2', ratio: 3 / 2 },
      { id: '2-3', label: '2:3', ratio: 2 / 3 },
      { id: '3-4', label: '3:4', ratio: 3 / 4 },
      { id: '4-5', label: '4:5', ratio: 4 / 5 },
      { id: '9-16', label: '9:16', ratio: 9 / 16 },
    ],
    [messages.workbench.cropFreeform],
  );

  const currentAspectRatio = aspectPresets.find((preset) => preset.id === selectedAspectId)?.ratio ?? null;
  const normalizedCrop = useMemo(() => normalizeCropRect(crop, imageSize), [crop, imageSize]);

  useEffect(() => {
    setSelectedAspectId('free');
  }, [previewUrl]);

  useEffect(() => {
    const matchingPreset = aspectPresets.find((preset) => (preset.ratio ? aspectRatioMatches(normalizedCrop, preset.ratio) : false));
    if (!matchingPreset && selectedAspectId !== 'free') {
      setSelectedAspectId('free');
    }
  }, [aspectPresets, normalizedCrop, selectedAspectId]);

  useEffect(() => {
    return () => {
      cleanupInteractionRef.current?.();
      cleanupInteractionRef.current = null;
    };
  }, []);

  const getPointInImage = (clientX: number, clientY: number) => {
    const frame = frameRef.current;
    if (!frame || !imageSize.width || !imageSize.height) {
      return null;
    }

    const bounds = frame.getBoundingClientRect();
    const x = clamp(((clientX - bounds.left) / Math.max(bounds.width, 1)) * imageSize.width, 0, imageSize.width);
    const y = clamp(((clientY - bounds.top) / Math.max(bounds.height, 1)) * imageSize.height, 0, imageSize.height);

    return { x, y };
  };

  const commitCrop = (nextCrop: CropRect) => {
    const safeCrop = normalizeCropRect(nextCrop, imageSize);
    if (!cropEquals(safeCrop, normalizedCrop)) {
      onCropChange(safeCrop);
    }
  };

  const runMouseInteraction = (onMove: (point: { x: number; y: number }) => void) => {
    cleanupInteractionRef.current?.();

    const handleMouseMove = (event: MouseEvent) => {
      const point = getPointInImage(event.clientX, event.clientY);
      if (!point) {
        return;
      }

      onMove(point);
    };

    const cleanup = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (cleanupInteractionRef.current === cleanup) {
        cleanupInteractionRef.current = null;
      }
    };

    const handleMouseUp = () => {
      cleanup();
    };

    cleanupInteractionRef.current = cleanup;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const startMoveCrop = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    const startPoint = getPointInImage(event.clientX, event.clientY);
    if (!startPoint) {
      return;
    }

    const startCrop = normalizedCrop;

    runMouseInteraction((point) => {
      const deltaX = point.x - startPoint.x;
      const deltaY = point.y - startPoint.y;

      commitCrop({
        ...startCrop,
        x: clamp(startCrop.x + deltaX, 0, Math.max(0, imageSize.width - startCrop.width)),
        y: clamp(startCrop.y + deltaY, 0, Math.max(0, imageSize.height - startCrop.height)),
      });
    });
  };

  const startResizeCrop = (handle: ResizeHandle) => (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const anchor =
      handle === 'nw'
        ? { x: normalizedCrop.x + normalizedCrop.width, y: normalizedCrop.y + normalizedCrop.height }
        : handle === 'ne'
          ? { x: normalizedCrop.x, y: normalizedCrop.y + normalizedCrop.height }
          : handle === 'sw'
            ? { x: normalizedCrop.x + normalizedCrop.width, y: normalizedCrop.y }
            : { x: normalizedCrop.x, y: normalizedCrop.y };

    runMouseInteraction((point) => {
      commitCrop(buildRectFromAnchor(anchor, point, imageSize, currentAspectRatio));
    });
  };

  const startDrawCrop = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).dataset.cropInteractive === 'true') {
      return;
    }

    event.preventDefault();
    const anchor = getPointInImage(event.clientX, event.clientY);
    if (!anchor) {
      return;
    }

    runMouseInteraction((point) => {
      commitCrop(buildRectFromAnchor(anchor, point, imageSize, currentAspectRatio));
    });
  };

  const handleImageLoad = () => {
    const imageElement = imageRef.current;
    if (!imageElement) {
      return;
    }

    const nextImageSize = {
      width: imageElement.naturalWidth,
      height: imageElement.naturalHeight,
    };

    setImageSize(nextImageSize);
    onImageReady?.(nextImageSize);

    const nextCrop = resetOnImageLoad ? getFullImageCrop(nextImageSize) : normalizeCropRect(crop, nextImageSize);
    onCropChange(nextCrop);
  };

  const handleAspectPresetClick = (preset: CropEditorAspectPreset) => {
    setSelectedAspectId(preset.id);

    if (!imageSize.width || !imageSize.height) {
      return;
    }

    if (!preset.ratio) {
      commitCrop(normalizedCrop);
      return;
    }

    commitCrop(getCropFromAspectRatio(imageSize, preset.ratio, normalizedCrop));
  };

  const left = imageSize.width ? (normalizedCrop.x / imageSize.width) * 100 : 0;
  const top = imageSize.height ? (normalizedCrop.y / imageSize.height) * 100 : 0;
  const width = imageSize.width ? (normalizedCrop.width / imageSize.width) * 100 : 0;
  const height = imageSize.height ? (normalizedCrop.height / imageSize.height) * 100 : 0;

  return (
    <div className="space-y-4" data-testid={`${testIdPrefix}-editor`}>
      <div className="rounded-xl border border-border bg-base-elevated p-3">
        <p className="text-xs uppercase tracking-[0.16em] text-ink-faint">{messages.workbench.cropAspectRatio}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {aspectPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              data-testid={`${testIdPrefix}-preset-${preset.id}`}
              onClick={() => handleAspectPresetClick(preset)}
              className={cx(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                selectedAspectId === preset.id
                  ? 'border-prime/60 bg-prime/10 text-prime'
                  : 'border-border bg-base-subtle text-ink-muted hover:border-border-bright hover:text-ink',
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-muted">{messages.workbench.cropDragHint}</p>
      </div>

      <div className="rounded-xl border border-border bg-base-elevated p-3">
        <div className="max-h-[40rem] overflow-auto rounded-xl border border-border bg-base-subtle">
          <div
            ref={frameRef}
            className="relative mx-auto w-fit max-w-full select-none"
            onMouseDown={startDrawCrop}
            data-testid={`${testIdPrefix}-stage`}
          >
            <img
              ref={imageRef}
              src={previewUrl}
              alt=""
              onLoad={handleImageLoad}
              draggable={false}
              className="block max-h-[36rem] max-w-full select-none rounded-lg"
            />

            {imageSize.width && imageSize.height ? (
              <div className="absolute inset-0 cursor-crosshair">
                <div
                  data-testid={`${testIdPrefix}-selection`}
                  data-crop-interactive="true"
                  className="absolute cursor-move rounded-xl border-2 border-cyan-300 bg-cyan-400/12 shadow-[0_0_0_9999px_rgba(15,23,42,0.58)]"
                  style={{
                    left: `${left}%`,
                    top: `${top}%`,
                    width: `${width}%`,
                    height: `${height}%`,
                  }}
                  onMouseDown={startMoveCrop}
                >
                  <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-cyan-200 bg-base-elevated/95 px-2 py-1 text-[11px] font-medium text-cyan-700">
                    {normalizedCrop.width} x {normalizedCrop.height}
                  </div>

                  <div
                    data-testid={`${testIdPrefix}-handle-nw`}
                    data-crop-interactive="true"
                    className="absolute -left-2 -top-2 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-white bg-cyan-500 shadow-sm"
                    onMouseDown={startResizeCrop('nw')}
                  />
                  <div
                    data-testid={`${testIdPrefix}-handle-ne`}
                    data-crop-interactive="true"
                    className="absolute -right-2 -top-2 h-4 w-4 cursor-nesw-resize rounded-full border-2 border-white bg-cyan-500 shadow-sm"
                    onMouseDown={startResizeCrop('ne')}
                  />
                  <div
                    data-testid={`${testIdPrefix}-handle-sw`}
                    data-crop-interactive="true"
                    className="absolute -bottom-2 -left-2 h-4 w-4 cursor-nesw-resize rounded-full border-2 border-white bg-cyan-500 shadow-sm"
                    onMouseDown={startResizeCrop('sw')}
                  />
                  <div
                    data-testid={`${testIdPrefix}-handle-se`}
                    data-crop-interactive="true"
                    className="absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-white bg-cyan-500 shadow-sm"
                    onMouseDown={startResizeCrop('se')}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid={`${testIdPrefix}-metrics`}>
        <div className="rounded-xl border border-border bg-base-elevated px-3 py-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint">X</p>
          <p className="mt-2 text-sm font-semibold text-ink">{normalizedCrop.x}px</p>
        </div>
        <div className="rounded-xl border border-border bg-base-elevated px-3 py-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint">Y</p>
          <p className="mt-2 text-sm font-semibold text-ink">{normalizedCrop.y}px</p>
        </div>
        <div className="rounded-xl border border-border bg-base-elevated px-3 py-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint">{messages.workbench.cropWidthLabel}</p>
          <p className="mt-2 text-sm font-semibold text-ink">{normalizedCrop.width}px</p>
        </div>
        <div className="rounded-xl border border-border bg-base-elevated px-3 py-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint">{messages.workbench.cropHeightLabel}</p>
          <p className="mt-2 text-sm font-semibold text-ink">{normalizedCrop.height}px</p>
        </div>
      </div>
    </div>
  );
}