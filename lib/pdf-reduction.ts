/**
 * Pure helpers for the "Reduce PDF Size" tool (no runtime dependencies → unit
 * testable). The actual page rendering happens in the browser (pdf.js + canvas);
 * these cover option validation and the honest "only use the result if it is
 * actually smaller" decision.
 */

export const REDUCE_DPI_CHOICES = [72, 96, 150, 200, 300] as const;
export const DEFAULT_REDUCE_DPI = 150;
export const DEFAULT_REDUCE_QUALITY = 0.7;

export function resolveReduceDpi(value: unknown): number {
  const parsed = Math.round(Number(value));
  return (REDUCE_DPI_CHOICES as readonly number[]).includes(parsed) ? parsed : DEFAULT_REDUCE_DPI;
}

export function resolveReduceQuality(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_REDUCE_QUALITY;
  }
  return Math.min(0.95, Math.max(0.3, parsed));
}

/** pdf.js viewport scale for a target DPI (PDF user space is 72 DPI). */
export function dpiToScale(dpi: number): number {
  const safe = Number.isFinite(dpi) && dpi > 0 ? dpi : DEFAULT_REDUCE_DPI;
  return safe / 72;
}

export interface ReductionSummary {
  /** True only when the recompressed file is strictly smaller than the original. */
  useReduced: boolean;
  /** Percent saved (0 when the original is kept). */
  savedPercent: number;
}

export function summarizePdfReduction(originalBytes: number, reducedBytes: number): ReductionSummary {
  const original = Number.isFinite(originalBytes) ? originalBytes : 0;
  const reduced = Number.isFinite(reducedBytes) ? reducedBytes : 0;
  const useReduced = original > 0 && reduced > 0 && reduced < original;
  const savedPercent = useReduced ? Math.max(0, Math.round((1 - reduced / original) * 100)) : 0;
  return { useReduced, savedPercent };
}

export type ReduceMode = 'keep-text' | 'flatten';

export function resolveReduceMode(value: unknown): ReduceMode {
  return value === 'flatten' ? 'flatten' : 'keep-text';
}

/**
 * Cap on an embedded image's longest pixel edge for the "keep text" mode,
 * derived from the chosen DPI (~11-inch long edge). Images bigger than this are
 * downscaled before recompression; smaller images keep their pixel dimensions.
 */
export function dpiToMaxImageDimension(dpi: number): number {
  const safe = (REDUCE_DPI_CHOICES as readonly number[]).includes(Math.round(Number(dpi)))
    ? Math.round(Number(dpi))
    : DEFAULT_REDUCE_DPI;
  return Math.round(safe * 11);
}

/** Shrink (never enlarge) to fit the longest edge within maxDimension, preserving aspect. */
export function computeDownscaledSize(
  width: number,
  height: number,
  maxDimension: number,
): { width: number; height: number } {
  const w = Math.max(1, Math.floor(Number.isFinite(width) ? width : 1));
  const h = Math.max(1, Math.floor(Number.isFinite(height) ? height : 1));
  const longest = Math.max(w, h);
  if (!Number.isFinite(maxDimension) || maxDimension <= 0 || longest <= maxDimension) {
    return { width: w, height: h };
  }
  const scale = maxDimension / longest;
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}
