'use client';

import { Pause, Play, RotateCcw, SkipBack } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useLocale } from '@/components/providers/locale-provider';
import { cx } from '@/lib/utils';
import {
  buildRectFromAnchor,
  clamp,
  cropEquals,
  formatEditorTime,
  getCropFromAspectRatio,
  getFullFrameCrop,
  normalizeCropRect,
  normalizeTrimRange,
  type ResizeHandle,
  type VideoAspectPreset,
  type VideoCropRect,
  type VideoFrameSize,
} from '@/components/ui/video-editor-utils';

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
  crop: VideoCropRect;
  onCropChange?: (nextCrop: VideoCropRect) => void;
  aspectPresetId?: string;
  onAspectPresetChange?: (nextAspectPresetId: string) => void;
  onVideoReady?: (metadata: { duration: number; width: number; height: number }) => void;
  testIdPrefix?: string;
};

function aspectRatioMatches(crop: VideoCropRect, ratio: number) {
  if (!crop.width || !crop.height) {
    return false;
  }

  return Math.abs(crop.width / crop.height - ratio) < 0.02;
}

export function VideoTimelineEditor({
  file,
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
  onVideoReady,
  testIdPrefix = 'video-editor',
}: VideoTimelineEditorProps) {
  const { locale, messages } = useLocale();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const cleanupInteractionRef = useRef<(() => void) | null>(null);
  const [videoSize, setVideoSize] = useState<VideoFrameSize>({ width: 0, height: 0 });
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedAspectId, setSelectedAspectId] = useState(aspectPresetId);

  const aspectPresets = useMemo<VideoAspectPreset[]>(
    () => [
      { id: 'free', label: messages.workbench.ratioPresetFree, ratio: null },
      { id: 'square', label: messages.workbench.ratioPresetSquare, ratio: 1 },
      { id: 'landscape', label: messages.workbench.ratioPresetLandscape, ratio: 16 / 9 },
      { id: '4-3', label: '4:3', ratio: 4 / 3 },
      { id: '2-3', label: '2:3', ratio: 2 / 3 },
      { id: '3-4', label: '3:4', ratio: 3 / 4 },
      { id: 'portrait', label: messages.workbench.ratioPresetPortrait, ratio: 9 / 16 },
    ],
    [
      messages.workbench.ratioPresetFree,
      messages.workbench.ratioPresetLandscape,
      messages.workbench.ratioPresetPortrait,
      messages.workbench.ratioPresetSquare,
    ],
  );

  const normalizedCrop = useMemo(() => normalizeCropRect(crop, videoSize), [crop, videoSize]);
  const normalizedTrim = useMemo(() => normalizeTrimRange(trimStart, trimEnd, duration || trimEnd || 1), [duration, trimEnd, trimStart]);
  const safeDuration = Math.max(duration, normalizedTrim.endTime, 0.05);
  const playheadPercent = safeDuration ? Math.round((clamp(currentTime, 0, safeDuration) / safeDuration) * 100) : 0;
  const trimStartPercent = safeDuration ? Math.round((normalizedTrim.startTime / safeDuration) * 100) : 0;
  const trimEndPercent = safeDuration ? Math.round((normalizedTrim.endTime / safeDuration) * 100) : 100;
  const selectionDuration = Math.max(0, normalizedTrim.endTime - normalizedTrim.startTime);
  const capturePercent = safeDuration ? Math.round((clamp(captureTime, 0, safeDuration) / safeDuration) * 100) : 0;
  const currentAspectRatio = aspectPresets.find((preset) => preset.id === selectedAspectId)?.ratio ?? null;
  const playLabel = locale === 'ko' ? '재생' : 'Play';
  const pauseLabel = locale === 'ko' ? '일시정지' : 'Pause';
  const replayLabel = locale === 'ko' ? '처음으로' : 'Restart';
  const playSelectionLabel = locale === 'ko' ? '선택 구간 재생' : 'Play selection';

  useEffect(() => {
    setSelectedAspectId(aspectPresetId);
  }, [aspectPresetId]);

  useEffect(() => {
    return () => {
      cleanupInteractionRef.current?.();
      cleanupInteractionRef.current = null;
    };
  }, []);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    const handleLoadedMetadata = () => {
      const nextDuration = Number.isFinite(videoElement.duration) ? videoElement.duration : 0;
      const nextSize = {
        width: videoElement.videoWidth,
        height: videoElement.videoHeight,
      };

      setDuration(nextDuration);
      setVideoSize(nextSize);
      onVideoReady?.({ duration: nextDuration, width: nextSize.width, height: nextSize.height });

      if (trimEnabled && onTrimChange) {
        const nextTrim = normalizeTrimRange(trimStart, trimEnd || nextDuration, nextDuration || 1);
        if (nextTrim.startTime !== normalizedTrim.startTime || nextTrim.endTime !== normalizedTrim.endTime) {
          onTrimChange(nextTrim);
        }
      }

      if (captureEnabled && onCaptureTimeChange) {
        const nextCapture = Number(clamp(captureTime, 0, nextDuration || 0).toFixed(3));
        if (nextCapture !== Number(captureTime.toFixed(3))) {
          onCaptureTimeChange(nextCapture);
        }
      }

      if (cropEnabled && onCropChange) {
        const nextCrop = normalizeCropRect(crop.width && crop.height ? crop : getFullFrameCrop(nextSize), nextSize);
        if (!cropEquals(nextCrop, normalizedCrop)) {
          onCropChange(nextCrop);
        }
      }
    };

    const handleTimeUpdate = () => {
      const nextTime = videoElement.currentTime;
      setCurrentTime(nextTime);

      if (captureEnabled && onCaptureTimeChange) {
        onCaptureTimeChange(Number(nextTime.toFixed(3)));
      }

      if (trimEnabled && nextTime > normalizedTrim.endTime + 0.01) {
        videoElement.pause();
        videoElement.currentTime = normalizedTrim.endTime;
        setCurrentTime(normalizedTrim.endTime);
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);
    videoElement.addEventListener('timeupdate', handleTimeUpdate);
    videoElement.addEventListener('play', handlePlay);
    videoElement.addEventListener('pause', handlePause);

    if (videoElement.readyState >= 1 && videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
      handleLoadedMetadata();
    }

    return () => {
      videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
      videoElement.removeEventListener('timeupdate', handleTimeUpdate);
      videoElement.removeEventListener('play', handlePlay);
      videoElement.removeEventListener('pause', handlePause);
    };
  }, [
    captureEnabled,
    captureTime,
    crop,
    cropEnabled,
    normalizedCrop,
    normalizedTrim.endTime,
    normalizedTrim.startTime,
    onCaptureTimeChange,
    onCropChange,
    onTrimChange,
    onVideoReady,
    trimEnabled,
    trimEnd,
    trimStart,
  ]);

  useEffect(() => {
    const matchingPreset = aspectPresets.find((preset) => (preset.ratio ? aspectRatioMatches(normalizedCrop, preset.ratio) : false));
    if (!matchingPreset && selectedAspectId !== 'free' && cropEnabled) {
      setSelectedAspectId('free');
    }
  }, [aspectPresets, cropEnabled, normalizedCrop, selectedAspectId]);

  const commitTrim = (nextStartTime: number, nextEndTime: number) => {
    if (!onTrimChange) {
      return;
    }

    const nextTrim = normalizeTrimRange(nextStartTime, nextEndTime, safeDuration);
    if (nextTrim.startTime !== normalizedTrim.startTime || nextTrim.endTime !== normalizedTrim.endTime) {
      onTrimChange(nextTrim);
    }
  };

  const commitCrop = (nextCrop: VideoCropRect) => {
    if (!onCropChange) {
      return;
    }

    const safeCrop = normalizeCropRect(nextCrop, videoSize);
    if (!cropEquals(safeCrop, normalizedCrop)) {
      onCropChange(safeCrop);
    }
  };

  const seekToTime = (nextTime: number) => {
    const videoElement = videoRef.current;
    const safeTime = clamp(nextTime, 0, safeDuration);
    if (videoElement) {
      videoElement.currentTime = safeTime;
    }
    setCurrentTime(safeTime);
    if (captureEnabled && onCaptureTimeChange) {
      onCaptureTimeChange(Number(safeTime.toFixed(3)));
    }
  };

  const togglePlayback = async () => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    if (isPlaying) {
      videoElement.pause();
      return;
    }

    if (trimEnabled && currentTime >= normalizedTrim.endTime) {
      videoElement.currentTime = normalizedTrim.startTime;
      setCurrentTime(normalizedTrim.startTime);
    }

    await videoElement.play().catch(() => undefined);
  };

  const playSelection = async () => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    videoElement.currentTime = trimEnabled ? normalizedTrim.startTime : 0;
    setCurrentTime(videoElement.currentTime);
    await videoElement.play().catch(() => undefined);
  };

  const handlePlayheadChange = (nextPercent: number) => {
    seekToTime((safeDuration * nextPercent) / 100);
  };

  const handleTrimStartChange = (nextPercent: number) => {
    const nextStartTime = (safeDuration * nextPercent) / 100;
    commitTrim(nextStartTime, normalizedTrim.endTime);
  };

  const handleTrimEndChange = (nextPercent: number) => {
    const nextEndTime = (safeDuration * nextPercent) / 100;
    commitTrim(normalizedTrim.startTime, nextEndTime);
  };

  const getPointInFrame = (clientX: number, clientY: number) => {
    const stageElement = stageRef.current;
    if (!stageElement || !videoSize.width || !videoSize.height) {
      return null;
    }

    const bounds = stageElement.getBoundingClientRect();
    const x = clamp(((clientX - bounds.left) / Math.max(bounds.width, 1)) * videoSize.width, 0, videoSize.width);
    const y = clamp(((clientY - bounds.top) / Math.max(bounds.height, 1)) * videoSize.height, 0, videoSize.height);
    return { x, y };
  };

  const runMouseInteraction = (onMove: (point: { x: number; y: number }) => void) => {
    cleanupInteractionRef.current?.();

    const handleMouseMove = (event: MouseEvent) => {
      const point = getPointInFrame(event.clientX, event.clientY);
      if (!point) {
        return;
      }

      onMove(point);
    };

    const cleanup = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (cleanupInteractionRef.current === cleanup) {
        cleanupInteractionRef.current = null;
      }
    };

    const handleMouseUp = () => {
      cleanup();
    };

    cleanupInteractionRef.current = cleanup;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const startMoveCrop = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!cropEnabled || event.button !== 0) {
      return;
    }

    event.preventDefault();
    const startPoint = getPointInFrame(event.clientX, event.clientY);
    if (!startPoint) {
      return;
    }

    const startCrop = normalizedCrop;
    runMouseInteraction((point) => {
      const deltaX = point.x - startPoint.x;
      const deltaY = point.y - startPoint.y;

      commitCrop({
        ...startCrop,
        x: clamp(startCrop.x + deltaX, 0, Math.max(0, videoSize.width - startCrop.width)),
        y: clamp(startCrop.y + deltaY, 0, Math.max(0, videoSize.height - startCrop.height)),
      });
    });
  };

  const startResizeCrop = (handle: ResizeHandle) => (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!cropEnabled || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const anchor =
      handle === 'nw'
        ? { x: normalizedCrop.x + normalizedCrop.width, y: normalizedCrop.y + normalizedCrop.height }
        : handle === 'ne'
          ? { x: normalizedCrop.x, y: normalizedCrop.y + normalizedCrop.height }
          : handle === 'sw'
            ? { x: normalizedCrop.x + normalizedCrop.width, y: normalizedCrop.y }
            : { x: normalizedCrop.x, y: normalizedCrop.y };

    runMouseInteraction((point) => {
      commitCrop(buildRectFromAnchor(anchor, point, videoSize, currentAspectRatio));
    });
  };

  const startDrawCrop = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!cropEnabled || event.button !== 0 || (event.target as HTMLElement).dataset.cropInteractive === 'true') {
      return;
    }

    event.preventDefault();
    const anchor = getPointInFrame(event.clientX, event.clientY);
    if (!anchor) {
      return;
    }

    runMouseInteraction((point) => {
      commitCrop(buildRectFromAnchor(anchor, point, videoSize, currentAspectRatio));
    });
  };

  const handleAspectPresetClick = (preset: VideoAspectPreset) => {
    setSelectedAspectId(preset.id);
    onAspectPresetChange?.(preset.id);

    if (!cropEnabled || !videoSize.width || !videoSize.height) {
      return;
    }

    if (!preset.ratio) {
      commitCrop(getFullFrameCrop(videoSize));
      return;
    }

    commitCrop(getCropFromAspectRatio(videoSize, preset.ratio, normalizedCrop));
  };

  const handleReset = () => {
    seekToTime(0);
    if (trimEnabled) {
      commitTrim(0, safeDuration);
    }
    if (captureEnabled && onCaptureTimeChange) {
      onCaptureTimeChange(0);
    }
    if (cropEnabled) {
      commitCrop(getFullFrameCrop(videoSize));
      setSelectedAspectId('free');
      onAspectPresetChange?.('free');
    }
  };

  const left = videoSize.width ? (normalizedCrop.x / videoSize.width) * 100 : 0;
  const top = videoSize.height ? (normalizedCrop.y / videoSize.height) * 100 : 0;
  const width = videoSize.width ? (normalizedCrop.width / videoSize.width) * 100 : 0;
  const height = videoSize.height ? (normalizedCrop.height / videoSize.height) * 100 : 0;

  return (
    <div className="space-y-4" data-testid={`${testIdPrefix}-editor`}>
      <div className="rounded-xl border border-border bg-base-elevated p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">{messages.workbench.videoEditorTitle}</p>
            <p className="mt-1 text-xs text-ink-muted">{messages.workbench.videoEditorDescription}</p>
          </div>
          <button type="button" onClick={handleReset} className="btn-ghost px-3 py-2 text-xs">
            <RotateCcw size={14} />
            {messages.workbench.resetEditor}
          </button>
        </div>
        <p className="mt-3 text-xs text-ink-muted">{messages.workbench.previewGuidance}</p>
      </div>

      <div className="rounded-xl border border-border bg-base-elevated p-3">
        <div className="max-h-[34rem] overflow-auto rounded-xl border border-border bg-base-subtle">
          <div ref={stageRef} className="relative mx-auto w-fit max-w-full select-none" onMouseDown={startDrawCrop} data-testid={`${testIdPrefix}-stage`}>
            <video
              ref={videoRef}
              src={previewUrl}
              preload="metadata"
              playsInline
              muted
              className="block max-h-[30rem] max-w-full rounded-lg"
            />

            {cropEnabled && videoSize.width && videoSize.height ? (
              <div className="absolute inset-0 cursor-crosshair">
                <div
                  data-testid={`${testIdPrefix}-selection`}
                  data-crop-interactive="true"
                  className="absolute cursor-move rounded-xl border-2 border-cyan-300 bg-cyan-400/12 shadow-[0_0_0_9999px_rgba(15,23,42,0.58)]"
                  style={{
                    left: `${left}%`,
                    top: `${top}%`,
                    width: `${width}%`,
                    height: `${height}%`,
                  }}
                  onMouseDown={startMoveCrop}
                >
                  <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-cyan-200 bg-base-elevated/95 px-2 py-1 text-[11px] font-medium text-cyan-700">
                    {normalizedCrop.width} x {normalizedCrop.height}
                  </div>

                  {(['nw', 'ne', 'sw', 'se'] as ResizeHandle[]).map((handle) => (
                    <div
                      key={handle}
                      data-testid={`${testIdPrefix}-handle-${handle}`}
                      data-crop-interactive="true"
                      className={cx(
                        'absolute h-4 w-4 rounded-full border-2 border-white bg-cyan-500 shadow-sm',
                        handle === 'nw' && '-left-2 -top-2 cursor-nwse-resize',
                        handle === 'ne' && '-right-2 -top-2 cursor-nesw-resize',
                        handle === 'sw' && '-bottom-2 -left-2 cursor-nesw-resize',
                        handle === 'se' && '-bottom-2 -right-2 cursor-nwse-resize',
                      )}
                      onMouseDown={startResizeCrop(handle)}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-base-elevated p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-ink-faint">{messages.workbench.timeline}</p>
            <p className="mt-1 text-xs text-ink-muted">{messages.workbench.trimRangeHint}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => seekToTime(0)} className="btn-ghost px-3 py-2 text-xs">
              <SkipBack size={14} />
              {replayLabel}
            </button>
            {trimEnabled ? (
              <button type="button" onClick={() => void playSelection()} className="btn-ghost px-3 py-2 text-xs">
                <Play size={14} />
                {playSelectionLabel}
              </button>
            ) : null}
            <button type="button" onClick={() => void togglePlayback()} className="btn-ghost px-3 py-2 text-xs">
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              {isPlaying ? pauseLabel : playLabel}
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-border bg-base-subtle px-3 py-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint">{messages.workbench.currentTime}</p>
            <p className="mt-2 text-sm font-semibold text-ink">{formatEditorTime(currentTime)}</p>
          </div>
          <div className="rounded-xl border border-border bg-base-subtle px-3 py-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint">{messages.workbench.duration}</p>
            <p className="mt-2 text-sm font-semibold text-ink">{formatEditorTime(safeDuration)}</p>
          </div>
          <div className="rounded-xl border border-border bg-base-subtle px-3 py-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint">
              {captureEnabled ? messages.workbench.currentTime : messages.workbench.playhead}
            </p>
            <p className="mt-2 text-sm font-semibold text-ink">{formatEditorTime(captureEnabled ? captureTime : selectionDuration)}</p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-ink-faint">{messages.workbench.playhead}</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={playheadPercent}
              onChange={(event) => handlePlayheadChange(Number(event.target.value))}
              className="mt-3 w-full accent-cyan-500"
              aria-label={messages.workbench.playhead}
            />
          </label>

          {trimEnabled ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-[0.16em] text-ink-faint">{messages.workbench.trimStart}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={trimStartPercent}
                  onChange={(event) => handleTrimStartChange(Number(event.target.value))}
                  className="mt-3 w-full accent-cyan-500"
                  aria-label={messages.workbench.trimStart}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-[0.16em] text-ink-faint">{messages.workbench.trimEnd}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={trimEndPercent}
                  onChange={(event) => handleTrimEndChange(Number(event.target.value))}
                  className="mt-3 w-full accent-cyan-500"
                  aria-label={messages.workbench.trimEnd}
                />
              </label>
            </div>
          ) : null}
        </div>
      </div>

      {cropEnabled ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-base-elevated p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-ink-faint">{messages.workbench.cropFrame}</p>
            <p className="mt-1 text-xs text-ink-muted">{messages.workbench.cropFrameHint}</p>
          </div>

          <div className="rounded-xl border border-border bg-base-elevated p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-ink-faint">{messages.workbench.ratioPresets}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {aspectPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  data-testid={`${testIdPrefix}-preset-${preset.id}`}
                  onClick={() => handleAspectPresetClick(preset)}
                  className={cx(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    selectedAspectId === preset.id
                      ? 'border-prime/60 bg-prime/10 text-prime'
                      : 'border-border bg-base-subtle text-ink-muted hover:border-border-bright hover:text-ink',
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
