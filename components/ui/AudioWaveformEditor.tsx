'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { useLocale } from '@/components/providers/locale-provider';
import { getLocalizedChoiceLabel } from '@/lib/tool-localization';

const MIN_SELECTION_SECONDS = 0.05;

interface AudioWaveformEditorProps {
  file: File;
  previewUrl: string;
  trimMode: string;
  outputFormat: string;
  startTime: number;
  endTime: number;
  onChange: (nextValues: { startTime?: number; endTime?: number }) => void;
}

type DragMode = 'start' | 'end' | 'range';

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatSeconds(value: number) {
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  const hundredths = Math.floor((value - Math.floor(value)) * 100);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

function normalizeSelection(start: number, end: number, duration: number) {
  const safeDuration = Math.max(duration, MIN_SELECTION_SECONDS);
  let nextStart = clamp(start, 0, safeDuration);
  let nextEnd = clamp(end, 0, safeDuration);

  if (nextEnd < nextStart) {
    [nextStart, nextEnd] = [nextEnd, nextStart];
  }

  if (nextEnd - nextStart < MIN_SELECTION_SECONDS) {
    if (nextEnd + MIN_SELECTION_SECONDS <= safeDuration) {
      nextEnd = nextStart + MIN_SELECTION_SECONDS;
    } else {
      nextStart = Math.max(0, nextEnd - MIN_SELECTION_SECONDS);
    }
  }

  return {
    startTime: Number(nextStart.toFixed(3)),
    endTime: Number(nextEnd.toFixed(3)),
  };
}

function buildPeaks(audioBuffer: AudioBuffer, bucketCount: number) {
  const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, index) => audioBuffer.getChannelData(index));
  const sampleCount = audioBuffer.length;
  const blockSize = Math.max(1, Math.floor(sampleCount / bucketCount));
  const peaks = new Array(bucketCount).fill(0);

  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
    const start = bucketIndex * blockSize;
    const end = Math.min(start + blockSize, sampleCount);
    let maxPeak = 0;

    for (const channel of channels) {
      for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
        const value = Math.abs(channel[sampleIndex] ?? 0);
        if (value > maxPeak) {
          maxPeak = value;
        }
      }
    }

    peaks[bucketIndex] = maxPeak;
  }

  return peaks;
}

