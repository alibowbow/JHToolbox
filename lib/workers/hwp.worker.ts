import type { HwpDocument } from '@rhwp/core';

export type HwpWorkerMessage =
  | { kind: 'ready' }
  | { kind: 'converted'; index: number; format: 'hwp' | 'hwpx'; bytes: ArrayBuffer; lossCount: number }
  | { kind: 'failed'; index: number; error: string }
  | { kind: 'fatal'; error: string }
  | { kind: 'done' };

const worker = self as unknown as DedicatedWorkerGlobalScope;
const ENGINE_LOAD_ERROR = 'Could not load the Hangul conversion engine. Please try again.';

async function loadEngine() {
  const assetUrl = new URL('/rhwp/', worker.location.origin);
  const moduleUrl = new URL('rhwp.js', assetUrl).href;
  const [engine, response] = await Promise.all([
    import(/* webpackIgnore: true */ moduleUrl) as Promise<typeof import('@rhwp/core')>,
    fetch(new URL('rhwp_bg.wasm.gz', assetUrl)),
  ]);
  if (!response.ok || !response.body) throw new Error(ENGINE_LOAD_ERROR);

  const canvas = new OffscreenCanvas(1, 1).getContext('2d');
  if (!canvas) throw new Error('Canvas unavailable.');
  let currentFont = '';
  Object.assign(globalThis, {
    measureTextWidth(font: string, text: string) {
      if (font !== currentFont) {
        canvas.font = font;
        currentFont = font;
      }
      return canvas.measureText(text).width;
    },
  });

  const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
  await engine.default({ module_or_path: await new Response(stream).arrayBuffer() });
  return engine.HwpDocument;
}

function inputError(cause: unknown): string {
  if (/password|encrypted|암호/i.test(String(cause))) {
    return 'Password-protected Hangul documents need to be unlocked before conversion.';
  }
  return 'Could not open this HWP or HWPX document. It may be damaged or unsupported.';
}

function post(message: HwpWorkerMessage, transfer: Transferable[] = []) {
  worker.postMessage(message, transfer);
}

async function convert(files: File[], Document: typeof HwpDocument) {
  for (const [index, file] of files.entries()) {
    let document: HwpDocument;
    try {
      document = new Document(new Uint8Array(await file.arrayBuffer()));
    } catch (cause) {
      post({ kind: 'failed', index, error: inputError(cause) });
      continue;
    }

    try {
      const source = document.getSourceFormat();
      if (source !== 'hwp' && source !== 'hwpx') {
        post({ kind: 'failed', index, error: 'Select an HWP or HWPX document.' });
        continue;
      }

      const format = source === 'hwp' ? 'hwpx' : 'hwp';
      const result = format === 'hwp' ? document.exportHwpWithReport() : document.exportHwpxWithReport();
      try {
        const { losses } = JSON.parse(result.contentLoss()) as { losses: unknown[] };
        const bytes = result.takeBytes();
        // wasm-bindgen returns a standalone Uint8Array from takeBytes().
        const buffer = bytes.buffer as ArrayBuffer;
        post({ kind: 'converted', index, format, bytes: buffer, lossCount: losses.length }, [buffer]);
      } finally {
        result.free();
      }
    } catch {
      post({ kind: 'failed', index, error: 'Could not save the converted Hangul document.' });
    } finally {
      document.free();
    }
  }
  post({ kind: 'done' });
}

worker.onmessage = async ({ data }: MessageEvent<File[]>) => {
  if (typeof OffscreenCanvas === 'undefined' || typeof DecompressionStream === 'undefined') {
    post({ kind: 'fatal', error: 'This browser cannot run the Hangul conversion engine. Try an updated browser.' });
    return;
  }

  let Document: typeof HwpDocument;
  try {
    Document = await loadEngine();
  } catch {
    post({ kind: 'fatal', error: ENGINE_LOAD_ERROR });
    return;
  }

  post({ kind: 'ready' });
  await convert(data, Document).catch(() => post({ kind: 'fatal', error: 'The background worker stopped unexpectedly.' }));
};
