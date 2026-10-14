'use client';

import { Magnet, Music, Pause, Play, SkipBack } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useLocale } from '@/components/providers/locale-provider';
import { useObjectUrl } from '@/components/tool-ui/pdf-stage-previews';
import { useFilmstrip } from '@/components/ui/use-filmstrip';
import { formatEditorTime, resolveMediaDuration } from '@/components/ui/video-editor-utils';
import { decodeAudioBlobToBuffer } from '@/lib/audio/AudioEngine';
import { renderWaveformOffscreen } from '@/lib/audio/WaveformRenderer';
import { cx } from '@/lib/utils';
import {
  clipLength,
  dragClip,
  fitClipToVideo,
  normalizeClip,
  type AudioClip,
  type ClipDrag,
} from '@/lib/video-audio-timeline';

export type AudioClipValues = { offset: number; audioStart: number; audioEnd: number };

type VideoAudioEditorProps = {
  videoFile: File;
  audioFile: File;
  offset: number;
  audioStart: number;
  audioEnd: number;
  /** "replace" mutes the video's own sound in the preview. */
  mode: string;
  volume: number;
  originalVolume: number;
  onClipChange: (next: AudioClipValues) => void;
  onVideoDuration?: (seconds: number) => void;
};

/** How close, in pixels, a dragged edge comes before it sticks. */
const SNAP_PIXELS = 10;
/** The timeline shows a little past the video's end, where a clip gets cut. */
const TIMELINE_OVERHANG = 1.2;
const FILMSTRIP_FRAMES = 8;

