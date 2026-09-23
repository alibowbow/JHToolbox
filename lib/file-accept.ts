/**
 * Matching files against an `<input accept>` string (no runtime deps → unit
 * testable). The file picker applies `accept` itself (loosely — users can pick
 * "All files"), but drag-and-drop bypasses it entirely.
 */

export interface AcceptCandidate {
  name: string;
  type: string;
}

function parseAccept(accept: string | undefined): string[] {
  return (accept ?? '')
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
}

export function isFileAccepted(file: AcceptCandidate, accept: string | undefined): boolean {
  const tokens = parseAccept(accept);
  if (tokens.length === 0 || tokens.includes('*') || tokens.includes('*/*')) {
    return true;
  }

  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  for (const token of tokens) {
    if (token.startsWith('.')) {
      if (name.endsWith(token)) return true;
    } else if (token.endsWith('/*')) {
      if (type.startsWith(token.slice(0, -1))) return true;
    } else if (type === token) {
      return true;
    }
  }

  // Browsers report an empty type for formats they do not know (e.g. .mkv on
  // some systems). With only MIME tokens to go on there is nothing to judge by,
  // so let the tool decide instead of rejecting a file it may well handle.
  return type === '' && !tokens.some((token) => token.startsWith('.'));
}

export function partitionByAccept<T extends AcceptCandidate>(
  files: T[],
  accept: string | undefined,
): { accepted: T[]; rejected: T[] } {
  const accepted: T[] = [];
  const rejected: T[] = [];
  for (const file of files) {
    (isFileAccepted(file, accept) ? accepted : rejected).push(file);
  }
  return { accepted, rejected };
}
