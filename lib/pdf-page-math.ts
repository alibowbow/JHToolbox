/**
 * Pure helpers for PDF page operations (no runtime dependencies → unit testable).
 */

/**
 * Combine an existing page rotation with a delta and return a normalized angle
 * that is a multiple of 90 within [0, 360). Rotating must add to the page's
 * current rotation (not replace it), and must never produce an angle pdf-lib
 * would reject.
 */
export function normalizePdfRotation(existingDegrees: number, deltaDegrees: number): number {
  const existing = Number.isFinite(existingDegrees) ? existingDegrees : 0;
  const delta = Number.isFinite(deltaDegrees) ? deltaDegrees : 0;
  const snapped = Math.round((existing + delta) / 90) * 90;
  return ((snapped % 360) + 360) % 360;
}

export interface DeletablePages {
  /** Unique, in-range page indices to remove, sorted descending (safe to splice). */
  indices: number[];
  /** True when the request would remove every page (caller must refuse). */
  deletesAll: boolean;
}

/**
 * Resolve which page indices may be deleted: drop out-of-range and duplicate
 * indices (deleting the same index twice would remove the wrong page), sort
 * descending, and flag a request that would empty the document.
 */
export function resolveDeletablePages(requestedIndices: number[], pageCount: number): DeletablePages {
  const valid = Array.from(
    new Set(requestedIndices.filter((value) => Number.isInteger(value) && value >= 0 && value < pageCount)),
  );
  valid.sort((left, right) => right - left);
  return { indices: valid, deletesAll: pageCount > 0 && valid.length >= pageCount };
}