const COPY = {
  en: {
    editor: 'Audio timeline',
    play: 'Play',
    pause: 'Pause',
    restart: 'Back to start',
    fit: 'Fit to video',
    fitTitle: 'Start the audio with the video and end it with the video',
    toPlayhead: 'Move to playhead',
    video: 'Video',
    audio: 'Audio',
    clip: 'Audio clip: drag to move, arrow keys to nudge',
    trimStart: 'Audio clip start: drag to trim',
    trimEnd: 'Audio clip end: drag to trim',
    position: 'Starts at',
    range: 'Uses',
    length: 'Length',
    cut: 'Cut at the video end',
    loading: 'Reading the audio…',
    unreadable: 'This audio cannot be shown here, but it can still be added.',
    hint: 'Drag the clip to move it, its edges to trim it. Edges stick to the video start, its end and the playhead.',
  },
  ko: {
    editor: '오디오 타임라인',
    play: '재생',
    pause: '일시정지',
    restart: '처음으로',
    fit: '영상 길이에 맞추기',
    fitTitle: '오디오가 영상과 함께 시작해서 함께 끝나게 맞춰요',
    toPlayhead: '재생 위치로 옮기기',
    video: '영상',
    audio: '오디오',
    clip: '오디오 클립: 끌어서 옮기기, 화살표 키로 미세 이동',
    trimStart: '오디오 클립 시작: 끌어서 자르기',
    trimEnd: '오디오 클립 끝: 끌어서 자르기',
    position: '시작 위치',
    range: '사용 구간',
    length: '길이',
    cut: '영상 끝에서 잘려요',
    loading: '오디오를 읽는 중…',
    unreadable: '이 오디오는 여기서 파형을 보여줄 수 없지만, 영상에 넣을 수는 있어요.',
    hint: '클립을 끌어 옮기고, 양 끝을 끌어 잘라요. 끝이 영상 시작·끝과 재생 위치에 자석처럼 붙어요.',
  },
} as const;

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    setWidth(element.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

const isDarkTheme = () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

/**
 * Places an audio clip on a video, the way video editors do: a waveform box
 * under the video's filmstrip that moves when dragged, trims from either end,
 * and sticks to the video's start, end and the playhead. The preview plays
 * the clip in time with the video.
 */
export function VideoAudioEditor(props: VideoAudioEditorProps) {
  const { videoFile, audioFile, mode, volume, originalVolume, onClipChange, onVideoDuration } = props;
  const { locale } = useLocale();
  const copy = COPY[locale];
  const videoUrl = useObjectUrl(videoFile);
  const audioUrl = useObjectUrl(audioFile);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [trackRef, trackWidth] = useElementWidth<HTMLDivElement>();

  const [videoDuration, setVideoDuration] = useState(0);
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioState, setAudioState] = useState<'loading' | 'ready' | 'unreadable'>('loading');
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [guide, setGuide] = useState<number | null>(null);
  const dragRef = useRef<{ kind: ClipDrag; pointerX: number; origin: AudioClip } | null>(null);
  const fittedRef = useRef(false);

  const frames = useFilmstrip(videoUrl ?? '', videoDuration, videoSize, FILMSTRIP_FRAMES);
  const ready = videoDuration > 0 && audioDuration > 0;
  const bounds = useMemo(() => ({ audioDuration: audioDuration || 1, videoDuration: videoDuration || 1 }), [audioDuration, videoDuration]);
  const clip = normalizeClip({ offset: props.offset, start: props.audioStart, end: props.audioEnd }, bounds);
  const length = clipLength(clip);
  const range = Math.max(videoDuration * TIMELINE_OVERHANG, 0.1);
  const pxPerSecond = trackWidth > 0 ? trackWidth / range : 1;
  const clipRef = useRef(clip);
  clipRef.current = clip;

  const commit = useCallback(
    (next: AudioClip) => onClipChange({ offset: next.offset, audioStart: next.start, audioEnd: next.end }),
    [onClipChange],
  );

  // Read the audio: its length, and samples for the waveform. A file the
  // browser cannot decode still has a length from an <audio> element.
  useEffect(() => {
    let cancelled = false;
    setAudioState('loading');
    setBuffer(null);
    decodeAudioBlobToBuffer(audioFile)
      .then((decoded) => {
        if (cancelled) return;
        setBuffer(decoded);
        setAudioDuration(decoded.duration);
        setAudioState('ready');
      })
      .catch(() => {
        if (!cancelled) setAudioState('unreadable');
      });
    return () => {
      cancelled = true;
    };
  }, [audioFile]);

  // The first time both lengths are known, the clip fills the video.
  useEffect(() => {
    if (ready && !fittedRef.current) {
      fittedRef.current = true;
      commit(fitClipToVideo({ offset: 0, start: 0, end: 0 }, { audioDuration, videoDuration }));
    }
  }, [audioDuration, commit, ready, videoDuration]);

  const handleVideoMetadata = async () => {
    const video = videoRef.current;
    if (!video) return;
    setVideoSize({ width: video.videoWidth, height: video.videoHeight });
    const seconds = await resolveMediaDuration(video);
    setVideoDuration(seconds);
    onVideoDuration?.(seconds);
  };

  // Keep the clip's sound in step with the picture.
  const sync = useCallback(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio) return;
    const { offset, start } = clipRef.current;
    const t = video.currentTime;
    const inside = !video.paused && t >= offset && t < offset + clipLength(clipRef.current);
    if (!inside) {
      if (!audio.paused) audio.pause();
      return;
    }
    const target = start + (t - offset);
    if (audio.paused) {
      audio.currentTime = target;
      void audio.play().catch(() => undefined);
    } else if (Math.abs(audio.currentTime - target) > 0.25) {
      audio.currentTime = target;
    }
  }, []);

  useEffect(() => {
    if (!playing) {
      audioRef.current?.pause();
      return;
    }
    let frame = 0;
    const tick = () => {
      const video = videoRef.current;
      if (video) setCurrentTime(video.currentTime);
      sync();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, sync]);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (video) {
      video.muted = mode !== 'mix';
      video.volume = Math.min(1, Math.max(0, originalVolume));
    }
    if (audio) audio.volume = Math.min(1, Math.max(0, volume));
  }, [mode, originalVolume, volume, videoUrl, audioUrl]);

  const seekTo = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const next = Math.min(Math.max(0, seconds), videoDuration || 0);
    video.currentTime = next;
    setCurrentTime(next);
    audioRef.current?.pause();
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (video.currentTime >= videoDuration - 0.05) video.currentTime = 0;
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  };

  // Draw the part of the waveform the clip uses, where it shows on the track.
  const visibleFrom = Math.max(0, clip.offset);
  const visibleTo = Math.min(range, clip.offset + length);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer || trackWidth <= 0) return;
    const cssWidth = Math.max(1, (visibleTo - visibleFrom) * pxPerSecond);
    const cssHeight = canvas.clientHeight || 48;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(cssWidth * ratio));
    canvas.height = Math.max(1, Math.round(cssHeight * ratio));
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const theme = isDarkTheme() ? 'dark' : 'light';
    const source = renderWaveformOffscreen(buffer, 2048, canvas.height, theme, theme === 'dark' ? '#c7d2fe' : '#4338ca');
    const fromSeconds = clip.start + (visibleFrom - clip.offset);
    const toSeconds = clip.start + (visibleTo - clip.offset);
    const sx = (fromSeconds / buffer.duration) * source.width;
    const sw = Math.max(1, ((toSeconds - fromSeconds) / buffer.duration) * source.width);
    context.drawImage(source as CanvasImageSource, sx, 0, sw, source.height, 0, 0, canvas.width, canvas.height);
  }, [buffer, clip.offset, clip.start, pxPerSecond, trackWidth, visibleFrom, visibleTo]);

  const snapContext = (extraPoints: number[] = []) => ({
    ...bounds,
    snapPoints: [0, videoDuration, currentTime, ...extraPoints],
    snapThreshold: SNAP_PIXELS / pxPerSecond,
  });

  const startDrag = (kind: ClipDrag) => (event: PointerEvent<HTMLElement>) => {
    if (!ready || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { kind, pointerX: event.clientX, origin: clip };
  };

  const moveDrag = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = (event.clientX - drag.pointerX) / pxPerSecond;
    const result = dragClip(drag.origin, drag.kind, delta, snapContext());
    setGuide(result.guide);
    commit(result.clip);
  };

  const endDrag = (event: PointerEvent<HTMLElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setGuide(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const nudge = (kind: ClipDrag) => (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    event.stopPropagation();
    const step = (event.shiftKey ? 1 : 0.1) * (event.key === 'ArrowLeft' ? -1 : 1);
    commit(dragClip(clip, kind, step, { ...snapContext(), snapThreshold: 0 }).clip);
  };

  const seekFromTrack = (event: PointerEvent<HTMLDivElement>) => {
    if (!ready || event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    seekTo((event.clientX - rect.left) / pxPerSecond);
  };

  const x = (seconds: number) => seconds * pxPerSecond;
  const clipLeft = x(clip.offset);
  const clipWidth = Math.max(4, x(length));
  const videoEndX = x(videoDuration);
  const runsPastVideo = clip.offset + length > videoDuration + 0.01;

  return (
    <div className="space-y-3" data-testid="add-audio-editor" aria-label={copy.editor}>
      <div className="overflow-hidden rounded-xl bg-black">
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            preload="metadata"
            playsInline
            onLoadedMetadata={() => void handleVideoMetadata()}
            onPlay={() => setPlaying(true)}
            onPause={() => {
              setPlaying(false);
              setCurrentTime(videoRef.current?.currentTime ?? 0);
            }}
            onSeeked={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
            onClick={togglePlay}
            className="mx-auto block max-h-[24rem] max-w-full cursor-pointer"
          />
        ) : null}
        {audioUrl ? (
          <audio
            ref={audioRef}
            src={audioUrl}
            preload="auto"
            className="hidden"
            // A file the waveform reader cannot decode still has a length here.
            onLoadedMetadata={(event) => {
              const seconds = event.currentTarget.duration;
              if (Number.isFinite(seconds) && seconds > 0) setAudioDuration((current) => current || seconds);
            }}
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => seekTo(0)} aria-label={copy.restart} title={copy.restart} className="btn-ghost h-9 w-9 p-0">
          <SkipBack size={15} />
        </button>
        <button type="button" onClick={togglePlay} aria-label={playing ? copy.pause : copy.play} className="btn-primary h-9 w-9 p-0">
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <span className="ml-1 font-mono text-sm tabular-nums text-ink">
          {formatEditorTime(currentTime)}
          <span className="text-ink-faint"> / {formatEditorTime(videoDuration)}</span>
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={!ready}
            onClick={() => commit(normalizeClip({ ...clip, offset: currentTime }, bounds))}
            className="btn-ghost h-9 px-2.5 text-xs"
            data-testid="add-audio-to-playhead"
          >
            {copy.toPlayhead}
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={() => commit(fitClipToVideo(clip, bounds))}
            title={copy.fitTitle}
            className="btn-ghost h-9 px-2.5 text-xs"
            data-testid="add-audio-fit"
          >
            <Magnet size={14} aria-hidden="true" />
            {copy.fit}
          </button>
        </div>
      </div>

      <div className="flex select-none gap-2 rounded-xl border border-border bg-base-subtle/60 p-2">
        <div className="flex w-12 shrink-0 flex-col gap-1.5 text-[11px] font-medium text-ink-faint">
          <span className="flex h-12 items-center">{copy.video}</span>
          <span className="flex h-14 items-center">{copy.audio}</span>
        </div>
        <div ref={trackRef} className="relative min-w-0 flex-1 space-y-1.5">
          <div className="relative h-12">
            <div
              className="absolute inset-y-0 left-0 flex cursor-pointer overflow-hidden rounded-md bg-base-elevated"
              style={{ width: videoEndX }}
              onPointerDown={seekFromTrack}
              aria-hidden="true"
            >
              {frames.map((frame, index) => (
                // eslint-disable-next-line @next/next/no-img-element -- data-URL frames
                <img key={index} src={frame} alt="" className="h-full min-w-0 flex-1 object-cover" draggable={false} />
              ))}
            </div>
          </div>
          <div className="relative h-14 overflow-hidden rounded-md bg-base-elevated/60" onPointerDown={seekFromTrack}>
            {/* Past the video's end: the part of a clip there is cut. */}
            <div className="pointer-events-none absolute inset-y-0 right-0 bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgba(127,127,127,0.12)_6px_12px)]" style={{ left: videoEndX }} />
            {audioState === 'ready' ? (
              <canvas
                ref={canvasRef}
                className="pointer-events-none absolute top-1 h-12"
                style={{ left: x(visibleFrom), width: Math.max(1, x(visibleTo - visibleFrom)) }}
                aria-hidden="true"
              />
            ) : null}
            {ready ? (
              <div
                role="slider"
                tabIndex={0}
                aria-label={copy.clip}
                aria-valuemin={0}
                aria-valuemax={Math.round(videoDuration * 100) / 100}
                aria-valuenow={clip.offset}
                aria-valuetext={formatEditorTime(clip.offset)}
                onPointerDown={startDrag('move')}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={nudge('move')}
                className="group absolute inset-y-1 cursor-grab touch-none rounded-md border-2 border-emerald-500/80 bg-emerald-500/15 outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-prime"
                style={{ left: clipLeft, width: clipWidth }}
                data-testid="add-audio-clip"
              >
                <span className="pointer-events-none absolute left-3 top-0.5 flex max-w-[calc(100%-1.5rem)] items-center gap-1 truncate text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                  <Music size={10} aria-hidden="true" />
                  <span className="truncate">{audioFile.name}</span>
                </span>
                {(['start', 'end'] as const).map((edge) => (
                  <span
                    key={edge}
                    role="slider"
                    tabIndex={0}
                    aria-label={edge === 'start' ? copy.trimStart : copy.trimEnd}
                    aria-valuemin={0}
                    aria-valuemax={Math.round(audioDuration * 100) / 100}
                    aria-valuenow={edge === 'start' ? clip.start : clip.end}
                    aria-valuetext={formatEditorTime(edge === 'start' ? clip.start : clip.end)}
                    onPointerDown={startDrag(edge)}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onKeyDown={nudge(edge)}
                    className={cx(
                      'absolute inset-y-0 flex w-3 cursor-ew-resize touch-none items-center justify-center bg-emerald-500/80 outline-none focus-visible:bg-prime',
                      edge === 'start' ? 'left-0 rounded-l-[4px]' : 'right-0 rounded-r-[4px]',
                    )}
                    data-testid={`add-audio-handle-${edge}`}
                  >
                    <span className="h-5 w-0.5 rounded-full bg-white/90" />
                  </span>
                ))}
              </div>
            ) : (
              <p className="absolute inset-0 flex items-center px-3 text-xs text-ink-faint">
                {audioState === 'unreadable' ? copy.unreadable : copy.loading}
              </p>
            )}
            {/* The part of the clip past the video's end is cut: shade it. */}
            {runsPastVideo ? (
              <div className="pointer-events-none absolute inset-y-0 right-0 bg-black/35 dark:bg-black/45" style={{ left: videoEndX }} aria-hidden="true" />
            ) : null}
          </div>
          {/* Playhead and snap guide over both tracks. */}
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.45)]" style={{ left: x(currentTime) }} />
            {guide !== null ? (
              <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-amber-400" style={{ left: x(guide) }} data-testid="add-audio-guide" />
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-sm">
        <div className="min-w-0">
          <span className="block text-xs text-ink-faint">{copy.position}</span>
          <p className="mt-1 font-mono font-semibold tabular-nums text-ink" data-testid="add-audio-position">
            {formatEditorTime(clip.offset)}
          </p>
        </div>
        <div className="min-w-0">
          <span className="block text-xs text-ink-faint">{copy.range}</span>
          <p className="mt-1 font-mono font-semibold tabular-nums text-ink" data-testid="add-audio-range">
            {formatEditorTime(clip.start)}–{formatEditorTime(clip.end)}
          </p>
        </div>
        <div className="min-w-0">
          <span className="block text-xs text-ink-faint">{copy.length}</span>
          <p className="mt-1 font-mono font-semibold tabular-nums text-ink" data-testid="add-audio-length">
            {formatEditorTime(length)}
          </p>
        </div>
      </div>
      <p className="text-xs text-ink-faint">{runsPastVideo ? `${copy.cut}. ` : ''}{copy.hint}</p>
    </div>
  );
}
