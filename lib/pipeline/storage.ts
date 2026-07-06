'use client';

import type { Pipeline, PipelineStep } from './types';
import { MAX_PIPELINE_STEPS } from './types';

const KEY = 'jhtoolbox.pipelines';

type PipelineStore = Record<string, Pipeline>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Validate + normalize an untrusted step (from storage or an imported file). */
function sanitizeStep(value: unknown): PipelineStep | null {
  if (!isPlainObject(value) || typeof value.toolId !== 'string' || !value.toolId) {
    return null;
  }
  const options: Record<string, string | number | boolean> = {};
  if (isPlainObject(value.options)) {
    for (const [key, raw] of Object.entries(value.options)) {
      if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
        options[key] = raw;
      }
    }
  }
  return { toolId: value.toolId, options };
}

/** Validate + normalize an untrusted pipeline; returns null when unusable. */
export function sanitizePipeline(value: unknown): Pipeline | null {
  if (!isPlainObject(value) || typeof value.id !== 'string' || !value.id) {
    return null;
  }
  const steps = Array.isArray(value.steps)
    ? value.steps.map(sanitizeStep).filter((step): step is PipelineStep => step !== null).slice(0, MAX_PIPELINE_STEPS)
    : [];
  const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : 'Untitled recipe';
  return { id: value.id, name, steps };
}

function readStore(): PipelineStore {
  if (typeof window === 'undefined') {
    return {};
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) {
      return {};
    }
    const store: PipelineStore = {};
    for (const [id, value] of Object.entries(parsed)) {
      const pipeline = sanitizePipeline(value);
      if (pipeline) {
        store[id] = pipeline;
      }
    }
    return store;
  } catch {
    return {};
  }
}

function writeStore(store: PipelineStore) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Storage full/blocked (private mode): never let persistence break a run.
  }
}

export function listPipelines(): Pipeline[] {
  return Object.values(readStore()).sort((a, b) => a.name.localeCompare(b.name));
}

export function getPipeline(id: string): Pipeline | null {
  return readStore()[id] ?? null;
}

export function savePipeline(pipeline: Pipeline): void {
  const clean = sanitizePipeline(pipeline);
  if (!clean) {
    return;
  }
  const store = readStore();
  store[clean.id] = clean;
  writeStore(store);
}

export function deletePipeline(id: string): void {
  const store = readStore();
  if (store[id]) {
    delete store[id];
    writeStore(store);
  }
}
