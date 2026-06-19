/**
 * Executable check for lib/tile-math.ts (image-split tiling with no lost pixels).
 *   node --experimental-strip-types scripts/checks/tile-math.check.mjs
 */
import { tileBoundaries } from '../../lib/tile-math.ts';

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond === true) pass += 1;
  else {
    fail += 1;
    console.log('  FAIL', name);
  }
};

// Every pixel is covered by exactly one tile: contiguous, no gaps/overlap, full total.
function coversExactly(total, count) {
  const tiles = tileBoundaries(total, count);
  if (tiles.length !== Math.max(1, Math.floor(count))) return false;
  let cursor = 0;
  let sum = 0;
  for (const { start, size } of tiles) {
    if (start !== cursor) return false; // gap or overlap
    if (size < 0) return false;
    cursor = start + size;
    sum += size;
  }
  return cursor === Math.max(0, Math.floor(total)) && sum === Math.max(0, Math.floor(total));
}

check('100 / 3 keeps remainder', coversExactly(100, 3));
check('1000 / 7', coversExactly(1000, 7));
check('10 / 2 even', coversExactly(10, 2));
check('7 / 3', coversExactly(7, 3));
check('1 / 1', coversExactly(1, 1));
check('2 / 3 (more splits than pixels)', coversExactly(2, 3));
check('4096 / 13', coversExactly(4096, 13));
check('odd 4097 / 16', coversExactly(4097, 16));

// explicit shapes
{
  const t = tileBoundaries(100, 3);
  check('100/3 shapes', t[0].size === 33 && t[1].size === 33 && t[2].size === 34);
}
{
  const t = tileBoundaries(10, 2);
  check('10/2 shapes', t[0].start === 0 && t[0].size === 5 && t[1].start === 5 && t[1].size === 5);
}
// guards
check('count<1 -> 1 tile', tileBoundaries(10, 0).length === 1);
check('NaN total -> 0', tileBoundaries(NaN, 2).every((t) => t.size === 0));

console.log(`\ntile-math: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
