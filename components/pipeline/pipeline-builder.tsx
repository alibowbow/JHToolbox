'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronRight,
  CircleStop,
  Download,
  LoaderCircle,
  Play,
  Plus,
  Save,
  SlidersHorizontal,
  Trash2,
  Workflow,
  X,
} from 'lucide-react';
import { DropZone } from '@/components/ui/DropZone';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useLocale } from '@/components/providers/locale-provider';
import { runTool } from '@/lib/processors';
import { runPipeline } from '@/lib/pipeline/engine';
import { localizeErrorMessage, localizeStage } from '@/lib/error-messages';
import { deletePipeline, listPipelines, savePipeline } from '@/lib/pipeline/storage';
import { PIPELINE_PRESETS, getPipelinePreset, type PipelinePreset } from '@/lib/pipeline/presets';
import { PresetCard, presetIcon } from '@/components/pipeline/preset-card';
import type { Pipeline, PipelineProgress, PipelineRunResult } from '@/lib/pipeline/types';
import { getBrowsableTools, getToolById } from '@/lib/tool-registry';
import { getToolIcon } from '@/lib/tool-icons';
import { categoryStyles } from '@/lib/tool-presentation';
import { getCategoryCopy, formatMegaBytes } from '@/lib/i18n';
import {
  getLocalizedChoiceLabel,
  getLocalizedOptionLabel,
  getLocalizedPlaceholder,
  getLocalizedToolCopy,
} from '@/lib/tool-localization';
import { isOptionApplicable, normalizeToolOptions } from '@/lib/option-schema';
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
  idPrefix,
  label: labelOverride,
  onChange,
}: {
  option: ToolOption;
  value: string | number | boolean | undefined;
  locale: 'en' | 'ko';
  disabled: boolean;
  /** Keeps ids unique when two steps share an option key. */
  idPrefix: string;
  label?: string;
  onChange: (value: string | number | boolean) => void;
}) {
  const label = labelOverride ?? getLocalizedOptionLabel(option, locale);
  const id = `${idPrefix}-${option.key}`;
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
        <input id={id} type="range" value={Number(value)} min={option.min} max={option.max} step={option.step} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-prime" />
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
      <label htmlFor={id} className="text-xs font-medium text-ink-muted">
        {label}
      </label>
      {control}
    </div>
  );
}

