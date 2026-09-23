/**
 * Executable check for lib/text-encoding.ts (CSV/text input decoding).
 *   node --experimental-strip-types scripts/checks/text-encoding.check.mjs
 */
import { UTF8_BOM, decodeTextBytes } from '../../lib/text-encoding.ts';

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond === true) pass += 1;
  else {
    fail += 1;
    console.log('  FAIL', name);
  }
};

const hex = (value) => Uint8Array.from(Buffer.from(value, 'hex'));
const utf8 = (value) => new TextEncoder().encode(value);

// Korean Excel "CSV (쉼표로 분리)" saves CP949: "이름,나이\n홍길동,30\n"
const cp949 = decodeTextBytes(hex('c0ccb8a72cb3aac0cc0ac8abb1e6b5bf2c33300a'));
check('cp949 csv decoded', cp949.text === '이름,나이\n홍길동,30\n');
check('cp949 reported as euc-kr', cp949.encoding === 'euc-kr');

// CP949-only extension syllables (똠, 뷁) are not asserted here: browsers decode
// them (WHATWG "euc-kr" is Windows-949), but Node's ICU decoder is strict
// EUC-KR. tests/data-tools.spec.ts covers them in Chromium.

const plain = decodeTextBytes(utf8('이름,나이\n홍길동,30\n'));
check('utf-8 decoded', plain.text === '이름,나이\n홍길동,30\n' && plain.encoding === 'utf-8');

const withBom = decodeTextBytes(utf8(`${UTF8_BOM}name,city\nKim,서울\n`));
check('utf-8 BOM stripped (header stays "name")', withBom.text === 'name,city\nKim,서울\n');

const ascii = decodeTextBytes(utf8('a,b\n1,2\n'));
check('ascii stays utf-8', ascii.text === 'a,b\n1,2\n' && ascii.encoding === 'utf-8');

// Excel "Unicode text" export is UTF-16LE with a BOM.
const utf16 = decodeTextBytes(Uint8Array.from([0xff, 0xfe, ...Buffer.from('이름\t나이\n', 'utf16le')]));
check('utf-16le with BOM decoded', utf16.text === '이름\t나이\n' && utf16.encoding === 'utf-16le');

check('empty input decodes to empty string', decodeTextBytes(new Uint8Array()).text === '');
check('BOM constant is U+FEFF', UTF8_BOM === '﻿' && UTF8_BOM.length === 1);

console.log(`\ntext-encoding: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
