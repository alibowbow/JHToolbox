/**
 * Best-effort input/output compatibility helpers for pipelines. Used to warn
 * (never to block): the engine still runs a step even when the previous
 * output looks mismatched, because a tool's real output type can only be known
 * after it runs. No DOM/browser APIs -> unit testable.
 */

/**
 * Does a file satisfy an `accept` string (the same syntax the file input and
 * DropZone use): comma-separated extensions (".pdf"), wildcard mime
 * ("image/*"), exact mime ("application/pdf"), or "*"/"" for anything.
 */
export function matchesAccept(accept: string | undefined, fileName: string, mimeType: string): boolean {
  const spec = (accept ?? '').trim();
  if (spec === '' || spec === '*' || spec === '*/*') {
    return true;
  }

  const name = fileName.toLowerCase();
  const mime = (mimeType ?? '').toLowerCase();

  return spec
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
    .some((token) => {
      if (token === '*' || token === '*/*') {
        return true;
      }
      if (token.startsWith('.')) {
        return name.endsWith(token);
      }
      if (token.endsWith('/*')) {
        // "image/*" -> mime starts with "image/"
        return mime.startsWith(token.slice(0, -1));
      }
      return mime === token;
    });
}

/**
 * Warning string when NONE of the produced files match the next tool's accept,
 * or undefined when at least one does (or there is nothing to check).
 */
export function describeAcceptMismatch(
  accept: string | undefined,
  files: Array<{ name: string; type: string }>,
): string | undefined {
  const spec = (accept ?? '').trim();
  if (spec === '' || spec === '*' || files.length === 0) {
    return undefined;
  }
  const anyMatch = files.some((file) => matchesAccept(spec, file.name, file.type));
  return anyMatch ? undefined : `The previous step's output may not match this tool's accepted input (${spec}).`;
}
