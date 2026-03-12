'use client';

import { useEffect, useState } from 'react';
import { Crop, Download, LoaderCircle, RefreshCw } from 'lucide-react';
import { useLocale } from '@/components/providers/locale-provider';
import { ImageCropEditor, type CropRect } from '@/components/ui/ImageCropEditor';
import { toast } from '@/components/ui/Toast';
import { baseName, downloadBlob, extOf } from '@/lib/utils';

type ImageSize = {
  width: number;
  height: number;
};

function buildCroppedFileName(fileName: string) {
  const extension = extOf(fileName) || 'png';
  return `${baseName(fileName)}-cropped.${extension}`;
}

function loadImage(sourceUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image.'));
    image.src = sourceUrl;
  });
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
  const [imageSize, setImageSize] = useState<ImageSize>({ width: 0, height: 0 });
  const [cropRect, setCropRect] = useState<CropRect>({ x: 0, y: 0, width: 0, height: 0 });
  const [isCropping, setIsCropping] = useState(false);

  useEffect(() => {
    setImageSize({ width: 0, height: 0 });
    setCropRect({ x: 0, y: 0, width: 0, height: 0 });
  }, [previewUrl]);

  const resetCrop = () => {
    if (!imageSize.width || !imageSize.height) {
      return;
    }

    setCropRect({
      x: 0,
      y: 0,
      width: imageSize.width,
      height: imageSize.height,
    });
  };

  const downloadCroppedImage = async () => {
    if (!cropRect.width || !cropRect.height) {
      toast.error(messages.workbench.cropImageError);
      return;
    }

    try {
      setIsCropping(true);
      const image = await loadImage(previewUrl);
      const canvas = document.createElement('canvas');
      canvas.width = cropRect.width;
      canvas.height = cropRect.height;

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Canvas unavailable.');
      }

      context.drawImage(
        image,
        cropRect.x,
        cropRect.y,
        cropRect.width,
        cropRect.height,
        0,
        0,
        cropRect.width,
        cropRect.height,
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
          <button type="button" onClick={resetCrop} disabled={!imageSize.width || isCropping} className="btn-ghost px-3 py-2 text-xs">
            <RefreshCw size={14} />
            {messages.workbench.resetCrop}
          </button>
          <button
            type="button"
            data-testid="url-image-crop-download"
            onClick={() => void downloadCroppedImage()}
            disabled={!cropRect.width || !cropRect.height || isCropping}
            className="btn-primary px-3 py-2 text-xs"
          >
            {isCropping ? <LoaderCircle size={14} className="animate-spin" /> : <Download size={14} />}
            {isCropping ? messages.workbench.croppingImage : messages.workbench.downloadCropped}
          </button>
        </div>
      </div>

      <ImageCropEditor
        crop={cropRect}
        previewUrl={previewUrl}
        onCropChange={setCropRect}
        onImageReady={setImageSize}
        resetOnImageLoad
        testIdPrefix="url-image-crop"
      />
    </div>
  );
}