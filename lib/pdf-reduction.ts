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
