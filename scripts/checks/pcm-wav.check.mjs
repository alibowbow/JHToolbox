/**
 * Executable check for lib/audio/pcm-wav.ts: the recorder's WAV has the
 * right header, keeps every channel and interleaves samples in order.
 *   node --experimental-strip-types scripts/checks/pcm-wav.check.mjs
 */
import { countFrames, encodePcm16Wav, toPcm16 } from '../../lib/audio/pcm-wav.ts';

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond === true) pass += 1;
  else {
    fail += 1;
    console.log('  FAIL', name);
  }
};
const text = (view, offset, length) =>
  Array.from({ length }, (_, index) => String.fromCharCode(view.getUint8(offset + index))).join('');

// Sample conversion clips and uses the full 16-bit range.
check('silence', toPcm16(0) === 0);
check('full positive', toPcm16(1) === 32767);
check('full negative', toPcm16(-1) === -32768);
check('clips above 1', toPcm16(1.7) === 32767);
check('clips below -1', toPcm16(-3) === -32768);
check('half', toPcm16(0.5) === 16384);

// Mono, split over chunks.
{
  const wav = encodePcm16Wav([[Int16Array.from([1, 2, 3]), Int16Array.from([4, 5])]], 48_000);
  const view = new DataView(wav);
  check('RIFF', text(view, 0, 4) === 'RIFF');
  check('WAVE', text(view, 8, 4) === 'WAVE');
  check('fmt ', text(view, 12, 4) === 'fmt ');
  check('PCM', view.getUint16(20, true) === 1);
  check('mono', view.getUint16(22, true) === 1);
  check('sample rate', view.getUint32(24, true) === 48_000);
  check('byte rate', view.getUint32(28, true) === 96_000);
  check('block align', view.getUint16(32, true) === 2);
  check('16-bit', view.getUint16(34, true) === 16);
  check('data', text(view, 36, 4) === 'data');
  check('data size', view.getUint32(40, true) === 10);
  check('riff size', view.getUint32(4, true) === 36 + 10);
  check('total length', wav.byteLength === 44 + 10);
  const samples = Array.from({ length: 5 }, (_, index) => view.getInt16(44 + index * 2, true));
  check('mono samples in order', samples.join(',') === '1,2,3,4,5');
}

// Stereo: channels interleave L R L R, across chunk boundaries.
{
  const left = [Int16Array.from([10, 11]), Int16Array.from([12])];
  const right = [Int16Array.from([-10]), Int16Array.from([-11, -12])];
  const wav = encodePcm16Wav([left, right], 44_100);
  const view = new DataView(wav);
  check('stereo channels', view.getUint16(22, true) === 2);
  check('stereo block align', view.getUint16(32, true) === 4);
  check('stereo byte rate', view.getUint32(28, true) === 44_100 * 4);
  check('stereo data size', view.getUint32(40, true) === 12);
  const samples = Array.from({ length: 6 }, (_, index) => view.getInt16(44 + index * 2, true));
  check('interleaved', samples.join(',') === '10,-10,11,-11,12,-12');
}

check('countFrames', countFrames([Int16Array.from([1, 2]), Int16Array.from([3])]) === 3);
check('empty recording', encodePcm16Wav([[]], 48_000).byteLength === 44);

console.log(`\npcm-wav: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
