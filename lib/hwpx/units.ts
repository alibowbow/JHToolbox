/**
 * Coordinate/measure conversions between PDF points and HWP units (no runtime
 * dependencies → unit testable).
 *
 * - PDF user space: 1 point = 1/72 inch.
 * - HWPUNIT: 1/7200 inch.
 * So 1 pt = 100 HWPUNIT exactly.
 */

export const HWPUNIT_PER_POINT = 100;

export function ptToHwpUnit(pt: number): number {
  return Math.round((Number.isFinite(pt) ? pt : 0) * HWPUNIT_PER_POINT);
}

export function hwpUnitToPt(unit: number): number {
  return (Number.isFinite(unit) ? unit : 0) / HWPUNIT_PER_POINT;
}

export function mmToHwpUnit(mm: number): number {
  // 1 inch = 25.4 mm; HWPUNIT = inch * 7200.
  return Math.round(((Number.isFinite(mm) ? mm : 0) / 25.4) * 7200);
}

/** A4 portrait in HWPUNIT (210 x 297 mm) — used as a sane default page size. */
export const A4_WIDTH_HWPUNIT = mmToHwpUnit(210);
export const A4_HEIGHT_HWPUNIT = mmToHwpUnit(297);

export interface HwpPageSize {
  widthHwp: number;
  heightHwp: number;
  landscape: boolean;
}

/** Convert a PDF page's point dimensions (already accounting for rotation) to an HWPX page size. */
export function pdfPageToHwpPageSize(widthPt: number, heightPt: number): HwpPageSize {
  const widthHwp = ptToHwpUnit(widthPt);
  const heightHwp = ptToHwpUnit(heightPt);
  return { widthHwp, heightHwp, landscape: widthHwp > heightHwp };
}
