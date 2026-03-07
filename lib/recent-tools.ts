const KEY = 'jhtoolbox.recentTools';
const MAX_ITEMS = 8;

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
    return parsed.filter((item) => typeof item === 'string');
  } catch {
    return [];
  }
}

export function pushRecentTool(toolId: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  const current = getRecentTools().filter((item) => item !== toolId);
  const next = [toolId, ...current].slice(0, MAX_ITEMS);
  localStorage.setItem(KEY, JSON.stringify(next));
}
