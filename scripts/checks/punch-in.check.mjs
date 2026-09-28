/**
 * Executable check for lib/audio/punch-in.ts: recording over a clip replaces
 * the right frames, extends the clip either way, keeps gaps silent, crossfades
 * the joins and mixes mono with stereo.
 *   node --experimental-strip-types scripts/checks/punch-in.check.mjs
 */
import { punchIn } from '../../lib/audio/punch-in.ts';

let pass = 0;
let fail = 0;
const check = (name, cond, detail = '') => {
  if (cond === true) pass += 1;
  else {
    fail += 1;
    console.log('  FAIL', name, detail);
  }
};
const f = (values) => Float32Array.from(values);
const list = (channel) => Array.from(channel, (value) => Math.round(value * 1000) / 1000).join(',');

{
  const result = punchIn([f([1, 1, 1, 1])], 0, [f([2, 2])], 4);
  check('recording at the end continues the clip', list(result.channels[0]) === '1,1,1,1,2,2', list(result.channels[0]));
  check('start stays', result.startFrame === 0);
}
{
  const result = punchIn([f([1, 1, 1, 1, 1, 1])], 0, [f([2, 2])], 2);
  check('recording inside replaces those frames only', list(result.channels[0]) === '1,1,2,2,1,1', list(result.channels[0]));
}
{
  const result = punchIn([f([1, 1])], 3, [f([2, 2])], 0);
  check('recording before the clip moves its start', result.startFrame === 0);
  check('gap before the clip is silent', list(result.channels[0]) === '2,2,0,1,1', list(result.channels[0]));
}
{
  const result = punchIn([f([1, 1, 1])], 2, [f([2, 2, 2])], 1);
  check('take over the clip start', result.startFrame === 1 && list(result.channels[0]) === '2,2,2,1', list(result.channels[0]));
}
{
  const result = punchIn([f([1, 1])], 0, [f([2])], 4);
  check('gap after the clip is silent', list(result.channels[0]) === '1,1,0,0,2', list(result.channels[0]));
}
{
  const result = punchIn([f([1, 1])], 0, [f([2, 2, 2, 2])], 1);
  check('take past the end extends the clip', list(result.channels[0]) === '1,2,2,2,2', list(result.channels[0]));
}
{
  // Crossfade into the take and back out to the clip that continues.
  const result = punchIn([f(new Array(10).fill(1))], 0, [f([0, 0, 0, 0])], 3, 2);
  check('crossfaded joins', list(result.channels[0]) === '1,1,1,1,0.5,0,0.5,1,1,1', list(result.channels[0]));
}
{
  // No crossfade where nothing continues: appending starts at full level.
  const result = punchIn([f([1, 1])], 0, [f([0.5, 0.5])], 2, 2);
  check('append has no fade', list(result.channels[0]) === '1,1,0.5,0.5', list(result.channels[0]));
}
{
  const result = punchIn([f([1, 1, 1]), f([-1, -1, -1])], 0, [f([2])], 1);
  check('mono take into stereo clip: two channels', result.channels.length === 2);
  check('left written', list(result.channels[0]) === '1,2,1');
  check('right written', list(result.channels[1]) === '-1,2,-1');
}
{
  const result = punchIn([f([1, 1, 1])], 0, [f([2]), f([3])], 1);
  check('stereo take into mono clip: two channels', result.channels.length === 2);
  check('clip copied to both', list(result.channels[0]) === '1,2,1' && list(result.channels[1]) === '1,3,1');
}
{
  const result = punchIn(null, 0, [f([2, 2])], 7);
  check('empty track takes the recording where it started', result.startFrame === 7 && list(result.channels[0]) === '2,2');
}
{
  const clip = f([1, 1, 1]);
  punchIn([clip], 0, [f([9])], 1);
  check('the original clip is not modified', list(clip) === '1,1,1');
}

console.log(`\npunch-in: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
