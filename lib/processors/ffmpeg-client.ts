let ffmpegRef: any = null;
let ffmpegLoadPromise: Promise<any> | null = null;

export async function getFfmpeg(onProgress?: (ratio: number) => void) {
  if (ffmpegRef) {
    return ffmpegRef;
  }

  if (!ffmpegLoadPromise) {
    ffmpegLoadPromise = (async () => {
      const ffmpegMod: any = await import('@ffmpeg/ffmpeg');
      const utilMod: any = await import('@ffmpeg/util');
      const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';

      const ffmpeg = new ffmpegMod.FFmpeg();
      ffmpeg.on('progress', ({ progress }: { progress: number }) => {
        onProgress?.(progress);
      });

      const coreURL = await utilMod.toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await utilMod.toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');
      await ffmpeg.load({ coreURL, wasmURL });

      ffmpegRef = { ffmpeg, fetchFile: utilMod.fetchFile };
      return ffmpegRef;
    })();
  }

  return await ffmpegLoadPromise;
}