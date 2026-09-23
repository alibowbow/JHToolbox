'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { useLocale } from '@/components/providers/locale-provider';
import { handOffFiles } from '@/lib/file-handoff';
import { getLocalizedToolCopy } from '@/lib/tool-localization';
import { getToolIcon } from '@/lib/tool-icons';
import { categoryStyles } from '@/lib/tool-presentation';
import { getToolById } from '@/lib/tool-registry';
import { cx } from '@/lib/utils';

/**
 * "Continue with…": opens another tool with these files already added, so a
 * result can be compressed, merged, converted… without downloading and
 * uploading it again.
 */
export function ContinueMenu({
  toolIds,
  getFiles,
  label,
  className,
}: {
  toolIds: string[];
  getFiles: () => File[];
  label: string;
  className?: string;
}) {
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);

  const tools = toolIds.map((toolId) => getToolById(toolId)).filter((tool): tool is NonNullable<typeof tool> => Boolean(tool));
  if (tools.length === 0) {
    return null;
  }

  return (
    <div ref={rootRef} className={cx('relative', className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="btn-ghost px-3 py-2 text-[13px]"
        data-testid="continue-menu-button"
      >
        {label}
        <ChevronDown size={14} aria-hidden="true" className={cx('transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1.5 max-h-80 w-64 overflow-y-auto rounded-xl border border-border bg-base-elevated p-1.5 shadow-pop"
        >
          {tools.map((tool) => {
            const Icon = getToolIcon(tool.id, tool.category);
            const style = categoryStyles[tool.category];
            return (
              <Link
                key={tool.id}
                role="menuitem"
                href={`/tools/${tool.category}/${tool.id}`}
                onClick={() => {
                  handOffFiles(getFiles(), tool.id);
                  setOpen(false);
                }}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink transition-colors hover:bg-base-subtle focus-visible:bg-base-subtle"
              >
                <span className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', style.iconBg, style.icon)}>
                  <Icon size={15} />
                </span>
                <span className="min-w-0 flex-1 truncate">{getLocalizedToolCopy(tool, locale).name}</span>
                <ArrowRight size={14} className="shrink-0 text-ink-faint" aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
