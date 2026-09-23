'use client';

import { ArrowLeftToLine, ArrowRightToLine, Pause, Play, RotateCcw, SkipBack, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useLocale } from '@/components/providers/locale-provider';
import { CropStage } from '@/components/ui/CropStage';
import {
  clamp,
  cropEquals,
  getCropFromAspectRatio,
  getFullFrameCrop,
  normalizeCropRect,
  type CropRect,
  type FrameSize,
} from '@/components/ui/crop-math';
import { formatEditorTime, normalizeTrimRange, parseEditorTime, resolveMediaDuration } from '@/components/ui/video-editor-utils';
import { cx } from '@/lib/utils';

export type VideoCropRect = CropRect;

type VideoTimelineEditorProps = {
  file: File;
  previewUrl: string;
  trimEnabled?: boolean;
  trimStart: number;
  trimEnd: number;
  onTrimChange?: (nextValues: { startTime: number; endTime: number }) => void;
  captureEnabled?: boolean;
  captureTime?: number;
  onCaptureTimeChange?: (nextValue: number) => void;
  cropEnabled?: boolean;
  crop: CropRect;
  onCropChange?: (nextCrop: CropRect) => void;
  aspectPresetId?: string;
  onAspectPresetChange?: (nextAspectPresetId: string) => void;
  onVideoReady?: (metadata: { duration: number; width: number; height: number }) => void;
  testIdPrefix?: string;
};

const FILMSTRIP_FRAMES = 10;
const MIN_SELECTION = 0.05;

const COPY = {
  en: {
    editor: 'Video editor',
    play: 'Play',
    pause: 'Pause',
    restart: 'Back to start',
    mute: 'Mute',
    unmute: 'Unmute',
    setStart: 'Start here',
    setEnd: 'End here',
    setStartTitle: 'Set the start to the playhead (I)',
    setEndTitle: 'Set the end to the playhead (O)',
    start: 'Start',
    end: 'End',
    length: 'Length',
    captureAt: 'Capture at',
    shortcuts: 'Space: play · ←/→: 0.1 s (Shift: 1 s) · I/O: set start/end',
  },
  ko: {
    editor: '동영상 편집기',
    play: '재생',
    pause: '일시정지',
    restart: '처음으로',
    mute: '음소거',
    unmute: '소리 켜기',
    setStart: '여기서 시작',
    setEnd: '여기서 끝',
    setStartTitle: '재생 위치를 시작점으로 (I)',
    setEndTitle: '재생 위치를 끝점으로 (O)',
    start: '시작',
    end: '끝',
    length: '길이',
    captureAt: '캡처 위치',
    shortcuts: 'Space: 재생 · ←/→: 0.1초 (Shift: 1초) · I/O: 시작/끝 지정',
  },
} as const;

/** Evenly spaced still frames for the timeline, read from a hidden video. */
function useFilmstrip(previewUrl: string, duration: number, size: FrameSize) {
  const [frames, setFrames] = useState<string[]>([]);

  useEffect(() => {
    setFrames([]);
    if (!duration || !size.width || !size.height) {
      return;
    }

    let cancelled = false;
    const probe = document.createElement('video');
    probe.muted = true;
    probe.playsInline = true;
    probe.preload = 'auto';
    probe.src = previewUrl;
    const canvas = document.createElement('canvas');
    canvas.height = 96;
    canvas.width = Math.max(2, Math.round((canvas.height * size.width) / size.height));
    const context = canvas.getContext('2d');

    const waitFor = (eventName: string) =>
      new Promise<void>((resolve, reject) => {
        const done = () => {
          window.clearTimeout(timer);
          probe.removeEventListener(eventName, done);
          resolve();
        };
        const timer = window.setTimeout(() => {
          probe.removeEventListener(eventName, done);
          reject(new Error('timeout'));
        }, 4000);
        probe.addEventListener(eventName, done);
      });

    void (async () => {
      if (!context) {
        return;
      }
      if (probe.readyState < 2) {
        await waitFor('loadeddata');
      }
      for (let index = 0; index < FILMSTRIP_FRAMES && !cancelled; index += 1) {
        const seeked = waitFor('seeked');
        probe.currentTime = ((index + 0.5) / FILMSTRIP_FRAMES) * duration;
        await seeked;
        if (cancelled) {
          return;
        }
        context.drawImage(probe, 0, 0, canvas.width, canvas.height);
        const frame = canvas.toDataURL('image/jpeg', 0.7);
        setFrames((current) => [...current, frame]);
      }
    })()
      .catch(() => undefined)
      .finally(() => {
        probe.removeAttribute('src');
        probe.load();
      });

    return () => {
      cancelled = true;
    };
  }, [duration, previewUrl, size.height, size.width]);

  return frames;
}

