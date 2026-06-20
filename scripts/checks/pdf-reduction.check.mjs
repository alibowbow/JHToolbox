/**
 * Executable check for lib/pdf-reduction.ts (Reduce PDF Size option/decision logic).
 *   node --experimental-strip-types scripts/checks/pdf-reduction.check.mjs
 */
import {
  resolveReduceDpi,
  resolveReduceQuality,
  dpiToScale,
  summarizePdfReduction,
  resolveReduceMode,
  dpiToMaxImageDimension,
  computeDownscaledSize,
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

// mode resolution
check('mode flatten', resolveReduceMode('flatten') === 'flatten');
check('mode keep-text', resolveReduceMode('keep-text') === 'keep-text');
check('mode unknown -> flatten (default)', resolveReduceMode('x') === 'flatten');
check('mode undefined -> flatten (default)', resolveReduceMode(undefined) === 'flatten');

// dpi -> max image dimension (~11in long edge)
check('150 dpi -> 1650', dpiToMaxImageDimension(150) === 1650);
check('300 dpi -> 3300', dpiToMaxImageDimension(300) === 3300);
check('72 dpi -> 792', dpiToMaxImageDimension(72) === 792);
check('bad dpi -> default 1650', dpiToMaxImageDimension('abc') === 1650);

// downscale: only shrink, preserve aspect
check('no upscale', JSON.stringify(computeDownscaledSize(1000, 500, 2000)) === JSON.stringify({ width: 1000, height: 500 }));
check('landscape shrink', JSON.stringify(computeDownscaledSize(4000, 2000, 1650)) === JSON.stringify({ width: 1650, height: 825 }));
check('portrait shrink', JSON.stringify(computeDownscaledSize(500, 4000, 1650)) === JSON.stringify({ width: 206, height: 1650 }));
check('no cap', JSON.stringify(computeDownscaledSize(100, 100, 0)) === JSON.stringify({ width: 100, height: 100 }));
check('degenerate -> 1x1', JSON.stringify(computeDownscaledSize(0, 0, 1650)) === JSON.stringify({ width: 1, height: 1 }));

console.log(`\npdf-reduction: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
