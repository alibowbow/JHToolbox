import type { ProcessContext, ProcessProgress, ProcessedFile } from '@/types/processor';
import type { PipelineProgress, PipelineRunResult, PipelineStep, PipelineStepResult } from './types';
import { MAX_PIPELINE_STEPS } from './types';
import { describeAcceptMismatch } from './compatibility';

export interface RunPipelineInput {
  steps: PipelineStep[];
  /** Files the first step receives. */
  files: File[];
  /** Runs one tool — inject `runTool` in the app, a fake in tests. */
  runStep: (ctx: ProcessContext) => Promise<ProcessedFile[]>;
  /** Optional: a tool's accepted-input string, for non-blocking warnings. */
  acceptForTool?: (toolId: string) => string | undefined;
  onProgress?: (progress: PipelineProgress) => void;
  /** Cooperative cancellation checked between steps. */
  signal?: { aborted: boolean };
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** ProcessedFile (a Blob + name + mime) -> the File the next step consumes. */
function processedToFile(file: ProcessedFile): File {
  return new File([file.blob], file.name, { type: file.mimeType });
}

/** Free an intermediate output's object URL (no-op in Node / for data: URLs). */
function revokePreview(file: ProcessedFile): void {
  if (
    file.previewUrl?.startsWith('blob:') &&
    typeof URL !== 'undefined' &&
    typeof URL.revokeObjectURL === 'function'
  ) {
    URL.revokeObjectURL(file.previewUrl);
  }
}

/**
 * Run an ordered list of tool steps, feeding each step's output into the next.
 * Pure and injectable: the only side effect is calling `runStep`, so the whole
 * chaining/conversion/progress/error logic is unit-testable without a browser.
 *
 * A step that throws or produces zero files stops the run and reports which
 * step failed; subsequent steps do not run. A step whose input does not match
 * the tool's `accept` still runs, but carries a warning.
 */
export async function runPipeline(input: RunPipelineInput): Promise<PipelineRunResult> {
  const { steps, runStep } = input;
  if (steps.length === 0) {
    throw new Error('Add at least one step before running the pipeline.');
  }
  if (steps.length > MAX_PIPELINE_STEPS) {
    throw new Error(`A pipeline can have at most ${MAX_PIPELINE_STEPS} steps.`);
  }

  const results: PipelineStepResult[] = [];
  // Copy so a tool that mutates its input array cannot corrupt the caller's.
  let current: File[] = [...input.files];

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];

    if (input.signal?.aborted) {
      results.push({ toolId: step.toolId, ok: false, outputCount: 0, error: 'Pipeline cancelled.' });
      return { ok: false, steps: results, finalFiles: [], failedStepIndex: index };
    }

    // Non-blocking input-compatibility warning (skip the first step, whose
    // input is whatever the user uploaded).
    const warning =
      index > 0
        ? describeAcceptMismatch(input.acceptForTool?.(step.toolId), current)
        : undefined;

    // Emit a step-start event so the UI advances the step label/boundary even
    // for tools that never call their onProgress.
    input.onProgress?.({
      stepIndex: index,
      totalSteps: steps.length,
      stepPercent: 0,
      overallPercent: clampPercent((index / steps.length) * 100),
      stage: 'Starting',
      toolId: step.toolId,
    });

    const report = (progress: ProcessProgress) => {
      input.onProgress?.({
        stepIndex: index,
        totalSteps: steps.length,
        stepPercent: clampPercent(progress.percent),
        overallPercent: clampPercent(((index + progress.percent / 100) / steps.length) * 100),
        stage: progress.stage,
        toolId: step.toolId,
      });
    };

    let outputs: ProcessedFile[];
    try {
      outputs = await runStep({
        toolId: step.toolId,
        files: current,
        options: step.options,
        onProgress: report,
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'This step failed.';
      results.push({ toolId: step.toolId, ok: false, outputCount: 0, warning, error: message });
      return { ok: false, steps: results, finalFiles: [], failedStepIndex: index };
    }

    if (!outputs.length) {
      results.push({ toolId: step.toolId, ok: false, outputCount: 0, warning, error: 'This step produced no output files.' });
      return { ok: false, steps: results, finalFiles: [], failedStepIndex: index };
    }

    results.push({ toolId: step.toolId, ok: true, outputCount: outputs.length, warning });

    const isLast = index === steps.length - 1;
    if (isLast) {
      input.onProgress?.({
        stepIndex: index,
        totalSteps: steps.length,
        stepPercent: 100,
        overallPercent: 100,
        stage: 'Done',
        toolId: step.toolId,
      });
      return { ok: true, steps: results, finalFiles: outputs, failedStepIndex: null };
    }

    // Convert to Files for the next step, then release each intermediate
    // output's object URL — they are discarded and never shown.
    current = outputs.map((output) => {
      const file = processedToFile(output);
      revokePreview(output);
      return file;
    });
  }

  // Unreachable (the last step always returns), kept for exhaustiveness.
  return { ok: true, steps: results, finalFiles: [], failedStepIndex: null };
}
