const KEY = 'jhtoolbox.recentTools';
const MAX_ITEMS = 8;

function normalizeRecentTools(items: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const item of items) {
    if (seen.has(item)) {
      continue;
    }

    seen.add(item);
    next.push(item);

    if (next.length >= MAX_ITEMS) {
      break;
    }
  }

  return next;
}

export function getRecentTools(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return normalizeRecentTools(parsed.filter((item) => typeof item === 'string'));
  } catch {
    return [];
  }
}

export function pushRecentTool(toolId: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  const current = getRecentTools().filter((item) => item !== toolId);
  const next = normalizeRecentTools([toolId, ...current]);
  localStorage.setItem(KEY, JSON.stringify(next));
}
