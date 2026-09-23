'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useLocale } from '@/components/providers/locale-provider';
import { CropStage } from '@/components/ui/CropStage';
import {
  aspectRatioMatches,
  getCropFromAspectRatio,
  getFullFrameCrop,
  normalizeCropRect,
  type CropRect,
  type FrameSize,
} from '@/components/ui/crop-math';
import { cx } from '@/lib/utils';

export type { CropRect } from '@/components/ui/crop-math';

type AspectPreset = { id: string; label: string; ratio: number | null };

/** A number box that commits on Enter or blur, so typing "120" does not clamp at "1". */
function PixelField({ label, value, onCommit }: { label: string; value: number; onCommit: (next: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(String(value));
    }
  }, [value]);

  const commit = () => {
    const next = Number(draft);
    if (Number.isFinite(next)) {
      onCommit(Math.round(next));
    } else {
      setDraft(String(value));
    }
  };

  return (
    <label className="block min-w-0">
      <span className="block truncate text-xs text-ink-faint">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={draft}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          focusedRef.current = false;
          commit();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit();
          }
        }}
        className="input-surface mt-1 h-9 w-full tabular-nums"
      />
    </label>
  );
}

export function ImageCropEditor({
  crop,
  previewUrl,
  onCropChange,
  onImageReady,
  resetOnImageLoad = false,
  testIdPrefix = 'image-crop',
}: {
  crop: CropRect;
  previewUrl: string;
  onCropChange: (nextCrop: CropRect) => void;
  onImageReady?: (size: FrameSize) => void;
  resetOnImageLoad?: boolean;
  testIdPrefix?: string;
}) {
  const { messages } = useLocale();
  const [imageSize, setImageSize] = useState<FrameSize>({ width: 0, height: 0 });
  const [aspectId, setAspectId] = useState('free');

  const aspectPresets = useMemo<AspectPreset[]>(
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
  const aspectRatio = aspectPresets.find((preset) => preset.id === aspectId)?.ratio ?? null;
  const normalizedCrop = useMemo(() => normalizeCropRect(crop, imageSize), [crop, imageSize]);

  useEffect(() => {
    setAspectId('free');
    // A cached or tiny image can finish loading before React sees its load
    // event; pick it up here as well.
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) {
      handleImageLoad(image);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per picture
  }, [previewUrl]);

  const imageRef = useRef<HTMLImageElement | null>(null);
  const handleImageLoad = (image: HTMLImageElement) => {
    const size = { width: image.naturalWidth, height: image.naturalHeight };
    setImageSize(size);
    onImageReady?.(size);
    onCropChange(resetOnImageLoad ? getFullFrameCrop(size) : normalizeCropRect(crop, size));
  };

  const applyPreset = (preset: AspectPreset) => {
    setAspectId(preset.id);
    if (preset.ratio && imageSize.width) {
      onCropChange(getCropFromAspectRatio(imageSize, preset.ratio, normalizedCrop));
    }
  };

  // Typed values keep a chosen ratio: changing the width moves the height too.
  const editField = (key: keyof CropRect, value: number) => {
    const next = { ...normalizedCrop, [key]: value };
    if (aspectRatio && key === 'width') next.height = Math.round(value / aspectRatio);
    if (aspectRatio && key === 'height') next.width = Math.round(value * aspectRatio);
    const safe = normalizeCropRect(next, imageSize);
    if (aspectRatio && !aspectRatioMatches(safe, aspectRatio)) {
      setAspectId('free');
    }
    onCropChange(safe);
  };

  return (
    <div className="space-y-3" data-testid={`${testIdPrefix}-editor`}>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={messages.workbench.cropAspectRatio}>
        {aspectPresets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            data-testid={`${testIdPrefix}-preset-${preset.id}`}
            aria-pressed={aspectId === preset.id}
            onClick={() => applyPreset(preset)}
            className={cx(
              'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              aspectId === preset.id
                ? 'border-prime/50 bg-prime/10 text-prime'
                : 'border-border bg-base-elevated text-ink-muted hover:border-border-bright hover:text-ink',
            )}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setAspectId('free');
            onCropChange(getFullFrameCrop(imageSize));
          }}
          disabled={!imageSize.width}
          className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-base-subtle hover:text-ink disabled:opacity-40"
        >
          <RotateCcw size={13} aria-hidden="true" />
          {messages.workbench.resetCrop}
        </button>
      </div>

      <div className="checkerboard max-h-[40rem] overflow-auto rounded-xl border border-border">
        <CropStage
          frameSize={imageSize}
          crop={normalizedCrop}
          aspectRatio={aspectRatio}
          onChange={onCropChange}
          testIdPrefix={testIdPrefix}
          label={messages.workbench.cropImageTitle}
        >
          <img
            ref={imageRef}
            src={previewUrl}
            alt=""
            onLoad={(event) => handleImageLoad(event.currentTarget)}
            draggable={false}
            className="block max-h-[36rem] max-w-full select-none"
          />
        </CropStage>
      </div>

      <div className="grid grid-cols-4 gap-2" data-testid={`${testIdPrefix}-metrics`}>
        <PixelField label="X" value={normalizedCrop.x} onCommit={(value) => editField('x', value)} />
        <PixelField label="Y" value={normalizedCrop.y} onCommit={(value) => editField('y', value)} />
        <PixelField label={messages.workbench.cropWidthLabel} value={normalizedCrop.width} onCommit={(value) => editField('width', value)} />
        <PixelField label={messages.workbench.cropHeightLabel} value={normalizedCrop.height} onCommit={(value) => editField('height', value)} />
      </div>
    </div>
  );
}
