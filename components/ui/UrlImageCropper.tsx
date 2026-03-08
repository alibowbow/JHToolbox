'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Crop, Download, LoaderCircle, RefreshCw } from 'lucide-react';
import { useLocale } from '@/components/providers/locale-provider';
import { toast } from '@/components/ui/Toast';
import { baseName, downloadBlob, extOf } from '@/lib/utils';

type CropRange = {
  start: number;
  end: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeCropRange(start: number, end: number, imageHeight: number, minSelection: number): CropRange {
  if (imageHeight <= 0) {
    return { start: 0, end: 0 };
  }

  const safeStart = clamp(Math.round(start), 0, Math.max(0, imageHeight - minSelection));
  const safeEnd = clamp(Math.round(end), safeStart + minSelection, imageHeight);

  return {
    start: safeStart,
    end: safeEnd,
  };
}

function buildCroppedFileName(fileName: string) {
  const extension = extOf(fileName) || 'png';
  return `${baseName(fileName)}-cropped.${extension}`;
}

export function UrlImageCropper({
  fileName,
  outputMimeType,
  previewUrl,
}: {
  fileName: string;
  outputMimeType: string;
  previewUrl: string;
}) {
  const { messages } = useLocale();
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageHeight, setImageHeight] = useState(0);
  const [cropRange, setCropRange] = useState<CropRange>({ start: 0, end: 0 });
  const [isCropping, setIsCropping] = useState(false);
  const minSelection = useMemo(() => Math.max(48, Math.round(imageHeight * 0.02)), [imageHeight]);
  const cropHeight = Math.max(0, cropRange.end - cropRange.start);

  useEffect(() => {
    setImageHeight(0);
    setCropRange({ start: 0, end: 0 });
  }, [previewUrl]);

  const handleImageLoad = () => {
    const imageElement = imageRef.current;
    if (!imageElement) {
      return;
    }

    setImageHeight(imageElement.naturalHeight);
    setCropRange({
      start: 0,
      end: imageElement.naturalHeight,
    });
  };

  const updateCropStart = (nextValue: number) => {
    setCropRange((currentRange) => normalizeCropRange(nextValue, currentRange.end, imageHeight, minSelection));
  };

  const updateCropEnd = (nextValue: number) => {
    setCropRange((currentRange) => normalizeCropRange(currentRange.start, nextValue, imageHeight, minSelection));
  };

  const resetCrop = () => {
    if (!imageHeight) {
      return;
    }

    setCropRange({
      start: 0,
      end: imageHeight,
    });
  };

  const downloadCroppedImage = async () => {
    const imageElement = imageRef.current;
    if (!imageElement || !imageElement.complete || !cropHeight) {
      toast.error(messages.workbench.cropImageError);
      return;
    }

    try {
      setIsCropping(true);
      const canvas = document.createElement('canvas');
      canvas.width = imageElement.naturalWidth;
      canvas.height = cropHeight;

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Canvas unavailable.');
      }

      context.drawImage(
        imageElement,
        0,
        cropRange.start,
        imageElement.naturalWidth,
        cropHeight,
        0,
        0,
        imageElement.naturalWidth,
        cropHeight,
      );

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (nextBlob) => {
            if (!nextBlob) {
              reject(new Error('Failed to create cropped image.'));
              return;
            }

            resolve(nextBlob);
          },
          outputMimeType || 'image/png',
          1,
        );
      });

      downloadBlob(blob, buildCroppedFileName(fileName));
    } catch {
      toast.error(messages.workbench.cropImageError);
    } finally {
      setIsCropping(false);
    }
  };

  const selectionTopPercent = imageHeight ? (cropRange.start / imageHeight) * 100 : 0;
  const selectionHeightPercent = imageHeight ? (cropHeight / imageHeight) * 100 : 0;
  const selectionBottomPercent = Math.max(0, 100 - selectionTopPercent - selectionHeightPercent);

  return (
    <div className="space-y-4" data-testid="url-image-cropper">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-base-subtle/70 px-4 py-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Crop size={16} />
            {messages.workbench.cropImageTitle}
          </div>
          <p className="text-xs text-ink-muted">{messages.workbench.cropImageDescription}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={resetCrop} disabled={!imageHeight || isCropping} className="btn-ghost px-3 py-2 text-xs">
            <RefreshCw size={14} />
            {messages.workbench.resetCrop}
          </button>
          <button
            type="button"
            data-testid="url-image-crop-download"
            onClick={() => void downloadCroppedImage()}
            disabled={!imageHeight || !cropHeight || isCropping}
            className="btn-primary px-3 py-2 text-xs"
          >
            {isCropping ? <LoaderCircle size={14} className="animate-spin" /> : <Download size={14} />}
            {isCropping ? messages.workbench.croppingImage : messages.workbench.downloadCropped}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="rounded-xl border border-border bg-base-elevated p-3">
          <div className="max-h-[40rem] overflow-auto rounded-xl border border-border bg-base-subtle">
            <div className="relative">
              <img ref={imageRef} src={previewUrl} alt={fileName} onLoad={handleImageLoad} className="block h-auto w-full" />

              {imageHeight ? (
                <div className="pointer-events-none absolute inset-0">
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-0 top-0 bg-slate-950/55"
                    style={{ height: `${selectionTopPercent}%` }}
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 bg-slate-950/55"
                    style={{ height: `${selectionBottomPercent}%` }}
                  />

                  <div
                    data-testid="url-image-crop-selection"
                    className="absolute inset-x-2 rounded-xl border-2 border-cyan-300 bg-cyan-400/12 shadow-[0_0_0_1px_rgba(8,145,178,0.3)]"
                    style={{
                      top: `${selectionTopPercent}%`,
                      height: `${selectionHeightPercent}%`,
                    }}
                  >
                    <div className="absolute left-3 top-3 rounded-full border border-cyan-200 bg-base-elevated/95 px-2 py-1 text-[11px] font-medium text-cyan-700">
                      {messages.workbench.cropHeightLabel}: {cropHeight}px
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-border bg-base-elevated p-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-ink-faint">{messages.workbench.cropTop}</p>
            <input
              type="range"
              min={0}
              max={Math.max(0, imageHeight - minSelection)}
              step={1}
              value={cropRange.start}
              onChange={(event) => updateCropStart(Number(event.target.value))}
              disabled={!imageHeight}
              data-testid="url-image-crop-start-range"
              className="mt-2 w-full accent-cyan-500"
            />
            <input
              type="number"
              min={0}
              max={Math.max(0, imageHeight - minSelection)}
              step={1}
              value={cropRange.start}
              onChange={(event) => updateCropStart(Number(event.target.value))}
              disabled={!imageHeight}
              data-testid="url-image-crop-start-input"
              className="input-surface mt-2 w-full"
            />
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-ink-faint">{messages.workbench.cropBottom}</p>
            <input
              type="range"
              min={Math.min(imageHeight, cropRange.start + minSelection)}
              max={imageHeight || 0}
              step={1}
              value={cropRange.end}
              onChange={(event) => updateCropEnd(Number(event.target.value))}
              disabled={!imageHeight}
              data-testid="url-image-crop-end-range"
              className="mt-2 w-full accent-cyan-500"
            />
            <input
              type="number"
              min={Math.min(imageHeight, cropRange.start + minSelection)}
              max={imageHeight || 0}
              step={1}
              value={cropRange.end}
              onChange={(event) => updateCropEnd(Number(event.target.value))}
              disabled={!imageHeight}
              data-testid="url-image-crop-end-input"
              className="input-surface mt-2 w-full"
            />
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-ink-faint">{messages.workbench.cropHeightLabel}</p>
            <div className="mt-1 rounded-xl border border-border bg-base-subtle px-3 py-3 text-sm font-semibold text-ink">
              {cropHeight}px
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
