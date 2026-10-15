/**
 * The video editor's project and the edits on it, as pure functions (no
 * runtime dependencies → unit testable). Like CapCut's: a main track of clips
 * played back to back (videos and photos), a text track and a music track
 * whose items sit anywhere on the timeline.
 */

export type AssetKind = 'video' | 'image' | 'audio';

export interface AssetInfo {
  id: string;
  kind: AssetKind;
  name: string;
  /** Seconds; photos have none of their own. */
  duration: number;
  width: number;
  height: number;
}

/** A piece of a video or a photo on the main track. */
export interface MainClip {
  id: string;
  assetId: string;
  /** Seconds into the source where the clip starts and ends (a photo: 0 and its length). */
  in: number;
  out: number;
  /** 1 = normal; 2 = twice as fast. */
  speed: number;
  /** 1 = as recorded, 0 = silent. */
  volume: number;
}

export interface TextItem {
  id: string;
  text: string;
  /** Timeline seconds. */
  start: number;
  end: number;
  /** Centre of the text as a share of the frame (0..1). */
  x: number;
  y: number;
  /** Line height as a share of the frame's height. */
  size: number;
  color: string;
  /** A dark box behind the text, like a caption. */
  box: boolean;
}

export interface MusicItem {
  id: string;
  assetId: string;
  /** Timeline seconds where it begins. */
  offset: number;
  /** Seconds into the audio file. */
  in: number;
  out: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
}

export type AspectId = 'original' | '16:9' | '9:16' | '1:1' | '4:5';
export type FitMode = 'fit' | 'fill';
export type TransitionId = 'none' | 'fade';

export interface Project {
  aspect: AspectId;
  fit: FitMode;
  transition: TransitionId;
  clips: MainClip[];
  texts: TextItem[];
  music: MusicItem[];
}

export type ItemRef = { kind: 'clip' | 'text' | 'music'; id: string };

export const MIN_LENGTH = 0.1;
export const PHOTO_SECONDS = 3;
export const MAX_PHOTO_SECONDS = 600;
export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;
/** Length of a fade through black on each side of a cut. */
export const FADE_SECONDS = 0.35;

