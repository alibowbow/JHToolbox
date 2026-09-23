/**
 * Boxes drawn on PDF pages in the placement editor, stored as fractions of the
 * page as displayed (0–1, top-left origin) so they do not depend on the
 * render size. Pure → unit testable.
 */
export type PageRegion = { page: number; x: number; y: number; w: number; h: number };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Valid regions from a JSON option value; junk entries are dropped. */
export function parseRegions(raw: unknown): PageRegion[] {
  let parsed: unknown;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const regions: PageRegion[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const { page, x, y, w, h } = entry as Record<string, unknown>;
    const numbers = [page, x, y, w, h].map(Number);
    if (numbers.some((value) => !Number.isFinite(value))) continue;
    const left = clamp01(numbers[1]);
    const top = clamp01(numbers[2]);
    const width = Math.min(clamp01(numbers[3]), 1 - left);
    const height = Math.min(clamp01(numbers[4]), 1 - top);
    if (numbers[0] < 1 || width <= 0 || height <= 0) continue;
    regions.push({ page: Math.floor(numbers[0]), x: left, y: top, w: width, h: height });
  }
  return regions;
}

export function serializeRegions(regions: PageRegion[]): string {
  const round = (value: number) => Math.round(value * 10000) / 10000;
  return JSON.stringify(regions.map((region) => ({ page: region.page, x: round(region.x), y: round(region.y), w: round(region.w), h: round(region.h) })));
}

/** Regions per page number, ignoring pages the document does not have. */
export function groupRegionsByPage(regions: PageRegion[], pageCount: number): Map<number, PageRegion[]> {
  const byPage = new Map<number, PageRegion[]>();
  for (const region of regions) {
    if (region.page > pageCount) continue;
    byPage.set(region.page, [...(byPage.get(region.page) ?? []), region]);
  }
  return new Map([...byPage.entries()].sort(([left], [right]) => left - right));
}