/** The steps of a pipeline as a row of numbered chips with tool icons. */
function StepChips({ toolIds, locale }: { toolIds: string[]; locale: 'en' | 'ko' }) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label={locale === 'ko' ? '단계' : 'Steps'}>
      {toolIds.map((toolId, index) => {
        const tool = getToolById(toolId);
        const Icon = getToolIcon(toolId, tool?.category ?? 'file');
        return (
          <li key={`${toolId}-${index}`} className="flex items-center gap-1.5">
            {index > 0 ? <ChevronRight size={14} className="text-ink-faint" aria-hidden="true" /> : null}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-base-elevated px-2.5 py-1 text-xs font-medium text-ink">
              <span className="tabular-nums text-ink-faint">{index + 1}</span>
              <Icon size={13} aria-hidden="true" className="text-ink-muted" />
              {tool ? getLocalizedToolCopy(tool, locale).name : toolId}
            </span>
          </li>
        );
      })}
    </ol>
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
  // A chosen preset turns the page into that one job: files, a setting or
  // two, run. Editing its steps hands it to the full builder below.
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const uidRef = useRef(0);
  // Whether a setting of the open preset was changed by hand.
  const presetEditedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const topRef = useRef<HTMLDivElement | null>(null);
  const builderRef = useRef<HTMLElement | null>(null);

  const tools = useMemo(pipelineTools, []);
  const activePreset = getPipelinePreset(activePresetId);

  const refreshRecipes = () => setRecipes(listPipelines());

  // Release the previous run's output object URLs when the result changes or
  // the page unmounts. Download links retain their URLs for the result's life.
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

  const clearRun = () => {
    setResult(null);
    setProgress(null);
    setNotice(null);
  };

  const presetSteps = (preset: PipelinePreset, language: 'en' | 'ko'): Step[] =>
    preset.steps(language).map((step) => ({
      uid: nextUid(),
      toolId: step.toolId,
      // Re-checked against each tool's current options.
      options: normalizeToolOptions(getToolById(step.toolId)?.options ?? [], step.options),
    }));

  const openPreset = (preset: PipelinePreset) => {
    setSteps(presetSteps(preset, locale));
    setRecipeName(preset.name[locale]);
    setActivePresetId(preset.id);
    presetEditedRef.current = false;
    clearRun();
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Some presets write words into the file (a watermark). A preset opened
  // from the address is built before the saved language is known, so an
  // untouched preset is rebuilt in the language the page ends up in.
  useEffect(() => {
    if (!activePreset || presetEditedRef.current) return;
    setSteps(presetSteps(activePreset, locale));
    setRecipeName(activePreset.name[locale]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on a language change
  }, [locale]);

  const closePreset = () => {
    setActivePresetId(null);
    setSteps([]);
    setRecipeName('');
    clearRun();
  };

  // Keep the preset's steps and continue in the full builder.
  const editPresetSteps = () => {
    setActivePresetId(null);
    clearRun();
    window.setTimeout(() => builderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  useEffect(() => {
    refreshRecipes();
    setHydrated(true);
    // /pipeline?preset=<id> opens that job directly.
    const preset = getPipelinePreset(new URLSearchParams(window.location.search).get('preset'));
    if (preset) {
      openPreset(preset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, from the address
  }, []);

  const addStep = (toolId: string) => {
    const tool = getToolById(toolId);
    if (!tool) return;
    setSteps((current) => [...current, { uid: nextUid(), toolId, options: defaultsFor(tool) }]);
    clearRun();
  };

  const updateOption = (index: number, keys: string[], value: string | number | boolean) => {
    presetEditedRef.current = true;
    setSteps((current) =>
      current.map((step, i) =>
        i === index ? { ...step, options: { ...step.options, ...Object.fromEntries(keys.map((key) => [key, value])) } } : step,
      ),
    );
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
    clearRun();
  };

  const removeStep = (index: number) => {
    setSteps((current) => current.filter((_, i) => i !== index));
    clearRun();
  };

  const onRun = async () => {
    if (!steps.length) {
      setNotice(t.addStepsFirst);
      return;
    }
    if (toolNeedsFiles(steps[0]?.toolId) && !files.length) {
      setNotice(t.addFilesFirst);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    clearRun();
    try {
      const outcome = await runPipeline({
        steps: steps.map((step) => ({ toolId: step.toolId, options: step.options })),
        files,
        runStep: runTool,
        acceptForTool: (id) => getToolById(id)?.accept,
        onProgress: setProgress,
        signal: controller.signal,
      });
      setResult({
        ...outcome,
        finalFiles: outcome.finalFiles.map((file) => ({
          ...file,
          previewUrl: file.previewUrl ?? URL.createObjectURL(file.blob),
        })),
      });
    } catch (cause) {
      setNotice(localizeErrorMessage(cause, locale));
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const onCancel = () => {
    abortRef.current?.abort();
  };

  const onSave = () => {
    const name = recipeName.trim();
    if (!name) {
      setNotice(t.nameToast);
      return;
    }
    if (!steps.length) {
      setNotice(t.addStepsFirst);
      return;
    }
    savePipeline({
      id: `p${Date.now()}`,
      name,
      steps: steps.map((step) => ({ toolId: step.toolId, options: step.options })),
    });
    refreshRecipes();
    setNotice(null);
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
    setActivePresetId(null);
    clearRun();
  };

  const onDeleteRecipe = (id: string) => {
    deletePipeline(id);
    refreshRecipes();
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

  // The drop zone takes only what the first step can open.
  const firstAccept = steps[0] ? getToolById(steps[0].toolId)?.accept : undefined;
  const dropAccept = firstAccept && firstAccept !== '*' ? firstAccept : undefined;
  const onFilesChange = (next: File[]) => {
    setFiles(next);
    clearRun();
  };

  const runButtons = (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={running} onClick={onRun} className="btn-primary" data-testid="pipeline-run">
        {running ? <LoaderCircle size={18} className="animate-spin" /> : <Play size={18} />}
        {running ? t.running : t.run}
      </button>
      {running ? (
        <button type="button" onClick={onCancel} className="btn-ghost border-danger/30 text-danger">
          <CircleStop size={16} />
          {t.cancel}
        </button>
      ) : null}
    </div>
  );
  const noticeLine = notice ? (
    <p role="alert" className="text-sm font-medium text-warn">
      {notice}
    </p>
  ) : null;

  const taskView = activePreset ? (
    <section className="workspace-panel p-5 sm:p-6" data-testid="pipeline-task" aria-labelledby="pipeline-task-title">
      <button type="button" onClick={closePreset} disabled={running} className="btn-ghost -ml-1 h-8 px-2 text-xs">
        <ArrowLeft size={14} aria-hidden="true" />
        {t.allTasks}
      </button>

      <div className="mt-4 flex items-start gap-3">
        {(() => {
          const Icon = presetIcon(activePreset);
          const style = categoryStyles[activePreset.category];
          return (
            <span className={cx('category-tile h-11 w-11 shrink-0', style.iconBg, style.icon)}>
              <Icon size={21} aria-hidden="true" />
            </span>
          );
        })()}
        <div className="min-w-0">
          <h2 id="pipeline-task-title" className="text-lg font-semibold text-ink">
            {activePreset.name[locale]}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">{activePreset.description[locale]}</p>
        </div>
      </div>

      <div className="mt-4">
        <StepChips toolIds={steps.map((step) => step.toolId)} locale={locale} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-semibold text-ink">
            <span className="mr-1.5 tabular-nums text-prime">1</span>
            {t.taskFiles}
            <span className="ml-2 font-normal text-ink-muted">{activePreset.input[locale]}</span>
          </p>
          <DropZone
            files={files}
            onFiles={onFilesChange}
            accept={dropAccept}
            multiple
            reorderable
            disabled={running}
            label={messages.workbench.dropzone}
          />
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold text-ink">
            <span className="mr-1.5 tabular-nums text-prime">2</span>
            {t.keySettings}
          </p>
          {activePreset.keyOptions?.length ? (
            activePreset.keyOptions.map((keyOption) => {
              const owner = steps[keyOption.step];
              const option = owner ? getToolById(owner.toolId)?.options?.find((entry) => entry.key === keyOption.key) : undefined;
              if (!owner || !option) return null;
              return (
                <StepOptionField
                  key={`${keyOption.step}-${keyOption.key}`}
                  option={option}
                  value={owner.options[keyOption.key]}
                  locale={locale}
                  disabled={running}
                  idPrefix={`preset-${owner.uid}`}
                  label={keyOption.label?.[locale]}
                  onChange={(value) => updateOption(keyOption.step, [keyOption.key, ...(keyOption.alsoSet ?? [])], value)}
                />
              );
            })
          ) : (
            <p className="text-sm text-ink-muted">{t.noKeySettings}</p>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-5">
        {runButtons}
        <button type="button" onClick={editPresetSteps} disabled={running} className="btn-ghost">
          <SlidersHorizontal size={16} aria-hidden="true" />
          {t.editSteps}
        </button>
        {noticeLine}
      </div>
    </section>
  ) : null;

  const presetsGrid = (
    <section className="space-y-4" aria-labelledby="pipeline-presets-title">
      <div>
        <h2 id="pipeline-presets-title" className="section-title">
          {t.presets}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{t.presetsHint}</p>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="pipeline-presets">
        {PIPELINE_PRESETS.map((preset) => (
          <li key={preset.id}>
            <PresetCard
              preset={preset}
              locale={locale}
              inputLabel={t.presetInput}
              disabled={running}
              onUse={() => openPreset(preset)}
            />
          </li>
        ))}
      </ul>
    </section>
  );

  const builder = (
    <section ref={builderRef} className="workspace-panel scroll-mt-20 space-y-5 p-5 sm:p-6" aria-labelledby="pipeline-custom-title">
      <div>
        <h2 id="pipeline-custom-title" className="text-[15px] font-semibold text-ink">
          {t.customTitle}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{t.customHint}</p>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-ink">{t.inputFiles}</h3>
        <DropZone
          files={files}
          onFiles={onFilesChange}
          accept={dropAccept}
          multiple
          reorderable
          disabled={running}
          label={messages.workbench.dropzone}
        />
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink">{t.steps}</h3>
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
              const options = (tool?.options ?? []).filter((option) => !option.hidden && isOptionApplicable(option, step.options));
              return (
                <li key={step.uid} className="workspace-section p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-prime/10 text-xs font-semibold text-prime">
                        {index + 1}
                      </span>
                      <h4 className="text-sm font-semibold text-ink">{toolName(step.toolId)}</h4>
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
                          idPrefix={`step-${step.uid}`}
                          onChange={(value) => updateOption(index, [option.key], value)}
                        />
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
        {runButtons}
        <div className="flex items-center gap-2">
          <input
            value={recipeName}
            disabled={running}
            onChange={(e) => setRecipeName(e.target.value)}
            placeholder={t.namePlaceholder}
            aria-label={t.namePlaceholder}
            className="input-surface text-sm"
          />
          <button type="button" disabled={running} onClick={onSave} className="btn-ghost">
            <Save size={16} />
            {t.save}
          </button>
        </div>
        {noticeLine}
      </div>
    </section>
  );

  return (
    <div
      ref={topRef}
      className="mx-auto flex w-full max-w-5xl scroll-mt-20 flex-col gap-6"
      data-testid="pipeline-builder"
      data-ready={hydrated ? 'true' : undefined}
    >
      <header className="flex items-start gap-4">
        <span className="category-tile h-12 w-12 shrink-0 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 sm:h-14 sm:w-14">
          <Workflow size={24} />
        </span>
        <div className="min-w-0 pt-0.5">
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem] sm:leading-tight">{t.title}</h1>
          <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-ink-muted">{t.subtitle}</p>
        </div>
      </header>

      {taskView ?? presetsGrid}

      {running || progress ? (
        <section className="workspace-panel p-5 sm:p-6">
          <div className="mb-3 flex items-center justify-between gap-3 text-sm">
            <span className="text-ink-muted">
              {progress ? `${t.stepLabel} ${progress.stepIndex + 1}/${progress.totalSteps} · ${toolName(progress.toolId)}` : ''}
            </span>
            <span className="text-ink-faint">{progress ? localizeStage(progress.stage, locale) : ''}</span>
          </div>
          <ProgressBar value={progress?.overallPercent ?? 0} status={running ? 'running' : 'done'} />
        </section>
      ) : null}

      {result ? (
        <section className="workspace-panel space-y-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold text-ink">{t.result}</h2>
            {result.ok && result.finalFiles.length > 1 ? (
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
                  <span className="text-danger">{localizeErrorMessage(stepResult.error ?? '', locale)}</span>
                )}
                {stepResult.warning ? <span className="text-warn">{localizeErrorMessage(stepResult.warning, locale)}</span> : null}
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
                  <a href={file.previewUrl} download={safeFileName(file.name)} className="btn-primary px-3 py-1.5 text-xs">
                    <Download size={14} />
                    {messages.workbench.download}
                  </a>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {activePreset ? null : (
        <>
          {builder}

          <section className="workspace-panel space-y-3 p-5 sm:p-6">
            <h2 className="text-[15px] font-semibold text-ink">{t.recipes}</h2>
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
        </>
      )}
    </div>
  );
}