const finite = (value: number, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const round = (value: number) => Math.round(value * 1000) / 1000;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function emptyProject(): Project {
  return { aspect: 'original', fit: 'fit', transition: 'none', clips: [], texts: [], music: [] };
}

// ── Main track ────────────────────────────────────────────────────────────

/** How long a clip lasts on the timeline. */
export function clipLength(clip: MainClip) {
  return Math.max(0, (clip.out - clip.in) / Math.max(0.01, clip.speed));
}

export interface PlacedClip {
  clip: MainClip;
  index: number;
  start: number;
  end: number;
}

/** Where each main-track clip sits: one after another from 0. */
export function layoutClips(project: Project): PlacedClip[] {
  let time = 0;
  return project.clips.map((clip, index) => {
    const start = time;
    time += clipLength(clip);
    return { clip, index, start: round(start), end: round(time) };
  });
}

/** The project lasts as long as its main track. */
export function projectDuration(project: Project) {
  const placed = layoutClips(project);
  return placed.length ? placed[placed.length - 1].end : 0;
}

/** The clip playing at `time`, and the source time it shows. */
export function clipAt(project: Project, time: number): (PlacedClip & { sourceTime: number }) | null {
  const placed = layoutClips(project);
  if (!placed.length) return null;
  const t = Math.max(0, finite(time));
  const hit = placed.find((entry) => t < entry.end) ?? placed[placed.length - 1];
  const within = clamp(t - hit.start, 0, hit.end - hit.start);
  return { ...hit, sourceTime: round(hit.clip.in + within * hit.clip.speed) };
}

function newClipFor(asset: AssetInfo, id: string): MainClip {
  const length = asset.kind === 'image' ? PHOTO_SECONDS : Math.max(MIN_LENGTH, finite(asset.duration, MIN_LENGTH));
  return { id, assetId: asset.id, in: 0, out: round(length), speed: 1, volume: 1 };
}

/** Puts a video or photo on the main track, after `afterIndex` (default: at the end). */
export function addClip(project: Project, asset: AssetInfo, id: string, afterIndex = project.clips.length - 1): Project {
  const clips = [...project.clips];
  clips.splice(clamp(afterIndex + 1, 0, clips.length), 0, newClipFor(asset, id));
  return { ...project, clips };
}

/**
 * Cuts the clip under `time` in two. Nothing happens when either part would
 * be shorter than MIN_LENGTH (the playhead is on a cut or at the very end).
 */
export function splitClipAt(project: Project, time: number, newId: string): Project {
  const hit = clipAt(project, time);
  if (!hit) return project;
  const t = finite(time);
  if (t - hit.start < MIN_LENGTH || hit.end - t < MIN_LENGTH) return project;
  const cut = round(hit.clip.in + (t - hit.start) * hit.clip.speed);
  const first = { ...hit.clip, out: cut };
  const second = { ...hit.clip, id: newId, in: cut };
  const clips = [...project.clips];
  clips.splice(hit.index, 1, first, second);
  return { ...project, clips };
}

export function moveClip(project: Project, from: number, to: number): Project {
  if (from < 0 || from >= project.clips.length) return project;
  const clips = [...project.clips];
  const [moved] = clips.splice(from, 1);
  clips.splice(clamp(to, 0, clips.length), 0, moved);
  return { ...project, clips };
}

/**
 * Where a clip dragged to timeline `time` lands: before the first clip whose
 * middle is past that point.
 */
export function dropIndex(project: Project, time: number, draggedIndex: number) {
  const others = layoutClips(project).filter((entry) => entry.index !== draggedIndex);
  let index = others.findIndex((entry) => time < (entry.start + entry.end) / 2);
  if (index === -1) index = others.length;
  return index;
}

/**
 * Trims a main-track clip by dragging an edge `delta` timeline seconds. The
 * start edge eats into the clip from the front (later clips move up), the end
 * edge from the back. A video cannot go past its own start or end; a photo
 * simply gets longer or shorter.
 */
export function trimClip(project: Project, id: string, edge: 'start' | 'end', delta: number, asset: AssetInfo | undefined): Project {
  const clips = project.clips.map((clip) => {
    if (clip.id !== id) return clip;
    const sourceDelta = finite(delta) * clip.speed;
    const minSource = MIN_LENGTH * clip.speed;
    if (asset?.kind === 'image') {
      const length = clamp(clip.out - clip.in + (edge === 'start' ? -sourceDelta : sourceDelta), MIN_LENGTH, MAX_PHOTO_SECONDS);
      return { ...clip, in: 0, out: round(length) };
    }
    const sourceEnd = Math.max(clip.out, finite(asset?.duration ?? clip.out, clip.out));
    if (edge === 'start') {
      return { ...clip, in: round(clamp(clip.in + sourceDelta, 0, clip.out - minSource)) };
    }
    return { ...clip, out: round(clamp(clip.out + sourceDelta, clip.in + minSource, sourceEnd)) };
  });
  return { ...project, clips };
}

/** Changes how fast a clip plays; it gets shorter or longer on the timeline. */
export function setClipSpeed(project: Project, id: string, speed: number): Project {
  const next = clamp(finite(speed, 1), SPEEDS[0], SPEEDS[SPEEDS.length - 1]);
  return { ...project, clips: project.clips.map((clip) => (clip.id === id ? { ...clip, speed: next } : clip)) };
}

/** A photo's length on the timeline. */
export function setPhotoLength(project: Project, id: string, seconds: number): Project {
  const length = round(clamp(finite(seconds, PHOTO_SECONDS), MIN_LENGTH, MAX_PHOTO_SECONDS));
  return { ...project, clips: project.clips.map((clip) => (clip.id === id ? { ...clip, in: 0, out: length * clip.speed } : clip)) };
}

// ── Text and music ────────────────────────────────────────────────────────

export function newText(id: string, start: number, duration: number, text: string): TextItem {
  const begin = Math.max(0, round(finite(start)));
  return { id, text, start: begin, end: round(begin + Math.max(MIN_LENGTH, finite(duration, PHOTO_SECONDS))), x: 0.5, y: 0.82, size: 0.07, color: '#ffffff', box: true };
}

export function newMusic(asset: AssetInfo, id: string, offset: number): MusicItem {
  return { id, assetId: asset.id, offset: Math.max(0, round(finite(offset))), in: 0, out: round(Math.max(MIN_LENGTH, finite(asset.duration, MIN_LENGTH))), volume: 1, fadeIn: 0, fadeOut: 0 };
}

export function musicLength(item: MusicItem) {
  return Math.max(0, item.out - item.in);
}

/** The snap point nearest to any edge, if within `threshold` seconds. */
export function nearestSnap(edges: number[], points: number[], threshold: number) {
  let best: { shift: number; point: number } | null = null;
  for (const edge of edges) {
    for (const point of points) {
      const shift = point - edge;
      if (Math.abs(shift) <= threshold && (!best || Math.abs(shift) < Math.abs(best.shift))) best = { shift, point };
    }
  }
  return best;
}

/** Times items stick to: 0, the end, the playhead, every cut and every other item's edges. */
export function snapPoints(project: Project, playhead: number, exclude?: ItemRef): number[] {
  const points = [0, projectDuration(project), playhead];
  for (const entry of layoutClips(project)) points.push(entry.start, entry.end);
  for (const text of project.texts) if (!(exclude?.kind === 'text' && exclude.id === text.id)) points.push(text.start, text.end);
  for (const item of project.music) if (!(exclude?.kind === 'music' && exclude.id === item.id)) points.push(item.offset, item.offset + musicLength(item));
  return [...new Set(points.map(round))];
}

export type Drag = 'move' | 'start' | 'end';

/** A text item after dragging its body or an edge; edges stick to snap points. */
export function dragText(item: TextItem, kind: Drag, delta: number, points: number[], threshold: number) {
  const d = finite(delta);
  if (kind === 'move') {
    const length = item.end - item.start;
    let start = item.start + d;
    const snap = nearestSnap([start, start + length], points, threshold);
    if (snap) start += snap.shift;
    start = Math.max(0, start);
    return { item: { ...item, start: round(start), end: round(start + length) }, guide: snap && Math.abs(start - (item.start + d + snap.shift)) < 0.002 ? snap.point : null };
  }
  if (kind === 'start') {
    let start = item.start + d;
    const snap = nearestSnap([start], points, threshold);
    if (snap) start += snap.shift;
    start = clamp(start, 0, item.end - MIN_LENGTH);
    return { item: { ...item, start: round(start) }, guide: snap && Math.abs(start - snap.point) < 0.002 ? snap.point : null };
  }
  let end = item.end + d;
  const snap = nearestSnap([end], points, threshold);
  if (snap) end += snap.shift;
  end = Math.max(item.start + MIN_LENGTH, end);
  return { item: { ...item, end: round(end) }, guide: snap && Math.abs(end - snap.point) < 0.002 ? snap.point : null };
}

/** A music item after dragging; the left edge trims its start, keeping the rest in place. */
export function dragMusic(item: MusicItem, kind: Drag, delta: number, audioDuration: number, points: number[], threshold: number) {
  const d = finite(delta);
  const length = musicLength(item);
  const guide = (snap: { point: number } | null, edges: number[]) =>
    snap && edges.some((edge) => Math.abs(edge - snap.point) < 0.002) ? snap.point : null;
  if (kind === 'move') {
    let offset = item.offset + d;
    const snap = nearestSnap([offset, offset + length], points, threshold);
    if (snap) offset += snap.shift;
    offset = Math.max(0, offset);
    return { item: { ...item, offset: round(offset) }, guide: guide(snap, [offset, offset + length]) };
  }
  if (kind === 'start') {
    let left = item.offset + d;
    const snap = nearestSnap([left], points, threshold);
    if (snap) left += snap.shift;
    let shift = left - item.offset;
    shift = Math.max(shift, -item.in, -item.offset);
    shift = Math.min(shift, length - MIN_LENGTH);
    const next = { ...item, offset: round(item.offset + shift), in: round(item.in + shift) };
    return { item: next, guide: guide(snap, [next.offset]) };
  }
  let right = item.offset + length + d;
  const snap = nearestSnap([right], points, threshold);
  if (snap) right += snap.shift;
  const out = clamp(item.in + (right - item.offset), item.in + MIN_LENGTH, Math.max(item.out, finite(audioDuration, item.out)));
  const next = { ...item, out: round(out) };
  return { item: next, guide: guide(snap, [next.offset + musicLength(next)]) };
}

/** Splits a text or music item at `time` (when both parts are long enough). */
export function splitItemAt(project: Project, ref: ItemRef, time: number, newId: string): Project {
  const t = round(finite(time));
  if (ref.kind === 'text') {
    const texts = project.texts.flatMap((item) => {
      if (item.id !== ref.id || t - item.start < MIN_LENGTH || item.end - t < MIN_LENGTH) return [item];
      return [{ ...item, end: t }, { ...item, id: newId, start: t }];
    });
    return { ...project, texts };
  }
  if (ref.kind === 'music') {
    const music = project.music.flatMap((item) => {
      const cut = t - item.offset;
      if (item.id !== ref.id || cut < MIN_LENGTH || musicLength(item) - cut < MIN_LENGTH) return [item];
      return [
        { ...item, out: round(item.in + cut), fadeOut: 0 },
        { ...item, id: newId, offset: t, in: round(item.in + cut), fadeIn: 0 },
      ];
    });
    return { ...project, music };
  }
  return splitClipAt(project, t, newId);
}

export function removeItem(project: Project, ref: ItemRef): Project {
  if (ref.kind === 'clip') return { ...project, clips: project.clips.filter((clip) => clip.id !== ref.id) };
  if (ref.kind === 'text') return { ...project, texts: project.texts.filter((item) => item.id !== ref.id) };
  return { ...project, music: project.music.filter((item) => item.id !== ref.id) };
}

export function textsAt(project: Project, time: number) {
  return project.texts.filter((item) => time >= item.start && time < item.end);
}

// ── Playback and drawing ──────────────────────────────────────────────────

/**
 * How visible the picture is at `time` with the "fade" transition: it dips to
 * black around every cut between two clips (1 = fully visible).
 */
export function pictureAlpha(project: Project, time: number) {
  if (project.transition !== 'fade') return 1;
  const placed = layoutClips(project);
  let alpha = 1;
  for (let index = 1; index < placed.length; index += 1) {
    const cut = placed[index].start;
    const reach = Math.min(FADE_SECONDS, (placed[index - 1].end - placed[index - 1].start) / 2, (placed[index].end - placed[index].start) / 2);
    const distance = Math.abs(time - cut);
    if (reach > 0 && distance < reach) alpha = Math.min(alpha, distance / reach);
  }
  return round(alpha);
}

/**
 * When to start a music item for playback that begins at timeline `from`:
 * `delay` seconds from now, from `source` seconds into the file, for
 * `duration` seconds. Null when it has already finished, or never starts
 * before the project ends.
 */
export function musicStart(item: MusicItem, from: number, projectEnd: number) {
  const length = musicLength(item);
  const end = Math.min(item.offset + length, projectEnd);
  if (from >= end) return null;
  if (from <= item.offset) {
    return { delay: round(item.offset - from), source: item.in, duration: round(end - item.offset) };
  }
  return { delay: 0, source: round(item.in + (from - item.offset)), duration: round(end - from) };
}

/** A music item's loudness on the timeline as [time, gain] points: fade in, hold, fade out. */
export function musicGainPoints(item: MusicItem): Array<[number, number]> {
  const length = musicLength(item);
  const fadeIn = clamp(finite(item.fadeIn), 0, length / 2);
  const fadeOut = clamp(finite(item.fadeOut), 0, length / 2);
  const volume = Math.max(0, finite(item.volume, 1));
  const end = item.offset + length;
  const points: Array<[number, number]> = [[item.offset, fadeIn > 0 ? 0 : volume]];
  if (fadeIn > 0) points.push([item.offset + fadeIn, volume]);
  if (fadeOut > 0) points.push([end - fadeOut, volume], [end, 0]);
  return points.map(([t, g]) => [round(t), round(g)]);
}

/** The gain a set of [time, gain] points gives at `time` (straight lines between points). */
export function gainAt(points: Array<[number, number]>, time: number) {
  if (!points.length) return 0;
  if (time <= points[0][0]) return points[0][1];
  for (let index = 1; index < points.length; index += 1) {
    const [t0, g0] = points[index - 1];
    const [t1, g1] = points[index];
    if (time <= t1) return t1 === t0 ? g1 : g0 + ((g1 - g0) * (time - t0)) / (t1 - t0);
  }
  return points[points.length - 1][1];
}

const ASPECTS: Record<Exclude<AspectId, 'original'>, number> = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1, '4:5': 4 / 5 };

