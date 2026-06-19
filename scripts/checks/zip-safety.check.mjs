/**
 * Executable check for lib/zip-safety.ts (Zip-Slip + zip-bomb guards).
 *   node --experimental-strip-types scripts/checks/zip-safety.check.mjs
 */
import { sanitizeZipEntryName, dedupeEntryName, checkZipBomb, ZIP_LIMITS } from '../../lib/zip-safety.ts';

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

// --- sanitizeZipEntryName: safe paths pass through (normalized) ---
check('plain file', sanitizeZipEntryName('a.txt') === 'a.txt');
check('nested file', sanitizeZipEntryName('dir/sub/b.txt') === 'dir/sub/b.txt');
check('drops ./ segments', sanitizeZipEntryName('a/./b.txt') === 'a/b.txt');
check('backslashes normalized', sanitizeZipEntryName('dir\\sub\\c.txt') === 'dir/sub/c.txt');
check('unicode kept', sanitizeZipEntryName('문서/보고서.txt') === '문서/보고서.txt');

// --- Zip-Slip: traversal / absolute / drive / control -> null ---
check('block ../', sanitizeZipEntryName('../evil.txt') === null);
check('block deep ../', sanitizeZipEntryName('a/../../etc/passwd') === null);
check('block leading ../../', sanitizeZipEntryName('../../etc/passwd') === null);
check('block absolute posix', sanitizeZipEntryName('/etc/passwd') === null);
check('block windows drive', sanitizeZipEntryName('C:/Windows/system32') === null);
check('block backslash traversal', sanitizeZipEntryName('foo\\..\\..\\bar') === null);
check('block NUL', sanitizeZipEntryName(`a${NUL}b.txt`) === null);
check('block tab/control', sanitizeZipEntryName('a\tb.txt') === null);
check('block empty', sanitizeZipEntryName('') === null);
check('block dot-only', sanitizeZipEntryName('./') === null);

// --- dedupeEntryName ---
{
  const seen = new Set();
  check('dedupe 1st', dedupeEntryName('a.txt', seen) === 'a.txt');
  check('dedupe 2nd', dedupeEntryName('a.txt', seen) === 'a (2).txt');
  check('dedupe 3rd', dedupeEntryName('a.txt', seen) === 'a (3).txt');
  check('dedupe nested', dedupeEntryName('dir/a.txt', seen) === 'dir/a.txt');
  check('dedupe nested 2nd', dedupeEntryName('dir/a.txt', seen) === 'dir/a (2).txt');
  check('dedupe no-ext', dedupeEntryName('README', seen) === 'README');
  check('dedupe no-ext 2nd', dedupeEntryName('README', seen) === 'README (2)');
}

// --- checkZipBomb ---
check('normal entry allowed', checkZipBomb(1000, 500, 0) === null);
check('entry too large', checkZipBomb(ZIP_LIMITS.maxEntryBytes + 1, 1000, 0) === 'entry-too-large');
check('total too large', checkZipBomb(10, 5, ZIP_LIMITS.maxTotalBytes) === 'total-too-large');
check('ratio bomb blocked', checkZipBomb(2 * 1024 * 1024, 1024, 0) === 'ratio'); // 2MB from 1KB
check('high ratio under floor allowed', checkZipBomb(500 * 1024, 10, 0) === null); // <1MB floor
check('missing sizes allowed', checkZipBomb(0, 0, 0) === null);

console.log(`\nzip-safety: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
