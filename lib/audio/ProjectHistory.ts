import type { AudioProjectTrack } from './MultiTrack';

type HistoryEntry = {
  label: string;
  tracks: AudioProjectTrack[];
};

const DEFAULT_LIMIT = 30;

function snapshotTracks(tracks: AudioProjectTrack[]): AudioProjectTrack[] {
  // Track objects are copied; AudioBuffers are shared because every edit
  // produces a new buffer instead of mutating in place.
  return tracks.map((track) => ({ ...track }));
}

/**
 * Project-level undo history. Snapshots cover the whole track list, so track
 * moves, deletions, recordings, and per-track edits are all undoable and the
 * history survives switching the active track.
 */
export class ProjectHistory {
  private readonly limit: number;
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];

  constructor(limit = DEFAULT_LIMIT) {
    this.limit = Math.max(1, limit);
  }

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }

  get undoLabel() {
    return this.past.at(-1)?.label ?? null;
  }

  get redoLabel() {
    return this.future.at(-1)?.label ?? null;
  }

  get depth() {
    return this.past.length;
  }

  /** Record the state that exists *before* a mutation is applied. */
  push(label: string, tracksBeforeChange: AudioProjectTrack[]) {
    this.past.push({ label, tracks: snapshotTracks(tracksBeforeChange) });
    if (this.past.length > this.limit) {
      this.past.shift();
    }
    this.future = [];
  }

  undo(currentTracks: AudioProjectTrack[]): HistoryEntry | null {
    const previous = this.past.pop();
    if (!previous) {
      return null;
    }

    this.future.push({ label: previous.label, tracks: snapshotTracks(currentTracks) });
    return previous;
  }

  redo(currentTracks: AudioProjectTrack[]): HistoryEntry | null {
    const next = this.future.pop();
    if (!next) {
      return null;
    }

    this.past.push({ label: next.label, tracks: snapshotTracks(currentTracks) });
    return next;
  }

  clear() {
    this.past = [];
    this.future = [];
  }
}
