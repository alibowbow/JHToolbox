/**
 * Executable check for lib/pdf-reduction.ts (Reduce PDF Size option/decision logic).
 *   node --experimental-strip-types scripts/checks/pdf-reduction.check.mjs
 */
import {
  resolveReduceDpi,
  resolveReduceQuality,
  dpiToScale,
  summarizePdfReduction,
} from '../../lib/pdf-reduction.ts';

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond === true) pass += 1;
  else {
    fail += 1;
    console.log('  FAIL', name);
  }
};

// dpi: only allowed choices, else default 150
check('dpi 150', resolveReduceDpi(150) === 150);
check('dpi "300" string', resolveReduceDpi('300') === 300);
check('dpi 72', resolveReduceDpi(72) === 72);
check('dpi out-of-set -> 150', resolveReduceDpi(999) === 150);
check('dpi NaN -> 150', resolveReduceDpi('abc') === 150);

// quality: clamp 0.3..0.95, default 0.7
check('quality 0.7', resolveReduceQuality(0.7) === 0.7);
check('quality "0.85"', resolveReduceQuality('0.85') === 0.85);
check('quality over -> 0.95', resolveReduceQuality(2) === 0.95);
check('quality under -> 0.3', resolveReduceQuality(0.1) === 0.3);
check('quality NaN -> 0.7', resolveReduceQuality('x') === 0.7);

// dpi -> scale (72 DPI base)
check('72 -> scale 1', dpiToScale(72) === 1);
check('144 -> scale 2', dpiToScale(144) === 2);
check('150 -> ~2.083', Math.abs(dpiToScale(150) - 150 / 72) < 1e-9);

// only use the result when strictly smaller; report savings honestly
check('smaller -> use, 50% saved', JSON.stringify(summarizePdfReduction(1000, 500)) === JSON.stringify({ useReduced: true, savedPercent: 50 }));
check('larger -> keep original', summarizePdfReduction(1000, 1200).useReduced === false);
check('equal -> keep original', summarizePdfReduction(1000, 1000).useReduced === false);
check('tiny saving rounds', summarizePdfReduction(1000, 990).savedPercent === 1);
check('zero original -> keep', summarizePdfReduction(0, 500).useReduced === false);
check('zero reduced -> keep', summarizePdfReduction(1000, 0).useReduced === false);
check('kept original reports 0% saved', summarizePdfReduction(1000, 1200).savedPercent === 0);

console.log(`\npdf-reduction: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
