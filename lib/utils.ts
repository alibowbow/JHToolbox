import { safeFileName } from '@/lib/filename-safety';

export { safeFileName };

export function cx(...tokens: Array<string | false | null | undefined>): string {
  return tokens.filter(Boolean).join(' ');
}

export function extOf(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx === -1 ? '' : name.slice(idx + 1).toLowerCase();
}

export function baseName(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx === -1 ? name : name.slice(0, idx);
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeFileName(fileName);
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke after a tick so the download has started (the blob is copied on click).
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readAsArrayBuffer(file: Blob): Promise<ArrayBuffer> {
  return await file.arrayBuffer();
}

export async function readAsText(file: Blob): Promise<string> {
  return await file.text();
}

export function parseNumber(value: string | number | boolean | undefined, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return fallback;
}

export function parseBoolean(value: string | number | boolean | undefined, fallback = false): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value === 'true';
  }
  return fallback;
}