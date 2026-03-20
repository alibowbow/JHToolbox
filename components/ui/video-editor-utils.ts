'use client';

export type VideoCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type VideoFrameSize = {
  width: number;
  height: number;
};

export type VideoAspectPreset = {
  id: string;
  label: string;
  ratio: number | null;
};

export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se';

const MIN_TRIM_DURATION = 0.05;

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function roundCropRect(crop: VideoCropRect): VideoCropRect {
  return {
    x: Math.round(crop.x),
    y: Math.round(crop.y),
    width: Math.round(crop.width),
    height: Math.round(crop.height),
  };
}

export function cropEquals(left: VideoCropRect, right: VideoCropRect) {
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;
}

export function getMinimumCropSize(frameSize: VideoFrameSize) {
  return Math.max(24, Math.round(Math.min(frameSize.width, frameSize.height) * 0.08));
}

export function normalizeCropRect(crop: VideoCropRect, frameSize: VideoFrameSize) {
  if (!frameSize.width || !frameSize.height) {
    return roundCropRect({ x: 0, y: 0, width: 0, height: 0 });
  }

  const minSize = getMinimumCropSize(frameSize);
  const safeWidth = clamp(crop.width || frameSize.width, 1, frameSize.width);
  const safeHeight = clamp(crop.height || frameSize.height, 1, frameSize.height);
  const width = safeWidth >= frameSize.width ? frameSize.width : clamp(safeWidth, Math.min(minSize, frameSize.width), frameSize.width);
  const height =
    safeHeight >= frameSize.height ? frameSize.height : clamp(safeHeight, Math.min(minSize, frameSize.height), frameSize.height);
  const x = clamp(crop.x, 0, Math.max(0, frameSize.width - width));
  const y = clamp(crop.y, 0, Math.max(0, frameSize.height - height));

  return roundCropRect({ x, y, width, height });
}

export function getFullFrameCrop(frameSize: VideoFrameSize): VideoCropRect {
  return {
    x: 0,
    y: 0,
    width: frameSize.width,
    height: frameSize.height,
  };
}

export function getCropFromAspectRatio(frameSize: VideoFrameSize, ratio: number, currentCrop: VideoCropRect) {
  if (!frameSize.width || !frameSize.height) {
    return roundCropRect({ x: 0, y: 0, width: 0, height: 0 });
  }

  const minimumSize = getMinimumCropSize(frameSize);
  const centerX = currentCrop.x + currentCrop.width / 2;
  const centerY = currentCrop.y + currentCrop.height / 2;
  const currentArea = Math.max(currentCrop.width * currentCrop.height, minimumSize * minimumSize);

  let width = Math.sqrt(currentArea * ratio);
  let height = width / ratio;

  if (width > frameSize.width) {
    width = frameSize.width;
    height = width / ratio;
  }

  if (height > frameSize.height) {
    height = frameSize.height;
    width = height * ratio;
  }

  const minimumHeight = Math.min(frameSize.height, minimumSize);
  const minimumWidth = Math.min(frameSize.width, minimumHeight * ratio);
  if (width < minimumWidth) {
    width = minimumWidth;
    height = width / ratio;
  }

  if (height < minimumHeight) {
    height = minimumHeight;
    width = height * ratio;
  }

  const x = clamp(centerX - width / 2, 0, Math.max(0, frameSize.width - width));
  const y = clamp(centerY - height / 2, 0, Math.max(0, frameSize.height - height));

  return normalizeCropRect({ x, y, width, height }, frameSize);
}

export function buildRectFromAnchor(
  anchor: { x: number; y: number },
  pointer: { x: number; y: number },
  frameSize: VideoFrameSize,
  aspectRatio: number | null,
) {
  const minSize = getMinimumCropSize(frameSize);
  const horizontalDirection = pointer.x >= anchor.x ? 1 : -1;
  const verticalDirection = pointer.y >= anchor.y ? 1 : -1;
  const maxWidth = horizontalDirection > 0 ? frameSize.width - anchor.x : anchor.x;
  const maxHeight = verticalDirection > 0 ? frameSize.height - anchor.y : anchor.y;

  if (!aspectRatio) {
    const width = clamp(Math.abs(pointer.x - anchor.x), Math.min(minSize, Math.max(maxWidth, 1)), Math.max(maxWidth, 1));
    const height = clamp(
      Math.abs(pointer.y - anchor.y),
      Math.min(minSize, Math.max(maxHeight, 1)),
      Math.max(maxHeight, 1),
    );
    const x = horizontalDirection > 0 ? anchor.x : anchor.x - width;
    const y = verticalDirection > 0 ? anchor.y : anchor.y - height;
    return normalizeCropRect({ x, y, width, height }, frameSize);
  }

  const widthLimit = Math.max(1, Math.min(maxWidth, maxHeight * aspectRatio));
  const minimumHeight = Math.min(widthLimit / aspectRatio, minSize);
  const minimumWidth = minimumHeight * aspectRatio;
  let width = Math.max(Math.abs(pointer.x - anchor.x), Math.abs(pointer.y - anchor.y) * aspectRatio, minimumWidth);
  width = clamp(width, minimumWidth, widthLimit);
  const height = width / aspectRatio;

  const x = horizontalDirection > 0 ? anchor.x : anchor.x - width;
  const y = verticalDirection > 0 ? anchor.y : anchor.y - height;
  return normalizeCropRect({ x, y, width, height }, frameSize);
}

export function normalizeTrimRange(startTime: number, endTime: number, duration: number) {
  const safeDuration = Math.max(duration, MIN_TRIM_DURATION);
  let nextStart = clamp(startTime, 0, safeDuration);
  let nextEnd = clamp(endTime > 0 ? endTime : safeDuration, 0, safeDuration);

  if (nextEnd < nextStart) {
    [nextStart, nextEnd] = [nextEnd, nextStart];
  }

  if (nextEnd - nextStart < MIN_TRIM_DURATION) {
    if (nextEnd + MIN_TRIM_DURATION <= safeDuration) {
      nextEnd = nextStart + MIN_TRIM_DURATION;
    } else {
      nextStart = Math.max(0, nextEnd - MIN_TRIM_DURATION);
    }
  }

  return {
    startTime: Number(nextStart.toFixed(3)),
    endTime: Number(nextEnd.toFixed(3)),
  };
}

export function formatEditorTime(value: number) {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  const minutes = Math.floor(safeValue / 60);
  const seconds = Math.floor(safeValue % 60);
  const hundredths = Math.floor((safeValue - Math.floor(safeValue)) * 100);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}
