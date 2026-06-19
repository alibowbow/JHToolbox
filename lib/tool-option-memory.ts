'use client';

import { ToolOption } from '@/types/tool';
import { normalizeOptionValue } from '@/lib/option-schema';

type ToolOptionValues = Record<string, string | number | boolean>;

type ToolOptionMemoryEntry = {
  lastRun?: ToolOptionValues;
  preset?: ToolOptionValues;
};

type ToolOptionMemoryStore = Record<string, ToolOptionMemoryEntry>;

const KEY = 'jhtoolbox.toolOptionMemory';

function readStore(): ToolOptionMemoryStore {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return parsed as ToolOptionMemoryStore;
  } catch {
    return {};
  }
}

function writeStore(store: ToolOptionMemoryStore) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Storage may be full or blocked (private mode); never let a persistence
    // failure break the tool run.
  }
}

function sanitizeValues(toolOptions: ToolOption[], candidate: ToolOptionValues | undefined) {
  if (!candidate) {
    return null;
  }

  const nextValues: ToolOptionValues = {};

  toolOptions.forEach((option) => {
    const rawValue = candidate[option.key];
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return;
    }
    // Schema-validate each stored value (fixes Boolean("false") === true,
    // out-of-range numbers, and stale select choices).
    nextValues[option.key] = normalizeOptionValue(option, rawValue);
  });

  return Object.keys(nextValues).length ? nextValues : null;
}

function getEntry(toolId: string) {
  return readStore()[toolId] ?? {};
}

function updateEntry(toolId: string, updater: (entry: ToolOptionMemoryEntry) => ToolOptionMemoryEntry) {
  const store = readStore();
  const nextEntry = updater(store[toolId] ?? {});

  if (!nextEntry.lastRun && !nextEntry.preset) {
    delete store[toolId];
  } else {
    store[toolId] = nextEntry;
  }

  writeStore(store);
}

export function getLastRunToolOptions(toolId: string, toolOptions: ToolOption[]) {
  return sanitizeValues(toolOptions, getEntry(toolId).lastRun);
}

export function saveLastRunToolOptions(toolId: string, toolOptions: ToolOption[], values: ToolOptionValues) {
  const sanitized = sanitizeValues(toolOptions, values);
  if (!sanitized) {
    return;
  }

  updateEntry(toolId, (entry) => ({
    ...entry,
    lastRun: sanitized,
  }));
}

export function hasLastRunToolOptions(toolId: string) {
  return Boolean(getEntry(toolId).lastRun);
}

export function getPresetToolOptions(toolId: string, toolOptions: ToolOption[]) {
  return sanitizeValues(toolOptions, getEntry(toolId).preset);
}

export function savePresetToolOptions(toolId: string, toolOptions: ToolOption[], values: ToolOptionValues) {
  const sanitized = sanitizeValues(toolOptions, values);
  if (!sanitized) {
    return;
  }

  updateEntry(toolId, (entry) => ({
    ...entry,
    preset: sanitized,
  }));
}

export function clearPresetToolOptions(toolId: string) {
  updateEntry(toolId, (entry) => ({
    ...entry,
    preset: undefined,
  }));
}

export function hasPresetToolOptions(toolId: string) {
  return Boolean(getEntry(toolId).preset);
}
