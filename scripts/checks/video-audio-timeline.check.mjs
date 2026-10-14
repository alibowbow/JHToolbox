/**
 * Executable check for lib/video-audio-timeline.ts: moving, trimming and
 * snapping an audio clip on a video, fitting it, and the ffmpeg graph.
 *   node --experimental-strip-types scripts/checks/video-audio-timeline.check.mjs
 */
import {
  MIN_CLIP_LENGTH,
  addAudioCommand,
  addAudioFilter,
  clipGainPoints,
  clipLength,
  dragClip,
  fitClipToVideo,
  normalizeClip,
} from '../../lib/video-audio-timeline.ts';

let pass = 0;
let fail = 0;
const check = (name, cond, detail = '') => {
  if (cond === true) pass += 1;
  else {
    fail += 1;
    console.log('  FAIL', name, detail);
  }
};
const near = (a, b) => Math.abs(a - b) < 1e-6;
const same = (a, b) => near(a.offset, b.offset) && near(a.start, b.start) && near(a.end, b.end);
const show = (c) => JSON.stringify(c);

// 60 s song on a 20 s video; snapping to 0, 20 and a playhead at 7.
const ctx = { audioDuration: 60, videoDuration: 20, snapPoints: [0, 20, 7], snapThreshold: 0.3 };
const clip = { offset: 2, start: 10, end: 18 }; // 8 s, sits at 2..10

// normalize
check('normal clip unchanged', same(normalizeClip(clip, ctx), clip));
check('end 0 means to the end of the audio', near(normalizeClip({ offset: 0, start: 5, end: 0 }, ctx).end, 60));
check('end past the audio is cut', near(normalizeClip({ offset: 0, start: 5, end: 99 }, ctx).end, 60));
check('start past the audio leaves a minimal clip', near(clipLength(normalizeClip({ offset: 0, start: 80, end: 90 }, ctx)), MIN_CLIP_LENGTH));
check('negative offset -> 0', near(normalizeClip({ offset: -3, start: 0, end: 5 }, ctx).offset, 0));
check('offset after the video is pulled back', normalizeClip({ offset: 50, start: 0, end: 5 }, ctx).offset < 20);
check('NaN values are safe', Number.isFinite(normalizeClip({ offset: NaN, start: NaN, end: NaN }, ctx).end));

// move
let r = dragClip(clip, 'move', 3, ctx);
check('move keeps the audio and length', same(r.clip, { offset: 5, start: 10, end: 18 }) && r.guide === null, show(r));
r = dragClip(clip, 'move', -1.85, ctx);
check('move: left edge sticks to the video start', same(r.clip, { offset: 0, start: 10, end: 18 }) && r.guide === 0, show(r));
r = dragClip(clip, 'move', 9.9, ctx);
check('move: right edge sticks to the video end', same(r.clip, { offset: 12, start: 10, end: 18 }) && r.guide === 20, show(r));
r = dragClip(clip, 'move', 4.8, ctx);
check('move: left edge sticks to the playhead', same(r.clip, { offset: 7, start: 10, end: 18 }) && r.guide === 7, show(r));
// A clip as long as the video (lengths differ by rounding): its right edge
// sticks to the video end, which pulls it a hair before 0; it is kept at 0
// and the guide still shows.
const whole = { audioDuration: 6, videoDuration: 1.5106, snapPoints: [0, 1.5106, 0], snapThreshold: 0.05 };
r = dragClip({ offset: 0.28, start: 0, end: 1.511 }, 'move', -0.26, whole);
check('move: guide shows when snapping ends at the clamp', near(r.clip.offset, 0) && r.guide !== null, show(r));
r = dragClip(clip, 'move', -10, ctx);
check('move: not before the video start', near(r.clip.offset, 0), show(r));
r = dragClip(clip, 'move', 3, { ...ctx, snapThreshold: 0 });
check('move: no snapping with threshold 0', same(r.clip, { offset: 5, start: 10, end: 18 }) && r.guide === null);

// trim start (left handle)
r = dragClip(clip, 'start', 2, ctx);
check('trim start: later audio, right edge stays', same(r.clip, { offset: 4, start: 12, end: 18 }), show(r));
r = dragClip(clip, 'start', -1.9, ctx);
check('trim start: sticks to the video start', same(r.clip, { offset: 0, start: 8, end: 18 }) && r.guide === 0, show(r));
r = dragClip(clip, 'start', -5, ctx);
check('trim start: stops at the video start', same(r.clip, { offset: 0, start: 8, end: 18 }), show(r));
r = dragClip({ offset: 5, start: 1, end: 9 }, 'start', -4, ctx);
check('trim start: stops at the audio start', same(r.clip, { offset: 4, start: 0, end: 9 }), show(r));
r = dragClip(clip, 'start', 50, ctx);
check('trim start: keeps a minimal clip', near(clipLength(r.clip), MIN_CLIP_LENGTH) && near(r.clip.end, 18), show(r));

