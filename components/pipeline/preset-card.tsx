'use client';

import Link from 'next/link';
import {
  ArrowRight,
  AudioLines,
  Contrast,
  FileStack,
  Headphones,
  IdCard,
  ImageUp,
  Mail,
  ScanText,
  Smartphone,
  type LucideIcon,
} from 'lucide-react';
import type { PipelinePreset } from '@/lib/pipeline/presets';
import { getToolIcon } from '@/lib/tool-icons';
import { getLocalizedToolCopy } from '@/lib/tool-localization';
import { categoryStyles } from '@/lib/tool-presentation';
import { getToolById } from '@/lib/tool-registry';
import { cx } from '@/lib/utils';

// What each job is about, at a glance. A preset missing here shows the icon
// of its first tool.
const PRESET_ICONS: Record<string, LucideIcon> = {
  'id-copy': IdCard,
  'paper-photos-to-pdf': ScanText,
  'screenshots-to-pdf': Smartphone,
  'pdfs-for-email': Mail,
  'submission-pdf': FileStack,
  'scans-black-and-white': Contrast,
  'photos-for-posting': ImageUp,
  'lecture-video-to-mp3': Headphones,
  'recordings-into-one': AudioLines,
};

export function presetIcon(preset: PipelinePreset): LucideIcon {
  return PRESET_ICONS[preset.id] ?? getToolIcon(preset.steps('en')[0]?.toolId ?? '', preset.category);
}

/** "Merge PDF → Reduce PDF Size" in the current language. */
export function presetChain(preset: PipelinePreset, locale: 'en' | 'ko') {
  return preset
    .steps(locale)
    .map((step) => {
      const tool = getToolById(step.toolId);
      return tool ? getLocalizedToolCopy(tool, locale).name : step.toolId;
    })
    .join(' → ');
}

/**
 * A ready-made pipeline: what it does, its steps and what to add. A button
 * in the pipeline builder, a link to it elsewhere.
 */
export function PresetCard({
  preset,
  locale,
  inputLabel,
  active = false,
  disabled = false,
  compact = false,
  href,
  onUse,
}: {
  preset: PipelinePreset;
  locale: 'en' | 'ko';
  inputLabel: string;
  active?: boolean;
  disabled?: boolean;
  /** Only what the job does, without its steps and files. */
  compact?: boolean;
  href?: string;
  onUse?: () => void;
}) {
  const Icon = presetIcon(preset);
  const style = categoryStyles[preset.category];
  const body = (
    <>
      <div className="flex items-start gap-3">
        <span className={cx('category-tile h-9 w-9 shrink-0', style.iconBg, style.icon)}>
          <Icon size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{preset.name[locale]}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{preset.description[locale]}</p>
        </div>
      </div>
      {compact ? null : (
        <>
          <p className="mt-3 text-[11px] font-medium leading-relaxed text-ink-muted">{presetChain(preset, locale)}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">
            {inputLabel}: {preset.input[locale]}
          </p>
        </>
      )}
    </>
  );
  const surface = cx(
    'flex h-full w-full flex-col rounded-xl border p-4 text-left transition',
    active
      ? 'border-prime/60 bg-prime/5 ring-1 ring-prime/30'
      : 'border-border bg-base-subtle/60 hover:border-border-bright hover:bg-base-elevated',
  );

  if (href) {
    return (
      <Link href={href} className={cx(surface, 'group')} data-testid={`pipeline-preset-${preset.id}`}>
        {body}
        <span className="mt-auto inline-flex items-center gap-1 pt-3 text-xs font-semibold text-prime">
          <ArrowRight size={13} aria-hidden="true" className="transition group-hover:translate-x-0.5" />
        </span>
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onUse}
      disabled={disabled}
      aria-pressed={active}
      className={cx(surface, 'disabled:opacity-50')}
      data-testid={`pipeline-preset-${preset.id}`}
    >
      {body}
    </button>
  );
}
