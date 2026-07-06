'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { ArrowDown, ArrowUp, CircleStop, Download, LoaderCircle, Play, Plus, Save, Trash2, Workflow, X } from 'lucide-react';
import { DropZone } from '@/components/ui/DropZone';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { toast } from '@/components/ui/Toast';
import { useLocale } from '@/components/providers/locale-provider';
import { runTool } from '@/lib/processors';
import { runPipeline } from '@/lib/pipeline/engine';
import { deletePipeline, listPipelines, savePipeline } from '@/lib/pipeline/storage';
import type { Pipeline, PipelineProgress, PipelineRunResult } from '@/lib/pipeline/types';
import { getBrowsableTools, getToolById } from '@/lib/tool-registry';
import { getCategoryCopy, formatMegaBytes } from '@/lib/i18n';
import {
  getLocalizedChoiceLabel,
  getLocalizedOptionLabel,
  getLocalizedPlaceholder,
  getLocalizedToolCopy,
} from '@/lib/tool-localization';
import { normalizeToolOptions } from '@/lib/option-schema';
import { cx, downloadBlob, safeFileName } from '@/lib/utils';
import { dedupeFileName } from '@/lib/filename-safety';
import type { ProcessedFile } from '@/types/processor';
import type { ToolDefinition, ToolOption } from '@/types/tool';

type ToolOptionValues = Record<string, string | number | boolean>;
type Step = { uid: string; toolId: string; options: ToolOptionValues };

// Tools that can run without an uploaded file (they take a URL/text input),
// so a pipeline starting with one should not require input files.
const FILE_OPTIONAL_TOOLS = new Set(['qr-generator', 'url-image', 'url-pdf', 'detect-cms']);

function toolNeedsFiles(toolId: string | undefined): boolean {
  if (!toolId) return true;
  const tool = getToolById(toolId);
  if (!tool) return true;
  return tool.inputMode !== 'url' && !FILE_OPTIONAL_TOOLS.has(tool.id);
}

// Tools usable in a pipeline: everything except the interactive capture studios
// (screen/webcam/audio recorders take no file input and need a live session).
function pipelineTools(): ToolDefinition[] {
  return getBrowsableTools().filter((tool) => tool.inputMode !== 'capture');
}

function defaultsFor(tool: ToolDefinition): ToolOptionValues {
  return normalizeToolOptions(tool.options ?? [], {});
}

