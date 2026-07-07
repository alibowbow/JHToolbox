/**
 * Even dimension/offset helpers for H.264 + yuv420p video (no runtime deps →
 * unit testable). libx264 with yuv420p requires even width/height (and even
 * crop offsets for chroma alignment); odd values make ffmpeg fail with
 * "height/width not divisible by 2".
 */

export function toEvenDimension(value: number, min = 2): number {
  const floored = Number.isFinite(value) ? Math.floor(value) : min;
  const even = floored - (floored % 2);
  return Math.max(min, even);
}

export function toEvenOffset(value: number): number {
  const floored = Number.isFinite(value) ? Math.floor(value) : 0;
  const nonNegative = Math.max(0, floored);
  return nonNegative - (nonNegative % 2);
}

export interface PngDimensions {
  width: number;
  height: number;
}

/**
 * Read a PNG's pixel size from its IHDR chunk (signature + length + "IHDR",
 * then 4-byte big-endian width and height). Returns null for anything that is
 * not a plausible PNG, so callers can treat the size as unknown.
 */
export function pngDimensions(bytes: Uint8Array): PngDimensions | null {
  const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || PNG_SIGNATURE.some((expected, index) => bytes[index] !== expected)) {
    return null;
  }
  // Bytes 12..15 must spell "IHDR" for offsets 16/20 to be width/height.
  if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}
