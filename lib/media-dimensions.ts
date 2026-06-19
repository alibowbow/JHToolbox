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
