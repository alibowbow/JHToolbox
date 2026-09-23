/**
 * Executable check for lib/pdf-page-math.ts (PDF rotate + delete page logic).
 *   node --experimental-strip-types scripts/checks/pdf-page-math.check.mjs
 */
import { normalizePdfRotation, resolveDeletablePages, resolveRearrangeOrder } from '../../lib/pdf-page-math.ts';

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond === true) pass += 1;
  else {
    fail += 1;
    console.log('  FAIL', name);
  }
};
const eqArr = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// --- rotation accumulates and stays a multiple of 90 in [0,360) ---
check('0 + 90 = 90', normalizePdfRotation(0, 90) === 90);
check('90 + 90 = 180', normalizePdfRotation(90, 90) === 180);
check('270 + 90 = 0 (wrap)', normalizePdfRotation(270, 90) === 0);
check('90 - 90 = 0', normalizePdfRotation(90, -90) === 0);
check('0 - 90 = 270', normalizePdfRotation(0, -90) === 270);
check('0 + 180 = 180', normalizePdfRotation(0, 180) === 180);
check('0 + 360 = 0', normalizePdfRotation(0, 360) === 0);
check('270 + 180 = 90', normalizePdfRotation(270, 180) === 90);
check('NaN existing -> treated 0', normalizePdfRotation(NaN, 90) === 90);
check('NaN delta -> treated 0', normalizePdfRotation(0, NaN) === 0);

// --- delete pages: dedupe, range, descending, refuse delete-all ---
{
  const r = resolveDeletablePages([0, 2, 2, 5], 4);
  check('dedupe + in-range + desc', eqArr(r.indices, [2, 0]) && r.deletesAll === false);
}
{
  const r = resolveDeletablePages([0, 1, 2], 3);
  check('delete all flagged', r.deletesAll === true && eqArr(r.indices, [2, 1, 0]));
}
{
  const r = resolveDeletablePages([0, 1, 2, 2, 1], 3);
  check('delete all via dupes flagged', r.deletesAll === true);
}
{
  const r = resolveDeletablePages([], 3);
  check('empty request', eqArr(r.indices, []) && r.deletesAll === false);
}
{
  const r = resolveDeletablePages([5, 6], 3);
  check('all out of range', eqArr(r.indices, []) && r.deletesAll === false);
}
{
  const r = resolveDeletablePages([1], 3);
  check('single mid page', eqArr(r.indices, [1]) && r.deletesAll === false);
}

// --- rearrange: listed pages are kept in order, the rest are reported removed ---
{
  const partial = resolveRearrangeOrder('3,1', 5);
  check('rearrange 3,1 of 5 -> order [2,0]', eqArr(partial.order, [2, 0]));
  check('rearrange 3,1 of 5 -> removed [2,4,5]', eqArr(partial.removedPages, [2, 4, 5]));
  check('rearrange 3,1 of 5 -> no invalid entries', partial.invalidEntries.length === 0);

  const full = resolveRearrangeOrder('2,1,3', 3);
  check('full permutation keeps every page', eqArr(full.order, [1, 0, 2]) && full.removedPages.length === 0);

  const empty = resolveRearrangeOrder('  ', 4);
  check('empty order keeps all pages in order', eqArr(empty.order, [0, 1, 2, 3]) && empty.removedPages.length === 0);

  const spaced = resolveRearrangeOrder(' 2 , 1 ', 2);
  check('whitespace tolerated', eqArr(spaced.order, [1, 0]) && spaced.invalidEntries.length === 0);

  const dupes = resolveRearrangeOrder('1,1,2', 3);
  check('duplicates collapse to first occurrence', eqArr(dupes.order, [0, 1]) && eqArr(dupes.removedPages, [3]));

  const ranges = resolveRearrangeOrder('4-6,1', 6);
  check('ascending range expands', eqArr(ranges.order, [3, 4, 5, 0]) && eqArr(ranges.removedPages, [2, 3]));

  const tilde = resolveRearrangeOrder('2~4, 1', 5);
  check('"~" range and spaced range accepted', eqArr(tilde.order, [1, 2, 3, 0]) && tilde.invalidEntries.length === 0);
  check('spaced dash range accepted', eqArr(resolveRearrangeOrder('1 - 2', 3).order, [0, 1]));

  const reversed = resolveRearrangeOrder('3-1', 3);
  check('descending range reverses pages', eqArr(reversed.order, [2, 1, 0]));

  const outOfRange = resolveRearrangeOrder('1,7,0', 5);
  check('out-of-range pages reported, not ignored', eqArr(outOfRange.invalidEntries, ['7', '0']));
  check('valid entries still resolved alongside invalid ones', eqArr(outOfRange.order, [0]));

  const junk = resolveRearrangeOrder('abc,2-9,1.5', 5);
  check('non-numeric / bad range / decimal all reported', eqArr(junk.invalidEntries, ['abc', '2-9', '1.5']));
  check('all-invalid order keeps nothing (caller must refuse)', junk.order.length === 0);
}

console.log(`\npdf-page-math: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
