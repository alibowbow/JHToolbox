/**
 * Pure geometry analysis for the layout-preserving PDF→HWPX mode.
 *
 * Input is what the PDF actually contains — positioned text lines and ruling
 * segments (stroked lines / thin filled rectangles) — and the output is a
 * layout plan: detected ruled tables (clean full grids only), leftover ruling
 * segments to draw as plain lines, and free text lines to place as text boxes.
 * No DOM/browser APIs → fully unit testable.
 *
 * All coordinates are PDF points with a TOP-LEFT origin (y grows downward).
 */

export interface PositionedTextLine {
  text: string;
  xPt: number;
  /** Top of the line's box. */
  yPt: number;
  widthPt: number;
  fontSizePt: number;
  bold: boolean;
}

export interface RuleSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface DetectedTable {
  /** Cell boundary coordinates, ascending; columns = xs.length - 1. */
  xs: number[];
  ys: number[];
  /** cells[row][col] = text lines assigned to that cell (top-to-bottom). */
  cells: PositionedTextLine[][][];
}

export interface LayoutPlan {
  tables: DetectedTable[];
  /** Ruling segments that were not part of a clean grid. */
  rules: RuleSegment[];
  /** Text lines not captured by any table cell. */
  freeText: PositionedTextLine[];
}

const AXIS_TOLERANCE = 1.2; // pt: how far off-axis a segment may be
const SNAP_TOLERANCE = 2.5; // pt: boundary coordinates closer than this merge
const JOIN_TOLERANCE = 3.0; // pt: gap allowed when merging collinear segments
const MIN_CELL_SIZE = 4; // pt: grids with cells smaller than this are noise
const SPAN_COVERAGE = 0.85; // each grid line must span this share of the bbox

type Axis = 'h' | 'v';

interface NormalizedSegment {
  axis: Axis;
  /** Fixed coordinate (y for horizontal, x for vertical). */
  at: number;
  from: number;
  to: number;
}

/** Classify raw segments as horizontal/vertical and drop diagonal noise. */
export function normalizeSegments(segments: RuleSegment[]): NormalizedSegment[] {
  const out: NormalizedSegment[] = [];
  for (const seg of segments) {
    const dx = Math.abs(seg.x2 - seg.x1);
    const dy = Math.abs(seg.y2 - seg.y1);
    if (dy <= AXIS_TOLERANCE && dx > MIN_CELL_SIZE) {
      out.push({ axis: 'h', at: (seg.y1 + seg.y2) / 2, from: Math.min(seg.x1, seg.x2), to: Math.max(seg.x1, seg.x2) });
    } else if (dx <= AXIS_TOLERANCE && dy > MIN_CELL_SIZE) {
      out.push({ axis: 'v', at: (seg.x1 + seg.x2) / 2, from: Math.min(seg.y1, seg.y2), to: Math.max(seg.y1, seg.y2) });
    }
  }
  return out;
}

/** Merge collinear segments that overlap or nearly touch. */
export function mergeCollinear(segments: NormalizedSegment[]): NormalizedSegment[] {
  const byAxis = new Map<string, NormalizedSegment[]>();
  for (const seg of segments) {
    // Bucket by axis + snapped fixed coordinate.
    const key = `${seg.axis}:${Math.round(seg.at / SNAP_TOLERANCE)}`;
    const bucket = byAxis.get(key) ?? [];
    bucket.push(seg);
    byAxis.set(key, bucket);
  }

  const merged: NormalizedSegment[] = [];
  for (const bucket of byAxis.values()) {
    bucket.sort((a, b) => a.from - b.from);
    let current = { ...bucket[0] };
    for (let i = 1; i < bucket.length; i += 1) {
      const seg = bucket[i];
      if (seg.from <= current.to + JOIN_TOLERANCE) {
        current.to = Math.max(current.to, seg.to);
        current.at = (current.at + seg.at) / 2;
      } else {
        merged.push(current);
        current = { ...seg };
      }
    }
    merged.push(current);
  }
  return merged;
}

