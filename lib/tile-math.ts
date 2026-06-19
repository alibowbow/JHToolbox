/**
 * Even tiling of a length into N segments with no lost remainder pixels (no
 * runtime dependencies → unit testable). `floor(total / count)` drops the
 * remainder on the right/bottom edge; this distributes it so every pixel lands
 * in exactly one tile.
 */

export interface Tile {
  start: number;
  size: number;
}

export function tileBoundaries(total: number, count: number): Tile[] {
  const safeTotal = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0));
  const safeCount = Math.max(1, Math.floor(Number.isFinite(count) ? count : 1));

  const tiles: Tile[] = [];
  for (let index = 0; index < safeCount; index += 1) {
    const start = Math.floor((index * safeTotal) / safeCount);
    const end = Math.floor(((index + 1) * safeTotal) / safeCount);
    tiles.push({ start, size: end - start });
  }
  return tiles;
}
