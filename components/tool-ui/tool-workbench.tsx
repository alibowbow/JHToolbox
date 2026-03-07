'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { Download, LoaderCircle, Play, UploadCloud, X } from 'lucide-react';
import { runTool } from '@/lib/processors';
import { pushRecentTool } from '@/lib/recent-tools';
import { downloadBlob, safeFileName } from '@/lib/utils';
import { ProcessedFile } from '@/types/processor';
import { ToolDefinition, ToolOption } from '@/types/tool';

const OPTIONAL_FILE_TOOLS = new Set(['qr-generator', 'url-image', 'url-pdf', 'detect-cms']);

function getDefaults(tool: ToolDefinition): Record<string, string | number | boolean> {
  const entries = (tool.options ?? []).map((option) => [option.key, option.defaultValue] as const);
  return Object.fromEntries(entries);
}

function renderField(
  option: ToolOption,
  value: string | number | boolean | undefined,
  onChange: (key: string, nextValue: string | number | boolean) => void,
) {
  const commonClassName =
    'mt-1 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent';

  if (option.type === 'select') {
    return (
      <select
        value={String(value)}
        onChange={(event) => onChange(option.key, event.target.value)}
        className={commonClassName}
      >
        {(option.options ?? []).map((entry) => (
          <option key={String(entry.value)} value={String(entry.value)}>
            {entry.label}
          </option>
        ))}
      </select>
    );
  }

  if (option.type === 'checkbox') {
    return (
      <label className="mt-2 inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(option.key, event.target.checked)}
          className="h-4 w-4"
        />
        Enabled
      </label>
    );
  }

  if (option.type === 'color') {
    return (
      <input
        type="color"
        value={String(value)}
        onChange={(event) => onChange(option.key, event.target.value)}
        className="mt-1 h-10 w-full rounded-md border border-border bg-transparent"
      />
    );
  }

  if (option.type === 'range') {
    return (
      <div className="mt-1 space-y-1">
        <input
          type="range"
          value={Number(value)}
          onChange={(event) => onChange(option.key, Number(event.target.value))}
          min={option.min}
          max={option.max}
          step={option.step}
          className="w-full"
        />
        <p className="text-xs text-muted">{String(value)}</p>
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
      placeholder={option.placeholder}
      className={commonClassName}
    />
  );
}

export function ToolWorkbench({ tool }: { tool: ToolDefinition }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<Record<string, string | number | boolean>>(getDefaults(tool));
  const [progress, setProgress] = useState({ percent: 0, stage: 'Waiting' });
  const [results, setResults] = useState<ProcessedFile[]>([]);

  useEffect(() => {
    setOptions(getDefaults(tool));
    setFiles([]);
    setResults([]);
    setError(null);
    setProgress({ percent: 0, stage: 'Waiting' });
  }, [tool.id]);

  useEffect(() => {
    return () => {
      results.forEach((result) => {
        if (result.previewUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(result.previewUrl);
        }
      });
    };
  }, [results]);

  const acceptLabel = useMemo(() => (tool.accept === '*' ? 'Any file' : tool.accept), [tool.accept]);
  const fileOptional = OPTIONAL_FILE_TOOLS.has(tool.id);

  const addFiles = (incomingFiles: File[]) => {
    setFiles((currentFiles) => {
      if (tool.multiple) {
        return [...currentFiles, ...incomingFiles];
      }
      return incomingFiles.slice(0, 1);
    });
  };

  const onProcess = async () => {
    if (!files.length && !fileOptional) {
      setError('Add at least one file before running this tool.');
      return;
    }

    try {
      setError(null);
      setResults([]);
      setRunning(true);
      setProgress({ percent: 2, stage: 'Starting' });

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
      setProgress({ percent: 100, stage: 'Done' });
      pushRecentTool(tool.id);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Processing failed.';
      setError(message);
      setProgress({ percent: 0, stage: 'Failed' });
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

  return (
    <div className="space-y-6">
      <section className="panel p-5 sm:p-6">
        <h1 className="text-2xl font-semibold">{tool.name}</h1>
        <p className="mt-1 text-sm text-muted">{tool.description}</p>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="panel p-4 lg:col-span-3">
          <p className="text-sm font-semibold">1. Files</p>
          <div
            className={`mt-3 rounded-xl border-2 border-dashed p-6 text-center transition ${
              dragging ? 'border-accent bg-accent/10' : 'border-border'
            }`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              addFiles(Array.from(event.dataTransfer.files));
            }}
          >
            <UploadCloud className="mx-auto text-muted" />
            <p className="mt-2 text-sm text-muted">
              {fileOptional ? 'This tool can run without uploading a file.' : 'Drag and drop files here or browse.'}
            </p>
            <p className="mt-1 text-xs text-muted">Accepted input: {acceptLabel}</p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="mt-3 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white"
            >
              Choose files
            </button>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept={tool.accept === '*' ? undefined : tool.accept}
              multiple={Boolean(tool.multiple)}
              onChange={(event) => {
                addFiles(Array.from(event.target.files ?? []));
                event.target.value = '';
              }}
            />
          </div>

          {files.length > 0 && (
            <div className="mt-3 space-y-2">
              {files.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <span className="truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => setFiles((currentFiles) => currentFiles.filter((_, itemIndex) => itemIndex !== index))}
                    className="rounded p-1 text-muted hover:bg-accent/10"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel p-4 lg:col-span-2">
          <p className="text-sm font-semibold">2. Options</p>
          <div className="mt-3 space-y-3">
            {(tool.options ?? []).map((option) => (
              <div key={option.key}>
                <label className="text-xs font-medium text-muted">{option.label}</label>
                {renderField(option, options[option.key], (key, nextValue) =>
                  setOptions((currentOptions) => ({
                    ...currentOptions,
                    [key]: nextValue,
                  }))
                )}
              </div>
            ))}
            {tool.options?.length ? null : (
              <p className="text-sm text-muted">This tool does not require extra options.</p>
            )}
          </div>

          <button
            type="button"
            disabled={running}
            onClick={onProcess}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 font-semibold text-white disabled:opacity-60"
          >
            {running ? <LoaderCircle size={18} className="animate-spin" /> : <Play size={18} />}
            Run tool
          </button>
        </div>
      </section>

      <section className="panel p-4">
        <p className="text-sm font-semibold">3. Progress</p>
        <div className="mt-2 h-2 rounded-full bg-border">
          <div className="h-2 rounded-full bg-accent transition-all" style={{ width: `${progress.percent}%` }} />
        </div>
        <p className="mt-2 text-sm text-muted">
          {Math.round(progress.percent)}% - {progress.stage}
        </p>
      </section>

      <section className="panel p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">4. Results</p>
          <button
            type="button"
            onClick={onDownloadAll}
            disabled={!results.length}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:border-accent disabled:opacity-60"
          >
            <Download size={16} />
            Download
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}

        {results.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Processed files will appear here.</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {results.map((result) => (
              <article key={result.name} className="rounded-xl border border-border p-3">
                <p className="truncate text-sm font-medium">{result.name}</p>
                {result.previewUrl && result.mimeType.startsWith('image/') && (
                  <img
                    src={result.previewUrl}
                    alt={result.name}
                    className="mt-2 max-h-72 w-full rounded-lg object-contain"
                  />
                )}
                {result.previewUrl && result.mimeType.startsWith('video/') && (
                  <video src={result.previewUrl} controls className="mt-2 max-h-72 w-full rounded-lg" />
                )}
                {result.previewUrl && result.mimeType.startsWith('audio/') && (
                  <audio src={result.previewUrl} controls className="mt-2 w-full" />
                )}
                {result.textContent && (
                  <pre className="mt-2 max-h-60 overflow-auto rounded-md bg-black/80 p-3 text-xs text-white">
                    {result.textContent}
                  </pre>
                )}
                {result.metadata && (
                  <pre className="mt-2 max-h-60 overflow-auto rounded-md bg-black/80 p-3 text-xs text-white">
                    {JSON.stringify(result.metadata, null, 2)}
                  </pre>
                )}
                <button
                  type="button"
                  onClick={() => downloadBlob(result.blob, result.name)}
                  className="mt-3 inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:border-accent"
                >
                  <Download size={14} />
                  Save file
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