/** Cluster segments whose bounding boxes touch into table candidates. */
function clusterSegments(segments: NormalizedSegment[]): NormalizedSegment[][] {
  const parent = segments.map((_, index) => index);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };

  const bboxOf = (seg: NormalizedSegment) =>
    seg.axis === 'h'
      ? { x1: seg.from, x2: seg.to, y1: seg.at, y2: seg.at }
      : { x1: seg.at, x2: seg.at, y1: seg.from, y2: seg.to };

  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const a = bboxOf(segments[i]);
      const b = bboxOf(segments[j]);
      const touches =
        a.x1 <= b.x2 + JOIN_TOLERANCE &&
        b.x1 <= a.x2 + JOIN_TOLERANCE &&
        a.y1 <= b.y2 + JOIN_TOLERANCE &&
        b.y1 <= a.y2 + JOIN_TOLERANCE;
      if (touches) {
        union(i, j);
      }
    }
  }

  const clusters = new Map<number, NormalizedSegment[]>();
  segments.forEach((seg, index) => {
    const root = find(index);
    const list = clusters.get(root) ?? [];
    list.push(seg);
    clusters.set(root, list);
  });
  return Array.from(clusters.values());
}

/** Deduplicate nearby boundary coordinates into sorted cell edges. */
function snapCoordinates(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const snapped: number[] = [];
  for (const value of sorted) {
    if (snapped.length === 0 || value - snapped[snapped.length - 1] > SNAP_TOLERANCE) {
      snapped.push(value);
    }
  }
  return snapped;
}

/**
 * Try to interpret one segment cluster as a clean full grid. Returns null when
 * the cluster is not clearly a table (then its segments render as plain rules).
 */
function toGrid(cluster: NormalizedSegment[]): { xs: number[]; ys: number[] } | null {
  const hs = cluster.filter((seg) => seg.axis === 'h');
  const vs = cluster.filter((seg) => seg.axis === 'v');
  if (hs.length < 2 || vs.length < 2) {
    return null;
  }

  const xs = snapCoordinates(vs.map((seg) => seg.at));
  const ys = snapCoordinates(hs.map((seg) => seg.at));
  if (xs.length < 2 || ys.length < 2) {
    return null;
  }

  const width = xs[xs.length - 1] - xs[0];
  const height = ys[ys.length - 1] - ys[0];
  if (width < MIN_CELL_SIZE * (xs.length - 1) || height < MIN_CELL_SIZE * (ys.length - 1)) {
    return null;
  }

  // A clean grid: every horizontal line spans (almost) the full width and
  // every vertical line the full height. Merged-cell tables fail this test and
  // fall back to visual rules, which is the honest choice for v1.
  const hFull = hs.every((seg) => seg.to - seg.from >= width * SPAN_COVERAGE);
  const vFull = vs.every((seg) => seg.to - seg.from >= height * SPAN_COVERAGE);
  if (!hFull || !vFull) {
    return null;
  }

  return { xs, ys };
}

function denormalize(seg: NormalizedSegment): RuleSegment {
  return seg.axis === 'h'
    ? { x1: seg.from, y1: seg.at, x2: seg.to, y2: seg.at }
    : { x1: seg.at, y1: seg.from, x2: seg.at, y2: seg.to };
}

/** Analyze one page: detect clean ruled tables and split the rest. */
export function analyzePageLayout(textLines: PositionedTextLine[], segments: RuleSegment[]): LayoutPlan {
  const merged = mergeCollinear(normalizeSegments(segments));
  const tables: DetectedTable[] = [];
  const rules: RuleSegment[] = [];
  const consumed = new Set<PositionedTextLine>();

  for (const cluster of clusterSegments(merged)) {
    const grid = toGrid(cluster);
    if (!grid) {
      rules.push(...cluster.map(denormalize));
      continue;
    }

    const { xs, ys } = grid;
    const cells: PositionedTextLine[][][] = Array.from({ length: ys.length - 1 }, () =>
      Array.from({ length: xs.length - 1 }, () => [] as PositionedTextLine[]),
    );

    for (const line of textLines) {
      if (consumed.has(line)) {
        continue;
      }
      const cx = line.xPt + line.widthPt / 2;
      const cy = line.yPt + line.fontSizePt / 2;
      if (cx < xs[0] || cx > xs[xs.length - 1] || cy < ys[0] || cy > ys[ys.length - 1]) {
        continue;
      }
      const col = xs.findIndex((edge, index) => index < xs.length - 1 && cx >= edge && cx <= xs[index + 1]);
      const row = ys.findIndex((edge, index) => index < ys.length - 1 && cy >= edge && cy <= ys[index + 1]);
      if (col >= 0 && row >= 0) {
        cells[row][col].push(line);
        consumed.add(line);
      }
    }

    for (const row of cells) {
      for (const cell of row) {
        cell.sort((a, b) => a.yPt - b.yPt || a.xPt - b.xPt);
      }
    }
    tables.push({ xs, ys, cells });
  }

  return {
    tables,
    rules,
    freeText: textLines.filter((line) => !consumed.has(line)),
  };
}
