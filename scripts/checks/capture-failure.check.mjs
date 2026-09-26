/**
 * Executable check for lib/capture-failure.ts: failed screenshot-service
 * responses are read into the right reason, the most telling reason wins, and
 * every reason has Korean copy.
 *   node --experimental-strip-types scripts/checks/capture-failure.check.mjs
 */
import {
  CAPTURE_FAILURE_MESSAGES,
  CaptureError,
  classifyServiceFailure,
  isCaptureError,
  summarizeCaptureFailures,
} from '../../lib/capture-failure.ts';
import { localizeErrorMessage } from '../../lib/error-messages.ts';

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
const kindOf = (status, body) => classifyServiceFailure(status, body).kind;

// Microlink error payloads.
check('proxy needed = blocked', kindOf(400, '{"status":"fail","code":"EPROXYNEEDED","message":"EPROXYNEEDED, the target needs a proxy"}') === 'blocked');
check('timeout code', kindOf(504, '{"status":"fail","code":"ETIMEOUT","message":"ETIMEOUT, reached the timeout"}') === 'timeout');
check('browser timeout code', kindOf(500, '{"status":"fail","code":"EBRWSRTIMEOUT"}') === 'timeout');
check('rate limit code', kindOf(429, '{"status":"fail","code":"ERATE","message":"ERATE, daily limit"}') === 'quota');
check('invalid url code', kindOf(400, '{"status":"fail","code":"EINVALURL"}') === 'not-found');
check('lower-case code', kindOf(400, '{"code":"eproxyneeded"}') === 'blocked');

// What the service's browser said while opening the page.
check(
  'connection timed out = blocked',
  kindOf(500, '{"status":"fail","code":"EFATALCLIENT","message":"net::ERR_CONNECTION_TIMED_OUT at https://www.ruliweb.com/"}') === 'blocked',
);
check('connection refused = blocked', kindOf(500, '{"code":"EFATAL","message":"net::ERR_CONNECTION_REFUSED"}') === 'blocked');
check('connection reset (plain text)', kindOf(502, 'Error: net::ERR_CONNECTION_RESET') === 'blocked');
check('cloudflare challenge', kindOf(403, '<title>Just a moment...</title> Cloudflare') === 'blocked');
check('captcha', kindOf(200, '{"message":"The page shows a CAPTCHA"}') === 'blocked');
check('dns', kindOf(500, '{"code":"EFATAL","message":"net::ERR_NAME_NOT_RESOLVED at https://nope.invalid/"}') === 'not-found');
check('navigation timeout', kindOf(500, '{"code":"EFATAL","message":"Navigation timeout of 30000 ms exceeded"}') === 'timeout');
check('rate limit text', kindOf(503, 'Too Many Requests') === 'quota');

// Status alone.
check('429', kindOf(429, '') === 'quota');
check('408', kindOf(408, '') === 'timeout');
check('504', kindOf(504, '') === 'timeout');
check('502 is unknown', kindOf(502, '') === 'unknown');
check('weserv numeric code is ignored', kindOf(404, '{"status":"error","code":404,"message":"The image does not exist."}') === 'unknown');
check('detail names status and code', classifyServiceFailure(400, '{"code":"EPROXYNEEDED"}').detail === 'status 400, EPROXYNEEDED');
check('detail for plain status', classifyServiceFailure(502, '').detail === 'status 502');

// The most telling reason wins; "network" only when nothing else answered.
check('all network', summarizeCaptureFailures(['network', 'network', 'network']) === 'network');
check('blocked beats the rest', summarizeCaptureFailures(['blocked', 'network', 'unknown']) === 'blocked');
check('quota beats unknown', summarizeCaptureFailures(['network', 'quota', 'unknown']) === 'quota');
check('timeout beats blank', summarizeCaptureFailures(['timeout', 'network', 'blank']) === 'timeout');
check('blank beats unknown', summarizeCaptureFailures(['blank', 'network', 'unknown']) === 'blank');
check('network does not outweigh unknown', summarizeCaptureFailures(['network', 'unknown']) === 'unknown');
check('nothing tried', summarizeCaptureFailures([]) === 'unknown');

// The thrown error and its copy.
{
  const error = new CaptureError('blocked');
  check('error kind', error.kind === 'blocked');
  check('error name', error.name === 'CaptureError');
  check('error message', error.message === CAPTURE_FAILURE_MESSAGES.blocked);
  check('isCaptureError', isCaptureError(error) && !isCaptureError(new Error('x')) && !isCaptureError('x'));
  check('unknown keeps a detail', new CaptureError('unknown', 'status 502').message.endsWith('(status 502).'));
  check('detail only for unknown', new CaptureError('quota', 'status 429').message === CAPTURE_FAILURE_MESSAGES.quota);
}
for (const kind of Object.keys(CAPTURE_FAILURE_MESSAGES)) {
  const error = new CaptureError(kind, 'status 500');
  check(`ko copy for ${kind}`, hasHangul(localizeErrorMessage(error, 'ko')));
  check(`en keeps ${kind}`, localizeErrorMessage(error, 'en') === error.message);
}
check('ko copy for plain unknown', hasHangul(localizeErrorMessage(new CaptureError('unknown'), 'ko')));
check('blocked ko mentions overseas', localizeErrorMessage(new CaptureError('blocked'), 'ko').includes('해외'));

console.log(`\ncapture-failure: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
