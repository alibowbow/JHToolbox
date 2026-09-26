'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AppWindow, Camera, ExternalLink, LoaderCircle } from 'lucide-react';
import { useLocale } from '@/components/providers/locale-provider';
import { localizeErrorMessage } from '@/lib/error-messages';
import { validateExternalUrl } from '@/lib/url-safety';
import type { ProcessedFile } from '@/types/processor';

const COPY = {
  en: {
    title: 'Capture it from your own browser',
    body: 'Your browser opens the page, so the site cannot turn it away. Only the part visible in the tab is captured.',
    open: 'Open in a new tab',
    capture: 'Capture that tab',
    capturing: 'Waiting for a tab…',
    pickHint: 'Choose the tab you opened in the sharing dialog.',
    unsupported: 'This browser cannot capture tabs. On a phone, open the page and take a screenshot instead.',
    cancelled: 'Sharing was cancelled or not allowed.',
    fullPage: 'Need the whole page?',
  },
  ko: {
    title: '내 브라우저에서 직접 캡처',
    body: '이 기기에서 연 화면을 찍어서 사이트가 막을 수 없어요. 탭에 보이는 부분만 담겨요.',
    open: '새 탭에서 열기',
    capture: '그 탭 캡처하기',
    capturing: '탭을 고르는 중…',
    pickHint: '공유 창에서 방금 연 탭을 고르세요.',
    unsupported: '이 브라우저는 탭 캡처를 지원하지 않아요. 휴대폰이라면 사이트를 연 뒤 기기 스크린샷을 찍으세요.',
    cancelled: '화면 공유가 취소되었거나 허용되지 않았어요.',
    fullPage: '전체 페이지가 필요하다면',
  },
} as const;

function fullPageTips(locale: 'en' | 'ko', mac: boolean): Array<[string, string]> {
  const mod = mac ? '⌘' : 'Ctrl';
  const devtools = mac ? '⌘ ⌥ I' : 'F12';
  return locale === 'ko'
    ? [
        ['엣지', `${mod}+Shift+S → 전체 페이지 캡처`],
        ['크롬', `${devtools} → ${mod}+Shift+P → "스크린샷" 입력 → 전체 크기 스크린샷 캡처`],
        ['파이어폭스', '페이지 우클릭 → 스크린샷 찍기 → 전체 페이지 저장'],
        ['휴대폰', '스크린샷 후 갤럭시는 ‘스크롤 캡처’, 아이폰 사파리는 ‘전체 페이지’'],
      ]
    : [
        ['Edge', `${mod}+Shift+S → Capture full page`],
        ['Chrome', `${devtools} → ${mod}+Shift+P → type "screenshot" → Capture full size screenshot`],
        ['Firefox', 'Right-click the page → Take Screenshot → Save full page'],
        ['Phone', 'Take a screenshot, then “Scroll capture” (Galaxy) or “Full Page” (iPhone Safari)'],
      ];
}

type FocusController = { setFocusBehavior?: (behavior: 'focus-captured-surface' | 'no-focus-change') => void };

/** Keeps this tab in front after the user picks another one (Chrome), so the result shows right away. */
function keepFocusHere(controller: FocusController | undefined) {
  try {
    controller?.setFocusBehavior?.('no-focus-change');
  } catch {
    // Older browsers: the picked tab comes to the front instead.
  }
}

/**
 * Shown when the screenshot services could not capture a URL: the user opens
 * the page in their own browser and shares that tab, and one frame of it
 * becomes the tool's result.
 */
export function CaptureFallback({
  toolId,
  rawUrl,
  options,
  onCaptured,
}: {
  toolId: string;
  rawUrl: string;
  options: Record<string, string | number | boolean>;
  onCaptured: (files: ProcessedFile[]) => void;
}) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // Changing the address or options removes this panel; a capture still in
  // progress must not then land as the result of the new inputs.
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const href = useMemo(() => validateExternalUrl(rawUrl).url ?? null, [rawUrl]);
  const supported = typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function';
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

  const captureTab = async () => {
    setNote(null);
    setBusy(true);
    let stream: MediaStream;
    try {
      const Controller = (window as unknown as { CaptureController?: new () => FocusController }).CaptureController;
      const controller = Controller ? new Controller() : undefined;
      keepFocusHere(controller);
      // Called first, while the click still counts as a user gesture.
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser' },
        audio: false,
        preferCurrentTab: false,
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'exclude',
        monitorTypeSurfaces: 'exclude',
        ...(controller ? { controller } : {}),
      } as DisplayMediaStreamOptions);
      keepFocusHere(controller);
    } catch (cause) {
      setBusy(false);
      setNote(cause instanceof DOMException && cause.name === 'NotAllowedError' ? copy.cancelled : localizeErrorMessage(cause, locale));
      return;
    }

    if (!mountedRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    try {
      const { buildResultFromSharedTab } = await import('@/lib/processors/web');
      const captured = await buildResultFromSharedTab(toolId, stream, options);
      if (mountedRef.current) {
        onCaptured(captured);
      }
    } catch (cause) {
      stream.getTracks().forEach((track) => track.stop());
      if (mountedRef.current) {
        setNote(localizeErrorMessage(cause, locale));
      }
    } finally {
      if (mountedRef.current) {
        setBusy(false);
      }
    }
  };

  return (
    <section className="workspace-panel p-4 sm:p-5" data-testid="capture-fallback" aria-labelledby="capture-fallback-title">
      <div className="flex items-start gap-3">
        <AppWindow size={20} className="mt-0.5 shrink-0 text-prime" aria-hidden="true" />
        <div className="min-w-0">
          <h3 id="capture-fallback-title" className="text-sm font-semibold text-ink">
            {copy.title}
          </h3>
          <p className="mt-0.5 text-sm text-ink-muted">{copy.body}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="btn-ghost h-9 px-3">
            <span className="text-xs font-semibold tabular-nums text-ink-faint">1</span>
            {copy.open}
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        ) : null}
        {supported ? (
          <button type="button" onClick={() => void captureTab()} disabled={busy} className="btn-primary h-9 px-3">
            <span className="text-xs font-semibold tabular-nums opacity-70">2</span>
            {busy ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <Camera size={15} aria-hidden="true" />}
            {busy ? copy.capturing : copy.capture}
          </button>
        ) : null}
      </div>

      {busy ? <p className="mt-2 text-xs text-ink-faint">{copy.pickHint}</p> : null}
      {!supported ? <p className="mt-2 text-xs text-ink-faint">{copy.unsupported}</p> : null}
      {note ? (
        <p role="status" className="mt-2 text-xs font-medium text-warn">
          {note}
        </p>
      ) : null}

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer select-none text-ink-muted hover:text-ink">{copy.fullPage}</summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
          {fullPageTips(locale, mac).map(([browser, steps]) => (
            <div key={browser} className="contents">
              <dt className="font-medium text-ink">{browser}</dt>
              <dd className="text-ink-muted">{steps}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}
