/**
 * Executable check for lib/spreadsheet-safety.ts (CSV/XLSX formula injection).
 *   node --experimental-strip-types scripts/checks/spreadsheet-safety.check.mjs
 */
import { escapeSpreadsheetCell, sanitizeRowsForSpreadsheet } from '../../lib/spreadsheet-safety.ts';

const TAB = String.fromCharCode(9);

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) pass += 1;
  else {
    fail += 1;
    console.log('  FAIL', name);
  }
};

// --- formula starts are neutralized with a leading quote ---
check('= escaped', escapeSpreadsheetCell('=SUM(A1)') === "'=SUM(A1)");
check('DDE payload escaped', escapeSpreadsheetCell("=cmd|'/c calc'!A1") === "'=cmd|'/c calc'!A1");
check('@ escaped', escapeSpreadsheetCell('@SUM(A1)') === "'@SUM(A1)");
check('+formula escaped', escapeSpreadsheetCell('+1+cmd') === "'+1+cmd");
check('-formula escaped', escapeSpreadsheetCell('-2+3+cmd') === "'-2+3+cmd");
check('-command escaped', escapeSpreadsheetCell('-cmd|calc') === "'-cmd|calc");
check('tab-prefixed escaped', escapeSpreadsheetCell(`${TAB}=x`) === `'${TAB}=x`);

// --- legitimate data is NOT corrupted ---
check('plain text untouched', escapeSpreadsheetCell('hello') === 'hello');
check('date-like untouched', escapeSpreadsheetCell('2024-01-01') === '2024-01-01');
check('negative number untouched', escapeSpreadsheetCell('-2') === '-2');
check('positive signed number untouched', escapeSpreadsheetCell('+3.14') === '+3.14');
check('scientific number untouched', escapeSpreadsheetCell('-1.5e3') === '-1.5e3');
check('percent untouched', escapeSpreadsheetCell('-50%') === '-50%');
check('non-string number untouched', escapeSpreadsheetCell(5) === 5);
check('null untouched', escapeSpreadsheetCell(null) === null);
check('empty untouched', escapeSpreadsheetCell('') === '');

// --- row collections keep shape ---
const objRows = sanitizeRowsForSpreadsheet([{ a: '=x', b: 'ok', c: 5 }]);
check('object row escaped', objRows[0].a === "'=x" && objRows[0].b === 'ok' && objRows[0].c === 5);

const arrRows = sanitizeRowsForSpreadsheet([['=x', 'ok', '-2']]);
check('array row escaped', arrRows[0][0] === "'=x" && arrRows[0][1] === 'ok' && arrRows[0][2] === '-2');

console.log(`\nspreadsheet-safety: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