/**
 * The frame size for export and preview: the aspect ratio chosen (or the
 * first clip's), with the long side `longSide` pixels and even dimensions.
 */
export function frameSize(project: Project, assets: Record<string, AssetInfo>, longSide = 1280) {
  let ratio = 16 / 9;
  if (project.aspect !== 'original') {
    ratio = ASPECTS[project.aspect];
  } else {
    const first = project.clips.map((clip) => assets[clip.assetId]).find((asset) => asset && asset.width > 0 && asset.height > 0);
    if (first) ratio = first.width / first.height;
  }
  const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);
  return ratio >= 1 ? { width: even(longSide), height: even(longSide / ratio) } : { width: even(longSide * ratio), height: even(longSide) };
}

/** Where a picture is drawn in the frame: whole and centred ("fit") or covering it ("fill"). */
export function placePicture(source: { width: number; height: number }, frame: { width: number; height: number }, mode: FitMode) {
  if (!(source.width > 0 && source.height > 0)) return { x: 0, y: 0, width: frame.width, height: frame.height };
  const scale = mode === 'fill' ? Math.max(frame.width / source.width, frame.height / source.height) : Math.min(frame.width / source.width, frame.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  return { x: (frame.width - width) / 2, y: (frame.height - height) / 2, width, height };
}
