'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { GripVertical, LoaderCircle, Trash2 } from 'lucide-react';
import { useLocale } from '@/components/providers/locale-provider';
import { formatMegaBytes } from '@/lib/i18n';
import { getPdfJs } from '@/lib/processors/pdfjs-client';
import { cx } from '@/lib/utils';

export interface PdfEditorPage {
  id: string;
  fileIndex: number;
  fileName: string;
  fileSize: number;
  pageIndex: number;
  pageNumber: number;
  totalPages: number;
  previewUrl: string;
}

interface PdfPageEditorProps {
  files: File[];
  mode: 'merge' | 'rearrange';
  onChange: (pages: PdfEditorPage[]) => void;
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
    return items;
  }

  const nextItems = [...items];
  const [movedItem] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, movedItem);
  return nextItems;
}

async function renderPagePreview(page: any) {
  const baseViewport = page.getViewport({ scale: 1 });
  const targetWidth = 180;
  const scale = targetWidth / Math.max(baseViewport.width, 1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas unavailable');
  }

  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  await page.render({ canvasContext: context, viewport }).promise;
  return canvas.toDataURL('image/png');
}

export function PdfPageEditor({ files, mode, onChange }: PdfPageEditorProps) {
  const { messages } = useLocale();
  const onChangeRef = useRef(onChange);
  const [pages, setPages] = useState<PdfEditorPage[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCount = selectedIds.length;
  const canDeleteSelected = selectedCount > 0 && selectedCount < pages.length;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;

    async function loadPages() {
      if (!files.length) {
        setPages([]);
        setSelectedIds([]);
        onChangeRef.current([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const pdfjs = await getPdfJs();
        const nextPages: PdfEditorPage[] = [];

        for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
          const file = files[fileIndex];
          const data = new Uint8Array(await file.arrayBuffer());
          const documentHandle = await pdfjs.getDocument({
            data,
            useWorkerFetch: false,
          }).promise;

          for (let pageNumber = 1; pageNumber <= documentHandle.numPages; pageNumber += 1) {
            const page = await documentHandle.getPage(pageNumber);
            const previewUrl = await renderPagePreview(page);

            nextPages.push({
              id: `${fileIndex}-${pageNumber}`,
              fileIndex,
              fileName: file.name,
              fileSize: file.size,
              pageIndex: pageNumber - 1,
              pageNumber,
              totalPages: documentHandle.numPages,
              previewUrl,
            });
          }
        }

        if (cancelled) {
          return;
        }

        setPages(nextPages);
        setSelectedIds([]);
        onChangeRef.current(nextPages);
      } catch (cause) {
        if (cancelled) {
          return;
        }

        setPages([]);
        setSelectedIds([]);
        onChangeRef.current([]);
        setError(cause instanceof Error ? cause.message : messages.workbench.failure);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPages();

    return () => {
      cancelled = true;
    };
  }, [files, messages.workbench.failure]);

  useEffect(() => {
    setSelectedIds((currentSelectedIds) => currentSelectedIds.filter((id) => pages.some((page) => page.id === id)));
  }, [pages]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggleSelection = (pageId: string) => {
    setSelectedIds((currentSelectedIds) =>
      currentSelectedIds.includes(pageId)
        ? currentSelectedIds.filter((id) => id !== pageId)
        : [...currentSelectedIds, pageId],
    );
  };

  const deletePages = (idsToDelete: string[]) => {
    setPages((currentPages) => {
      if (!idsToDelete.length || idsToDelete.length >= currentPages.length) {
        return currentPages;
      }

      const nextPages = currentPages.filter((page) => !idsToDelete.includes(page.id));
      onChangeRef.current(nextPages);
      return nextPages;
    });
    setSelectedIds([]);
  };

  const movePage = (fromId: string, toId: string) => {
    if (fromId === toId) {
      return;
    }

    setPages((currentPages) => {
      const fromIndex = currentPages.findIndex((page) => page.id === fromId);
      const toIndex = currentPages.findIndex((page) => page.id === toId);
      const nextPages = moveItem(currentPages, fromIndex, toIndex);
      onChangeRef.current(nextPages);
      return nextPages;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-muted">{messages.workbench.pdfEditorHint}</p>
        <div className="flex flex-wrap gap-2">
          <span className="editor-chip normal-case tracking-normal text-ink-muted">
            {messages.workbench.pdfEditorVisiblePages}: {pages.length}
          </span>
          <span className="editor-chip normal-case tracking-normal text-ink-muted">
            {messages.workbench.pdfEditorSelectedCount}: {selectedCount}
          </span>
        </div>
      </div>

      <div className="workspace-toolbar">
        <button
          type="button"
          onClick={() => setSelectedIds(pages.map((page) => page.id))}
          disabled={!pages.length}
          className="btn-ghost px-3 py-2 text-xs disabled:opacity-50"
        >
          {messages.workbench.pdfEditorSelectAll}
        </button>
        <button
          type="button"
          onClick={() => setSelectedIds([])}
          disabled={!selectedCount}
          className="btn-ghost px-3 py-2 text-xs disabled:opacity-50"
        >
          {messages.workbench.pdfEditorClearSelection}
        </button>
        <button
          type="button"
          onClick={() => deletePages(selectedIds)}
          disabled={!canDeleteSelected}
          className="btn-ghost px-3 py-2 text-xs text-danger disabled:opacity-50"
        >
          <Trash2 size={14} />
          {messages.workbench.pdfEditorDeleteSelected}
        </button>
      </div>

      {loading ? (
        <div className="workspace-section flex items-center gap-3 text-sm text-ink-muted">
          <LoaderCircle size={16} className="animate-spin" />
          {messages.workbench.pdfEditorLoading}
        </div>
      ) : null}

      {error ? <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div> : null}

      {!loading && !pages.length && !error ? (
        <div className="workspace-section text-sm text-ink-muted">
          {messages.workbench.pdfEditorEmpty}
        </div>
      ) : null}

      {pages.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {pages.map((page, index) => {
            const selected = selectedIdSet.has(page.id);
            return (
              <article
                key={page.id}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (dragId) {
                    movePage(dragId, page.id);
                  }
                  setDragId(null);
                }}
                className={cx(
                  'workspace-panel overflow-hidden border transition-colors',
                  selected && 'border-prime/40 bg-prime/5',
                  dragId === page.id && 'border-accent/40',
                )}
              >
                <div className="relative">
                  <img
                    src={page.previewUrl}
                    alt={`${messages.workbench.pdfEditorPage} ${page.pageNumber}`}
                    className="h-56 w-full bg-base-subtle object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => toggleSelection(page.id)}
                    className={cx(
                      'absolute left-3 top-3 rounded-full border px-2 py-1 text-[11px] font-medium transition-colors',
                      selected
                        ? 'border-prime/40 bg-prime text-base'
                        : 'border-border bg-base-elevated text-ink-muted hover:border-border-bright hover:text-ink',
                    )}
                  >
                    #{index + 1}
                  </button>
                  <button
                    type="button"
                    onClick={() => deletePages([page.id])}
                    disabled={pages.length === 1}
                    className="absolute right-3 top-3 rounded-full border border-border bg-base-elevated p-2 text-ink-muted transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-50"
                    aria-label={`${messages.workbench.pdfEditorRemovePage} ${page.pageNumber}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">
                        {messages.workbench.pdfEditorPage} {page.pageNumber}
                      </p>
                      <p className="truncate text-xs text-ink-muted">
                        {mode === 'merge' ? page.fileName : `${page.fileName} | ${formatMegaBytes(page.fileSize)}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      draggable
                      onDragStart={() => setDragId(page.id)}
                      onDragEnd={() => setDragId(null)}
                      className="flex h-8 w-8 cursor-grab items-center justify-center rounded-xl border border-border bg-base-subtle text-ink-faint active:cursor-grabbing"
                      aria-label={`Reorder page ${page.pageNumber}`}
                    >
                      <GripVertical size={14} />
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span className="badge border border-border bg-base-subtle text-ink-muted">
                      {messages.workbench.pdfEditorSource}: {page.fileIndex + 1}
                    </span>
                    <span className="badge border border-border bg-base-subtle text-ink-muted">
                      {formatMegaBytes(page.fileSize)}
                    </span>
                    {mode === 'merge' ? (
                      <span className="badge border border-border bg-base-subtle text-ink-muted">
                        {page.pageNumber}/{page.totalPages}
                      </span>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
