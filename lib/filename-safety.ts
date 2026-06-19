/**
 * Download / archive filename safety (no runtime dependencies → unit testable).
 *
 * The previous `safeFileName` replaced every non-`[A-Za-z0-9._-]` character with
 * `_`, which destroyed Korean and other Unicode names (e.g. `보고서.pdf` →
 * `______.pdf`). This version preserves Unicode while removing only what is
 * genuinely unsafe: path separators, control characters, Windows-illegal
 * characters, reserved device names, and trailing dots/spaces.
 */

const ILLEGAL = /[<>:"/\\|?*]/g;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const MAX_LENGTH = 200;

/** Remove ASCII control characters (0x00–0x1f) and DEL without a regex literal. */
function stripControl(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x20 && code !== 0x7f) {
      out += ch;
    }
  }
  return out;
}

/**
 * Return a safe download filename that preserves the original (Unicode) base
 * name as much as possible. Strips path separators and illegal characters,
 * handles Windows reserved names, trims trailing dots/spaces, and caps length.
 */
export function safeFileName(rawName: string, fallback = 'download'): string {
  let name = (typeof rawName === 'string' ? rawName : '').normalize('NFC');
  name = stripControl(name).replace(ILLEGAL, '-');

  // Trim leading/trailing spaces and dots (hidden/invalid on some platforms).
  name = name.replace(/^[ .]+/, '').replace(/[ .]+$/, '');
  // Collapse whitespace and dash runs.
  name = name.replace(/\s+/g, ' ').replace(/-{2,}/g, '-');

  if (name === '' || name === '-') {
    name = fallback;
  }
  if (WINDOWS_RESERVED.test(name)) {
    name = `_${name}`;
  }

  if (name.length > MAX_LENGTH) {
    const dot = name.lastIndexOf('.');
    if (dot > 0 && name.length - dot <= 16) {
      const ext = name.slice(dot);
      name = `${name.slice(0, MAX_LENGTH - ext.length)}${ext}`;
    } else {
      name = name.slice(0, MAX_LENGTH);
    }
  }

  return name;
}

/**
 * Deduplicate a filename against names already emitted by inserting ` (2)`,
 * ` (3)`, … before the extension. Mutates `seen`.
 */
export function dedupeFileName(name: string, seen: Set<string>): string {
  if (!seen.has(name)) {
    seen.add(name);
    return name;
  }

  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';

  let counter = 2;
  let candidate = `${stem} (${counter})${ext}`;
  while (seen.has(candidate)) {
    counter += 1;
    candidate = `${stem} (${counter})${ext}`;
  }
  seen.add(candidate);
  return candidate;
}
