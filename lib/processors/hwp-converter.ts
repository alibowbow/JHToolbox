import { baseName } from '@/lib/utils';
import type { HwpWorkerMessage } from '@/lib/workers/hwp.worker';
import type { ProcessContext, ProcessedFile } from '@/types/processor';

const MIME_TYPES = { hwp: 'application/x-hwp', hwpx: 'application/hwp+zip' };

export async function processHwpConversion({ files, onProgress, onFileError, signal }: ProcessContext): Promise<ProcessedFile[]> {
  if (!files.length) throw new Error('Select an HWP or HWPX document.');
  signal?.throwIfAborted();
  onProgress({ percent: 5, stage: 'Loading Hangul conversion engine' });

  const worker = new Worker(new URL('../workers/hwp.worker.ts', import.meta.url), { type: 'module' });
  const results: ProcessedFile[] = [];
  let completed = 0;
  let onAbort: (() => void) | undefined;

  try {
    return await new Promise<ProcessedFile[]>((resolve, reject) => {
      onAbort = () => reject(signal?.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
      signal?.addEventListener('abort', onAbort, { once: true });
      worker.onerror = () => reject(new Error('The background worker stopped unexpectedly.'));
      worker.onmessage = ({ data }: MessageEvent<HwpWorkerMessage>) => {
        if (data.kind === 'fatal') {
          reject(new Error(data.error));
          return;
        }
        if (data.kind === 'done') {
          resolve(results);
          return;
        }
        if (data.kind === 'failed') {
          const error = new Error(data.error);
          if (!onFileError) {
            reject(error);
            return;
          }
          onFileError(files[data.index], error);
          completed += 1;
        }
        if (data.kind === 'converted') {
          const mimeType = MIME_TYPES[data.format];
          results.push({
            name: `${baseName(files[data.index].name)}.${data.format}`,
            blob: new Blob([data.bytes], { type: mimeType }),
            mimeType,
            metadata: data.lossCount ? { omittedHangulItems: data.lossCount, note: 'Some document content could not be saved. Check this file against the original.' } : undefined,
          });
          completed += 1;
        }
        onProgress({ percent: 15 + (completed / files.length) * 85, stage: 'Converting Hangul documents' });
      };
      worker.postMessage(files);
    });
  } finally {
    if (onAbort) signal?.removeEventListener('abort', onAbort);
    worker.terminate();
  }
}
