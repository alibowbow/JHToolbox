'use client';

import { useEffect, useMemo, useState } from 'react';
import JSZip from 'jszip';
import { Download, LoaderCircle, Play, Sparkles } from 'lucide-react';
import { runTool } from '@/lib/processors';
import { pushRecentTool } from '@/lib/recent-tools';
import { downloadBlob, safeFileName } from '@/lib/utils';
import { ProcessedFile } from '@/types/processor';
import { ToolDefinition, ToolOption } from '@/types/tool';
import { ToolPageLayout } from '@/components/ToolPageLayout';
import { useLocale } from '@/components/providers/locale-provider';
import { formatMegaBytes, getCategoryCopy } from '@/lib/i18n';
import {
  getLocalizedChoiceLabel,
  getLocalizedOptionLabel,
  getLocalizedPlaceholder,
  getLocalizedToolCopy,
} from '@/lib/tool-localization';
import { categoryIcons, categoryStyles } from '@/lib/tool-presentation';
import { DropZone } from '@/components/ui/DropZone';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ResultCard } from '@/components/ui/ResultCard';
import { Tabs } from '@/components/ui/Tabs';
import { toast } from '@/components/ui/Toast';

const OPTIONAL_FILE_TOOLS = new Set(['qr-generator', 'url-image', 'url-pdf', 'detect-cms']);

function getDefaults(tool: ToolDefinition): Record<string, string | number | boolean> {
  const entries = (tool.options ?? []).map((option) => [option.key, option.defaultValue] as const);
  return Object.fromEntries(entries);
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
      <select
        value={String(value)}
        onChange={(event) => onChange(option.key, event.target.value)}
        className={commonClassName}
      >
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
  const [files, setFiles] = useState<File[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<Record<string, string | number | boolean>>(getDefaults(tool));
  const [progress, setProgress] = useState<{ percent: number; stage: string }>({
    percent: 0,
    stage: messages.workbench.statusIdle,
  });
  const [results, setResults] = useState<ProcessedFile[]>([]);

  const Icon = categoryIcons[tool.category];
  const style = categoryStyles[tool.category];
  const category = getCategoryCopy(locale, tool.category);
  const localizedTool = getLocalizedToolCopy(tool, locale);
  const acceptLabel = useMemo(
    () => (tool.accept === '*' ? (locale === 'ko' ? '모든 파일' : 'Any file') : tool.accept),
    [locale, tool.accept],
  );
  const fileOptional = OPTIONAL_FILE_TOOLS.has(tool.id);

  useEffect(() => {
    setOptions(getDefaults(tool));
    setFiles([]);
    setResults([]);
    setError(null);
    setProgress({ percent: 0, stage: messages.workbench.statusIdle });
  }, [tool.id, messages.workbench.statusIdle]);

  useEffect(() => {
    return () => {
      results.forEach((result) => {
        if (result.previewUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(result.previewUrl);
        }
      });
    };
  }, [results]);

  const onProcess = async () => {
    if (!files.length && !fileOptional) {
      setError(messages.workbench.addFileError);
      toast.error(messages.workbench.addFileError);
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
      const result = results[0];
      downloadBlob(result.blob, result.name);
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
  const dropLabel = fileOptional ? messages.workbench.dropzoneOptional : messages.workbench.dropzone;

  return (
    <ToolPageLayout title={localizedTool.name} description={localizedTool.description} icon={Icon} iconColor={style.icon}>
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
          <section className="card space-y-4 p-5 xl:col-span-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">{messages.workbench.files}</p>
                <p className="mt-1 text-xs text-ink-muted">{messages.workbench.acceptedInput}: {acceptLabel}</p>
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
          </section>

          <section className="card p-5 xl:col-span-2">
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
              {tool.options?.length ? null : <p className="text-sm text-ink-muted">{messages.workbench.noOptions}</p>}
            </div>

            <button
              type="button"
              disabled={running}
              onClick={onProcess}
              className="btn-primary mt-5 w-full justify-center"
            >
              {running ? <LoaderCircle size={18} className="animate-spin" /> : <Play size={18} />}
              {running ? messages.workbench.running : messages.workbench.runTool}
            </button>
          </section>
        </div>

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

        <Tabs
          tabs={[
            { id: 'results', label: messages.workbench.results },
            { id: 'inspector', label: messages.workbench.inspector },
          ]}
        >
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
                  <button type="button" onClick={onDownloadAll} disabled={!results.length} className="btn-ghost disabled:opacity-60">
                    <Download size={16} />
                    {messages.workbench.downloadAll}
                  </button>
                </div>

                {error ? (
                  <div className="card border-danger/30 bg-danger/10 p-4 text-sm text-danger">{error}</div>
                ) : null}

                {results.length === 0 ? (
                  <div className="card flex items-center gap-3 p-5 text-sm text-ink-muted">
                    <Sparkles size={16} className="text-prime" />
                    {messages.workbench.emptyResults}
                  </div>
                ) : (
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
                )}
              </section>
            );
          }}
        </Tabs>
      </div>
    </ToolPageLayout>
  );
}
