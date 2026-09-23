/**
 * Executable check for lib/error-messages.ts: every error a processor throws
 * and every progress stage it reports has Korean copy, and raw library errors
 * turn into readable messages.
 *   node --experimental-strip-types scripts/checks/error-messages.check.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getDisplayMetadata, isAbortError, localizeErrorMessage, localizeStage } from '../../lib/error-messages.ts';
import { describeUrlRejection } from '../../lib/url-safety.ts';

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond === true) pass += 1;
  else {
    fail += 1;
    console.log('  FAIL', name);
  }
};
const hasHangul = (text) => /[가-힣]/.test(text);

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}
const sources = ['lib/processors', 'lib/hwpx', 'lib/pipeline', 'lib/workers', 'lib/audio'].flatMap(sourceFiles);
const allSource = sources.map((path) => readFileSync(path, 'utf8')).join('\n');

// Every literal error a processor throws has a Korean translation.
const thrown = new Set([...allSource.matchAll(/new Error\(\s*'([^']+)'\s*\)/g)].map((match) => match[1]));
check('found thrown errors to verify', thrown.size > 30);
for (const message of thrown) {
  const ko = localizeErrorMessage(new Error(message), 'ko');
  check(`ko copy for "${message}"`, hasHangul(ko));
  check(`en keeps "${message}"`, localizeErrorMessage(new Error(message), 'en') === message || !hasHangul(localizeErrorMessage(new Error(message), 'en')));
}

// Every URL rejection reason is translated.
for (const reason of ['empty', 'too-long', 'unsupported-scheme', 'credentials', 'loopback', 'metadata', 'non-public-ip', 'invalid']) {
  check(`url rejection ${reason}`, hasHangul(localizeErrorMessage(new Error(describeUrlRejection(reason)), 'ko')));
}

// Every progress stage has copy in both locales.
const stages = new Set([...allSource.matchAll(/stage: '([^']+)'/g)].map((match) => match[1]));
check('found stages to verify', stages.size > 30);
for (const stage of stages) {
  if (hasHangul(stage)) {
    check(`en copy for stage "${stage}"`, !hasHangul(localizeStage(stage, 'en')));
  } else {
    check(`ko copy for stage "${stage}"`, hasHangul(localizeStage(stage, 'ko')));
  }
}
check('templated stage', localizeStage('Re-rendering page 3 of 12', 'ko') === '페이지 다시 그리는 중 (3/12)');
check('waiting stage', localizeStage('Loading page (waiting 5s)', 'ko').includes('5초'));
check('already-localized stage passes through', localizeStage('실행 중', 'ko') === '실행 중');
check('empty stage', localizeStage('', 'ko') === '');

// Templated and library errors.
check('screenshot status', localizeErrorMessage(new Error('Screenshot service responded with status 503.'), 'ko').includes('503'));
check(
  'page order',
  localizeErrorMessage(new Error('Page order has entries that are not pages of this 4-page PDF: 7, 9.'), 'ko') ===
    '이 PDF(총 4쪽)에 없는 페이지가 순서에 들어 있습니다: 7, 9',
);
check('page order keeps English', localizeErrorMessage(new Error('Page order has entries that are not pages of this 4-page PDF: 7.'), 'en').startsWith('Page order'));
check(
  'encrypted pdf',
  localizeErrorMessage(new Error('Input document to `PDFDocument.load` is encrypted. You can use ...'), 'ko').includes('암호'),
);
check('encrypted pdf en', localizeErrorMessage(new Error('Input document to `PDFDocument.load` is encrypted.'), 'en').includes('password'));
check('not a pdf', localizeErrorMessage(new Error('Failed to parse PDF document (line:0 col:0 offset=0): No PDF header found'), 'ko').includes('PDF'));
check('json position', localizeErrorMessage(new SyntaxError('Unexpected token } in JSON at position 42'), 'ko').includes('42번째'));
check(
  'json line/column (Firefox)',
  localizeErrorMessage(new SyntaxError("JSON.parse: expected ',' or '}' after property value in object at line 3 column 5 of the JSON data"), 'ko').includes('3행 5열'),
);
check('json en keeps original', localizeErrorMessage(new SyntaxError('Unexpected end of JSON input'), 'en') === 'Unexpected end of JSON input');
check('zip', localizeErrorMessage(new Error("Can't find end of central directory : is this a zip file ?"), 'ko').includes('ZIP'));
check('network', localizeErrorMessage(new TypeError('Failed to fetch'), 'ko').includes('네트워크'));
check('network en', localizeErrorMessage(new TypeError('Failed to fetch'), 'en').includes('network'));
check('winansi', localizeErrorMessage(new Error('WinAnsi cannot encode "한" (0xd55c)'), 'ko').includes('한글'));
check('memory', localizeErrorMessage(new RangeError('Array buffer allocation failed'), 'ko').includes('메모리'));
check('abort', localizeErrorMessage(new DOMException('The operation was aborted.', 'AbortError'), 'ko') === '작업을 취소했습니다.');
check('isAbortError', isAbortError(new DOMException('x', 'AbortError')) && !isAbortError(new Error('x')));
check('permission (Chrome)', localizeErrorMessage(new DOMException('Permission denied', 'NotAllowedError'), 'ko').includes('권한'));
check(
  'permission (Safari)',
  localizeErrorMessage(new DOMException('The request is not allowed by the user agent or the platform in the current context.', 'NotAllowedError'), 'en').includes('Permission'),
);
check('device busy', localizeErrorMessage(new DOMException('Could not start video source', 'NotReadableError'), 'ko').includes('다른 앱'));
check('archive entries', localizeErrorMessage(new Error('This archive has too many entries (20001); refusing to extract.'), 'ko').includes('20001'));
check('unknown message passes through', localizeErrorMessage(new Error('Something odd'), 'ko') === 'Something odd');
check('empty error has copy', hasHangul(localizeErrorMessage(new Error(''), 'ko')));
check('string cause', localizeErrorMessage('Unsupported tool.', 'ko') === '지원하지 않는 도구입니다.');

// Result metadata: internal fields hidden, notes translated.
{
  const entries = getDisplayMetadata(
    {
      result: 'original-kept',
      reason: 'Recompression did not reduce the file size, so the original is returned unchanged.',
      originalBytes: 1234,
      pages: 3,
      repaired: true,
      mode: 'fidelity',
      removedPages: undefined,
    },
    'ko',
  );
  const keys = entries.map((entry) => entry.key);
  check('metadata hides internals', !keys.includes('result') && !keys.includes('originalBytes') && !keys.includes('mode'));
  check('metadata skips empty values', !keys.includes('removedPages'));
  check('metadata keeps pages', entries.find((entry) => entry.key === 'pages')?.label === '페이지');
  check('metadata translates reason', hasHangul(entries.find((entry) => entry.key === 'reason')?.value ?? ''));
  check('metadata marks notes long', entries.find((entry) => entry.key === 'reason')?.long === true);
}
{
  const entries = getDisplayMetadata({ differencesFound: false, changedPages: 0 }, 'en');
  check('metadata boolean en', entries.find((entry) => entry.key === 'differencesFound')?.value === 'No');
  check('metadata zero is kept', entries.find((entry) => entry.key === 'changedPages')?.value === '0');
}
{
  // Every English note or reason a processor attaches has Korean copy.
  const notes = [...allSource.matchAll(/(?:note|reason):\s*\n?\s*'([^']+)'/g)].map((match) => match[1]);
  check('found notes to verify', notes.length >= 8);
  for (const note of notes) {
    const [entry] = getDisplayMetadata({ note }, 'ko');
    check(`ko copy for note "${note.slice(0, 40)}…"`, hasHangul(entry?.value ?? ''));
  }
}

console.log(`\nerror-messages: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
