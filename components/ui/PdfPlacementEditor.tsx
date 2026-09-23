'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react';
import { useLocale } from '@/components/providers/locale-provider';
import { BoxLayer, type FracBox } from '@/components/ui/BoxLayer';
import { PdfPageImage, usePdfPreview } from '@/components/ui/PdfPagePicker';
import type { PdfPageInfo } from '@/lib/pdf-preview';
import type { PageRegion } from '@/lib/pdf-regions';
import { cx } from '@/lib/utils';

/** A stamp (signature, text, image…) in PDF points, bottom-left origin. */
export type PdfPlacement = { pageNumber: number; x: number; y: number; width: number; height: number };

const COPY = {
  en: {
    loading: 'Loading pages…',
    page: 'Page',
    previous: 'Previous page',
    next: 'Next page',
    drawHint: 'Drag over what to hide. Add as many boxes as you need.',
    placeHint: 'Drag the box to place it, or tap where it should go. The corners resize it.',
    boxes: (count: number) => `${count} box${count === 1 ? '' : 'es'} on this page`,
    clearPage: 'Clear this page',
    box: (index: number) => `Box ${index + 1}`,
    remove: 'Remove box',
  },
  ko: {
    loading: '페이지 불러오는 중…',
    page: '쪽',
    previous: '이전 쪽',
    next: '다음 쪽',
    drawHint: '가릴 부분 위를 드래그하세요. 상자는 여러 개 그릴 수 있어요.',
    placeHint: '상자를 끌어 옮기거나, 둘 곳을 눌러 보세요. 모서리로 크기를 바꿉니다.',
    boxes: (count: number) => `이 쪽의 상자 ${count}개`,
    clearPage: '이 쪽 지우기',
    box: (index: number) => `상자 ${index + 1}`,
    remove: '상자 삭제',
  },
} as const;

/** Page display width that fits the container. */
function useContainerWidth(maxWidth: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setWidth(Math.min(maxWidth, Math.floor(element.clientWidth)));
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [maxWidth]);
  return { ref, width };
}

function placementToBox(placement: PdfPlacement, info: PdfPageInfo): FracBox {
  const [x1, y1, x2, y2] = info.toDisplayRect([placement.x, placement.y, placement.x + placement.width, placement.y + placement.height]);
  return {
    x: Math.min(x1, x2) / info.width,
    y: Math.min(y1, y2) / info.height,
    w: Math.abs(x2 - x1) / info.width,
    h: Math.abs(y2 - y1) / info.height,
  };
}

function boxToPlacement(box: FracBox, info: PdfPageInfo, pageNumber: number): PdfPlacement {
  const [ax, ay] = info.toPdfPoint(box.x * info.width, box.y * info.height);
  const [bx, by] = info.toPdfPoint((box.x + box.w) * info.width, (box.y + box.h) * info.height);
  const round = (value: number) => Math.round(value * 10) / 10;
  return {
    pageNumber,
    x: round(Math.min(ax, bx)),
    y: round(Math.min(ay, by)),
    width: round(Math.abs(bx - ax)),
    height: round(Math.abs(by - ay)),
  };
}

type EditorProps = {
  file: File;
  testIdPrefix?: string;
  /** Drawn on top of the page, e.g. a watermark preview. `scale` is CSS px per PDF point. */
  overlay?: (page: { width: number; height: number; scale: number; pageNumber: number }) => ReactNode;
} & (
  | { mode: 'regions'; regions: PageRegion[]; onRegionsChange: (regions: PageRegion[]) => void; boxColor: string }
  | {
      mode: 'stamp';
      placement: PdfPlacement;
      onPlacementChange: (placement: PdfPlacement) => void;
      renderStamp: (size: { width: number; height: number; scale: number }) => ReactNode;
    }
  | { mode: 'view' }
);

/**
 * A PDF page to work on directly: draw boxes to redact, or drag a stamp
 * (signature, text, image) to where it belongs. The page shown is the page
 * a stamp goes on.
 */
