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

export interface PageSelection {
  /** 0-based page indices, ascending and unique. */
  indices: number[];
  /** Entries that are not pages (or ranges) of this document. */
  invalidEntries: string[];
}

const PAGE_KEYWORDS: Record<string, (pageCount: number) => number[]> = {
  all: (count) => Array.from({ length: count }, (_, index) => index),
  odd: (count) => Array.from({ length: count }, (_, index) => index).filter((index) => index % 2 === 0),
  even: (count) => Array.from({ length: count }, (_, index) => index).filter((index) => index % 2 === 1),
  last: (count) => (count > 0 ? [count - 1] : []),
};
const KOREAN_PAGE_KEYWORDS: Record<string, string> = { 전체: 'all', 모두: 'all', 홀수: 'odd', 짝수: 'even', 마지막: 'last' };

function pageKeyword(entry: string): string | undefined {
  const key = KOREAN_PAGE_KEYWORDS[entry] ?? entry.toLowerCase();
  return key in PAGE_KEYWORDS ? key : undefined;
}

/**
 * Resolve a set of pages such as "2, 5-7", "3~1", "odd", "홀수" or "last".
 * Order and duplicates do not matter (unlike rearranging); entries that are
 * not pages of the document are reported for the caller to surface.
 */
export function resolvePageSelection(raw: string, pageCount: number): PageSelection {
  const selected = new Set<number>();
  const invalidEntries: string[] = [];
  const inRange = (pageNumber: number) => pageNumber >= 1 && pageNumber <= pageCount;

  const normalized = raw.replace(/\s*[-~]\s*/g, '-');
  for (const entry of normalized.split(/[\s,]+/).filter(Boolean)) {
    const keyword = pageKeyword(entry);
    const range = /^(\d+)-(\d+)$/.exec(entry);
    if (keyword) {
      PAGE_KEYWORDS[keyword](pageCount).forEach((index) => selected.add(index));
    } else if (range && inRange(Number(range[1])) && inRange(Number(range[2]))) {
      const from = Math.min(Number(range[1]), Number(range[2]));
      const to = Math.max(Number(range[1]), Number(range[2]));
      for (let pageNumber = from; pageNumber <= to; pageNumber += 1) {
        selected.add(pageNumber - 1);
      }
    } else if (/^\d+$/.test(entry) && inRange(Number(entry))) {
      selected.add(Number(entry) - 1);
    } else {
      invalidEntries.push(entry);
    }
  }

  return { indices: [...selected].sort((left, right) => left - right), invalidEntries };
}

export interface SplitPlan {
  /** Each output file's 0-based page indices, in reading order. */
  groups: Array<{ label: string; indices: number[] }>;
  invalidEntries: string[];
}

/**
 * Resolve how to split a document: an empty value makes one file per page;
 * "1-3, 4-6, 7" makes one file per comma-separated group.
 */
export function resolveSplitPlan(raw: string, pageCount: number): SplitPlan {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      groups: Array.from({ length: pageCount }, (_, index) => ({ label: String(index + 1), indices: [index] })),
      invalidEntries: [],
    };
  }

  const groups: SplitPlan['groups'] = [];
  const invalidEntries: string[] = [];
  for (const part of trimmed.split(',').map((item) => item.trim()).filter(Boolean)) {
    const selection = resolvePageSelection(part, pageCount);
    invalidEntries.push(...selection.invalidEntries);
    if (selection.indices.length > 0 && selection.invalidEntries.length === 0) {
      groups.push({ label: part.replace(/\s*[-~]\s*/g, '-'), indices: selection.indices });
    }
  }
  return { groups, invalidEntries };
}

/** 0-based indices → "1-3, 5" (the format resolvePageSelection reads back). */
export function formatPageSelection(indices: number[]): string {
  const pages = [...new Set(indices)].filter((index) => Number.isInteger(index) && index >= 0).sort((left, right) => left - right);
  const parts: string[] = [];
  for (let start = 0; start < pages.length; ) {
    let end = start;
    while (end + 1 < pages.length && pages[end + 1] === pages[end] + 1) {
      end += 1;
    }
    parts.push(end > start ? `${pages[start] + 1}-${pages[end] + 1}` : String(pages[start] + 1));
    start = end + 1;
  }
  return parts.join(', ');
}
