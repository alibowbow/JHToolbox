import { ptToHwpUnit, hwpUnitToPt, mmToHwpUnit, pdfPageToHwpPageSize, A4_WIDTH_HWPUNIT, A4_HEIGHT_HWPUNIT } from '../../lib/hwpx/units.ts';
let pass = 0, fail = 0;
const check = (n, c) => { if (c === true) pass++; else { fail++; console.log('  FAIL', n); } };

check('1pt = 100 HWPUNIT', ptToHwpUnit(1) === 100);
check('612pt (US Letter w) = 61200', ptToHwpUnit(612) === 61200);
check('round-trip', hwpUnitToPt(ptToHwpUnit(595.28)) === Math.round(595.28 * 100) / 100);
check('NaN pt -> 0', ptToHwpUnit(NaN) === 0);
check('A4 width 210mm = 59528 HWPUNIT', A4_WIDTH_HWPUNIT === Math.round((210 / 25.4) * 7200));
check('A4 297mm', A4_HEIGHT_HWPUNIT === mmToHwpUnit(297));
{
  const s = pdfPageToHwpPageSize(841.89, 595.28); // A4 landscape in pt
  check('landscape detected', s.landscape === true && s.widthHwp > s.heightHwp);
}
{
  const s = pdfPageToHwpPageSize(595.28, 841.89); // A4 portrait
  check('portrait', s.landscape === false);
}
console.log(`\nhwpx-units: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
