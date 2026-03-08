'use client';

import { useEffect, useMemo, useState } from 'react';
import JSZip from 'jszip';
import { Download, LoaderCircle, Play } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { ToolPageLayout } from '@/components/ToolPageLayout';
import { useLocale } from '@/components/providers/locale-provider';
import { AudioWaveformEditor } from '@/components/ui/AudioWaveformEditor';
import { PdfPageEditor, PdfEditorPage } from '@/components/ui/PdfPageEditor';
import { DropZone } from '@/components/ui/DropZone';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ResultCard } from '@/components/ui/ResultCard';
import { Tabs } from '@/components/ui/Tabs';
import { toast } from '@/components/ui/Toast';
import { formatMegaBytes, getCategoryCopy } from '@/lib/i18n';
import {
  getLocalizedChoiceLabel,
  getLocalizedOptionLabel,
  getLocalizedPlaceholder,
  getLocalizedToolCopy,
} from '@/lib/tool-localization';
import { runTool } from '@/lib/processors';
import { categoryIcons, categoryStyles } from '@/lib/tool-presentation';
import { pushRecentTool } from '@/lib/recent-tools';
import { cx, downloadBlob, safeFileName } from '@/lib/utils';
import { ProcessedFile } from '@/types/processor';
import { ToolDefinition, ToolOption } from '@/types/tool';

const OPTIONAL_FILE_TOOLS = new Set(['qr-generator', 'url-image', 'url-pdf', 'detect-cms']);
const PDF_EDITOR_TOOLS = new Set(['pdf-merge', 'pdf-rearrange']);
const CUSTOM_OPTIONS_IN_PREVIEW_TOOLS = new Set(['pdf-rearrange']);

type SearchParamSource = Pick<URLSearchParams, 'get'>;

function getDefaults(tool: ToolDefinition): Record<string, string | number | boolean> {
  const entries = (tool.options ?? []).map((option) => [option.key, option.defaultValue] as const);
  return Object.fromEntries(entries);
}

function getInitialOptions(
  tool: ToolDefinition,
  searchParams: SearchParamSource,
): Record<string, string | number | boolean> {
  const defaults = getDefaults(tool);

  for (const option of tool.options ?? []) {
    const paramValue = searchParams.get(option.key);
    if (paramValue === null) {
      continue;
    }

    if (option.type === 'number' || option.type === 'range') {
      defaults[option.key] = Number(paramValue);
      continue;
    }

    if (option.type === 'checkbox') {
      defaults[option.key] = paramValue === 'true';
      continue;
    }

    defaults[option.key] = paramValue;
  }

  return defaults;
}

function moveFileItem(files: File[], fromIndex: number, toIndex: number) {
  const nextFiles = [...files];
  const [item] = nextFiles.splice(fromIndex, 1);
  nextFiles.splice(toIndex, 0, item);
  return nextFiles;
}

function renderField(
  option: ToolOption,
  value: string | number | boolean | undefined,
  locale: 'en' | 'ko',
  onChange: (key: string, nextValue: string | number | boolean) => void,
) {
  const commonClassName = 'input-surface mt-1 w-full';

  if (option.type === 'select') {
    return (
      <select value={String(value)} onChange={(event) => onChange(option.key, event.target.value)} className={commonClassName}>
        {(option.options ?? []).map((entry) => (
          <option key={String(entry.value)} value={String(entry.value)}>
            {getLocalizedChoiceLabel(entry.label, locale)}
          </option>
        ))}
      </select>
    );
  }

  if (option.type === 'checkbox') {
    return (
      <label className="mt-2 inline-flex items-center gap-2 text-sm text-ink-muted">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(option.key, event.target.checked)}
          className="h-4 w-4"
        />
        {locale === 'ko' ? '사용' : 'Enabled'}
      </label>
    );
  }

  if (option.type === 'color') {
    return (
      <input
        type="color"
        value={String(value)}
        onChange={(event) => onChange(option.key, event.target.value)}
        className="mt-1 h-10 w-full rounded-xl border border-border bg-base-subtle"
      />
    );
  }

  if (option.type === 'range') {
    return (
      <div className="mt-1 space-y-2">
        <input
          type="range"
          value={Number(value)}
          onChange={(event) => onChange(option.key, Number(event.target.value))}
          min={option.min}
          max={option.max}
          step={option.step}
          className="w-full accent-cyan-400"
        />
        <p className="text-xs font-mono text-ink-muted">{String(value)}</p>
      </div>
    );
  }

  return (
    <input
      type={option.type === 'number' ? 'number' : 'text'}
      value={String(value ?? '')}
      onChange={(event) =>
        onChange(option.key, option.type === 'number' ? Number(event.target.value) : event.target.value)
      }
      min={option.min}
      max={option.max}
      step={option.step}
      placeholder={getLocalizedPlaceholder(option, locale)}
      className={commonClassName}
    />
  );
}

