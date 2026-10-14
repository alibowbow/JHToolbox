/**
 * Placing an audio clip on a video's timeline (no runtime dependencies → unit
 * testable): moving it, trimming either end, snapping its edges to the video's
 * start, end and the playhead, fitting it to the video, and the ffmpeg
 * arguments that put it into the file.
 */

/** Where the audio sits on the video (offset) and which part of it plays. */
export interface AudioClip {
  /** Seconds into the video where the clip begins. */
  offset: number;
  /** Seconds into the audio file where the clip starts. */
  start: number;
  /** Seconds into the audio file where the clip ends. */
  end: number;
}

export type ClipDrag = 'move' | 'start' | 'end';

export interface ClipBounds {
  audioDuration: number;
  videoDuration: number;
}

export interface SnapContext extends ClipBounds {
  /** Timeline times edges stick to (video start, video end, playhead). */
  snapPoints: number[];
  /** How close, in seconds, an edge must come to stick. */
  snapThreshold: number;
}

export const MIN_CLIP_LENGTH = 0.1;

const finite = (value: number, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const round = (value: number) => Math.round(value * 1000) / 1000;

export function clipLength(clip: AudioClip) {
  return Math.max(0, clip.end - clip.start);
}

/** Keeps a clip inside its audio file and starting within the video. */
export function normalizeClip(clip: AudioClip, { audioDuration, videoDuration }: ClipBounds): AudioClip {
  const audio = Math.max(MIN_CLIP_LENGTH, finite(audioDuration, MIN_CLIP_LENGTH));
  const video = Math.max(MIN_CLIP_LENGTH, finite(videoDuration, MIN_CLIP_LENGTH));
  const start = Math.min(Math.max(0, finite(clip.start)), audio - MIN_CLIP_LENGTH);
  const rawEnd = finite(clip.end) > 0 ? finite(clip.end) : audio;
  const end = Math.min(audio, Math.max(start + MIN_CLIP_LENGTH, rawEnd));
  const offset = Math.min(Math.max(0, finite(clip.offset)), video - MIN_CLIP_LENGTH);
  return { offset: round(offset), start: round(start), end: round(end) };
}

/** The snap point nearest to any of `edges`, if one is close enough. */
function nearestSnap(edges: number[], points: number[], threshold: number) {
  let best: { shift: number; point: number } | null = null;
  for (const edge of edges) {
    for (const point of points) {
      const shift = point - edge;
      if (Math.abs(shift) <= threshold && (!best || Math.abs(shift) < Math.abs(best.shift))) {
        best = { shift, point };
      }
    }
  }
  return best;
}

/**
 * The snap point to draw a guide at: only when an edge really ended up on it
 * (keeping the clip inside the video or the audio can move it off again).
 * Compared loosely, as positions are rounded to the millisecond.
 */
function guideFor(snap: { point: number } | null, edges: number[]) {
  return snap && edges.some((edge) => Math.abs(edge - snap.point) < 0.002) ? snap.point : null;
}

/**
 * The clip after dragging by `delta` seconds from `origin`: the body moves
 * it, the left handle trims its start (the rest stays where it is on the
 * timeline), the right handle trims its end. An edge that comes near a snap
 * point sticks to it; `guide` is that point, for drawing a line.
 */
export function dragClip(origin: AudioClip, kind: ClipDrag, delta: number, context: SnapContext): { clip: AudioClip; guide: number | null } {
  const base = normalizeClip(origin, context);
  const length = clipLength(base);
  const step = finite(delta);
  const points = context.snapPoints.filter((point) => Number.isFinite(point));
  const threshold = Math.max(0, finite(context.snapThreshold));

  if (kind === 'move') {
    let offset = base.offset + step;
    const snap = nearestSnap([offset, offset + length], points, threshold);
    if (snap) offset += snap.shift;
    const clip = normalizeClip({ ...base, offset }, context);
    return { clip, guide: guideFor(snap, [clip.offset, clip.offset + clipLength(clip)]) };
  }

  if (kind === 'start') {
    let left = base.offset + step;
    const snap = nearestSnap([left], points, threshold);
    if (snap) left += snap.shift;
    // Cannot reach before the audio's own start, the video's start, or past the end.
    let shift = left - base.offset;
    shift = Math.max(shift, -base.start, -base.offset);
    shift = Math.min(shift, length - MIN_CLIP_LENGTH);
    const clip = normalizeClip({ offset: base.offset + shift, start: base.start + shift, end: base.end }, context);
    return { clip, guide: guideFor(snap, [clip.offset]) };
  }

  let right = base.offset + length + step;
  const snap = nearestSnap([right], points, threshold);
  if (snap) right += snap.shift;
  const end = base.start + (right - base.offset);
  const clip = normalizeClip({ ...base, end: Math.max(base.start + MIN_CLIP_LENGTH, end) }, context);
  return { clip, guide: guideFor(snap, [clip.offset + clipLength(clip)]) };
}

/**
 * Lines the clip up with the whole video: it starts with the video and ends
 * with it. A clip too short for that keeps all the audio it can, taking
 * earlier audio when the chosen start leaves too little.
 */
export function fitClipToVideo(clip: AudioClip, bounds: ClipBounds): AudioClip {
  const base = normalizeClip(clip, bounds);
  const video = Math.max(MIN_CLIP_LENGTH, finite(bounds.videoDuration, MIN_CLIP_LENGTH));
  const audio = Math.max(MIN_CLIP_LENGTH, finite(bounds.audioDuration, MIN_CLIP_LENGTH));
  let start = base.start;
  let end = Math.min(audio, start + video);
  if (end - start < video) {
    start = Math.max(0, end - video);
  }
  return normalizeClip({ offset: 0, start, end }, bounds);
}

export type AddAudioMode = 'replace' | 'mix';

export interface AddAudioSettings {
  clip: AudioClip;
  mode: AddAudioMode;
  /** Added audio's volume, 1 = as recorded. */
  volume: number;
  /** The video's own sound in "mix" mode. */
  originalVolume: number;
  fadeIn: number;
  fadeOut: number;
  /** The video's length when known; the result is cut to it. */
  videoDuration: number;
}

/**
 * Audio codec a copied video stream can share a file with. WebM takes Vorbis:
 * ffmpeg.wasm's Opus encoder crashes the tab on stereo sound.
 */
export function audioCodecFor(container: string) {
  return container === 'webm' ? 'libvorbis' : 'aac';
}

/** Fade lengths that fit in the clip: each at most half of it. */
export function clipFades(settings: AddAudioSettings) {
  const length = clipLength(settings.clip);
  return {
    fadeIn: Math.min(Math.max(0, finite(settings.fadeIn)), length / 2),
    fadeOut: Math.min(Math.max(0, finite(settings.fadeOut)), length / 2),
  };
}

/**
 * The added clip's loudness over the video's timeline, as [time, gain]
 * points joined by straight lines: silent before it, fading in, at its
 * volume, fading out, silent after. Used for the browser-side mix.
 */
export function clipGainPoints(settings: AddAudioSettings): Array<[number, number]> {
  const { offset } = settings.clip;
  const length = clipLength(settings.clip);
  const volume = Math.max(0, finite(settings.volume, 1));
  const { fadeIn, fadeOut } = clipFades(settings);
  const end = offset + length;
  return [
    [offset, fadeIn > 0 ? 0 : volume],
    ...(fadeIn > 0 ? ([[offset + fadeIn, volume]] as Array<[number, number]>) : []),
    ...(fadeOut > 0 ? ([[end - fadeOut, volume], [end, 0]] as Array<[number, number]>) : []),
  ].map(([time, gain]) => [round(time), round(gain)] as [number, number]);
}

/** The `-filter_complex` graph that makes the clip the video's whole sound: trimmed, faded, placed, then silence. */
export function addAudioFilter(settings: AddAudioSettings): string {
  const clip = settings.clip;
  const length = clipLength(clip);
  const volume = Math.max(0, finite(settings.volume, 1));
  const { fadeIn, fadeOut } = clipFades(settings);
  const delayMs = Math.round(Math.max(0, clip.offset) * 1000);
  const music = [
    `atrim=start=${round(clip.start)}:end=${round(clip.end)}`,
    'asetpts=PTS-STARTPTS',
    `volume=${round(volume)}`,
    ...(fadeIn > 0 ? [`afade=t=in:st=0:d=${round(fadeIn)}`] : []),
    ...(fadeOut > 0 ? [`afade=t=out:st=${round(length - fadeOut)}:d=${round(fadeOut)}`] : []),
    ...(delayMs > 0 ? [`adelay=${delayMs}:all=1`] : []),
  ].join(',');
  // Silence after the clip, so the sound lasts as long as the picture.
  return `[1:a]${music},apad[aout]`;
}

/**
 * The ffmpeg command that puts the sound into the video, copying the picture
 * (or re-encoding it as H.264 when it cannot be copied into the file).
 *
 * Replacing: the clip itself goes in, trimmed and placed by a filter.
 * Mixing: the mix is made in the browser (Web Audio) and arrives as a WAV
 * (`names.mixed`); ffmpeg.wasm stalls when a filter decodes the video's own
 * sound, so it only has to join that WAV to the picture.
 */
export function addAudioCommand(
  settings: AddAudioSettings,
  names: { video: string; audio: string; output: string; container: string; mixed?: string },
  reencode = false,
): string[] {
  const duration = finite(settings.videoDuration);
  const cut = duration > 0 ? ['-t', `${round(duration)}`] : [];
  const picture = reencode ? ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p'] : ['-c:v', 'copy'];
  // 48 kHz: what players expect, whatever rate the added audio had.
  const sound = ['-c:a', audioCodecFor(names.container), '-ar', '48000', '-b:a', '192k'];
  const inputs = names.mixed
    ? ['-i', names.video, '-i', names.mixed, '-map', '0:v:0', '-map', '1:a:0']
    : ['-i', names.video, '-i', names.audio, '-filter_complex', addAudioFilter(settings), '-map', '0:v:0', '-map', '[aout]'];
  // -y: a failed earlier attempt may have left the output behind. -shortest:
  // the padded clip never ends on its own.
  return ['-y', ...inputs, ...picture, ...sound, ...cut, '-shortest', names.output];
}
