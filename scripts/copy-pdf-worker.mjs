import { copyFile, cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const projectRoot = path.resolve(currentDir, '..');
const pdfjsRoot = path.join(projectRoot, 'node_modules', 'pdfjs-dist');
const source = path.join(pdfjsRoot, 'legacy', 'build', 'pdf.worker.min.mjs');
const destination = path.join(projectRoot, 'public', 'pdf.worker.min.mjs');

await mkdir(path.dirname(destination), { recursive: true });

try {
  await copyFile(source, destination);
  // CJK character maps and the standard 14 fonts: pdf.js needs them to draw
  // and extract Korean/Japanese/Chinese text in PDFs that do not embed fonts.
  await cp(path.join(pdfjsRoot, 'cmaps'), path.join(projectRoot, 'public', 'pdfjs', 'cmaps'), { recursive: true });
  await cp(path.join(pdfjsRoot, 'standard_fonts'), path.join(projectRoot, 'public', 'pdfjs', 'standard_fonts'), {
    recursive: true,
  });
} catch (cause) {
  if (cause?.code === 'ENOENT') {
    throw new Error(`Unable to copy pdf.js assets from ${pdfjsRoot}. Did you run npm install?`);
  }

  throw cause;
}
