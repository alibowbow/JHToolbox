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

export interface RearrangePlan {
  /** 0-based page indices in output order, without duplicates. */
  order: number[];
  /** 1-based page numbers left out of the output, ascending. */
  removedPages: number[];
  /** Entries that are not page numbers (or ranges) of this document. */
  invalidEntries: string[];
}

/**
 * Resolve a page list such as "3,1,2", "4-6, 1" or "2~4" for rearranging. The list is
 * the pages to keep, in order — the visual page editor deletes pages this way —
 * so unlisted pages are removed and reported for the caller to surface. Entries
 * that do not exist in the document are reported instead of silently ignored.
 * An empty list keeps every page in its original order.
 */
export function resolveRearrangeOrder(orderRaw: string, pageCount: number): RearrangePlan {
  const order: number[] = [];
  const seen = new Set<number>();
  const invalidEntries: string[] = [];
  const keep = (pageNumber: number) => {
    if (!seen.has(pageNumber)) {
      seen.add(pageNumber);
      order.push(pageNumber - 1);
    }
  };
  const inRange = (pageNumber: number) => pageNumber >= 1 && pageNumber <= pageCount;

  // "1 - 3" and the Korean-style "1~3" both mean the range 1-3.
  const normalized = orderRaw.replace(/\s*[-~]\s*/g, '-');
  for (const entry of normalized.split(/[\s,]+/).filter(Boolean)) {
    const range = /^(\d+)-(\d+)$/.exec(entry);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (!inRange(from) || !inRange(to)) {
        invalidEntries.push(entry);
        continue;
      }
      const step = from <= to ? 1 : -1;
      for (let pageNumber = from; pageNumber !== to + step; pageNumber += step) {
        keep(pageNumber);
      }
    } else if (/^\d+$/.test(entry) && inRange(Number(entry))) {
      keep(Number(entry));
    } else {
      invalidEntries.push(entry);
    }
  }

  if (order.length === 0 && invalidEntries.length === 0) {
    return { order: Array.from({ length: pageCount }, (_, index) => index), removedPages: [], invalidEntries };
  }

  const removedPages: number[] = [];
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    if (!seen.has(pageNumber)) {
      removedPages.push(pageNumber);
    }
  }
  return { order, removedPages, invalidEntries };
}
