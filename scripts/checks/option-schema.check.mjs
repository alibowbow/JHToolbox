/**
 * Executable check for lib/option-schema.ts (option value validation).
 *   node --experimental-strip-types scripts/checks/option-schema.check.mjs
 */
import { normalizeOptionValue, normalizeToolOptions, clampPositiveInteger } from '../../lib/option-schema.ts';

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) pass += 1;
  else {
    fail += 1;
    console.log('  FAIL', name);
  }
};

const num = { key: 'width', type: 'number', defaultValue: 1200, min: 320, max: 4096 };
const stepped = { key: 'q', type: 'range', defaultValue: 2, min: 0, max: 10, step: 1 };
const flag = { key: 'full', type: 'checkbox', defaultValue: false };
const sel = { key: 'fmt', type: 'select', defaultValue: 'png', options: [{ label: 'PNG', value: 'png' }, { label: 'JPG', value: 'jpg' }] };
const numSel = { key: 'n', type: 'select', defaultValue: 1, options: [{ label: 'one', value: 1 }, { label: 'two', value: 2 }] };
const text = { key: 't', type: 'text', defaultValue: '' };

// --- number coercion / validation ---
check('number ok', normalizeOptionValue(num, '1500') === 1500);
check('number NaN -> default', normalizeOptionValue(num, 'abc') === 1200);
check('number empty -> default', normalizeOptionValue(num, '') === 1200);
check('number Infinity -> default', normalizeOptionValue(num, 'Infinity') === 1200);
check('number over max clamps', normalizeOptionValue(num, '99999') === 4096);
check('number under min clamps', normalizeOptionValue(num, '10') === 320);
check('number numeric input clamps', normalizeOptionValue(num, 5000) === 4096);
check('step snaps', normalizeOptionValue(stepped, 2.7) === 3);
check('step + clamp', normalizeOptionValue(stepped, 100) === 10);

// --- the headline bug: Boolean("false") must be false ---
check('checkbox "false" -> false', normalizeOptionValue(flag, 'false') === false);
check('checkbox "true" -> true', normalizeOptionValue(flag, 'true') === true);
check('checkbox bool true', normalizeOptionValue(flag, true) === true);
check('checkbox junk -> default', normalizeOptionValue(flag, 'yes') === false);
check('checkbox number -> default', normalizeOptionValue(flag, 1) === false);

// --- select must be a real choice ---
check('select valid', normalizeOptionValue(sel, 'jpg') === 'jpg');
check('select invalid -> default', normalizeOptionValue(sel, 'gif') === 'png');
check('numeric select matches', normalizeOptionValue(numSel, '2') === 2);
check('numeric select invalid -> default', normalizeOptionValue(numSel, 'x') === 1);

// --- text ---
check('text passthrough', normalizeOptionValue(text, 'hi') === 'hi');
check('text coerces number', normalizeOptionValue(text, 123) === '123');
check('text object -> default', normalizeOptionValue(text, {}) === '');

// --- full bag: validate declared, preserve extra primitives, drop non-primitives ---
const bag = normalizeToolOptions([num, flag], { width: '99999', full: 'false', startTime: 5, bogus: { a: 1 } });
check('bag validates width', bag.width === 4096);
check('bag validates checkbox', bag.full === false);
check('bag preserves editor key', bag.startTime === 5);
check('bag drops non-primitive', !('bogus' in bag));

// --- clampPositiveInteger (anti-infinite-loop guard) ---
check('clamp NaN string -> fallback', clampPositiveInteger('abc', 10, 1e6, 1000) === 1000);
check('clamp undefined -> fallback', clampPositiveInteger(undefined, 10, 1e6, 1000) === 1000);
check('clamp Infinity -> fallback', clampPositiveInteger(Infinity, 10, 1e6, 1000) === 1000);
check('clamp below min', clampPositiveInteger(5, 10, 1e6, 1000) === 10);
check('clamp above max', clampPositiveInteger(2e9, 10, 1e6, 1000) === 1e6);
check('clamp in range', clampPositiveInteger(500, 10, 1e6, 1000) === 500);
check('clamp numeric string', clampPositiveInteger('250', 10, 1e6, 1000) === 250);
check('clamp floors', clampPositiveInteger(1000.9, 10, 1e6, 1000) === 1000);
check('clamp negative -> min', clampPositiveInteger(-5, 10, 1e6, 1000) === 10);

console.log(`\noption-schema: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
