import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const projectRoot = path.resolve(currentDir, '..');
const source = path.join(projectRoot, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.min.mjs');
const destination = path.join(projectRoot, 'public', 'pdf.worker.min.mjs');

await mkdir(path.dirname(destination), { recursive: true });

try {
  await copyFile(source, destination);
} catch (cause) {
  if (cause?.code === 'ENOENT') {
    throw new Error(`Unable to copy PDF worker. Expected source not found at ${source}. Did you run npm install?`);
  }

  throw cause;
}
