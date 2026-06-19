/**
 * Executable check for lib/html-sanitize.ts (string-level scrub + policy).
 *   node --experimental-strip-types scripts/checks/html-sanitize.check.mjs
 *
 * The DOMParser structural pass only runs in a browser; this exercises the
 * Node-runnable string scrub and policy predicates that ship as defense
 * alongside the iframe sandbox dropping allow-scripts.
 */
import { stripDangerousHtml, isEventHandlerAttribute, isUnsafeUrl } from '../../lib/html-sanitize.ts';

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond === true) pass += 1;
  else {
    fail += 1;
    console.log('  FAIL', name);
  }
};
const lacks = (html, needle) => !stripDangerousHtml(html).toLowerCase().includes(needle);
const keeps = (html, needle) => stripDangerousHtml(html).includes(needle);

// --- script execution + framing + external vectors are removed ---
check('removes <script> block', lacks('<script>alert(1)</script><p>ok</p>', '<script'));
check('keeps surrounding content', keeps('<script>x</script><p>ok</p>', '<p>ok</p>'));
check('removes script with attrs', lacks('<script src="http://evil/x.js"></script>', 'script'));
check('removes onclick', lacks('<p onclick="evil()">x</p>', 'onclick'));
check('removes onerror (img)', lacks('<img src="x" onerror="evil()">', 'onerror'));
check('removes unquoted handler', lacks('<b onmouseover=evil()>x</b>', 'onmouseover'));
check('removes <iframe>', lacks('<iframe src="http://evil"></iframe>hi', '<iframe'));
check('removes <object>', lacks('<object data="x"></object>', '<object'));
check('removes <embed>', lacks('<embed src="x">', '<embed'));
check('removes <base>', lacks('<base href="http://evil/">', '<base'));
check('removes <meta refresh>', lacks('<meta http-equiv="refresh" content="0">', '<meta'));
check('removes <link>', lacks('<link rel="stylesheet" href="http://evil.css">', '<link'));

{
  const out = stripDangerousHtml('<a href="javascript:alert(1)">x</a>');
  check('neutralizes javascript: href', !out.toLowerCase().includes('javascript:') && out.includes('href="#"'));
}

// --- safe content preserved ---
check('keeps korean text', keeps('<p style="color:red">한글 본문</p>', '한글 본문'));
check('keeps inline style', keeps('<p style="color:red">x</p>', 'style="color:red"'));
check('keeps data:image', keeps('<img src="data:image/png;base64,iVBOR">', 'data:image/png'));

// --- policy predicates ---
check('event attr onclick', isEventHandlerAttribute('onclick') === true);
check('event attr onLoad', isEventHandlerAttribute('onLoad') === true);
check('event attr href false', isEventHandlerAttribute('href') === false);
check('event attr bare on false', isEventHandlerAttribute('on') === false);

check('unsafe javascript', isUnsafeUrl('javascript:alert(1)') === true);
check('unsafe spaced/cased', isUnsafeUrl('  JavaScript:alert(1)') === true);
check('unsafe vbscript', isUnsafeUrl('vbscript:x') === true);
check('unsafe data html', isUnsafeUrl('data:text/html,<script>') === true);
check('safe data image', isUnsafeUrl('data:image/png;base64,iVBOR') === false);
check('safe https', isUnsafeUrl('https://example.com/a.png') === false);
check('safe anchor', isUnsafeUrl('#section') === false);

console.log(`\nhtml-sanitize: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
