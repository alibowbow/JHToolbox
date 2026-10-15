'use client';

import { Volume2, VolumeX } from 'lucide-react';
import { formatEditorTime } from '@/components/ui/video-editor-utils';
import { cx } from '@/lib/utils';
import {
  SPEEDS,
  clipLength,
  musicLength,
  setClipSpeed,
  setPhotoLength,
  type AspectId,
  type ItemRef,
  type Project,
} from '@/lib/video-editor/project';
import type { RuntimeAsset } from './engine';
import type { VideoEditorCopy } from './copy';

const ASPECTS: AspectId[] = ['original', '16:9', '9:16', '1:1', '4:5'];
const TEXT_COLORS = ['#ffffff', '#fde047', '#f87171', '#60a5fa', '#4ade80', '#111827'];

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  testId,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  testId?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" data-testid={testId}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cx(
            'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
            option.value === value ? 'border-prime/50 bg-prime/10 text-prime' : 'border-border bg-base-elevated text-ink-muted hover:border-border-bright hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children, value }: { label: string; children: React.ReactNode; value?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-ink-muted">{label}</span>
        {value ? <span className="font-mono tabular-nums text-ink-faint">{value}</span> : null}
      </div>
      {children}
    </div>
  );
}

function Range({ value, min, max, step, onChange, label }: { value: number; min: number; max: number; step: number; onChange: (value: number) => void; label: string }) {
  return (
    <input
      type="range"
      aria-label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(event) => onChange(Number(event.target.value))}
      className="w-full accent-prime"
    />
  );
}

/**
 * Settings for the selected clip, text or music, or for the whole project
 * when nothing is selected. `onChange` is one undo step per change.
 */
