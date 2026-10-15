/**
 * Executable check for lib/video-editor/project.ts: the main track, splitting,
 * trimming, moving, speed, text and music items, snapping and playback math.
 *   node --experimental-strip-types scripts/checks/video-editor.check.mjs
 */
import {
  MIN_LENGTH,
  addClip,
  clipAt,
  dragMusic,
  dragText,
  dropIndex,
  emptyProject,
  frameSize,
  gainAt,
  layoutClips,
  moveClip,
  musicGainPoints,
  musicStart,
  newMusic,
  newText,
  pictureAlpha,
  placePicture,
  projectDuration,
  removeItem,
  setClipSpeed,
  setPhotoLength,
  snapPoints,
  splitClipAt,
  splitItemAt,
  textsAt,
  trimClip,
} from '../../lib/video-editor/project.ts';

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
const show = (value) => JSON.stringify(value);

const video = { id: 'v', kind: 'video', name: 'a.mp4', duration: 10, width: 1920, height: 1080 };
const photo = { id: 'p', kind: 'image', name: 'b.jpg', duration: 0, width: 1080, height: 1350 };
const song = { id: 's', kind: 'audio', name: 'c.mp3', duration: 30, width: 0, height: 0 };
const assets = { v: video, p: photo, s: song };

// Build: video (10 s) then photo (3 s)
let project = addClip(addClip(emptyProject(), video, 'c1'), photo, 'c2');
check('two clips', project.clips.length === 2);
check('duration 13', near(projectDuration(project), 13));
check('layout', show(layoutClips(project).map((e) => [e.start, e.end])) === show([[0, 10], [10, 13]]));
check('photo lasts 3 s', near(project.clips[1].out, 3));
check('insert after the first', addClip(project, photo, 'x', 0).clips[1].id === 'x');

// clipAt
let hit = clipAt(project, 4);
check('clipAt video', hit.index === 0 && near(hit.sourceTime, 4));
hit = clipAt(project, 11.5);
check('clipAt photo', hit.index === 1 && near(hit.sourceTime, 1.5));
check('clipAt past the end -> last', clipAt(project, 99).index === 1);
check('clipAt empty -> null', clipAt(emptyProject(), 1) === null);

// split
let split = splitClipAt(project, 4, 'c3');
check('split makes three', split.clips.length === 3);
check('split keeps the length', near(projectDuration(split), 13));
check('split parts', show(split.clips.slice(0, 2).map((c) => [c.in, c.out])) === show([[0, 4], [4, 10]]));
check('split on a cut does nothing', splitClipAt(project, 10, 'x').clips.length === 2);
check('split at the very start does nothing', splitClipAt(project, 0.05, 'x').clips.length === 2);
const fast = setClipSpeed(project, 'c1', 2);
check('speed halves the length', near(projectDuration(fast), 8));
const fastSplit = splitClipAt(fast, 2, 'c3');
check('split a fast clip at source time 4', near(fastSplit.clips[0].out, 4) && near(fastSplit.clips[1].in, 4));
check('speed clamps to 4', setClipSpeed(project, 'c1', 9).clips[0].speed === 4);

// delete and move
check('delete', removeItem(split, { kind: 'clip', id: 'c3' }).clips.length === 2);
const moved = moveClip(project, 1, 0);
check('move photo first', moved.clips[0].id === 'c2' && near(layoutClips(moved)[1].start, 3));
check('move out of range is clamped', moveClip(project, 0, 99).clips[1].id === 'c1');
check('dropIndex: before the photo middle -> 0 of others', dropIndex(project, 11, 0) === 0);
check('dropIndex: past the photo middle -> end', dropIndex(project, 12.5, 0) === 1);
check('dropIndex: dragging the photo to the start', dropIndex(project, 1, 1) === 0);

// trim
let trimmed = trimClip(project, 'c1', 'start', 2, video);
check('trim start', near(trimmed.clips[0].in, 2) && near(projectDuration(trimmed), 11));
trimmed = trimClip(project, 'c1', 'start', -5, video);
check('trim start stops at the source start', near(trimmed.clips[0].in, 0));
trimmed = trimClip(project, 'c1', 'end', 5, video);
check('trim end stops at the source end', near(trimmed.clips[0].out, 10));
trimmed = trimClip(project, 'c1', 'end', -20, video);
check('trim keeps a minimal clip', near(trimmed.clips[0].out - trimmed.clips[0].in, MIN_LENGTH));
trimmed = trimClip(project, 'c2', 'end', 4, photo);
check('photo end stretches', near(trimmed.clips[1].out, 7));
trimmed = trimClip(project, 'c2', 'start', 1, photo);
check('photo start shortens', near(trimmed.clips[1].out, 2) && near(trimmed.clips[1].in, 0));
trimmed = trimClip(fast, 'c1', 'end', -1, video);
check('trimming a 2x clip by 1 s removes 2 s of source', near(trimmed.clips[0].out, 8));
check('photo length', near(setPhotoLength(project, 'c2', 5).clips[1].out, 5));

