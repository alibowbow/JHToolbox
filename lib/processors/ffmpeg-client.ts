let ffmpegRef: any = null;
let ffmpegLoadPromise: Promise<any> | null = null;
let ffmpegProgressHandler: ((ratio: number) => void) | null = null;

const FFMPEG_CORE_BASE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.9/dist/umd';
export const FFMPEG_CACHE_NAME = 'jhtoolbox-ffmpeg-core-v1';

async function toCachedBlobURL(toBlobURL: (url: string, mime: string) => Promise<string>, url: string, mimeType: string) {
  try {
    if (typeof caches !== 'undefined') {
      const cache = await caches.open(FFMPEG_CACHE_NAME);
      let response = await cache.match(url);

      if (!response) {
        await cache.add(url);
        response = await cache.match(url);
      }

      if (response) {
        const payload = await response.blob();
        return URL.createObjectURL(new Blob([payload], { type: mimeType }));
      }
    }
  } catch {
    // Cache Storage may be unavailable (private mode, quota); fall back to a direct fetch.
  }

  return await toBlobURL(url, mimeType);
}

export async function getFfmpeg(onProgress?: (ratio: number) => void) {
  ffmpegProgressHandler = onProgress ?? null;

  if (ffmpegRef) {
    return ffmpegRef;
  }

  if (!ffmpegLoadPromise) {
    ffmpegLoadPromise = (async () => {
      const ffmpegMod: any = await import('@ffmpeg/ffmpeg');
      const utilMod: any = await import('@ffmpeg/util');

      const ffmpeg = new ffmpegMod.FFmpeg();
      ffmpeg.on('progress', ({ progress }: { progress: number }) => {
        ffmpegProgressHandler?.(progress);
      });

      const coreURL = await toCachedBlobURL(utilMod.toBlobURL, `${FFMPEG_CORE_BASE_URL}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await toCachedBlobURL(
        utilMod.toBlobURL,
        `${FFMPEG_CORE_BASE_URL}/ffmpeg-core.wasm`,
        'application/wasm',
      );
      await ffmpeg.load({ coreURL, wasmURL });

      ffmpegRef = { ffmpeg, fetchFile: utilMod.fetchFile };
      return ffmpegRef;
    })().catch((cause) => {
      ffmpegLoadPromise = null;
      throw cause;
    });
  }

  return await ffmpegLoadPromise;
}
