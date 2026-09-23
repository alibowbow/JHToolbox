'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { LoaderCircle, RotateCw, Trash2 } from 'lucide-react';
import { useLocale } from '@/components/providers/locale-provider';
import { openPdfPreview, type PdfPreview } from '@/lib/pdf-preview';
import { formatPageSelection, resolvePageSelection } from '@/lib/pdf-page-math';
import { localizeErrorMessage } from '@/lib/error-messages';
import { cx } from '@/lib/utils';

const COPY = {
  en: {
    all: 'All',
    odd: 'Odd',
    even: 'Even',
    none: 'Clear',
    selected: (count: number, total: number) => `${count} of ${total} pages selected`,
    noneSelectedRotate: (total: number) => `No pages chosen — all ${total} pages will be rotated`,
    noneSelectedDelete: 'Click the pages to delete',
    noneSelectedPick: (total: number) => `No pages chosen — all ${total} pages will be saved`,
    page: (pageNumber: number) => `Page ${pageNumber}`,
    hint: 'Shift+click selects a range',
    loading: 'Loading pages…',
  },
  ko: {
    all: '전체',
    odd: '홀수',
    even: '짝수',
    none: '선택 해제',
    selected: (count: number, total: number) => `${total}쪽 중 ${count}쪽 선택`,
    noneSelectedRotate: (total: number) => `고른 페이지가 없으면 ${total}쪽 전체를 회전합니다`,
    noneSelectedDelete: '지울 페이지를 눌러 고르세요',
    noneSelectedPick: (total: number) => `고른 페이지가 없으면 ${total}쪽 전체를 저장합니다`,
    page: (pageNumber: number) => `${pageNumber}쪽`,
    hint: 'Shift+클릭으로 범위 선택',
    loading: '페이지 불러오는 중…',
  },
} as const;

/** Loads a PDF once for previews; cleans up when the file changes. */
export function usePdfPreview(file: File | null) {
  const { locale } = useLocale();
  const [preview, setPreview] = useState<PdfPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPreview(null);
    setError(null);
    if (!file) {
      return;
    }
    let cancelled = false;
    let opened: PdfPreview | null = null;
    openPdfPreview(file)
      .then((result) => {
        opened = result;
        if (cancelled) {
          result.destroy();
        } else {
          setPreview(result);
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(localizeErrorMessage(cause, locale));
        }
      });
    return () => {
      cancelled = true;
      opened?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only for a new file
  }, [file]);

  return { preview, error };
}

/** A page image rendered when it scrolls into view. */
export function PdfPageImage({
  preview,
  pageNumber,
  width,
  className,
  style,
}: {
  preview: PdfPreview;
  pageNumber: number;
  width: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '200px' });
    observer.observe(holder);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) {
      return;
    }
    let cancelled = false;
    preview
      .renderPage(pageNumber, width)
      .then((next) => {
        if (!cancelled) setUrl(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pageNumber, preview, visible, width]);

  return (
    <div ref={holderRef} className={cx('relative overflow-hidden bg-white', className)} style={style}>
      {url ? (
        <img src={url} alt="" draggable={false} className="block h-full w-full select-none object-contain" />
      ) : (
        <div className="flex aspect-[3/4] items-center justify-center text-ink-faint">
          <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

/**
 * Page thumbnails to click, kept in sync with a page-list option such as
 * "2, 5-7". Used to choose pages to delete or rotate.
 */
export function PdfPagePicker({
  file,
  value,
  onChange,
  mode,
  rotation = 0,
}: {
  file: File;
  value: string;
  onChange: (next: string) => void;
  mode: 'delete' | 'rotate' | 'pick';
  rotation?: number;
}) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const { preview, error } = usePdfPreview(file);
  const anchorRef = useRef<number | null>(null);
  const pageCount = preview?.pageCount ?? 0;
  const selected = useMemo(() => new Set(resolvePageSelection(value, pageCount).indices), [pageCount, value]);

  const commit = (indices: Iterable<number>) => onChange(formatPageSelection([...indices]));

  const toggle = (index: number, event: MouseEvent) => {
    const next = new Set(selected);
    if (event.shiftKey && anchorRef.current !== null) {
      const [from, to] = [Math.min(anchorRef.current, index), Math.max(anchorRef.current, index)];
      for (let page = from; page <= to; page += 1) next.add(page);
    } else if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    anchorRef.current = index;
    commit(next);
  };

  if (error) {
    return <p className="text-sm text-danger">{error}</p>;
  }
  if (!preview) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-muted">
        <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
        {copy.loading}
      </p>
    );
  }

  const indices = Array.from({ length: pageCount }, (_, index) => index);
  const quick = [
    { label: copy.all, pick: () => indices },
    { label: copy.odd, pick: () => indices.filter((index) => index % 2 === 0) },
    { label: copy.even, pick: () => indices.filter((index) => index % 2 === 1) },
    { label: copy.none, pick: () => [] },
  ];
  const rotateAll = mode === 'rotate' && selected.size === 0;

  return (
    <div className="space-y-3" data-testid="pdf-page-picker">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-auto text-xs text-ink-muted" aria-live="polite">
          {selected.size > 0
            ? copy.selected(selected.size, pageCount)
            : mode === 'rotate'
              ? copy.noneSelectedRotate(pageCount)
              : mode === 'pick'
                ? copy.noneSelectedPick(pageCount)
                : copy.noneSelectedDelete}
        </span>
        {quick.map((entry) => (
          <button
            key={entry.label}
            type="button"
            onClick={() => commit(entry.pick())}
            className="rounded-full border border-border bg-base-elevated px-2.5 py-1 text-xs font-medium text-ink-muted transition-colors hover:border-border-bright hover:text-ink"
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div className="grid max-h-[28rem] grid-cols-3 gap-3 overflow-y-auto p-1 sm:grid-cols-4 lg:grid-cols-5">
        {indices.map((index) => {
          const isSelected = selected.has(index);
          const turned = mode === 'rotate' && (isSelected || rotateAll);
          return (
            <button
              key={index}
              type="button"
              aria-pressed={isSelected}
              aria-label={copy.page(index + 1)}
              title={copy.hint}
              onClick={(event) => toggle(index, event)}
              className={cx(
                'group relative flex flex-col items-center gap-1.5 rounded-xl border p-2 transition-colors',
                isSelected ? (mode === 'delete' ? 'border-danger/60 bg-danger/5' : 'border-prime/60 bg-prime/5') : 'border-border hover:border-border-bright',
              )}
            >
              <div className="flex aspect-square w-full items-center justify-center overflow-hidden">
                <PdfPageImage
                  preview={preview}
                  pageNumber={index + 1}
                  width={140}
                  className={cx(
                    'w-4/5 shadow-card transition-transform duration-300',
                    mode === 'delete' && isSelected && 'opacity-40',
                  )}
                  style={turned ? { transform: `rotate(${rotation}deg)` } : undefined}
                />
                {mode === 'delete' && isSelected ? (
                  <span className="absolute inset-x-0 top-[38%] mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-danger text-white shadow">
                    <Trash2 size={15} aria-hidden="true" />
                  </span>
                ) : null}
                {turned ? (
                  <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-prime text-prime-contrast shadow">
                    <RotateCw size={13} aria-hidden="true" />
                  </span>
                ) : null}
              </div>
              <span className={cx('text-xs tabular-nums', isSelected ? 'font-semibold text-ink' : 'text-ink-muted')}>{index + 1}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
