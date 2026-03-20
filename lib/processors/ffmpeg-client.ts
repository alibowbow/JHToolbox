let ffmpegRef: any = null;
let ffmpegLoadPromise: Promise<any> | null = null;
let ffmpegProgressHandler: ((ratio: number) => void) | null = null;

export async function getFfmpeg(onProgress?: (ratio: number) => void) {
  ffmpegProgressHandler = onProgress ?? null;

  if (ffmpegRef) {
    return ffmpegRef;
  }

  if (!ffmpegLoadPromise) {
    ffmpegLoadPromise = (async () => {
      const ffmpegMod: any = await import('@ffmpeg/ffmpeg');
      const utilMod: any = await import('@ffmpeg/util');
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.9/dist/umd';

      const ffmpeg = new ffmpegMod.FFmpeg();
      ffmpeg.on('progress', ({ progress }: { progress: number }) => {
        ffmpegProgressHandler?.(progress);
      });

      const coreURL = await utilMod.toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await utilMod.toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');
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
