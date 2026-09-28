/**
 * Where tiled watermark copies go (no runtime dependencies → unit testable).
 * Shared by the PDF watermark processor and its on-page preview so the preview
 * shows the same pattern the file gets.
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * Centres of the copies of a stamp tiled over a page, in a space whose y axis
 * points up (PDF). Copies run in lines along the stamp's own direction
 * (`degrees`, counter-clockwise), 1.4 stamp widths apart, with lines three
 * stamp heights apart and every other line shifted by half a step. Because the
 * grid turns with the stamp, rotated copies never run into each other.
 */
export function tiledWatermarkCenters(
  pageWidth: number,
  pageHeight: number,
  stampWidth: number,
  stampHeight: number,
  degrees: number,
  minStep = 120,
): Point[] {
  const width = Number.isFinite(pageWidth) && pageWidth > 0 ? pageWidth : 0;
  const height = Number.isFinite(pageHeight) && pageHeight > 0 ? pageHeight : 0;
  if (!width || !height) {
    return [];
  }
  const stampW = Number.isFinite(stampWidth) && stampWidth > 0 ? stampWidth : 1;
  const stampH = Number.isFinite(stampHeight) && stampHeight > 0 ? stampHeight : 1;
  const along = Math.max(stampW * 1.4, minStep);
  const across = Math.max(stampH * 3, minStep);
  const radians = ((Number.isFinite(degrees) ? degrees : 0) * Math.PI) / 180;
  const u = { x: Math.cos(radians), y: Math.sin(radians) };
  const v = { x: -Math.sin(radians), y: Math.cos(radians) };

  // A copy whose centre lies this far outside the page can still show on it.
  const margin = Math.hypot(stampW, stampH) / 2;
  const reach = Math.hypot(width, height) / 2 + margin;
  const lines = Math.ceil(reach / across);
  const perLine = Math.ceil(reach / along) + 1;
  const centre = { x: width / 2, y: height / 2 };

  const centers: Point[] = [];
  for (let line = -lines; line <= lines; line += 1) {
    const shift = (Math.abs(line) % 2) * (along / 2);
    for (let index = -perLine; index <= perLine; index += 1) {
      const a = index * along + shift;
      const b = line * across;
      const x = centre.x + a * u.x + b * v.x;
      const y = centre.y + a * u.y + b * v.y;
      if (x >= -margin && x <= width + margin && y >= -margin && y <= height + margin) {
        centers.push({ x, y });
      }
    }
  }
  return centers;
}
