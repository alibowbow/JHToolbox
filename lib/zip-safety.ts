/**
 * ZIP extraction safety helpers (no runtime dependencies, so they are unit
 * testable in Node). Used by the extract-zip tool to defend against Zip-Slip
 * path traversal and zip-bomb decompression.
 */

/** Hard limits for a single archive extraction. */
export const ZIP_LIMITS = {
  maxEntries: 4096,
  maxEntryBytes: 512 * 1024 * 1024, // 512 MB per file
  maxTotalBytes: 1024 * 1024 * 1024, // 1 GB total uncompressed
  /** Reject entries whose uncompressed:compressed ratio exceeds this (above a floor). */
  maxCompressionRatio: 200,
  ratioFloorBytes: 1024 * 1024, // only apply the ratio check above 1 MB uncompressed
} as const;

const WINDOWS_DRIVE = /^[a-zA-Z]:\//;

/** True if the string contains an ASCII control character (0x00–0x1f) or DEL. */
function hasControlChar(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * Normalize and validate a ZIP entry name. Returns a safe **relative** path, or
 * `null` if the entry is unsafe (absolute path, drive letter, `..` traversal,
 * control/NUL characters, or empty). The caller must refuse `null`.
 */
export function sanitizeZipEntryName(rawName: string): string | null {
  if (typeof rawName !== 'string' || rawName.length === 0) {
    return null;
  }

  // Treat backslashes as separators (Windows-authored archives) and normalize.
  const name = rawName.replace(/\\/g, '/').normalize('NFC');

  if (hasControlChar(name)) {
    return null;
  }
  // Reject absolute POSIX paths and Windows drive paths.
  if (name.startsWith('/') || WINDOWS_DRIVE.test(name)) {
    return null;
  }

  const segments = name.split('/').filter((segment) => segment !== '' && segment !== '.');
  if (segments.length === 0) {
    return null;
  }
  // Any `..` segment is path traversal — refuse the whole entry.
  if (segments.some((segment) => segment === '..')) {
    return null;
  }

  return segments.join('/');
}

/**
 * Deduplicate a (already-sanitized) path against names already emitted, by
 * inserting ` (2)`, ` (3)`, … before the extension. Mutates `seen`.
 */
export function dedupeEntryName(name: string, seen: Set<string>): string {
  if (!seen.has(name)) {
    seen.add(name);
    return name;
  }

  const slash = name.lastIndexOf('/');
  const dir = slash >= 0 ? name.slice(0, slash + 1) : '';
  const base = slash >= 0 ? name.slice(slash + 1) : name;
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';

  let counter = 2;
  let candidate = `${dir}${stem} (${counter})${ext}`;
  while (seen.has(candidate)) {
    counter += 1;
    candidate = `${dir}${stem} (${counter})${ext}`;
  }
  seen.add(candidate);
  return candidate;
}

export type ZipBombReason = 'entry-too-large' | 'total-too-large' | 'ratio';

/**
 * Pre-flight a single entry's declared sizes against the bomb limits. Returns a
 * reason when the entry must be rejected, or `null` when it is allowed.
 * `runningTotal` is the total uncompressed bytes accumulated so far.
 */
export function checkZipBomb(
  uncompressedBytes: number,
  compressedBytes: number,
  runningTotal: number,
): ZipBombReason | null {
  const uncompressed = Number.isFinite(uncompressedBytes) ? uncompressedBytes : 0;
  const compressed = Number.isFinite(compressedBytes) ? compressedBytes : 0;

  if (uncompressed > ZIP_LIMITS.maxEntryBytes) {
    return 'entry-too-large';
  }
  if (runningTotal + uncompressed > ZIP_LIMITS.maxTotalBytes) {
    return 'total-too-large';
  }
  if (
    compressed > 0 &&
    uncompressed > ZIP_LIMITS.ratioFloorBytes &&
    uncompressed / compressed > ZIP_LIMITS.maxCompressionRatio
  ) {
    return 'ratio';
  }
  return null;
}