export function AudioWaveformEditor({
  file,
  previewUrl,
  trimMode,
  outputFormat,
  startTime,
  endTime,
  onChange,
}: AudioWaveformEditorProps) {
  const { locale, messages } = useLocale();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onChangeRef = useRef(onChange);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [baseWidth, setBaseWidth] = useState(720);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [waveformError, setWaveformError] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{ mode: DragMode; anchor: number } | null>(null);

  const longFile = duration >= 600 || file.size >= 50 * 1024 * 1024;
  const normalizedSelection = useMemo(
    () => normalizeSelection(startTime, endTime || duration || MIN_SELECTION_SECONDS, duration || Math.max(endTime, 1)),
    [duration, endTime, startTime],
  );
  const safeDuration = Math.max(duration, normalizedSelection.endTime, MIN_SELECTION_SECONDS);
  const selectionDuration = Math.max(0, normalizedSelection.endTime - normalizedSelection.startTime);
  const outputDuration = trimMode === 'remove' ? Math.max(0, safeDuration - selectionDuration) : selectionDuration;
  const canvasWidth = Math.max(baseWidth, Math.round(baseWidth * zoom));
  const startPercent = safeDuration ? normalizedSelection.startTime / safeDuration : 0;
  const endPercent = safeDuration ? normalizedSelection.endTime / safeDuration : 0;
  const playheadPercent = safeDuration ? clamp(currentTime / safeDuration, 0, 1) : 0;
  const localizedTrimMode = getLocalizedChoiceLabel(
    trimMode === 'remove' ? 'Remove selection' : 'Keep selection',
    locale,
  );
  const localizedOutputFormat =
    outputFormat === 'keep' ? getLocalizedChoiceLabel('Keep original', locale) : outputFormat.toUpperCase();

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!scrollRef.current || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 720;
      setBaseWidth(Math.max(320, Math.floor(width)));
    });

    observer.observe(scrollRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadWaveform() {
      setLoading(true);
      setWaveformError(null);

      let audioContext: AudioContext | null = null;

      try {
        const AudioContextCtor =
          window.AudioContext ||
          (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

        if (!AudioContextCtor) {
          throw new Error('AudioContext unavailable');
        }

        audioContext = new AudioContextCtor();
        const buffer = await file.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(buffer.slice(0));
        const nextDuration = audioBuffer.duration;
        const nextPeaks = buildPeaks(audioBuffer, 1200);

        if (cancelled) {
          return;
        }

        setDuration(nextDuration);
        setPeaks(nextPeaks);
        setLoading(false);

        const nextSelection = normalizeSelection(startTime, endTime > 0 ? endTime : nextDuration, nextDuration);
        if (
          nextSelection.startTime !== Number(startTime.toFixed(3)) ||
          nextSelection.endTime !== Number(endTime.toFixed(3))
        ) {
          onChangeRef.current(nextSelection);
        }
      } catch {
        if (cancelled) {
          return;
        }

        setLoading(false);
        setWaveformError(messages.workbench.waveformError);
      } finally {
        if (audioContext) {
          void audioContext.close().catch(() => undefined);
        }
      }
    }

    void loadWaveform();

    return () => {
      cancelled = true;
    };
  }, [endTime, file, messages.workbench.waveformError, startTime]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks.length) {
      return;
    }

    const height = 168;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${height}px`;

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.scale(dpr, dpr);
    context.clearRect(0, 0, canvasWidth, height);
    context.fillStyle = 'rgba(255,255,255,0.03)';
    context.fillRect(0, 0, canvasWidth, height);

    const middle = height / 2;
    const barWidth = 2;
    const gap = 1;
    const barCount = Math.max(1, Math.floor(canvasWidth / (barWidth + gap)));

    for (let index = 0; index < barCount; index += 1) {
      const peakIndex = Math.floor((index / barCount) * peaks.length);
      const value = peaks[peakIndex] ?? 0;
      const barHeight = Math.max(4, value * (height * 0.84));
      const x = index * (barWidth + gap);
      const y = middle - barHeight / 2;

      context.fillStyle = 'rgba(136, 136, 160, 0.55)';
      context.fillRect(x, y, barWidth, barHeight);
    }
  }, [canvasWidth, peaks]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const onLoadedMetadata = () => {
      if (audio.duration && Number.isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);

      if (trimMode === 'keep' && audio.currentTime >= normalizedSelection.endTime) {
        audio.pause();
        audio.currentTime = normalizedSelection.endTime;
        setCurrentTime(normalizedSelection.endTime);
        setIsPlaying(false);
      }
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, [normalizedSelection.endTime, trimMode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isTyping =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement;
      const audio = audioRef.current;

      if (!audio || isTyping) {
        return;
      }

      if (event.code === 'Space') {
        event.preventDefault();
        if (audio.paused) {
          if (
            trimMode === 'keep' &&
            (audio.currentTime < normalizedSelection.startTime || audio.currentTime >= normalizedSelection.endTime)
          ) {
            audio.currentTime = normalizedSelection.startTime;
            setCurrentTime(normalizedSelection.startTime);
          }
          void audio.play();
        } else {
          audio.pause();
        }
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        audio.currentTime = clamp(audio.currentTime - 0.25, 0, safeDuration);
        setCurrentTime(audio.currentTime);
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        audio.currentTime = clamp(audio.currentTime + 0.25, 0, safeDuration);
        setCurrentTime(audio.currentTime);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [normalizedSelection.endTime, normalizedSelection.startTime, safeDuration, trimMode]);

  const updateSelection = (nextStart: number, nextEnd: number) => {
    onChangeRef.current(normalizeSelection(nextStart, nextEnd, safeDuration));
  };

  const getTimeFromClientX = (clientX: number) => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer || safeDuration <= 0) {
      return 0;
    }

    const rect = scrollContainer.getBoundingClientRect();
    const offsetX = clientX - rect.left + scrollContainer.scrollLeft;
    const ratio = clamp(offsetX / canvasWidth, 0, 1);
    return ratio * safeDuration;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (safeDuration <= 0) {
      return;
    }

    const time = getTimeFromClientX(event.clientX);
    const pixelX = (time / safeDuration) * canvasWidth;
    const startX = startPercent * canvasWidth;
    const endX = endPercent * canvasWidth;
    const handleThreshold = 12;
    let mode: DragMode = 'range';

    if (Math.abs(pixelX - startX) <= handleThreshold) {
      mode = 'start';
    } else if (Math.abs(pixelX - endX) <= handleThreshold) {
      mode = 'end';
    }

    setDragState({ mode, anchor: time });
    event.currentTarget.setPointerCapture(event.pointerId);

    if (mode === 'range') {
      updateSelection(time, time + MIN_SELECTION_SECONDS);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState) {
      return;
    }

    const time = getTimeFromClientX(event.clientX);

    if (dragState.mode === 'start') {
      updateSelection(time, normalizedSelection.endTime);
      return;
    }

    if (dragState.mode === 'end') {
      updateSelection(normalizedSelection.startTime, time);
      return;
    }

    updateSelection(dragState.anchor, time);
  };

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (audio.paused) {
      if (
        trimMode === 'keep' &&
        (audio.currentTime < normalizedSelection.startTime || audio.currentTime >= normalizedSelection.endTime)
      ) {
        audio.currentTime = normalizedSelection.startTime;
        setCurrentTime(normalizedSelection.startTime);
      }
      await audio.play();
      return;
    }

    audio.pause();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-ink-muted">{messages.workbench.waveformHint}</p>
            <button type="button" onClick={() => updateSelection(0, safeDuration)} className="btn-ghost px-3 py-2 text-xs">
              {messages.workbench.resetSelection}
            </button>
          </div>

          <div ref={scrollRef} className="overflow-x-auto rounded-xl border border-border bg-base-elevated">
            <div
              className="relative h-44 min-w-full touch-none select-none"
              style={{ width: `${canvasWidth}px` }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={() => setDragState(null)}
              onPointerCancel={() => setDragState(null)}
            >
              <canvas ref={canvasRef} className="absolute inset-0 h-full w-full cursor-crosshair" />
              {peaks.length > 0 ? (
                <>
                  <div
                    className="absolute inset-y-0 border-x border-prime/40 bg-prime/12"
                    style={{
                      left: `${startPercent * 100}%`,
                      width: `${Math.max((endPercent - startPercent) * 100, 0.5)}%`,
                    }}
                  />
                  <div className="absolute inset-y-0 w-0.5 bg-prime" style={{ left: `${startPercent * 100}%` }} />
                  <div className="absolute inset-y-0 w-0.5 bg-prime" style={{ left: `${endPercent * 100}%` }} />
                  <div className="absolute inset-y-0 w-0.5 bg-accent shadow-glow-accent" style={{ left: `${playheadPercent * 100}%` }} />
                </>
              ) : null}
              {loading ? (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-muted">
                  {messages.workbench.waveformLoading}
                </div>
              ) : null}
              {waveformError ? (
                <div className="absolute inset-x-4 bottom-4 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
                  {waveformError}
                </div>
              ) : null}
            </div>
          </div>

          <audio ref={audioRef} src={previewUrl} controls className="w-full" preload="metadata" />
        </div>

        <div className="space-y-3 rounded-xl border border-border bg-base-elevated p-4">
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={() => void togglePlayback()} className="btn-primary px-4 py-2 text-xs">
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              {isPlaying ? messages.workbench.pause : messages.workbench.play}
            </button>
            <span className="badge border border-border bg-base-subtle text-ink-muted">
              {localizedTrimMode} | {localizedOutputFormat}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs uppercase tracking-[0.16em] text-ink-faint">
              {messages.workbench.startTime}
              <input
                type="number"
                min={0}
                max={safeDuration}
                step={0.01}
                value={normalizedSelection.startTime.toFixed(2)}
                onChange={(event) => updateSelection(Number(event.target.value), normalizedSelection.endTime)}
                className="input-surface mt-1 w-full"
              />
            </label>
            <label className="text-xs uppercase tracking-[0.16em] text-ink-faint">
              {messages.workbench.endTime}
              <input
                type="number"
                min={0}
                max={safeDuration}
                step={0.01}
                value={normalizedSelection.endTime.toFixed(2)}
                onChange={(event) => updateSelection(normalizedSelection.startTime, Number(event.target.value))}
                className="input-surface mt-1 w-full"
              />
            </label>
          </div>

          <label className="block text-xs uppercase tracking-[0.16em] text-ink-faint">
            {messages.workbench.zoom}
            <input
              type="range"
              min={1}
              max={4}
              step={0.25}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="mt-2 w-full accent-cyan-400"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div className="card p-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint">{messages.workbench.currentTime}</p>
              <p className="mt-2 text-sm font-semibold text-ink">{formatSeconds(currentTime)}</p>
            </div>
            <div className="card p-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint">{messages.workbench.totalDuration}</p>
              <p className="mt-2 text-sm font-semibold text-ink">{formatSeconds(safeDuration)}</p>
            </div>
            <div className="card p-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint">{messages.workbench.selectionDuration}</p>
              <p className="mt-2 text-sm font-semibold text-ink">{formatSeconds(selectionDuration)}</p>
            </div>
            <div className="card p-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint">{messages.workbench.outputDuration}</p>
              <p className="mt-2 text-sm font-semibold text-ink">{formatSeconds(outputDuration)}</p>
            </div>
          </div>

          {longFile ? (
            <div className="rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
              {messages.workbench.memoryWarning}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
