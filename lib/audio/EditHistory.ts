import type { AudioCommand } from './types';

type HistoryEntry = {
  buffer: AudioBuffer;
  label: string;
};

const DEFAULT_HISTORY_LIMIT = 20;

export class EditHistory {
  private readonly limit: number;
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];

  constructor(limit = DEFAULT_HISTORY_LIMIT) {
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

  apply(buffer: AudioBuffer, command: AudioCommand): AudioBuffer {
    const nextBuffer = command.execute(buffer);
    this.pushPast(buffer, command.label);
    this.future = [];
    return nextBuffer;
  }

  undo(current: AudioBuffer): AudioBuffer | null {
    const previous = this.past.pop();
    if (!previous) {
      return null;
    }

    this.future.push({ buffer: current, label: previous.label });
    return previous.buffer;
  }

  redo(current: AudioBuffer): AudioBuffer | null {
    const next = this.future.pop();
    if (!next) {
      return null;
    }

    this.pushPast(current, next.label);
    return next.buffer;
  }

  clear() {
    this.past = [];
    this.future = [];
  }

  private pushPast(buffer: AudioBuffer, label: string) {
    this.past.push({ buffer, label });
    if (this.past.length > this.limit) {
      this.past.shift();
    }
  }
}
