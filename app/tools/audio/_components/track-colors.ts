/** Track colours, in the order new tracks receive them. */
const TRACK_COLORS: Array<{ light: string; dark: string }> = [
  { light: '#4f46e5', dark: '#818cf8' },
  { light: '#0d9488', dark: '#2dd4bf' },
  { light: '#d97706', dark: '#fbbf24' },
  { light: '#db2777', dark: '#f472b6' },
  { light: '#0284c7', dark: '#38bdf8' },
  { light: '#65a30d', dark: '#a3e635' },
];

/**
 * Gives each track id the next colour the first time it is seen, so a track
 * keeps its colour when tracks are reordered or removed.
 */
export function createTrackColorer() {
  const indexById = new Map<string, number>();
  return (trackId: string, theme: 'light' | 'dark') => {
    let index = indexById.get(trackId);
    if (index === undefined) {
      index = indexById.size % TRACK_COLORS.length;
      indexById.set(trackId, index);
    }
    return TRACK_COLORS[index][theme];
  };
}

/** `#rrggbb` with an alpha, for tints of a track colour. */
export function withAlpha(hex: string, alpha: number) {
  const value = hex.replace('#', '');
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
