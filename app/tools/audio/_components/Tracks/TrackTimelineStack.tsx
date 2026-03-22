'use client';

import { FolderPlus, Mic, Music4, Play, Radio } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocale } from '@/components/providers/locale-provider';
import { useTheme } from '@/components/providers/theme-provider';
import { renderWaveformOffscreen } from '@/lib/audio';
import { clamp, formatTime } from '../audio-editor-utils';
import { WaveformTimeline } from '../Waveform/WaveformTimeline';
import type { AudioTrackListItem, AudioTrackSource } from './TrackListPanel';

interface TrackTimelineItem extends AudioTrackListItem {
  buffer: AudioBuffer;
}

interface TrackTimelineStackProps {
  tracks: TrackTimelineItem[];
  duration: number;
  currentTime: number;
  zoom: number;
  onSelectTrack?: (trackId: string) => void;
  onAddTracks?: () => void;
  onPreviewMix?: () => void;
}

function getSourceIcon(source: AudioTrackSource) {
  switch (source) {
    case 'recording':
      return Mic;
    case 'generated':
      return Radio;
    default:
      return Music4;
  }
}

function getCopy(locale: string) {
  if (locale === 'ko') {
    return {
      title: '트랙 타임라인',
      subtitle: '모든 트랙을 한 화면에서 비교하고 선택할 수 있습니다.',
      addTracks: '트랙 추가',
      previewMix: '믹스 미리듣기',
      empty: '표시할 트랙이 없습니다.',
      active: '편집 중',
      edit: '편집',
      file: '파일',
      recording: '녹음',
      generated: '생성',
      mixdown: '믹스다운',
      track: '트랙',
      start: '시작',
      muted: '뮤트',
      solo: '솔로',
    };
  }

  return {
    title: 'Track timeline',
    subtitle: 'Review every track on one shared timeline and jump into the one you want to edit.',
    addTracks: 'Add tracks',
    previewMix: 'Preview mix',
    empty: 'No tracks to show yet.',
    active: 'Editing',
    edit: 'Edit',
    file: 'File',
    recording: 'Recording',
    generated: 'Generated',
    mixdown: 'Mixdown',
    track: 'Track',
    start: 'Start',
    muted: 'Muted',
    solo: 'Solo',
  };
}

function getSourceLabel(source: AudioTrackSource, locale: string) {
  const copy = getCopy(locale);

  switch (source) {
    case 'file':
      return copy.file;
    case 'recording':
      return copy.recording;
    case 'generated':
      return copy.generated;
    case 'mixdown':
      return copy.mixdown;
    default:
      return copy.track;
  }
}

interface LaneCanvasProps {
  track: TrackTimelineItem;
  duration: number;
  currentTime: number;
  width: number;
  height: number;
  theme: 'light' | 'dark';
}

function LaneCanvas({ track, duration, currentTime, width, height, theme }: LaneCanvasProps) {
  const [canvasNode, setCanvasNode] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasNode) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    canvasNode.width = Math.round(width * dpr);
    canvasNode.height = Math.round(height * dpr);
    canvasNode.style.width = `${width}px`;
    canvasNode.style.height = `${height}px`;

    const context = canvasNode.getContext('2d');
    if (!context) {
      return;
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.scale(dpr, dpr);
    context.clearRect(0, 0, width, height);

    const palette = {
      background: theme === 'dark' ? 'rgba(10, 26, 25, 0.9)' : 'rgba(240, 249, 255, 0.9)',
      border: theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
      playhead: theme === 'dark' ? '#00D4C8' : '#0F766E',
      activeTint: theme === 'dark' ? 'rgba(0,212,200,0.16)' : 'rgba(20,184,166,0.12)',
      mutedTint: theme === 'dark' ? 'rgba(2,6,23,0.58)' : 'rgba(255,255,255,0.4)',
      soloBorder: theme === 'dark' ? 'rgba(0,212,200,0.65)' : 'rgba(13,148,136,0.55)',
    };

    context.fillStyle = palette.background;
    context.fillRect(0, 0, width, height);

    context.strokeStyle = palette.border;
    context.lineWidth = 1;
    context.strokeRect(0.5, 0.5, width - 1, height - 1);

    const safeDuration = Math.max(duration, 0.001);
    const laneX = clamp((track.startTime / safeDuration) * width, 0, width);
    const laneWidth = Math.max(2, (track.buffer.duration / safeDuration) * width);
    const waveformSource = renderWaveformOffscreen(track.buffer, Math.max(512, Math.round(laneWidth)), height, theme);

    context.save();
    context.beginPath();
    context.rect(laneX, 0, Math.min(laneWidth, width - laneX), height);
    context.clip();
    context.drawImage(waveformSource as CanvasImageSource, laneX, 0, laneWidth, height);
    context.restore();

    if (track.isActive) {
      context.fillStyle = palette.activeTint;
      context.fillRect(laneX, 0, Math.min(laneWidth, width - laneX), height);
    }

    if (track.solo) {
      context.strokeStyle = palette.soloBorder;
      context.lineWidth = 2;
      context.strokeRect(laneX + 1, 1, Math.max(1, Math.min(laneWidth, width - laneX) - 2), height - 2);
    }

    if (track.muted) {
      context.fillStyle = palette.mutedTint;
      context.fillRect(laneX, 0, Math.min(laneWidth, width - laneX), height);
    }

    const playheadX = clamp((currentTime / safeDuration) * width, 0, width);
    context.fillStyle = palette.playhead;
    context.fillRect(Math.max(0, playheadX - 1), 0, 2, height);
  }, [canvasNode, currentTime, duration, height, theme, track, width]);

  return <canvas ref={setCanvasNode} className="block h-full w-full" />;
}