export function Inspector({
  project,
  assets,
  selected,
  quality,
  copy,
  onChange,
  onQuality,
}: {
  project: Project;
  assets: Record<string, RuntimeAsset>;
  selected: ItemRef | null;
  quality: number;
  copy: VideoEditorCopy;
  onChange: (next: Project) => void;
  onQuality: (longSide: number) => void;
}) {
  const clip = selected?.kind === 'clip' ? project.clips.find((entry) => entry.id === selected.id) : undefined;
  const text = selected?.kind === 'text' ? project.texts.find((entry) => entry.id === selected.id) : undefined;
  const music = selected?.kind === 'music' ? project.music.find((entry) => entry.id === selected.id) : undefined;

  if (clip) {
    const asset = assets[clip.assetId];
    const photo = asset?.info.kind === 'image';
    return (
      <div className="space-y-4" data-testid="ve-inspector-clip">
        <p className="truncate text-sm font-semibold text-ink">{photo ? copy.photo : copy.clip} · <span className="font-normal text-ink-muted">{asset?.info.name}</span></p>
        {photo ? (
          <Field label={copy.length} value={`${clipLength(clip).toFixed(1)} ${copy.seconds}`}>
            <Range label={copy.length} value={clipLength(clip)} min={0.5} max={20} step={0.5} onChange={(seconds) => onChange(setPhotoLength(project, clip.id, seconds))} />
          </Field>
        ) : (
          <>
            <Field label={copy.speed} value={`${clip.speed}x · ${formatEditorTime(clipLength(clip))}`}>
              <Segmented
                value={clip.speed}
                options={SPEEDS.map((speed) => ({ value: speed, label: `${speed}x` }))}
                onChange={(speed) => onChange(setClipSpeed(project, clip.id, speed))}
                testId="ve-speed"
              />
            </Field>
            <Field label={copy.volume} value={`${Math.round(clip.volume * 100)}%`}>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onChange({ ...project, clips: project.clips.map((entry) => (entry.id === clip.id ? { ...entry, volume: entry.volume === 0 ? 1 : 0 } : entry)) })}
                  aria-label={clip.volume === 0 ? copy.unmute : copy.mute}
                  title={clip.volume === 0 ? copy.unmute : copy.mute}
                  className="btn-ghost h-8 w-8 shrink-0 p-0"
                  data-testid="ve-mute"
                >
                  {clip.volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
                <Range
                  label={copy.volume}
                  value={clip.volume}
                  min={0}
                  max={2}
                  step={0.05}
                  onChange={(volume) => onChange({ ...project, clips: project.clips.map((entry) => (entry.id === clip.id ? { ...entry, volume } : entry)) })}
                />
              </div>
            </Field>
          </>
        )}
      </div>
    );
  }

  if (text) {
    const update = (patch: Partial<typeof text>) => onChange({ ...project, texts: project.texts.map((entry) => (entry.id === text.id ? { ...entry, ...patch } : entry)) });
    return (
      <div className="space-y-4" data-testid="ve-inspector-text">
        <p className="text-sm font-semibold text-ink">{copy.text}</p>
        <Field label={copy.textContent}>
          <textarea
            value={text.text}
            rows={2}
            onChange={(event) => update({ text: event.target.value })}
            className="input-surface w-full resize-y text-sm"
            aria-label={copy.textContent}
            data-testid="ve-text-input"
          />
        </Field>
        <Field label={copy.textSize} value={`${Math.round(text.size * 1000) / 10}%`}>
          <Range label={copy.textSize} value={text.size} min={0.03} max={0.2} step={0.005} onChange={(size) => update({ size })} />
        </Field>
        <Field label={copy.textColor}>
          <div className="flex items-center gap-1.5">
            {TEXT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={color}
                aria-pressed={text.color === color}
                onClick={() => update({ color })}
                className={cx('h-7 w-7 rounded-full border-2', text.color === color ? 'border-prime' : 'border-border')}
                style={{ background: color }}
              />
            ))}
            <input type="color" value={text.color} onChange={(event) => update({ color: event.target.value })} aria-label={copy.textColor} className="h-7 w-9 rounded border border-border bg-transparent" />
          </div>
        </Field>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" checked={text.box} onChange={(event) => update({ box: event.target.checked })} className="h-4 w-4 accent-prime" />
          {copy.textBox}
        </label>
        <Field label={copy.position}>
          <Segmented
            value={text.y < 0.34 ? 'top' : text.y > 0.66 ? 'bottom' : 'middle'}
            options={[
              { value: 'top', label: copy.top },
              { value: 'middle', label: copy.middle },
              { value: 'bottom', label: copy.bottom },
            ]}
            onChange={(where) => update({ x: 0.5, y: where === 'top' ? 0.15 : where === 'bottom' ? 0.82 : 0.5 })}
          />
        </Field>
        <p className="text-xs text-ink-faint">{copy.dragOnPreview}</p>
        <p className="font-mono text-xs tabular-nums text-ink-faint">
          {copy.starts} {formatEditorTime(text.start)} · {copy.ends} {formatEditorTime(text.end)}
        </p>
      </div>
    );
  }

  if (music) {
    const update = (patch: Partial<typeof music>) => onChange({ ...project, music: project.music.map((entry) => (entry.id === music.id ? { ...entry, ...patch } : entry)) });
    const asset = assets[music.assetId];
    return (
      <div className="space-y-4" data-testid="ve-inspector-music">
        <p className="truncate text-sm font-semibold text-ink">{copy.music} · <span className="font-normal text-ink-muted">{asset?.info.name}</span></p>
        <Field label={copy.volume} value={`${Math.round(music.volume * 100)}%`}>
          <Range label={copy.volume} value={music.volume} min={0} max={2} step={0.05} onChange={(volume) => update({ volume })} />
        </Field>
        <Field label={copy.fadeIn} value={`${music.fadeIn.toFixed(1)} ${copy.seconds}`}>
          <Range label={copy.fadeIn} value={music.fadeIn} min={0} max={5} step={0.5} onChange={(fadeIn) => update({ fadeIn })} />
        </Field>
        <Field label={copy.fadeOut} value={`${music.fadeOut.toFixed(1)} ${copy.seconds}`}>
          <Range label={copy.fadeOut} value={music.fadeOut} min={0} max={5} step={0.5} onChange={(fadeOut) => update({ fadeOut })} />
        </Field>
        <p className="font-mono text-xs tabular-nums text-ink-faint">
          {copy.starts} {formatEditorTime(music.offset)} · {copy.length} {formatEditorTime(musicLength(music))}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="ve-inspector-project">
      <p className="text-sm font-semibold text-ink">{copy.project}</p>
      <Field label={copy.aspect}>
        <Segmented
          value={project.aspect}
          options={ASPECTS.map((aspect) => ({ value: aspect, label: aspect === 'original' ? copy.original : aspect }))}
          onChange={(aspect) => onChange({ ...project, aspect })}
          testId="ve-aspect"
        />
      </Field>
      <Field label={copy.fit}>
        <Segmented
          value={project.fit}
          options={[
            { value: 'fit', label: copy.fitWhole },
            { value: 'fill', label: copy.fitFill },
          ]}
          onChange={(fit) => onChange({ ...project, fit })}
        />
      </Field>
      <Field label={copy.transition}>
        <Segmented
          value={project.transition}
          options={[
            { value: 'none', label: copy.transitionNone },
            { value: 'fade', label: copy.transitionFade },
          ]}
          onChange={(transition) => onChange({ ...project, transition })}
          testId="ve-transition"
        />
      </Field>
      <Field label={copy.quality}>
        <Segmented
          value={quality}
          options={[
            { value: 1280, label: '720p' },
            { value: 1920, label: '1080p' },
          ]}
          onChange={onQuality}
        />
      </Field>
      <p className="text-xs leading-relaxed text-ink-faint">{copy.selectHint}</p>
    </div>
  );
}