// texts
const text = newText('t1', 2, 3, 'Hello');
project = { ...project, texts: [text] };
check('text at 3', textsAt(project, 3).length === 1 && textsAt(project, 5).length === 0);
let dragged = dragText(text, 'move', 1, [0, 13, 4], 0.1);
check('text move', near(dragged.item.start, 3) && near(dragged.item.end, 6) && dragged.guide === null, show(dragged));
dragged = dragText(text, 'move', 1.95, [0, 13, 4], 0.1);
check('text start snaps to 4', near(dragged.item.start, 4) && dragged.guide === 4, show(dragged));
dragged = dragText(text, 'end', 7.95, [0, 13], 0.1);
check('text end snaps to the end', near(dragged.item.end, 13) && dragged.guide === 13, show(dragged));
dragged = dragText(text, 'start', 10, [], 0);
check('text start keeps a minimal item', near(dragged.item.end - dragged.item.start, MIN_LENGTH));
dragged = dragText(text, 'move', -9, [], 0);
check('text not before 0', near(dragged.item.start, 0) && near(dragged.item.end, 3));
let s2 = splitItemAt(project, { kind: 'text', id: 't1' }, 3.5, 't2');
check('split text', s2.texts.length === 2 && near(s2.texts[0].end, 3.5) && near(s2.texts[1].start, 3.5));

// music
const music = newMusic(song, 'm1', 1);
check('music lasts the song', near(music.out, 30) && near(music.offset, 1));
let m = dragMusic(music, 'move', -0.95, 30, [0, 13], 0.1);
check('music snaps to 0', near(m.item.offset, 0) && m.guide === 0, show(m));
m = dragMusic(music, 'start', 2, 30, [], 0);
check('music trim start keeps the rest in place', near(m.item.offset, 3) && near(m.item.in, 2) && near(m.item.out, 30));
m = dragMusic(music, 'end', -17.95, 30, [0, 13], 0.1);
check('music end snaps to the project end', near(m.item.offset + m.item.out - m.item.in, 13) && m.guide === 13, show(m));
m = dragMusic(music, 'end', 50, 30, [], 0);
check('music end stops at the song end', near(m.item.out, 30));
s2 = splitItemAt({ ...project, music: [music] }, { kind: 'music', id: 'm1' }, 6, 'm2');
check('split music', s2.music.length === 2 && near(s2.music[0].out, 5) && near(s2.music[1].in, 5) && near(s2.music[1].offset, 6));
check('snap points include cuts and items', (() => {
  const points = snapPoints({ ...project, music: [music] }, 7.5);
  return [0, 10, 13, 7.5, 2, 5, 1].every((p) => points.includes(p));
})());
check('snap points leave out the dragged item', !snapPoints(project, 0, { kind: 'text', id: 't1' }).includes(5));

// music playback
check('music starts later', show(musicStart(music, 0, 13)) === show({ delay: 1, source: 0, duration: 12 }));
check('music joined midway', show(musicStart(music, 4, 13)) === show({ delay: 0, source: 3, duration: 9 }));
check('music after the end -> null', musicStart(music, 13, 13) === null);
const faded = { ...music, volume: 0.5, fadeIn: 2, fadeOut: 4, out: 10 };
check('music gain points', show(musicGainPoints(faded)) === show([[1, 0], [3, 0.5], [7, 0.5], [11, 0]]), show(musicGainPoints(faded)));
check('gain halfway into the fade in', near(gainAt(musicGainPoints(faded), 2), 0.25));
check('gain at hold', near(gainAt(musicGainPoints(faded), 5), 0.5));
check('gain after the end', near(gainAt(musicGainPoints(faded), 20), 0));

// fade transition
const withFade = { ...project, transition: 'fade' };
check('no fade setting -> visible', pictureAlpha(project, 10) === 1);
check('black at the cut', pictureAlpha(withFade, 10) === 0);
check('half way into the dip', near(pictureAlpha(withFade, 10 - 0.175), 0.5));
check('fully visible away from cuts', pictureAlpha(withFade, 5) === 1);

// frame
check('original takes the first clip (16:9)', show(frameSize(project, assets, 1280)) === show({ width: 1280, height: 720 }));
check('9:16 portrait', show(frameSize({ ...project, aspect: '9:16' }, assets, 1280)) === show({ width: 720, height: 1280 }));
check('1:1', show(frameSize({ ...project, aspect: '1:1' }, assets, 1080)) === show({ width: 1080, height: 1080 }));
check('portrait photo first', show(frameSize(moveClip(project, 1, 0), assets, 1280)) === show({ width: 1024, height: 1280 }));
check('empty -> 16:9', show(frameSize(emptyProject(), assets, 1280)) === show({ width: 1280, height: 720 }));
const fit = placePicture({ width: 1080, height: 1350 }, { width: 1280, height: 720 }, 'fit');
check('fit: whole picture, centred', near(fit.height, 720) && near(fit.x, (1280 - fit.width) / 2));
const fill = placePicture({ width: 1080, height: 1350 }, { width: 1280, height: 720 }, 'fill');
check('fill: covers the frame', near(fill.width, 1280) && fill.height > 720);

console.log(`\nvideo-editor: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
