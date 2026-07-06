/**
 * Data model for pipelines ("recipes"): an ordered list of tool steps whose
 * output feeds the next step's input. Because every tool is already a
 * `ProcessContext -> ProcessedFile[]` function, a step is just a tool id plus
 * its option values, and the engine wires the outputs of one into the next.
 */

export interface PipelineStep {
  toolId: string;
  options: Record<string, string | number | boolean>;
}

export interface Pipeline {
  id: string;
  name: string;
  steps: PipelineStep[];
}

export interface PipelineProgress {
  /** 0-based index of the step currently running. */
  stepIndex: number;
  totalSteps: number;
  /** Progress within the current step, 0..100. */
  stepPercent: number;
  /** Progress across the whole pipeline, 0..100. */
  overallPercent: number;
  stage: string;
  toolId: string;
}

export interface PipelineStepResult {
  toolId: string;
  ok: boolean;
  outputCount: number;
  /** Non-fatal note (e.g. the previous output may not match this tool's input). */
  warning?: string;
  /** Present only when ok === false. */
  error?: string;
}

export interface PipelineRunResult {
  ok: boolean;
  steps: PipelineStepResult[];
  /** The final step's outputs (empty when the run failed). */
  finalFiles: import('@/types/processor').ProcessedFile[];
  /** Index of the step that failed, or null when the whole run succeeded. */
  failedStepIndex: number | null;
}

/** Hard cap so a bad recipe can never spin forever. */
export const MAX_PIPELINE_STEPS = 20;
