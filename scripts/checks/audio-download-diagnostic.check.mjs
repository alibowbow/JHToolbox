import assert from 'node:assert/strict';
import { base64Length, CASES, createFixture, MAX_BYTES, prepareDataUri, synthesizeWav } from '../../app/tools/audio/download-diagnostic/fixture.ts';

assert.equal(MAX_BYTES, 42_336_044);
assert.equal(base64Length(MAX_BYTES), 56_448_060);
assert.equal(base64Length(176_444), 235_260);
const signal = new AbortController().signal;
for (const channels of [1, 2]) {
  const bytes = await synthesizeWav(2, channels, signal);
  const view = new DataView(bytes.buffer);
  assert.equal(bytes.length, 44 + 2 * 44_100 * channels * 2);
  assert.equal(view.getUint16(22, true), channels);
  assert.equal(view.getUint32(24, true), 44_100);
  assert.equal(view.getUint16(34, true), 16);
}
for (const seconds of [-1, 0, 241, Infinity, NaN]) {
  await assert.rejects(synthesizeWav(seconds, 2, signal), /허용되지/);
}
await assert.rejects(synthesizeWav(240, 8, signal), /허용되지/);
await assert.rejects(createFixture({ ...CASES[4], seconds: 600 }, signal, () => {}), /허용되지/);
await assert.rejects(createFixture({ ...CASES[4], channels: 8 }, signal, () => {}), /허용되지/);
await assert.rejects(prepareDataUri(new Blob(['bad'], { type: 'text/html' }), signal), /제한 초과/);
// A size-only stand-in ensures rejection happens before FileReader / allocation.
await assert.rejects(prepareDataUri({ size: MAX_BYTES + 1, type: 'audio/wav' }, signal), /제한 초과/);
const cancelled = new AbortController();
cancelled.abort();
await assert.rejects(synthesizeWav(240, 2, cancelled.signal), { name: 'AbortError' });
const interrupted = new AbortController();
const generating = synthesizeWav(240, 2, interrupted.signal);
interrupted.abort();
await assert.rejects(generating, { name: 'AbortError' });
console.log('PASS: fixture allowlist, PCM header, exact byte/base64 limits, pre-allocation rejection, cancellation');