/** "m:ss.cc" text box; commits on Enter or blur and reverts on nonsense. */
function TimeField({
  label,
  value,
  onCommit,
  disabled = false,
}: {
  label: string;
  value: number;
  onCommit: (seconds: number) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(formatEditorTime(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(formatEditorTime(value));
    }
  }, [value]);

  const commit = () => {
    const seconds = parseEditorTime(draft);
    if (seconds === null) {
      setDraft(formatEditorTime(value));
      return;
    }
    onCommit(seconds);
  };

  return (
    <label className="block min-w-0">
      <span className="block text-xs text-ink-faint">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        disabled={disabled}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          focusedRef.current = false;
          commit();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit();
          }
        }}
        className="input-surface mt-1 h-9 w-full font-mono text-sm tabular-nums disabled:opacity-50"
      />
    </label>
  );
}

export function VideoTimelineEditor(props: VideoTimelineEditorProps) {
  const {
    previewUrl,
    trimEnabled = false,
    trimStart,
    trimEnd,
    onTrimChange,
    captureEnabled = false,
    captureTime = 0,
    onCaptureTimeChange,
    cropEnabled = false,
    crop,
    onCropChange,
    aspectPresetId = 'free',
    onAspectPresetChange,
    testIdPrefix = 'video-editor',
  } = props;
  const { locale, messages } = useLocale();
  const copy = COPY[locale];
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const durationRef = useRef(0);
  const [videoSize, setVideoSize] = useState<FrameSize>({ width: 0, height: 0 });
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [aspectId, setAspectId] = useState(aspectPresetId);
  const frames = useFilmstrip(previewUrl, duration, videoSize);

  const aspectPresets = useMemo(
    () => [
      { id: 'free', label: messages.workbench.ratioPresetFree, ratio: null as number | null },
      { id: 'square', label: messages.workbench.ratioPresetSquare, ratio: 1 },
      { id: 'landscape', label: messages.workbench.ratioPresetLandscape, ratio: 16 / 9 },
      { id: '4-3', label: '4:3', ratio: 4 / 3 },
      { id: '3-4', label: '3:4', ratio: 3 / 4 },
      { id: 'portrait', label: messages.workbench.ratioPresetPortrait, ratio: 9 / 16 },
    ],
    [messages.workbench],
  );
  const aspectRatio = aspectPresets.find((preset) => preset.id === aspectId)?.ratio ?? null;
  const safeDuration = Math.max(duration, MIN_SELECTION);
  const trim = normalizeTrimRange(trimStart, trimEnd, duration || trimEnd || 1);
  const normalizedCrop = useMemo(() => normalizeCropRect(crop, videoSize), [crop, videoSize]);
  // Until the length is known, times cannot be placed on the timeline.
  const ready = duration > 0;
  const percentOf = (seconds: number) => Number(clamp((seconds / safeDuration) * 100, 0, 100).toFixed(2));

  useEffect(() => {
    setAspectId(aspectPresetId);
  }, [aspectPresetId]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = muted;
    }
  }, [muted]);

  // Per-file values start fresh for every new video: full length, full frame.
  const metadataHandledRef = useRef(false);
  const handleLoadedMetadata = async () => {
    const video = videoRef.current;
    if (!video || metadataHandledRef.current) {
      return;
    }
    metadataHandledRef.current = true;
    const size = { width: video.videoWidth, height: video.videoHeight };
    setVideoSize(size);
    const resolved = await resolveMediaDuration(video);
    if (videoRef.current !== video) {
      return;
    }
    durationRef.current = resolved;
    setDuration(resolved);

    const latest = propsRef.current;
    latest.onVideoReady?.({ duration: resolved, width: size.width, height: size.height });
    if (latest.trimEnabled && latest.onTrimChange) {
      latest.onTrimChange(normalizeTrimRange(0, resolved, resolved || 1));
    }
    if (latest.captureEnabled) {
      const start = clamp(latest.captureTime ?? 0, 0, resolved);
      video.currentTime = start;
      setCurrentTime(start);
      latest.onCaptureTimeChange?.(Number(start.toFixed(3)));
    }
    if (latest.cropEnabled && latest.onCropChange) {
      latest.onCropChange(getFullFrameCrop(size));
    }
  };

  // A small local file can finish loading before React attaches the element's
  // handlers (the editor is loaded lazily), and then "loadedmetadata" is never
  // seen. Catch that case on mount.
  useEffect(() => {
    if ((videoRef.current?.readyState ?? 0) >= 1) {
      void handleLoadedMetadata();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mounted video (the editor is keyed by file)
  }, []);

  // The browser can learn the real length later than expected; follow it,
  // and stretch a selection that still spans the whole clip.
  const handleDurationChange = () => {
    const next = videoRef.current?.duration ?? 0;
    if (!Number.isFinite(next) || next <= 0 || Math.abs(next - durationRef.current) < 0.01) {
      return;
    }
    const previous = durationRef.current;
    durationRef.current = next;
    setDuration(next);
    const latest = propsRef.current;
    if (latest.trimEnabled && latest.onTrimChange && (previous === 0 || Math.abs(latest.trimEnd - previous) < 0.01 || latest.trimEnd <= 0)) {
      latest.onTrimChange(normalizeTrimRange(latest.trimStart, next, next));
    }
  };

  // Smooth playhead while playing; playback stays inside the selection.
  useEffect(() => {
    if (!isPlaying) {
      return;
    }
    let frame = 0;
    const tick = () => {
      const video = videoRef.current;
      if (video) {
        const latest = propsRef.current;
        if (latest.trimEnabled) {
          const range = normalizeTrimRange(latest.trimStart, latest.trimEnd, durationRef.current || 1);
          if (video.currentTime >= range.endTime - 0.01) {
            video.pause();
            video.currentTime = range.endTime;
          }
        }
        setCurrentTime(video.currentTime);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying]);

  const seekTo = (seconds: number) => {
    const video = videoRef.current;
    const target = clamp(seconds, 0, safeDuration);
    if (video) {
      video.currentTime = target;
    }
    setCurrentTime(target);
    if (captureEnabled) {
      onCaptureTimeChange?.(Number(target.toFixed(3)));
    }
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (!video.paused) {
      video.pause();
      return;
    }
    if (trimEnabled && (video.currentTime < trim.startTime - 0.01 || video.currentTime >= trim.endTime - 0.02)) {
      video.currentTime = trim.startTime;
    }
    void video.play().catch(() => undefined);
  };

  const commitTrim = (start: number, end: number) => {
    const next = normalizeTrimRange(start, end, safeDuration);
    if (next.startTime !== trim.startTime || next.endTime !== trim.endTime) {
      onTrimChange?.(next);
    }
  };

  const commitCrop = (next: CropRect) => {
    const safe = normalizeCropRect(next, videoSize);
    if (!cropEquals(safe, normalizedCrop)) {
      onCropChange?.(safe);
    }
  };

  const chooseAspect = (id: string, ratio: number | null) => {
    setAspectId(id);
    onAspectPresetChange?.(id);
    if (!videoSize.width) {
      return;
    }
    commitCrop(ratio ? getCropFromAspectRatio(videoSize, ratio, normalizedCrop) : getFullFrameCrop(videoSize));
  };

  const reset = () => {
    seekTo(0);
    if (trimEnabled) {
      commitTrim(0, safeDuration);
    }
    if (cropEnabled) {
      chooseAspect('free', null);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.getAttribute('role') === 'group') {
      return;
    }
    const step = event.shiftKey ? 1 : 0.1;
    if (event.key === ' ' || event.key === 'k') {
      event.preventDefault();
      togglePlay();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      seekTo(currentTime + (event.key === 'ArrowLeft' ? -step : step));
    } else if (trimEnabled && (event.key === 'i' || event.key === 'I')) {
      commitTrim(Math.min(currentTime, trim.endTime - MIN_SELECTION), trim.endTime);
    } else if (trimEnabled && (event.key === 'o' || event.key === 'O')) {
      commitTrim(trim.startTime, Math.max(currentTime, trim.startTime + MIN_SELECTION));
    }
  };

  const startPercent = percentOf(trim.startTime);
  const endPercent = percentOf(trim.endTime);
  const video = (
    <video
      ref={videoRef}
      src={previewUrl}
      preload="metadata"
      playsInline
      onLoadedMetadata={() => void handleLoadedMetadata()}
      onDurationChange={handleDurationChange}
      onPlay={() => setIsPlaying(true)}
      onPause={() => {
        setIsPlaying(false);
        const current = videoRef.current?.currentTime ?? 0;
        setCurrentTime(current);
        if (captureEnabled) {
          onCaptureTimeChange?.(Number(current.toFixed(3)));
        }
      }}
      onClick={cropEnabled ? undefined : togglePlay}
      className={cx('block max-h-[28rem] max-w-full', !cropEnabled && 'mx-auto cursor-pointer')}
    />
  );

  return (
    <div
      tabIndex={0}
      aria-label={copy.editor}
      onKeyDown={handleKeyDown}
      className="space-y-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-prime focus-visible:ring-offset-2 focus-visible:ring-offset-base-elevated"
      data-testid={`${testIdPrefix}-editor`}
    >
      <div className="overflow-hidden rounded-xl bg-black">
        {cropEnabled ? (
          <CropStage
            frameSize={videoSize}
            crop={normalizedCrop}
            aspectRatio={aspectRatio}
            onChange={commitCrop}
            testIdPrefix={testIdPrefix}
            label={messages.workbench.cropFrame}
          >
            {video}
          </CropStage>
        ) : (
          video
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => seekTo(trimEnabled ? trim.startTime : 0)} aria-label={copy.restart} title={copy.restart} className="btn-ghost h-9 w-9 p-0">
          <SkipBack size={15} />
        </button>
        <button type="button" onClick={togglePlay} aria-label={isPlaying ? copy.pause : copy.play} className="btn-primary h-9 w-9 p-0">
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button type="button" onClick={() => setMuted((value) => !value)} aria-label={muted ? copy.unmute : copy.mute} title={muted ? copy.unmute : copy.mute} className="btn-ghost h-9 w-9 p-0">
          {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>
        <span className="ml-1 font-mono text-sm tabular-nums text-ink">
          {formatEditorTime(currentTime)}
          <span className="text-ink-faint"> / {formatEditorTime(duration)}</span>
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {trimEnabled ? (
            <>
              <button
                type="button"
                onClick={() => commitTrim(Math.min(currentTime, trim.endTime - MIN_SELECTION), trim.endTime)}
                disabled={!ready}
                title={copy.setStartTitle}
                className="btn-ghost h-9 px-2.5 text-xs"
              >
                <ArrowLeftToLine size={14} />
                {copy.setStart}
              </button>
              <button
                type="button"
                onClick={() => commitTrim(trim.startTime, Math.max(currentTime, trim.startTime + MIN_SELECTION))}
                disabled={!ready}
                title={copy.setEndTitle}
                className="btn-ghost h-9 px-2.5 text-xs"
              >
                <ArrowRightToLine size={14} />
                {copy.setEnd}
              </button>
            </>
          ) : null}
          <button type="button" onClick={reset} aria-label={messages.workbench.resetEditor} title={messages.workbench.resetEditor} className="btn-ghost h-9 w-9 p-0">
            <RotateCcw size={15} />
          </button>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-3 text-xs text-ink-faint">
          <span>{messages.workbench.timeline}</span>
          {captureEnabled ? (
            <span className="font-medium tabular-nums text-ink">
              {copy.captureAt} {formatEditorTime(captureTime)}
            </span>
          ) : (
            <span className="hidden sm:inline">{copy.shortcuts}</span>
          )}
        </div>
        <div className="relative h-14 overflow-hidden rounded-lg bg-base-subtle">
          <div className="absolute inset-0 flex" aria-hidden="true">
            {frames.map((frame, index) => (
              <img key={index} src={frame} alt="" className="h-full min-w-0 flex-1 object-cover" />
            ))}
          </div>
          {trimEnabled ? (
            <>
              <div className="pointer-events-none absolute inset-y-0 left-0 bg-black/60" style={{ width: `${startPercent}%` }} />
              <div className="pointer-events-none absolute inset-y-0 right-0 bg-black/60" style={{ width: `${100 - endPercent}%` }} />
              <div
                className="pointer-events-none absolute inset-y-0 rounded-md border-2 border-prime"
                style={{ left: `${startPercent}%`, width: `${Math.max(0, endPercent - startPercent)}%` }}
              />
            </>
          ) : null}
          <div
            className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.4)]"
            style={{ left: `${percentOf(currentTime)}%` }}
          />
          <input
            type="range"
            min={0}
            max={100}
            step={0.1}
            value={percentOf(currentTime)}
            onChange={(event) => seekTo((Number(event.target.value) / 100) * safeDuration)}
            aria-label={messages.workbench.playhead}
            disabled={!ready}
            aria-valuetext={formatEditorTime(currentTime)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>
        {trimEnabled ? (
          <div className="relative mt-1 h-8">
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-base-subtle" />
            <div
              className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-prime"
              style={{ left: `${startPercent}%`, width: `${Math.max(0, endPercent - startPercent)}%` }}
            />
            <input
              type="range"
              min={0}
              max={100}
              step={0.1}
              value={startPercent}
              onChange={(event) => {
                const start = Math.min((Number(event.target.value) / 100) * safeDuration, trim.endTime - MIN_SELECTION);
                commitTrim(start, trim.endTime);
                seekTo(start);
              }}
              aria-label={messages.workbench.trimStart}
            disabled={!ready}
              aria-valuetext={formatEditorTime(trim.startTime)}
              className="dual-range"
            />
            <input
              type="range"
              min={0}
              max={100}
              step={0.1}
              value={endPercent}
              onChange={(event) => {
                const end = Math.max((Number(event.target.value) / 100) * safeDuration, trim.startTime + MIN_SELECTION);
                commitTrim(trim.startTime, end);
                seekTo(end);
              }}
              aria-label={messages.workbench.trimEnd}
            disabled={!ready}
              aria-valuetext={formatEditorTime(trim.endTime)}
              className="dual-range"
            />
          </div>
        ) : null}
      </div>

      {trimEnabled ? (
        <div className="grid grid-cols-3 gap-2">
          <TimeField label={copy.start} value={trim.startTime} disabled={!ready} onCommit={(seconds) => commitTrim(seconds, trim.endTime)} />
          <TimeField label={copy.end} value={trim.endTime} disabled={!ready} onCommit={(seconds) => commitTrim(trim.startTime, seconds)} />
          <div className="min-w-0">
            <span className="block text-xs text-ink-faint">{copy.length}</span>
            <p className="mt-1 flex h-9 items-center font-mono text-sm font-semibold tabular-nums text-ink">
              {formatEditorTime(trim.endTime - trim.startTime)}
            </p>
          </div>
        </div>
      ) : null}

      {cropEnabled ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-ink-faint">{messages.workbench.ratioPresets}</span>
          {aspectPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              data-testid={`${testIdPrefix}-preset-${preset.id}`}
              aria-pressed={aspectId === preset.id}
              onClick={() => chooseAspect(preset.id, preset.ratio)}
              className={cx(
                'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                aspectId === preset.id
                  ? 'border-prime/50 bg-prime/10 text-prime'
                  : 'border-border bg-base-elevated text-ink-muted hover:border-border-bright hover:text-ink',
              )}
            >
              {preset.label}
            </button>
          ))}
          <span className="ml-auto flex items-center gap-1.5 text-xs text-ink-faint">
            <span>{messages.workbench.cropFrame}</span>
            <span className="font-medium tabular-nums text-ink">
              {normalizedCrop.width}×{normalizedCrop.height}
            </span>
          </span>
        </div>
      ) : null}
    </div>
  );
}