export function ToolWorkbench({ tool }: { tool: ToolDefinition }) {
  const { locale, messages } = useLocale();
  const searchParams = useSearchParams();
  const searchParamString = searchParams.toString();
  const [files, setFiles] = useState<File[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<Record<string, string | number | boolean>>(() =>
    getInitialOptions(tool, searchParams),
  );
  const [progress, setProgress] = useState<{ percent: number; stage: string }>({
    percent: 0,
    stage: messages.workbench.statusIdle,
  });
  const [results, setResults] = useState<ProcessedFile[]>([]);
  const [inputPreviewUrl, setInputPreviewUrl] = useState<string | null>(null);

  const Icon = categoryIcons[tool.category];
  const style = categoryStyles[tool.category];
  const category = getCategoryCopy(locale, tool.category);
  const localizedTool = getLocalizedToolCopy(tool, locale);
  const usesDirectInput = tool.inputMode === 'url';
  const usesPdfEditor = PDF_EDITOR_TOOLS.has(tool.id);
  const hasOptions = Boolean(tool.options?.length);
  const showOptionsPanel = hasOptions && !CUSTOM_OPTIONS_IN_PREVIEW_TOOLS.has(tool.id);
  const showWideEditorLayout = tool.id === 'audio-cut';
  const fileOptional = usesDirectInput || OPTIONAL_FILE_TOOLS.has(tool.id);
  const acceptLabel = useMemo(
    () => (tool.accept === '*' ? (locale === 'ko' ? '모든 파일' : 'Any file') : tool.accept),
    [locale, tool.accept],
  );
  const showProgress = running || results.length > 0 || error !== null;
  const showResults = results.length > 0 || error !== null;
  const resultTabs = [
    { id: 'results', label: messages.workbench.results },
    ...(results.length > 0 ? [{ id: 'inspector', label: messages.workbench.inspector }] : []),
  ];
  const dropLabel = fileOptional ? messages.workbench.dropzoneOptional : messages.workbench.dropzone;
  const trimMode = String(options.trimMode ?? 'keep');
  const outputFormat = String(options.outputFormat ?? 'keep');

  useEffect(() => {
    setOptions(getInitialOptions(tool, searchParams));
    setFiles([]);
    setResults([]);
    setError(null);
    setInputPreviewUrl(null);
    setProgress({ percent: 0, stage: messages.workbench.statusIdle });
  }, [messages.workbench.statusIdle, searchParamString, searchParams, tool.id]);

  useEffect(() => {
    if (!running && !results.length && !error) {
      setProgress({ percent: 0, stage: messages.workbench.statusIdle });
    }
  }, [error, messages.workbench.statusIdle, results.length, running]);

  useEffect(() => {
    return () => {
      results.forEach((result) => {
        if (result.previewUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(result.previewUrl);
        }
      });
    };
  }, [results]);

  useEffect(() => {
    if (!files.length) {
      setInputPreviewUrl(null);
      return;
    }

    const firstFile = files[0];
    if (
      !firstFile.type.startsWith('image/') &&
      !firstFile.type.startsWith('audio/') &&
      !firstFile.type.startsWith('video/')
    ) {
      setInputPreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(firstFile);
    setInputPreviewUrl(previewUrl);

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [files]);

  const handlePdfPlanChange = (pages: PdfEditorPage[]) => {
    setOptions((currentOptions) => {
      const nextOptions = { ...currentOptions };

      if (tool.id === 'pdf-merge') {
        nextOptions.mergePlan = JSON.stringify(
          pages.map((page) => ({
            fileIndex: page.fileIndex,
            pageIndex: page.pageIndex,
          })),
        );
      }

      if (tool.id === 'pdf-rearrange') {
        nextOptions.order = pages.map((page) => page.pageNumber).join(',');
      }

      return nextOptions;
    });
  };

  const onProcess = async () => {
    if (!files.length && !fileOptional) {
      setError(messages.workbench.addFileError);
      toast.error(messages.workbench.addFileError);
      return;
    }

    if (tool.id === 'pdf-merge' && files.length > 0 && String(options.mergePlan ?? '').trim() === '') {
      setError(messages.workbench.addPageError);
      toast.error(messages.workbench.addPageError);
      return;
    }

    if (tool.id === 'pdf-rearrange' && files.length > 0 && String(options.order ?? '').trim() === '') {
      setError(messages.workbench.addPageError);
      toast.error(messages.workbench.addPageError);
      return;
    }

    try {
      setError(null);
      setResults([]);
      setRunning(true);
      setProgress({ percent: 2, stage: messages.workbench.statusRunning });

      const processedFiles = await runTool({
        toolId: tool.id,
        files,
        options,
        onProgress: setProgress,
      });

      const filesWithPreview = processedFiles.map((item) => {
        if (item.previewUrl) {
          return item;
        }

        if (
          item.mimeType.startsWith('image/') ||
          item.mimeType.startsWith('video/') ||
          item.mimeType.startsWith('audio/')
        ) {
          return {
            ...item,
            previewUrl: URL.createObjectURL(item.blob),
          };
        }

        return item;
      });

      setResults(filesWithPreview);
      setProgress({ percent: 100, stage: messages.workbench.statusDone });
      pushRecentTool(tool.id);
      toast.success(messages.workbench.success);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : messages.workbench.failure;
      setError(message);
      setProgress({ percent: 0, stage: messages.workbench.statusError });
      toast.error(message);
    } finally {
      setRunning(false);
    }
  };

  const onDownloadAll = async () => {
    if (!results.length) {
      return;
    }

    if (results.length === 1) {
      downloadBlob(results[0].blob, results[0].name);
      return;
    }

    const zip = new JSZip();
    results.forEach((result) => {
      zip.file(safeFileName(result.name), result.blob);
    });

    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(blob, `${tool.id}-results.zip`);
  };

  const progressStatus = error ? 'error' : results.length ? 'done' : running ? 'running' : 'idle';

  return (
    <ToolPageLayout title={localizedTool.name} description={localizedTool.description} icon={Icon} iconColor={style.icon}>
      <div className="space-y-6">
        <div
          className={cx(
            'grid grid-cols-1 gap-4',
            !usesDirectInput && showOptionsPanel && !showWideEditorLayout && 'xl:grid-cols-5',
          )}
        >
          {usesDirectInput ? (
            <section className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">{messages.workbench.directInputTitle}</p>
                  <p className="mt-1 text-xs text-ink-muted">{messages.workbench.directInputDescription}</p>
                </div>
                <span className={`badge border ${style.badge}`}>{category.nav}</span>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                {(tool.options ?? []).map((option) => (
                  <div key={option.key}>
                    <label className="text-xs font-medium uppercase tracking-[0.16em] text-ink-faint">
                      {getLocalizedOptionLabel(option, locale)}
                    </label>
                    {renderField(option, options[option.key], locale, (key, nextValue) =>
                      setOptions((currentOptions) => ({
                        ...currentOptions,
                        [key]: nextValue,
                      }))
                    )}
                  </div>
                ))}
              </div>

              <button type="button" disabled={running} onClick={onProcess} className="btn-primary mt-5 w-full justify-center lg:w-auto">
                {running ? <LoaderCircle size={18} className="animate-spin" /> : <Play size={18} />}
                {running ? messages.workbench.running : messages.workbench.runTool}
              </button>
            </section>
          ) : (
            <>
              <section className={cx('card space-y-4 p-5', showOptionsPanel && !showWideEditorLayout && 'xl:col-span-3')}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">{messages.workbench.files}</p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {messages.workbench.acceptedInput}: {acceptLabel}
                    </p>
                  </div>
                  {fileOptional ? <span className={`badge border ${style.badge}`}>{messages.workbench.optionalUpload}</span> : null}
                </div>

                <DropZone
                  files={files}
                  onFiles={setFiles}
                  accept={tool.accept === '*' ? undefined : tool.accept}
                  multiple={Boolean(tool.multiple)}
                  label={dropLabel}
                />

                {tool.id === 'pdf-merge' && files.length > 1 ? (
                  <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-base-elevated px-3 py-3">
                    {files.map((file, index) => (
                      <div key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-full border border-border bg-base-subtle px-3 py-2 text-xs text-ink-muted">
                        <span className="font-mono text-ink-faint">#{index + 1}</span>
                        <span className="max-w-[14rem] truncate">{file.name}</span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => setFiles((currentFiles) => moveFileItem(currentFiles, index, index - 1))}
                            className="rounded-lg border border-border px-2 py-1 text-[11px] hover:border-border-bright disabled:opacity-50"
                          >
                            {messages.workbench.moveUp}
                          </button>
                          <button
                            type="button"
                            disabled={index === files.length - 1}
                            onClick={() => setFiles((currentFiles) => moveFileItem(currentFiles, index, index + 1))}
                            className="rounded-lg border border-border px-2 py-1 text-[11px] hover:border-border-bright disabled:opacity-50"
                          >
                            {messages.workbench.moveDown}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {files.length > 0 ? (
                  <section className="rounded-xl border border-border-bright bg-base-subtle/70 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-ink">{messages.workbench.editorPreviewTitle}</p>
                        <p className="mt-1 text-xs text-ink-muted">
                          {usesPdfEditor ? messages.workbench.mergePreviewDescription : messages.workbench.inputPreviewDescription}
                        </p>
                      </div>
                      <span className="badge border border-border bg-base-elevated text-ink-muted">
                        {formatMegaBytes(files.reduce((sum, file) => sum + file.size, 0))}
                      </span>
                    </div>

                    {usesPdfEditor ? (
                      <PdfPageEditor
                        files={tool.id === 'pdf-rearrange' ? files.slice(0, 1) : files}
                        mode={tool.id === 'pdf-merge' ? 'merge' : 'rearrange'}
                        onChange={handlePdfPlanChange}
                      />
                    ) : tool.id === 'audio-cut' && inputPreviewUrl ? (
                      <AudioWaveformEditor
                        file={files[0]}
                        previewUrl={inputPreviewUrl}
                        trimMode={trimMode}
                        outputFormat={outputFormat}
                        startTime={Number(options.startTime ?? 0)}
                        endTime={Number(options.endTime ?? 0)}
                        onChange={(nextValues) =>
                          setOptions((currentOptions) => ({
                            ...currentOptions,
                            ...nextValues,
                          }))
                        }
                      />
                    ) : inputPreviewUrl ? (
                      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
                        <div className="rounded-xl border border-border bg-base-elevated p-3">
                          {files[0]?.type.startsWith('image/') ? (
                            <img src={inputPreviewUrl} alt={files[0].name} className="max-h-[24rem] w-full rounded-lg object-contain" />
                          ) : null}
                          {files[0]?.type.startsWith('audio/') ? <audio src={inputPreviewUrl} controls className="w-full" /> : null}
                          {files[0]?.type.startsWith('video/') ? (
                            <video src={inputPreviewUrl} controls className="max-h-[24rem] w-full rounded-lg" />
                          ) : null}
                        </div>
                        <div className="space-y-3 rounded-xl border border-border bg-base-elevated p-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-ink-faint">{messages.workbench.selectedFile}</p>
                            <p className="mt-2 truncate text-sm font-semibold text-ink">{files[0]?.name}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-ink-faint">{messages.workbench.fileCount}</p>
                            <p className="mt-2 text-sm font-semibold text-ink">{files.length}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-ink-faint">{messages.workbench.firstFileSize}</p>
                            <p className="mt-2 text-sm font-semibold text-ink">{formatMegaBytes(files[0]?.size ?? 0)}</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-border bg-base-elevated px-4 py-3 text-sm text-ink-muted">
                        {messages.workbench.readyToRunDescription}
                      </div>
                    )}
                  </section>
                ) : null}

                {!showOptionsPanel ? (
                  <button type="button" disabled={running} onClick={onProcess} className="btn-primary w-full justify-center">
                    {running ? <LoaderCircle size={18} className="animate-spin" /> : <Play size={18} />}
                    {running ? messages.workbench.running : messages.workbench.runTool}
                  </button>
                ) : null}
              </section>

              {showOptionsPanel ? (
                <section className={cx('card p-5', !showWideEditorLayout && 'xl:col-span-2')}>
                  <p className="text-sm font-semibold text-ink">{messages.workbench.options}</p>
                  <div className="mt-4 space-y-4">
                    {(tool.options ?? []).map((option) => (
                      <div key={option.key}>
                        <label className="text-xs font-medium uppercase tracking-[0.16em] text-ink-faint">
                          {getLocalizedOptionLabel(option, locale)}
                        </label>
                        {renderField(option, options[option.key], locale, (key, nextValue) =>
                          setOptions((currentOptions) => ({
                            ...currentOptions,
                            [key]: nextValue,
                          }))
                        )}
                      </div>
                    ))}
                  </div>

                  <button type="button" disabled={running} onClick={onProcess} className="btn-primary mt-5 w-full justify-center">
                    {running ? <LoaderCircle size={18} className="animate-spin" /> : <Play size={18} />}
                    {running ? messages.workbench.running : messages.workbench.runTool}
                  </button>
                </section>
              ) : null}
            </>
          )}
        </div>

        {showProgress ? (
          <section className="card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">{messages.workbench.progress}</p>
                <p className="mt-1 text-xs text-ink-muted">{progress.stage}</p>
              </div>
              <span className={`badge border ${style.badge}`}>{category.nav}</span>
            </div>
            <ProgressBar value={progress.percent} label={progress.stage} status={progressStatus} />
          </section>
        ) : null}

        {showResults ? (
          <Tabs tabs={resultTabs}>
            {(activeTab) => {
              if (activeTab === 'inspector') {
                return (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="card p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-ink-faint">{messages.workbench.toolId}</p>
                      <p className="mt-2 text-sm font-semibold text-ink">{tool.id}</p>
                    </div>
                    <div className="card p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-ink-faint">{messages.workbench.acceptedInput}</p>
                      <p className="mt-2 text-sm font-semibold text-ink">{acceptLabel}</p>
                    </div>
                    <div className="card p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-ink-faint">{messages.workbench.outputFiles}</p>
                      <p className="mt-2 text-sm font-semibold text-ink">{results.length}</p>
                    </div>
                    <div className="card p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-ink-faint">{messages.workbench.tags}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {tool.tags.map((tag) => (
                          <span key={tag} className="badge border border-border bg-base-subtle text-ink-muted">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <section className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-ink">{messages.workbench.results}</p>
                    {results.length > 1 ? (
                      <button type="button" onClick={onDownloadAll} disabled={!results.length} className="btn-ghost disabled:opacity-60">
                        <Download size={16} />
                        {messages.workbench.downloadAll}
                      </button>
                    ) : null}
                  </div>

                  {error ? <div className="card border-danger/30 bg-danger/10 p-4 text-sm text-danger">{error}</div> : null}

                  {results.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      {results.map((result) => (
                        <ResultCard
                          key={result.name}
                          fileName={result.name}
                          fileSize={formatMegaBytes(result.blob.size)}
                          title={messages.workbench.success}
                          actionLabel={messages.workbench.download}
                          onDownload={() => downloadBlob(result.blob, result.name)}
                        >
                          {result.previewUrl && result.mimeType.startsWith('image/') ? (
                            <img src={result.previewUrl} alt={result.name} className="max-h-80 w-full rounded-xl object-contain" />
                          ) : null}
                          {result.previewUrl && result.mimeType.startsWith('video/') ? (
                            <video src={result.previewUrl} controls className="max-h-80 w-full rounded-xl" />
                          ) : null}
                          {result.previewUrl && result.mimeType.startsWith('audio/') ? (
                            <audio src={result.previewUrl} controls className="w-full" />
                          ) : null}
                          {result.textContent ? (
                            <pre className="max-h-64 overflow-auto rounded-xl border border-border bg-base-subtle p-3 text-xs text-ink">
                              {result.textContent}
                            </pre>
                          ) : null}
                          {result.metadata ? (
                            <pre className="max-h-64 overflow-auto rounded-xl border border-border bg-base-subtle p-3 text-xs text-ink">
                              {JSON.stringify(result.metadata, null, 2)}
                            </pre>
                          ) : null}
                        </ResultCard>
                      ))}
                    </div>
                  ) : null}
                </section>
              );
            }}
          </Tabs>
        ) : null}
      </div>
    </ToolPageLayout>
  );
}