export function TrackTimelineStack({
  tracks,
  duration,
  currentTime,
  zoom,
  onSelectTrack,
  onAddTracks,
  onPreviewMix,
}: TrackTimelineStackProps) {
  const { locale } = useLocale();
  const { theme } = useTheme();
  const copy = getCopy(locale);
  const [viewportNode, setViewportNode] = useState<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const canvasWidth = Math.max(320, Math.round(Math.max(viewportWidth, 320) * zoom));
  const contentWidth = Math.max(canvasWidth - 32, 288);
  const safeDuration = Math.max(duration, 0.001);

  useEffect(() => {
    if (!viewportNode || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? 0;
      setViewportWidth(Math.max(320, Math.floor(nextWidth)));
    });

    observer.observe(viewportNode);
    return () => observer.disconnect();
  }, [viewportNode]);

  return (
    <section data-testid="audio-track-timeline-stack" className="audio-panel overflow-hidden rounded-[20px]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-4">
        <div>
          <p className="audio-section-kicker">{copy.title}</p>
          <h2 className="mt-1 text-sm font-medium text-[var(--text-primary)]">{copy.subtitle}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {onAddTracks ? (
            <button type="button" onClick={onAddTracks} className="audio-button-secondary audio-focus-ring h-9 px-3">
              <FolderPlus size={14} strokeWidth={1.5} />
              {copy.addTracks}
            </button>
          ) : null}
          {onPreviewMix && tracks.length > 1 ? (
            <button type="button" onClick={onPreviewMix} className="audio-button-secondary audio-focus-ring h-9 px-3">
              <Play size={14} strokeWidth={1.5} />
              {copy.previewMix}
            </button>
          ) : null}
        </div>
      </div>

      <div ref={setViewportNode} className={`bg-[var(--waveform-bg)] ${canvasWidth > viewportWidth + 1 ? 'overflow-x-auto' : 'overflow-x-hidden'}`}>
        <div style={{ width: `${canvasWidth}px` }} className="min-w-full">
          <div className="px-4 pt-4">
            <div style={{ width: `${contentWidth}px` }}>
              <WaveformTimeline duration={safeDuration} zoom={zoom} />
            </div>
          </div>

          {tracks.length === 0 ? (
            <div className="px-4 py-6 text-sm text-[var(--text-secondary)]">{copy.empty}</div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {tracks.map((track) => {
                const SourceIcon = getSourceIcon(track.source);
                const sourceLabel = getSourceLabel(track.source, locale);

                return (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() => onSelectTrack?.(track.id)}
                    data-testid="audio-track-stack-row"
                    className={`block w-full text-left transition ${
                      track.isActive ? 'bg-[rgba(0,212,200,0.06)]' : 'bg-transparent hover:bg-[var(--surface-muted)]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium text-[var(--text-primary)]">{track.name}</span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-secondary)]">
                            <SourceIcon size={11} strokeWidth={1.5} />
                            {sourceLabel}
                          </span>
                          {track.muted ? (
                            <span className="rounded-full border border-[rgba(255,77,77,0.35)] px-2 py-1 text-[11px] text-[var(--status-recording)]">
                              {copy.muted}
                            </span>
                          ) : null}
                          {track.solo ? (
                            <span className="rounded-full border border-[var(--accent)] px-2 py-1 text-[11px] text-[var(--accent)]">
                              {copy.solo}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)]">
                        <span className="audio-mono">{copy.start} {formatTime(track.startTime)}</span>
                        <span className="audio-mono">{formatTime(track.buffer.duration)}</span>
                        <span
                          className={`rounded-full border px-2 py-1 ${
                            track.isActive
                              ? 'border-[var(--accent)] text-[var(--accent)]'
                              : 'border-[var(--border)] text-[var(--text-secondary)]'
                          }`}
                        >
                          {track.isActive ? copy.active : copy.edit}
                        </span>
                      </div>
                    </div>

                    <div className="px-4 pb-4">
                      <div className="h-16 overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--surface-muted)]">
                        <LaneCanvas
                          track={track}
                          duration={safeDuration}
                          currentTime={currentTime}
                          width={contentWidth}
                          height={64}
                          theme={theme}
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