export function PdfPlacementEditor(props: EditorProps) {
  const { file, testIdPrefix = 'pdf-placement', overlay } = props;
  const { locale } = useLocale();
  const copy = COPY[locale];
  const { preview, error } = usePdfPreview(file);
  const { ref: frameRef, width: frameWidth } = useContainerWidth(760);
  const [pageNumber, setPageNumber] = useState(props.mode === 'stamp' ? props.placement.pageNumber : 1);
  const [info, setInfo] = useState<PdfPageInfo | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const pageCount = preview?.pageCount ?? 0;
  const safePage = Math.min(Math.max(1, pageNumber), Math.max(1, pageCount));

  useEffect(() => {
    setSelected(null);
    if (!preview) {
      setInfo(null);
      return;
    }
    let cancelled = false;
    void preview.pageInfo(safePage).then((next) => {
      if (!cancelled) setInfo(next);
    });
    return () => {
      cancelled = true;
    };
  }, [preview, safePage]);

  // A stamp lives on the page being shown.
  useEffect(() => {
    if (props.mode === 'stamp' && info && props.placement.pageNumber !== safePage) {
      props.onPlacementChange({ ...props.placement, pageNumber: safePage });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follow the visible page only
  }, [info, safePage]);

  const scale = info && frameWidth ? frameWidth / info.width : 0;
  const displayHeight = info ? Math.round(info.height * scale) : 0;

  const boxes = useMemo<FracBox[]>(() => {
    if (!info) return [];
    if (props.mode === 'regions') {
      return props.regions.filter((region) => region.page === safePage).map(({ x, y, w, h }) => ({ x, y, w, h }));
    }
    if (props.mode === 'stamp') {
      return [placementToBox(props.placement, info)];
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- derived from the props for the visible page
  }, [info, safePage, props.mode, props.mode === 'regions' ? props.regions : null, props.mode === 'stamp' ? props.placement : null]);

  const changeBoxes = (next: FracBox[]) => {
    if (!info) return;
    if (props.mode === 'regions') {
      const others = props.regions.filter((region) => region.page !== safePage);
      props.onRegionsChange([...others, ...next.map((box) => ({ page: safePage, ...box }))]);
    } else if (props.mode === 'stamp' && next[0]) {
      props.onPlacementChange(boxToPlacement(next[0], info, safePage));
    }
  };

  if (error) {
    return <p className="text-sm text-danger">{error}</p>;
  }

  const pager = (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setPageNumber(Math.max(1, safePage - 1))}
        disabled={safePage <= 1}
        aria-label={copy.previous}
        className="btn-ghost h-8 w-8 p-0 disabled:opacity-40"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="min-w-[4.5rem] text-center text-sm tabular-nums text-ink" aria-live="polite">
        {safePage} / {pageCount || '…'}
        {locale === 'ko' ? ` ${copy.page}` : ''}
      </span>
      <button
        type="button"
        onClick={() => setPageNumber(Math.min(pageCount, safePage + 1))}
        disabled={safePage >= pageCount}
        aria-label={copy.next}
        className="btn-ghost h-8 w-8 p-0 disabled:opacity-40"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );

  return (
    <div className="space-y-3" data-testid={`${testIdPrefix}-editor`}>
      <div className="flex flex-wrap items-center gap-2">
        {pager}
        {props.mode === 'regions' ? (
          <>
            <span className="text-xs text-ink-muted">{copy.boxes(boxes.length)}</span>
            {boxes.length > 0 ? (
              <button
                type="button"
                onClick={() => changeBoxes([])}
                className="ml-auto rounded-lg px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-base-subtle hover:text-ink"
              >
                {copy.clearPage}
              </button>
            ) : null}
          </>
        ) : null}
      </div>
      {props.mode !== 'view' ? (
        <p className="text-xs text-ink-faint">{props.mode === 'regions' ? copy.drawHint : copy.placeHint}</p>
      ) : null}

      <div ref={frameRef} className="w-full">
        {!preview || !info || !frameWidth ? (
          <p className="flex items-center gap-2 py-10 text-sm text-ink-muted">
            <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
            {copy.loading}
          </p>
        ) : (
          <div className="mx-auto overflow-hidden rounded-lg border border-border shadow-card" style={{ width: frameWidth }}>
            <BoxLayer
              boxes={boxes}
              onChange={changeBoxes}
              selected={selected}
              onSelect={setSelected}
              allowDraw={props.mode === 'regions'}
              placeOnClick={props.mode === 'stamp'}
              removable={props.mode === 'regions'}
              labels={{ box: copy.box, remove: copy.remove }}
              testIdPrefix={testIdPrefix}
              boxClassName={(index, isSelected) =>
                props.mode === 'regions'
                  ? cx('border border-white/40', isSelected && 'ring-2 ring-prime')
                  : cx('border-2 border-dashed', isSelected ? 'border-prime' : 'border-prime/60')
              }
              renderBox={(box) =>
                props.mode === 'regions' ? (
                  <div className="h-full w-full" style={{ backgroundColor: props.boxColor }} />
                ) : props.mode === 'stamp' ? (
                  props.renderStamp({ width: box.w * frameWidth, height: box.h * displayHeight, scale })
                ) : null
              }
            >
              <PdfPageImage preview={preview} pageNumber={safePage} width={frameWidth} style={{ width: frameWidth, height: displayHeight }} />
              {overlay ? (
                <div className="pointer-events-none absolute inset-0 overflow-hidden">
                  {overlay({ width: frameWidth, height: displayHeight, scale, pageNumber: safePage })}
                </div>
              ) : null}
            </BoxLayer>
          </div>
        )}
      </div>
    </div>
  );
}