// trim end (right handle)
r = dragClip(clip, 'end', 5, ctx);
check('trim end: longer clip', same(r.clip, { offset: 2, start: 10, end: 23 }), show(r));
r = dragClip(clip, 'end', 9.8, ctx);
check('trim end: sticks to the video end', same(r.clip, { offset: 2, start: 10, end: 28 }) && r.guide === 20, show(r));
r = dragClip(clip, 'end', -2.85, ctx);
check('trim end: sticks to the playhead', same(r.clip, { offset: 2, start: 10, end: 15 }) && r.guide === 7, show(r));
r = dragClip(clip, 'end', 500, ctx);
check('trim end: stops at the audio end', near(r.clip.end, 60), show(r));
r = dragClip(clip, 'end', -50, ctx);
check('trim end: keeps a minimal clip', near(clipLength(r.clip), MIN_CLIP_LENGTH), show(r));

// fit to video
check('fit: long audio fills the video from its start', same(fitClipToVideo(clip, ctx), { offset: 0, start: 10, end: 30 }));
check('fit: start near the end takes earlier audio', same(fitClipToVideo({ offset: 3, start: 55, end: 60 }, ctx), { offset: 0, start: 40, end: 60 }));
const short = { audioDuration: 6, videoDuration: 20 };
check('fit: short audio plays whole from the start', same(fitClipToVideo({ offset: 4, start: 2, end: 5 }, short), { offset: 0, start: 0, end: 6 }));

// ffmpeg and the browser-side mix
const settings = { clip, mode: 'replace', volume: 0.8, originalVolume: 0.5, fadeIn: 1, fadeOut: 2, videoDuration: 20 };
const alone = addAudioFilter(settings);
check('filter: trims, fades, delays and pads', alone === '[1:a]atrim=start=10:end=18,asetpts=PTS-STARTPTS,volume=0.8,afade=t=in:st=0:d=1,afade=t=out:st=6:d=2,adelay=2000:all=1,apad[aout]', alone);
check('no delay at offset 0', !addAudioFilter({ ...settings, clip: { ...clip, offset: 0 } }).includes('adelay'));
check('fades no longer than half the clip', addAudioFilter({ ...settings, fadeIn: 30, fadeOut: 0 }).includes('afade=t=in:st=0:d=4'));
const names = { video: 'v.webm', audio: 'a.mp3', output: 'o.webm', container: 'webm' };
const replace = addAudioCommand(settings, names);
check('replace copies the picture', replace.join(' ').includes('-map 0:v:0 -map [aout] -c:v copy'));
check('vorbis for webm at 48 kHz', replace.join(' ').includes('-c:a libvorbis -ar 48000'));
check('aac for mp4', addAudioCommand(settings, { ...names, container: 'mp4' }).includes('aac'));
check('cut to the video and ends with it', replace.join(' ').includes('-t 20 -shortest o.webm'));
check('overwrites leftovers', replace[0] === '-y');
check('no -t when the length is unknown', !addAudioCommand({ ...settings, videoDuration: 0 }, names).includes('-t'));
const muxed = addAudioCommand(settings, { ...names, mixed: 'm.wav' });
check('mix: joins the mixed WAV, no filter', muxed.join(' ').includes('-i v.webm -i m.wav -map 0:v:0 -map 1:a:0 -c:v copy') && !muxed.includes('-filter_complex'));
check('re-encode swaps copy for x264', addAudioCommand(settings, { ...names, container: 'mp4' }, true).join(' ').includes('-c:v libx264'));
const gains = clipGainPoints(settings);
check('gain: fade in, hold, fade out', JSON.stringify(gains) === JSON.stringify([[2, 0], [3, 0.8], [8, 0.8], [10, 0]]), JSON.stringify(gains));
check('gain: no fades -> volume from the start', JSON.stringify(clipGainPoints({ ...settings, fadeIn: 0, fadeOut: 0 })) === JSON.stringify([[2, 0.8]]));

console.log(`\nvideo-audio-timeline: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
