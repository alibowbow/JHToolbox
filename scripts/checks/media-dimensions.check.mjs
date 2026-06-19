/**
 * Executable check for lib/media-dimensions.ts (even video dimensions/offsets).
 *   node --experimental-strip-types scripts/checks/media-dimensions.check.mjs
 */
import { toEvenDimension, toEvenOffset } from '../../lib/media-dimensions.ts';

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond === true) pass += 1;
  else {
    fail += 1;
    console.log('  FAIL', name);
  }
};

// dimensions: floor to even, enforce min
check('even stays even', toEvenDimension(1280) === 1280);
check('odd -> even (down)', toEvenDimension(1281) === 1280);
check('odd 721 -> 720', toEvenDimension(721) === 720);
check('17 -> 16', toEvenDimension(17) === 16);
check('1 -> min 2', toEvenDimension(1) === 2);
check('0 -> min 2', toEvenDimension(0) === 2);
check('NaN -> min 2', toEvenDimension(NaN) === 2);
check('custom min applied', toEvenDimension(121, 120) === 120);

// offsets: floor to even, clamp >= 0
check('offset 0', toEvenOffset(0) === 0);
check('offset even', toEvenOffset(24) === 24);
check('offset odd -> even', toEvenOffset(23) === 22);
check('offset 5 -> 4', toEvenOffset(5) === 4);
check('offset negative -> 0', toEvenOffset(-3) === 0);
check('offset NaN -> 0', toEvenOffset(NaN) === 0);

// the core guarantee: results are always even
let allEven = true;
for (let n = -5; n <= 2000; n += 1) {
  if (toEvenDimension(n) % 2 !== 0) allEven = false;
  if (toEvenOffset(n) % 2 !== 0) allEven = false;
}
check('all results are even', allEven);

console.log(`\nmedia-dimensions: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
