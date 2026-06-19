import JSZip from 'jszip';
import { ProcessContext, ProcessedFile } from '@/types/processor';
import { ZIP_LIMITS, checkZipBomb, dedupeEntryName, sanitizeZipEntryName } from '@/lib/zip-safety';

type WorkerFile = {
  name: string;
  mimeType: string;
  data: string | ArrayBuffer;
  encoding: 'text' | 'binary';
};

type WorkerResponse =
  | {
      id: number;
      ok: true;
      files: WorkerFile[];
    }
  | {
      id: number;
      ok: false;
      error: string;
    };

let requestId = 1;

async function callDataWorker(
  toolId: string,
  file: File,
  options: Record<string, string | number | boolean>,
): Promise<WorkerFile[]> {
  return await new Promise((resolve, reject) => {
    const id = requestId++;
    const worker = new Worker(new URL('../workers/data.worker.ts', import.meta.url), { type: 'module' });

    const finish = () => {
      worker.terminate();
    };

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id) {
        return;
      }
      finish();
      if (!event.data.ok) {
        reject(new Error(event.data.error));
        return;
      }
      resolve(event.data.files);
    };

    worker.onerror = (event) => {
      finish();
      reject(event.error ?? new Error('Worker 실행 오류'));
    };

    const run = async () => {
      const textTools = ['csv-json', 'json-csv', 'csv-excel', 'xml-json', 'json-xml', 'xml-csv', 'split-csv'];
      if (textTools.includes(toolId)) {
        worker.postMessage({
          id,
          toolId,
          fileName: file.name,
          text: await file.text(),
          options,
        });
        return;
      }

      worker.postMessage({
        id,
        toolId,
        fileName: file.name,
        buffer: await file.arrayBuffer(),
        options,
      });
    };

    run().catch((cause) => {
      finish();
      reject(cause);
    });
  });
}

function normalizeWorkerFile(file: WorkerFile): ProcessedFile {
  const blob =
    file.encoding === 'text'
      ? new Blob([file.data as string], { type: file.mimeType })
      : new Blob([file.data as ArrayBuffer], { type: file.mimeType });

  const previewUrl = file.mimeType.startsWith('image/') ? URL.createObjectURL(blob) : undefined;
  const textContent = file.mimeType.includes('json') || file.mimeType.includes('xml') || file.mimeType.includes('csv')
    ? file.encoding === 'text'
      ? (file.data as string)
      : undefined
    : undefined;

  return {
    name: file.name,
    blob,
    mimeType: file.mimeType,
    previewUrl,
    textContent,
  };
}

export async function processDataTool(ctx: ProcessContext): Promise<ProcessedFile[]> {
  const { toolId, files, options, onProgress } = ctx;

  if (toolId === 'create-zip') {
    const zip = new JSZip();
    const totalFiles = Math.max(files.length, 1);
    files.forEach((file, index) => {
      onProgress({ percent: (index / totalFiles) * 100, stage: 'ZIP 생성 중' });
      zip.file(file.name, file);
    });

    const blob = await zip.generateAsync(
      { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
      (meta) => onProgress({ percent: meta.percent, stage: 'ZIP 압축 중' }),
    );

    return [
      {
        name: 'archive.zip',
        blob,
        mimeType: 'application/zip',
      },
    ];
  }

  if (toolId === 'extract-zip') {
    if (!files.length) {
      throw new Error('Select a ZIP file to extract.');
    }

    const file = files[0];
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entries = Object.values(zip.files).filter((entry) => !entry.dir);

    if (entries.length > ZIP_LIMITS.maxEntries) {
      throw new Error(`This archive has too many entries (${entries.length}); refusing to extract.`);
    }

    const out: ProcessedFile[] = [];
    const seenNames = new Set<string>();
    let totalBytes = 0;

    for (let index = 0; index < entries.length; index += 1) {
      onProgress({ percent: (index / Math.max(entries.length, 1)) * 100, stage: 'ZIP 해제 중' });
      const entry = entries[index];

      // Zip-Slip: refuse absolute paths, drive letters, and `..` traversal.
      const safeName = sanitizeZipEntryName(entry.name);
      if (!safeName) {
        throw new Error(`Refusing to extract an unsafe path from the archive: "${entry.name}".`);
      }

      // Zip-bomb: pre-flight declared sizes before decompressing.
      const sizes = (entry as unknown as { _data?: { uncompressedSize?: number; compressedSize?: number } })._data;
      if (checkZipBomb(Number(sizes?.uncompressedSize ?? 0), Number(sizes?.compressedSize ?? 0), totalBytes)) {
        throw new Error('This archive looks like a decompression bomb and was not extracted.');
      }

      const blob = await entry.async('blob');
      totalBytes += blob.size;
      if (totalBytes > ZIP_LIMITS.maxTotalBytes) {
        throw new Error('This archive expands to more data than is allowed and was not fully extracted.');
      }

      out.push({
        name: dedupeEntryName(safeName, seenNames),
        blob,
        mimeType: blob.type || 'application/octet-stream',
      });
    }

    return out;
  }

  if (!files.length) {
    throw new Error('Select at least one file to process.');
  }

  const out: ProcessedFile[] = [];
  for (let index = 0; index < files.length; index += 1) {
    onProgress({ percent: (index / files.length) * 100, stage: '데이터 변환 준비 중' });
    const transformed = await callDataWorker(toolId, files[index], options);
    transformed.forEach((file) => out.push(normalizeWorkerFile(file)));
  }

  return out;
}
