import { decodeAudioBlobToBuffer } from '@/lib/audio/AudioEngine';
import { resolveMediaDuration } from '@/components/ui/video-editor-utils';
import type { AssetKind } from '@/lib/video-editor/project';
import type { RuntimeAsset } from './engine';

const AUDIO_NAME = /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|weba)$/i;
const VIDEO_NAME = /\.(mp4|m4v|mov|webm|mkv|avi)$/i;
const IMAGE_NAME = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;

export function kindOf(file: File): AssetKind | null {
  if (file.type.startsWith('video/') || (!file.type && VIDEO_NAME.test(file.name))) return 'video';
  if (file.type.startsWith('image/') || (!file.type && IMAGE_NAME.test(file.name))) return 'image';
  if (file.type.startsWith('audio/') || AUDIO_NAME.test(file.name)) return 'audio';
  return null;
}

function once(target: EventTarget, ok: string, fail = 'error', timeout = 15000) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => done(new Error('timeout')), timeout);
    const done = (error?: Error) => {
      window.clearTimeout(timer);
      target.removeEventListener(ok, onOk);
      target.removeEventListener(fail, onFail);
      if (error) reject(error);
      else resolve();
    };
    const onOk = () => done();
    const onFail = () => done(new Error(fail));
    target.addEventListener(ok, onOk);
    target.addEventListener(fail, onFail);
  });
}

/** Still frames across a video for the timeline, read from a second, hidden element. */
async function makeFrames(url: string, duration: number, width: number, height: number): Promise<Array<[number, string]>> {
  if (!(duration > 0 && width > 0 && height > 0)) return [];
  const probe = document.createElement('video');
  probe.muted = true;
  probe.playsInline = true;
  probe.preload = 'auto';
  probe.src = url;
  const canvas = document.createElement('canvas');
  canvas.height = 72;
  canvas.width = Math.max(2, Math.round((72 * width) / height));
  const context = canvas.getContext('2d');
  const frames: Array<[number, string]> = [];
  const count = Math.max(2, Math.min(24, Math.round(duration / 2)));
  try {
    if (probe.readyState < 2) await once(probe, 'loadeddata');
    for (let index = 0; index < count && context; index += 1) {
      const time = ((index + 0.5) / count) * duration;
      const seeked = once(probe, 'seeked', 'error', 5000);
      probe.currentTime = time;
      await seeked;
      context.drawImage(probe, 0, 0, canvas.width, canvas.height);
      frames.push([time, canvas.toDataURL('image/jpeg', 0.6)]);
    }
  } catch {
    // Fewer thumbnails; the clip still plays.
  } finally {
    probe.removeAttribute('src');
    probe.load();
  }
  return frames;
}

/**
 * Reads a file into an asset: its length and size, a ready player (video or
 * image element) and, for audio, the decoded sound. Throws when the browser
 * cannot open it.
 */
export async function loadAsset(file: File, id: string): Promise<RuntimeAsset> {
  const kind = kindOf(file);
  if (!kind) throw new Error(file.name);
  const url = URL.createObjectURL(file);
  try {
    if (kind === 'video') {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.playsInline = true;
      video.src = url;
      await once(video, 'loadedmetadata');
      const duration = await resolveMediaDuration(video);
      const info = { id, kind, name: file.name, duration, width: video.videoWidth, height: video.videoHeight };
      return { info, file, url, video };
    }
    if (kind === 'image') {
      const image = new Image();
      image.src = url;
      await image.decode();
      const info = { id, kind, name: file.name, duration: 0, width: image.naturalWidth, height: image.naturalHeight };
      return { info, file, url, image };
    }
    const buffer = await decodeAudioBlobToBuffer(file);
    const info = { id, kind, name: file.name, duration: buffer.duration, width: 0, height: 0 };
    return { info, file, url, buffer };
  } catch (cause) {
    URL.revokeObjectURL(url);
    throw cause instanceof Error ? new Error(file.name) : cause;
  }
}

/** Timeline thumbnails for a video asset (filled in after it is added). */
export async function loadFrames(asset: RuntimeAsset) {
  if (asset.info.kind !== 'video') return [];
  return await makeFrames(asset.url, asset.info.duration, asset.info.width, asset.info.height);
}

/** Stops an asset's player and frees its file. */
export function releaseAsset(asset: RuntimeAsset) {
  asset.video?.pause();
  URL.revokeObjectURL(asset.url);
}
