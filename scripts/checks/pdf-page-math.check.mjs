/**
 * Executable check for lib/pdf-page-math.ts (PDF rotate + delete page logic).
 *   node --experimental-strip-types scripts/checks/pdf-page-math.check.mjs
 */
import { normalizePdfRotation, resolveDeletablePages } from '../../lib/pdf-page-math.ts';

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

console.log(`\npdf-page-math: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