function StepOptionField({
  option,
  value,
  locale,
  disabled,
  onChange,
}: {
  option: ToolOption;
  value: string | number | boolean | undefined;
  locale: 'en' | 'ko';
  disabled: boolean;
  onChange: (value: string | number | boolean) => void;
}) {
  const label = getLocalizedOptionLabel(option, locale);
  const id = `pipe-opt-${option.key}`;
  const base = 'input-surface mt-1 w-full text-sm';

  let control: JSX.Element;
  if (option.type === 'select') {
    control = (
      <select id={id} value={String(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={base}>
        {(option.options ?? []).map((entry) => (
          <option key={String(entry.value)} value={String(entry.value)}>
            {getLocalizedChoiceLabel(entry.label, locale)}
          </option>
        ))}
      </select>
    );
  } else if (option.type === 'checkbox') {
    control = (
      <label className="mt-1 inline-flex items-center gap-2 text-sm text-ink-muted">
        <input id={id} type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
        {locale === 'ko' ? '사용' : 'Enabled'}
      </label>
    );
  } else if (option.type === 'color') {
    control = (
      <input id={id} type="color" value={String(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border bg-base-subtle" />
    );
  } else if (option.type === 'range') {
    control = (
      <div className="mt-1 flex items-center gap-2">
        <input id={id} type="range" value={Number(value)} min={option.min} max={option.max} step={option.step} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-cyan-400" />
        <span className="w-10 text-right font-mono text-xs text-ink-muted">{String(value)}</span>
      </div>
    );
  } else {
    control = (
      <input
        id={id}
        type={option.type === 'number' ? 'number' : 'text'}
        value={String(value ?? '')}
        min={option.min}
        max={option.max}
        step={option.step}
        disabled={disabled}
        placeholder={getLocalizedPlaceholder(option, locale)}
        onChange={(e) => onChange(option.type === 'number' ? Number(e.target.value) : e.target.value)}
        className={base}
      />
    );
  }

  return (
    <div>
      <label htmlFor={id} className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">
        {label}
      </label>
      {control}
    </div>
  );
}

export function PipelineBuilder() {
  const { locale, messages } = useLocale();
  const t = messages.pipeline;

  const [files, setFiles] = useState<File[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [result, setResult] = useState<PipelineRunResult | null>(null);
  const [recipes, setRecipes] = useState<Pipeline[]>([]);
  const [recipeName, setRecipeName] = useState('');
  const uidRef = useRef(0);
  const signalRef = useRef<{ aborted: boolean } | null>(null);

  const tools = useMemo(pipelineTools, []);

  const refreshRecipes = () => setRecipes(listPipelines());
  useEffect(refreshRecipes, []);

  // Release the previous run's output object URLs when the result changes or
  // the page unmounts (downloads use the blob directly, so this is safe).
  useEffect(() => {
    return () => {
      result?.finalFiles.forEach((file) => {
        if (file.previewUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(file.previewUrl);
        }
      });
    };
  }, [result]);

  const nextUid = () => {
    uidRef.current += 1;
    return `s${uidRef.current}`;
  };

  const addStep = (toolId: string) => {
    const tool = getToolById(toolId);
    if (!tool) return;
    setSteps((current) => [...current, { uid: nextUid(), toolId, options: defaultsFor(tool) }]);
    setResult(null);
  };

  const updateOption = (index: number, key: string, value: string | number | boolean) => {
    setSteps((current) => current.map((step, i) => (i === index ? { ...step, options: { ...step.options, [key]: value } } : step)));
    setResult(null);
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    setSteps((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setResult(null);
  };

  const removeStep = (index: number) => {
    setSteps((current) => current.filter((_, i) => i !== index));
    setResult(null);
  };

  const onRun = async () => {
    if (!steps.length) {
      toast.error(t.addStepsFirst);
      return;
    }
    if (toolNeedsFiles(steps[0]?.toolId) && !files.length) {
      toast.error(t.addFilesFirst);
      return;
    }
    const signal = { aborted: false };
    signalRef.current = signal;
    setRunning(true);
    setResult(null);
    setProgress(null);
    try {
      const outcome = await runPipeline({
        steps: steps.map((step) => ({ toolId: step.toolId, options: step.options })),
        files,
        runStep: runTool,
        acceptForTool: (id) => getToolById(id)?.accept,
        onProgress: setProgress,
        signal,
      });
      setResult(outcome);
      if (outcome.ok) {
        toast.success(t.done);
      } else {
        const failedTool = outcome.failedStepIndex != null ? outcome.steps[outcome.failedStepIndex] : null;
        toast.error(failedTool?.error ?? t.cancelled);
      }
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t.cancelled);
    } finally {
      setRunning(false);
      signalRef.current = null;
    }
  };

  const onCancel = () => {
    if (signalRef.current) {
      signalRef.current.aborted = true;
    }
  };

  const onSave = () => {
    const name = recipeName.trim();
    if (!name) {
      toast.error(t.nameToast);
      return;
    }
    if (!steps.length) {
      toast.error(t.addStepsFirst);
      return;
    }
    savePipeline({
      id: `p${Date.now()}`,
      name,
      steps: steps.map((step) => ({ toolId: step.toolId, options: step.options })),
    });
    refreshRecipes();
    toast.success(t.savedToast);
  };

  const loadRecipe = (pipeline: Pipeline) => {
    // Re-normalize stored options against each tool's current schema (fills
    // defaults, drops stale keys, and yields empty options for a removed tool).
    setSteps(
      pipeline.steps.map((step) => ({
        uid: nextUid(),
        toolId: step.toolId,
        options: normalizeToolOptions(getToolById(step.toolId)?.options ?? [], step.options),
      })),
    );
    setRecipeName(pipeline.name);
    setResult(null);
  };

  const onDeleteRecipe = (id: string) => {
    deletePipeline(id);
    refreshRecipes();
    toast.success(t.deletedToast);
  };

  const onDownloadAll = async (outputs: ProcessedFile[]) => {
    if (outputs.length === 1) {
      downloadBlob(outputs[0].blob, outputs[0].name);
      return;
    }
    const zip = new JSZip();
    const seen = new Set<string>();
    outputs.forEach((file) => zip.file(dedupeFileName(safeFileName(file.name), seen), file.blob));
    downloadBlob(await zip.generateAsync({ type: 'blob' }), 'pipeline-results.zip');
  };

  const toolName = (toolId: string) => {
    const tool = getToolById(toolId);
    return tool ? getLocalizedToolCopy(tool, locale).name : toolId;
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="workspace-panel p-6 sm:p-7">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.25rem] border border-border/70 bg-base-elevated text-prime shadow-card">
            <Workflow size={26} />
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{t.title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted sm:text-base">{t.subtitle}</p>
          </div>
        </div>
      </div>

      <section className="workspace-panel space-y-4 p-5 sm:p-6">
        <p className="text-sm font-semibold text-ink">{t.inputFiles}</p>
        <DropZone
          files={files}
          onFiles={(next) => {
            setFiles(next);
            setResult(null);
            setProgress(null);
          }}
          multiple
          disabled={running}
          label={messages.workbench.dropzone}
        />
      </section>

      <section className="workspace-panel space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-ink">{t.steps}</p>
          <div className="flex items-center gap-2">
            <Plus size={16} className="text-ink-faint" />
            <select
              aria-label={t.addStep}
              value=""
              disabled={running}
              onChange={(e) => {
                if (e.target.value) addStep(e.target.value);
                e.target.value = '';
              }}
              className="input-surface text-sm"
            >
              <option value="">{t.chooseTool}</option>
              {Array.from(new Set(tools.map((tool) => tool.category))).map((category) => (
                <optgroup key={category} label={getCategoryCopy(locale, category).nav}>
                  {tools
                    .filter((tool) => tool.category === category)
                    .map((tool) => (
                      <option key={tool.id} value={tool.id}>
                        {getLocalizedToolCopy(tool, locale).name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        {steps.length === 0 ? (
          <div className="workspace-section text-center">
            <p className="text-sm font-medium text-ink">{t.emptyStepsTitle}</p>
            <p className="mt-1 text-sm text-ink-muted">{t.emptyStepsBody}</p>
          </div>
        ) : (
          <ol className="space-y-3">
            {steps.map((step, index) => {
              const tool = getToolById(step.toolId);
              const options = tool?.options ?? [];
              return (
                <li key={step.uid} className="workspace-section p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-prime/10 text-xs font-semibold text-prime">
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-ink">{toolName(step.toolId)}</p>
                        {tool?.accept ? <p className="text-[11px] font-mono text-ink-faint">{tool.accept}</p> : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" aria-label={t.moveUp} disabled={running || index === 0} onClick={() => moveStep(index, -1)} className="rounded-lg border border-border p-1.5 text-ink-muted hover:border-border-bright disabled:opacity-40">
                        <ArrowUp size={14} />
                      </button>
                      <button type="button" aria-label={t.moveDown} disabled={running || index === steps.length - 1} onClick={() => moveStep(index, 1)} className="rounded-lg border border-border p-1.5 text-ink-muted hover:border-border-bright disabled:opacity-40">
                        <ArrowDown size={14} />
                      </button>
                      <button type="button" aria-label={t.removeStep} disabled={running} onClick={() => removeStep(index)} className="rounded-lg p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger disabled:opacity-40">
                        <X size={14} />
                      </button>
                    </div>
                  </div>

                  {options.length > 0 ? (
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {options.map((option) => (
                        <StepOptionField
                          key={option.key}
                          option={option}
                          value={step.options[option.key]}
                          locale={locale}
                          disabled={running}
                          onChange={(value) => updateOption(index, option.key, value)}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-ink-faint">{t.noOptions}</p>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button type="button" disabled={running} onClick={onRun} className="btn-primary">
            {running ? <LoaderCircle size={18} className="animate-spin" /> : <Play size={18} />}
            {running ? t.running : t.run}
          </button>
          {running ? (
            <button type="button" onClick={onCancel} className="btn-ghost border-danger/30 text-danger">
              <CircleStop size={16} />
              {t.cancel}
            </button>
          ) : null}
          <div className="flex items-center gap-2">
            <input
              value={recipeName}
              disabled={running}
              onChange={(e) => setRecipeName(e.target.value)}
              placeholder={t.namePlaceholder}
              className="input-surface text-sm"
            />
            <button type="button" disabled={running} onClick={onSave} className="btn-ghost">
              <Save size={16} />
              {t.save}
            </button>
          </div>
        </div>
      </section>

      {running || progress ? (
        <section className="workspace-panel p-5 sm:p-6">
          <div className="mb-3 flex items-center justify-between gap-3 text-sm">
            <span className="text-ink-muted">
              {progress ? `${t.stepLabel} ${progress.stepIndex + 1}/${progress.totalSteps} · ${toolName(progress.toolId)}` : ''}
            </span>
            <span className="text-ink-faint">{progress?.stage}</span>
          </div>
          <ProgressBar value={progress?.overallPercent ?? 0} status={running ? 'running' : 'done'} />
        </section>
      ) : null}

      {result ? (
        <section className="workspace-panel space-y-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-ink">{t.result}</p>
            {result.ok && result.finalFiles.length ? (
              <button type="button" onClick={() => onDownloadAll(result.finalFiles)} className="btn-ghost">
                <Download size={16} />
                {messages.workbench.downloadAll}
              </button>
            ) : null}
          </div>

          <ol className="space-y-2">
            {result.steps.map((stepResult, index) => (
              <li
                key={index}
                className={cx(
                  'flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm',
                  stepResult.ok ? 'border-ok/25 bg-ok/5' : 'border-danger/30 bg-danger/10',
                )}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-base-elevated text-[11px] font-semibold text-ink-muted">{index + 1}</span>
                <span className="font-medium text-ink">{toolName(stepResult.toolId)}</span>
                {stepResult.ok ? (
                  <span className="text-ink-muted">→ {stepResult.outputCount} {t.stepProduced}</span>
                ) : (
                  <span className="text-danger">{t.failedAtStep}: {stepResult.error}</span>
                )}
                {stepResult.warning ? <span className="text-warn">⚠ {stepResult.warning}</span> : null}
              </li>
            ))}
          </ol>

          {result.ok && result.finalFiles.length ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {result.finalFiles.map((file, index) => (
                <div key={index} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-base-subtle/70 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{file.name}</p>
                    <p className="text-xs font-mono text-ink-muted">{formatMegaBytes(file.blob.size)}</p>
                  </div>
                  <button type="button" onClick={() => downloadBlob(file.blob, file.name)} className="btn-primary px-3 py-1.5 text-xs">
                    <Download size={14} />
                    {messages.workbench.download}
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="workspace-panel space-y-3 p-5 sm:p-6">
        <p className="text-sm font-semibold text-ink">{t.recipes}</p>
        {recipes.length === 0 ? (
          <p className="text-sm text-ink-muted">{t.noRecipes}</p>
        ) : (
          <ul className="space-y-2">
            {recipes.map((pipeline) => (
              <li key={pipeline.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-base-subtle/70 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{pipeline.name}</p>
                  <p className="truncate text-xs text-ink-muted">{pipeline.steps.map((step) => toolName(step.toolId)).join(' → ') || '—'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" disabled={running} onClick={() => loadRecipe(pipeline)} className="btn-ghost px-3 py-1.5 text-xs disabled:opacity-40">
                    {t.load}
                  </button>
                  <button type="button" aria-label={t.delete} disabled={running} onClick={() => onDeleteRecipe(pipeline.id)} className="rounded-lg p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger disabled:opacity-40">
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
