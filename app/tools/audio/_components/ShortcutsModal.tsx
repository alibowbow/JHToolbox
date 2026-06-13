'use client';

import { X } from 'lucide-react';

type ShortcutItem = { keys: string[]; label: string };
type ShortcutGroup = { title: string; items: ShortcutItem[] };

function getShortcutGroups(locale: 'en' | 'ko'): { title: string; close: string; groups: ShortcutGroup[] } {
  if (locale === 'ko') {
    return {
      title: '키보드 단축키',
      close: '닫기',
      groups: [
        {
          title: '재생 · 이동',
          items: [
            { keys: ['Space'], label: '재생 / 일시정지' },
            { keys: ['←', '→'], label: '0.1초 이동 (Shift: 1초)' },
            { keys: ['Home', 'End'], label: '처음 / 끝으로 이동' },
            { keys: ['L'], label: '선택 구간 반복' },
          ],
        },
        {
          title: '편집',
          items: [
            { keys: ['Ctrl', 'Z'], label: '실행 취소 (Shift+Z: 다시 실행)' },
            { keys: ['Ctrl', 'X / C / V'], label: '잘라내기 / 복사 / 붙여넣기' },
            { keys: ['Delete'], label: '선택 구간 제거' },
            { keys: ['S'], label: '플레이헤드에서 분할' },
            { keys: ['M'], label: '활성 트랙 뮤트' },
          ],
        },
        {
          title: '선택 · 보기',
          items: [
            { keys: ['Ctrl', 'A'], label: '활성 클립 전체 선택' },
            { keys: ['Esc'], label: '선택 해제' },
            { keys: ['더블클릭'], label: '클립 전체 선택' },
            { keys: ['Ctrl', '휠'], label: '타임라인 확대 / 축소' },
            { keys: ['Alt', '드래그'], label: '스냅 일시 해제' },
            { keys: ['?'], label: '이 패널 열기' },
          ],
        },
      ],
    };
  }

  return {
    title: 'Keyboard shortcuts',
    close: 'Close',
    groups: [
      {
        title: 'Playback · Navigate',
        items: [
          { keys: ['Space'], label: 'Play / pause' },
          { keys: ['←', '→'], label: 'Nudge 0.1s (Shift: 1s)' },
          { keys: ['Home', 'End'], label: 'Jump to start / end' },
          { keys: ['L'], label: 'Loop selection' },
        ],
      },
      {
        title: 'Editing',
        items: [
          { keys: ['Ctrl', 'Z'], label: 'Undo (Shift+Z: redo)' },
          { keys: ['Ctrl', 'X / C / V'], label: 'Cut / copy / paste' },
          { keys: ['Delete'], label: 'Remove selection' },
          { keys: ['S'], label: 'Split at playhead' },
          { keys: ['M'], label: 'Mute active track' },
        ],
      },
      {
        title: 'Selection · View',
        items: [
          { keys: ['Ctrl', 'A'], label: 'Select the active clip' },
          { keys: ['Esc'], label: 'Clear selection' },
          { keys: ['Double-click'], label: 'Select a whole clip' },
          { keys: ['Ctrl', 'Wheel'], label: 'Zoom the timeline' },
          { keys: ['Alt', 'Drag'], label: 'Temporarily disable snapping' },
          { keys: ['?'], label: 'Open this panel' },
        ],
      },
    ],
  };
}

export function ShortcutsModal({ locale, onClose }: { locale: 'en' | 'ko'; onClose: () => void }) {
  const copy = getShortcutGroups(locale);

  return (
    <div
      data-testid="audio-shortcuts-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.45)] p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="audio-panel max-h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-[20px] p-5">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] pb-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{copy.title}</h2>
          <button type="button" onClick={onClose} className="audio-icon-button audio-focus-ring" aria-label={copy.close}>
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="mt-4 grid gap-5 sm:grid-cols-3">
          {copy.groups.map((group) => (
            <div key={group.title}>
              <p className="audio-section-kicker">{group.title}</p>
              <ul className="mt-2 space-y-2">
                {group.items.map((item) => (
                  <li key={item.label} className="flex flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-1">
                      {item.keys.map((key) => (
                        <kbd
                          key={key}
                          className="audio-mono rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]"
                        >
                          {key}
                        </kbd>
                      ))}
                    </span>
                    <span className="text-xs text-[var(--text-secondary)]">{item.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
