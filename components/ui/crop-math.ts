/**
 * Crop rectangle math shared by the image and video crop editors. All values
 * are in source pixels; results are rounded and kept inside the frame.
 */

export type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FrameSize = {
  width: number;
  height: number;
};

export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se';

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function roundCropRect(crop: CropRect): CropRect {
  return {
    x: Math.round(crop.x),
    y: Math.round(crop.y),
    width: Math.round(crop.width),
    height: Math.round(crop.height),
  };
}

export function cropEquals(left: CropRect, right: CropRect) {
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;
}

export function getMinimumCropSize(frameSize: FrameSize) {
  return Math.max(24, Math.round(Math.min(frameSize.width, frameSize.height) * 0.08));
}

export function normalizeCropRect(crop: CropRect, frameSize: FrameSize) {
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

export function getFullFrameCrop(frameSize: FrameSize): CropRect {
  return {
    x: 0,
    y: 0,
    width: frameSize.width,
    height: frameSize.height,
  };
}

export function getCropFromAspectRatio(frameSize: FrameSize, ratio: number, currentCrop: CropRect) {
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
  frameSize: FrameSize,
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

export function aspectRatioMatches(crop: CropRect, ratio: number) {
  if (!crop.width || !crop.height) {
    return false;
  }
  return Math.abs(crop.width / crop.height - ratio) < 0.02;
}

/** The fixed corner while dragging `handle`. */
export function anchorForHandle(crop: CropRect, handle: ResizeHandle) {
  switch (handle) {
    case 'nw':
      return { x: crop.x + crop.width, y: crop.y + crop.height };
    case 'ne':
      return { x: crop.x, y: crop.y + crop.height };
    case 'sw':
      return { x: crop.x + crop.width, y: crop.y };
    default:
      return { x: crop.x, y: crop.y };
  }
}
