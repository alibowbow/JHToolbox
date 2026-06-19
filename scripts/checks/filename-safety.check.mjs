/**
 * Executable check for lib/filename-safety.ts (Unicode-preserving download names).
 *   node --experimental-strip-types scripts/checks/filename-safety.check.mjs
 */
import { safeFileName, dedupeFileName } from '../../lib/filename-safety.ts';

const NUL = String.fromCharCode(0);

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) pass += 1;
  else {
    fail += 1;
    console.log('  FAIL', name);
  }
};

// --- Unicode / Korean is preserved (the core regression) ---
check('korean preserved', safeFileName('보고서.pdf') === '보고서.pdf');
check('accented preserved', safeFileName('résumé.docx') === 'résumé.docx');
check('plain preserved', safeFileName('normal-file_123.png') === 'normal-file_123.png');

// --- unsafe characters removed ---
check('path separators removed', safeFileName('a/b\\c.txt') === 'a-b-c.txt');
check('illegal chars removed', safeFileName('file:name?.txt') === 'file-name-.txt');
check('control chars removed', safeFileName(`a${NUL}b.txt`) === 'ab.txt');
check('collapse slashes', safeFileName('a//b') === 'a-b');

// --- trailing/leading dots & spaces ---
check('trailing dot trimmed', safeFileName('file.') === 'file');
check('leading dots trimmed', safeFileName('...hidden') === 'hidden');
check('spaces trimmed', safeFileName('  spaced.txt  ') === 'spaced.txt');

// --- Windows reserved names ---
check('reserved CON', safeFileName('CON') === '_CON');
check('reserved con.txt', safeFileName('con.txt') === '_con.txt');
check('reserved lpt1', safeFileName('LPT1.dat') === '_LPT1.dat');

// --- empty -> fallback ---
check('empty -> download', safeFileName('') === 'download');
check('whitespace -> download', safeFileName('   ') === 'download');
check('custom fallback', safeFileName('', 'output.bin') === 'output.bin');

// --- length cap preserves extension ---
{
  const long = `${'a'.repeat(300)}.txt`;
  const out = safeFileName(long);
  check('length capped', out.length <= 200 && out.endsWith('.txt'));
}

// --- dedupeFileName ---
{
  const seen = new Set();
  check('dedupe 1st', dedupeFileName('r.pdf', seen) === 'r.pdf');
  check('dedupe 2nd', dedupeFileName('r.pdf', seen) === 'r (2).pdf');
  check('dedupe 3rd', dedupeFileName('r.pdf', seen) === 'r (3).pdf');
  check('dedupe korean', dedupeFileName('보고서.pdf', seen) === '보고서.pdf');
  check('dedupe korean 2nd', dedupeFileName('보고서.pdf', seen) === '보고서 (2).pdf');
}

console.log(`\nfilename-safety: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
