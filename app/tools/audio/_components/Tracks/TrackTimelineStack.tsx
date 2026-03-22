'use client';

import { FolderPlus, GripHorizontal, Mic, Music4, Play, Radio } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from '@/components/providers/locale-provider';
import { useTheme } from '@/components/providers/theme-provider';
import { renderWaveformOffscreen } from '@/lib/audio';
import { clamp, formatTime } from '../audio-editor-utils';
import { WaveformTimeline } from '../Waveform/WaveformTimeline';
import type { AudioTrackListItem, AudioTrackSource } from './TrackListPanel';

type SelectionHandle = 'start' | 'end';

interface TrackTimelineItem extends AudioTrackListItem {
  buffer: AudioBuffer | null;
}

interface TrackTimelineStackProps {
  tracks: TrackTimelineItem[];
  duration: number;
  currentTime: number;
  zoom: number;
  selectionStart?: number;
  selectionEnd?: number;
  onSelectTrack?: (trackId: string) => void;
  onSeek?: (time: number, trackId?: string) => void;
  onSelectionChange?: (trackId: string, nextSelection: { start: number; end: number }) => void;
  onMoveTrack?: (trackId: string, nextStartTime: number) => void;
  onAddTrack?: () => void;
  onPreviewMix?: () => void;
}

type InteractionState =
  | null
  | {
      kind: 'move-playhead';
    }
  | {
      kind: 'move-track';
      trackId: string;
      clipDuration: number;
      pointerOffsetTime: number;
    }
  | {
      kind: 'selection';
      trackId: string;
      trackStartTime: number;
      trackDuration: number;
      anchorTime: number;
      handle: SelectionHandle | null;
    };

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
      title: '멀티트랙 타임라인',
      subtitle: '트랙 블록을 옮기고, 편집할 트랙을 바로 선택하세요.',
      addTrack: '빈 트랙 추가',
      previewMix: '믹스 미리듣기',
      empty: '트랙이 아직 없습니다.',
      emptyTrack: '빈 트랙',
      active: '편집 중',
      edit: '편집',
      file: '파일',
      recording: '녹음',
      generated: '생성',
      start: '시작',
      muted: '뮤트',
      solo: '솔로',
      dragTrack: '트랙 위치 이동',
      laneHint: '클립을 잡아 좌우로 옮기고, 파형에서 클릭하거나 드래그해 재생 위치와 선택 구간을 정리하세요.',
    };
  }

  return {
    title: 'Multitrack timeline',
    subtitle: 'Move clips like blocks, then jump into the track you want to edit.',
    addTrack: 'Add empty track',
    previewMix: 'Preview mix',
    empty: 'No tracks yet.',
    emptyTrack: 'Empty track',
    active: 'Editing',
    edit: 'Edit',
    file: 'File',
    recording: 'Recording',
    generated: 'Generated',
    start: 'Start',
    muted: 'Muted',
    solo: 'Solo',
    dragTrack: 'Move track clip',
    laneHint: 'Drag the clip to reposition it. Click or drag inside the waveform to place the playhead and selection.',
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
    default:
      return copy.emptyTrack;
  }
}

function ClipWaveform({
  audioBuffer,
  width,
  height,
  theme,
  isMuted,
}: {
  audioBuffer: AudioBuffer;
  width: number;
  height: number;
  theme: 'light' | 'dark';
  isMuted: boolean;
}) {
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

    const source = renderWaveformOffscreen(audioBuffer, Math.max(256, Math.round(width)), height, theme);
    context.drawImage(source as CanvasImageSource, 0, 0, width, height);

    if (isMuted) {
      context.fillStyle = theme === 'dark' ? 'rgba(2, 6, 23, 0.5)' : 'rgba(255, 255, 255, 0.45)';
      context.fillRect(0, 0, width, height);
    }
  }, [audioBuffer, canvasNode, height, isMuted, theme, width]);

  return <canvas ref={setCanvasNode} className="block h-full w-full" />;
}

export function TrackTimelineStack({
  tracks,
  duration,
  currentTime,
  zoom,
  selectionStart = 0,
  selectionEnd = 0,
  onSelectTrack,
  onSeek,
  onSelectionChange,
  onMoveTrack,
  onAddTrack,
  onPreviewMix,
}: TrackTimelineStackProps) {
  const { locale } = useLocale();
  const { theme } = useTheme();
  const copy = getCopy(locale);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [interaction, setInteraction] = useState<InteractionState>(null);
  const contentPadding = 24;
  const maxTrackEnd = useMemo(
    () =>
      tracks.reduce((maxValue, track) => Math.max(maxValue, track.startTime + (track.buffer?.duration ?? 0.6)), 0),
    [tracks],
  );
  const safeDuration = Math.max(duration, maxTrackEnd, 1);
  const canvasWidth = Math.max(520, Math.round(Math.max(viewportWidth, 520) * zoom));
  const contentWidth = Math.max(canvasWidth - contentPadding * 2, 320);
  const playheadLeft = contentPadding + clamp(currentTime / safeDuration, 0, 1) * contentWidth;

  useEffect(() => {
    if (!viewportRef.current || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? 0;
      setViewportWidth(Math.max(520, Math.floor(nextWidth)));
    });

    observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, []);

  const getProjectTimeFromClientX = (clientX: number) => {
    const viewportNode = viewportRef.current;
    if (!viewportNode) {
      return 0;
    }

    const rect = viewportNode.getBoundingClientRect();
    const x = clamp(clientX - rect.left + viewportNode.scrollLeft - contentPadding, 0, contentWidth);
    return clamp((x / contentWidth) * safeDuration, 0, safeDuration);
  };

  useEffect(() => {
    if (!interaction) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const projectTime = getProjectTimeFromClientX(event.clientX);

      if (interaction.kind === 'move-playhead') {
        onSeek?.(projectTime);
        return;
      }

      if (interaction.kind === 'move-track') {
        const nextStartTime = clamp(projectTime - interaction.pointerOffsetTime, 0, safeDuration - interaction.clipDuration);
        onMoveTrack?.(interaction.trackId, Number(nextStartTime.toFixed(3)));
        return;
      }

      const localTime = clamp(projectTime - interaction.trackStartTime, 0, interaction.trackDuration);

      if (interaction.handle === 'start') {
        onSelectionChange?.(interaction.trackId, {
          start: localTime,
          end: selectionEnd,
        });
        return;
      }

      if (interaction.handle === 'end') {
        onSelectionChange?.(interaction.trackId, {
          start: selectionStart,
          end: localTime,
        });
        return;
      }

      onSelectionChange?.(interaction.trackId, {
        start: interaction.anchorTime,
        end: localTime,
      });
    };

    const handlePointerUp = () => {
      setInteraction(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [contentWidth, interaction, onMoveTrack, onSelectionChange, safeDuration, selectionEnd, selectionStart]);

  return (
    <section data-testid="audio-track-timeline-stack" className="audio-panel overflow-hidden rounded-[20px]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-4">
        <div>
          <p className="audio-section-kicker">{copy.title}</p>
          <h2 className="mt-1 text-sm font-medium text-[var(--text-primary)]">{copy.subtitle}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {onAddTrack ? (
            <button type="button" onClick={onAddTrack} className="audio-button-secondary audio-focus-ring h-9 px-3">
              <FolderPlus size={14} strokeWidth={1.5} />
              {copy.addTrack}
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

      <div
        ref={viewportRef}
        className={canvasWidth > viewportWidth + 1 ? 'overflow-x-auto' : 'overflow-x-hidden'}
        data-testid="audio-waveform-scroll"
      >
        <div style={{ width: `${canvasWidth}px` }} className="relative min-w-full bg-[var(--waveform-bg)]">
          <div className="px-0 pt-4">
            <div style={{ width: `${contentWidth}px`, marginLeft: `${contentPadding}px` }}>
              <WaveformTimeline duration={safeDuration} zoom={zoom} />
            </div>
          </div>

          {tracks.length === 0 ? (
            <div className="px-6 py-8 text-sm text-[var(--text-secondary)]">{copy.empty}</div>
          ) : (
            <div className="relative px-0 pb-4 pt-3">
              <div
                data-testid="audio-playhead"
                className="absolute bottom-4 top-3 z-20 w-4 -translate-x-1/2 cursor-ew-resize"
                style={{ left: `${playheadLeft}px` }}
              >
                <button
                  type="button"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setInteraction({ kind: 'move-playhead' });
                    onSeek?.(getProjectTimeFromClientX(event.clientX));
                  }}
                  className="absolute inset-y-0 left-1/2 w-4 -translate-x-1/2 bg-transparent"
                  aria-label="Playhead"
                >
                  <span className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-[var(--playhead)]" />
                  <span className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 rounded-full border border-[var(--bg-base)] bg-[var(--playhead)]" />
                </button>
              </div>

              <div className="space-y-3">
                {tracks.map((track) => {
                  const clipDuration = track.buffer?.duration ?? 0.75;
                  const clipLeft = contentPadding + clamp(track.startTime / safeDuration, 0, 1) * contentWidth;
                  const clipWidth = Math.max(
                    track.buffer ? (clipDuration / safeDuration) * contentWidth : 132,
                    track.buffer ? 72 : 132,
                  );
                  const selectionStartPercent =
                    track.buffer && track.buffer.duration > 0 ? clamp(selectionStart / track.buffer.duration, 0, 1) : 0;
                  const selectionEndPercent =
                    track.buffer && track.buffer.duration > 0 ? clamp(selectionEnd / track.buffer.duration, 0, 1) : 1;
                  const isFullSelection = Boolean(
                    track.isActive &&
                      track.buffer &&
                      selectionStartPercent <= 0.001 &&
                      selectionEndPercent >= 0.999,
                  );
                  const playheadWithinTrack =
                    currentTime >= track.startTime && currentTime <= track.startTime + (track.buffer?.duration ?? 0);
                  const localPlayheadPercent =
                    track.buffer && playheadWithinTrack
                      ? clamp((currentTime - track.startTime) / track.buffer.duration, 0, 1)
                      : null;
                  const SourceIcon = getSourceIcon(track.source);
                  const sourceLabel = getSourceLabel(track.source, locale);

                  return (
                    <div
                      key={track.id}
                      data-testid="audio-track-stack-row"
                      className={`rounded-[16px] border px-4 py-3 transition ${
                        track.isActive
                          ? 'border-[var(--accent)] bg-[rgba(0,212,200,0.06)]'
                          : 'border-[var(--border)] bg-[var(--surface-muted)]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onSelectTrack?.(track.id)}
                              className="truncate text-left text-sm font-medium text-[var(--text-primary)]"
                            >
                              {track.name}
                            </button>
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
                          <span className="audio-mono">
                            {copy.start} {formatTime(track.startTime)}
                          </span>
                          <span className="audio-mono">{formatTime(track.buffer?.duration ?? 0)}</span>
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

                      <div className="mt-3 px-0">
                        <div
                          className="relative h-24 overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--bg-base)]"
                          onPointerDown={(event) => {
                            if ((event.target as HTMLElement).closest('[data-track-clip]')) {
                              return;
                            }

                            onSelectTrack?.(track.id);
                            onSeek?.(getProjectTimeFromClientX(event.clientX), track.id);
                          }}
                        >
                          <div
                            className="pointer-events-none absolute inset-0 opacity-60"
                            style={{
                              backgroundImage:
                                'linear-gradient(to right, var(--border) 0, var(--border) 1px, transparent 1px, transparent 100%)',
                              backgroundSize: `${Math.max(contentWidth / Math.max(safeDuration, 1), 24)}px 100%`,
                            }}
                          />

                          <div
                            data-track-clip
                            data-testid="audio-track-clip"
                            className={`absolute top-2 h-[calc(100%-1rem)] overflow-hidden rounded-[12px] border ${
                              track.isActive
                                ? 'border-[var(--accent)] bg-[rgba(0,212,200,0.08)]'
                                : 'border-[var(--border-strong)] bg-[rgba(0,212,200,0.04)]'
                            }`}
                            style={{
                              left: `${clipLeft}px`,
                              width: `${clipWidth}px`,
                            }}
                          >
                            <button
                              type="button"
                              onPointerDown={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                onSelectTrack?.(track.id);
                                const pointerTime = getProjectTimeFromClientX(event.clientX);
                                setInteraction({
                                  kind: 'move-track',
                                  trackId: track.id,
                                  clipDuration,
                                  pointerOffsetTime: clamp(pointerTime - track.startTime, 0, clipDuration),
                                });
                              }}
                              className="flex h-6 w-full items-center justify-between border-b border-[var(--border)] bg-[rgba(0,0,0,0.08)] px-2 text-[11px] text-[var(--text-secondary)]"
                              aria-label={copy.dragTrack}
                            >
                              <span className="truncate">{track.name}</span>
                              <GripHorizontal size={12} strokeWidth={1.5} />
                            </button>

                            <div
                              className="relative h-[calc(100%-1.5rem)] w-full touch-none"
                              onPointerDown={(event) => {
                                event.stopPropagation();
                                onSelectTrack?.(track.id);

                                if (!track.buffer) {
                                  onSeek?.(getProjectTimeFromClientX(event.clientX), track.id);
                                  return;
                                }

                                if (!track.isActive) {
                                  onSeek?.(getProjectTimeFromClientX(event.clientX), track.id);
                                  return;
                                }

                                const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-selection-handle]')
                                  ?.dataset.selectionHandle as SelectionHandle | undefined;
                                const projectTime = getProjectTimeFromClientX(event.clientX);
                                const localTime = clamp(projectTime - track.startTime, 0, track.buffer.duration);

                                if (handle) {
                                  setInteraction({
                                    kind: 'selection',
                                    trackId: track.id,
                                    trackStartTime: track.startTime,
                                    trackDuration: track.buffer.duration,
                                    anchorTime: localTime,
                                    handle,
                                  });
                                  return;
                                }

                                setInteraction({
                                  kind: 'selection',
                                  trackId: track.id,
                                  trackStartTime: track.startTime,
                                  trackDuration: track.buffer.duration,
                                  anchorTime: localTime,
                                  handle: null,
                                });
                                onSeek?.(projectTime, track.id);
                              }}
                            >
                              {track.buffer ? (
                                <ClipWaveform
                                  audioBuffer={track.buffer}
                                  width={clipWidth}
                                  height={56}
                                  theme={theme}
                                  isMuted={track.muted}
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center px-3 text-xs text-[var(--text-secondary)]">
                                  {copy.emptyTrack}
                                </div>
                              )}

                              {track.isActive && track.buffer ? (
                                <>
                                  {!isFullSelection ? (
                                    <div
                                      className="pointer-events-none absolute inset-y-0 bg-[var(--selection-bg)]"
                                      style={{
                                        left: `${selectionStartPercent * 100}%`,
                                        width: `${Math.max((selectionEndPercent - selectionStartPercent) * 100, 0.6)}%`,
                                        boxShadow:
                                          'inset 2px 0 0 var(--selection-border), inset -2px 0 0 var(--selection-border)',
                                      }}
                                    />
                                  ) : null}

                                  <button
                                    type="button"
                                    data-selection-handle="start"
                                    data-testid="audio-selection-handle-start"
                                    className="absolute inset-y-1 left-0 z-10 w-4 -translate-x-1/2 cursor-col-resize rounded-full bg-transparent"
                                    style={{ left: isFullSelection ? '8px' : `${selectionStartPercent * 100}%` }}
                                    aria-label="Selection start"
                                  >
                                    <span className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 rounded-full bg-[var(--selection-border)]" />
                                    <span className="absolute left-1/2 top-1.5 h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-[var(--waveform-handle-outline)] bg-[var(--selection-border)]" />
                                    <span className="absolute bottom-1.5 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-[var(--waveform-handle-outline)] bg-[var(--selection-border)]" />
                                  </button>
                                  <button
                                    type="button"
                                    data-selection-handle="end"
                                    data-testid="audio-selection-handle-end"
                                    className="absolute inset-y-1 z-10 w-4 -translate-x-1/2 cursor-col-resize rounded-full bg-transparent"
                                    style={{ left: isFullSelection ? 'calc(100% - 8px)' : `${selectionEndPercent * 100}%` }}
                                    aria-label="Selection end"
                                  >
                                    <span className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 rounded-full bg-[var(--selection-border)]" />
                                    <span className="absolute left-1/2 top-1.5 h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-[var(--waveform-handle-outline)] bg-[var(--selection-border)]" />
                                    <span className="absolute bottom-1.5 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-[var(--waveform-handle-outline)] bg-[var(--selection-border)]" />
                                  </button>
                                </>
                              ) : null}

                              {localPlayheadPercent != null ? (
                                <div
                                  className="pointer-events-none absolute inset-y-0 z-10 w-[2px] bg-[var(--playhead)]"
                                  style={{ left: `${localPlayheadPercent * 100}%` }}
                                />
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tracks.length > 0 ? (
            <div className="border-t border-[var(--border)] px-4 pb-4 pt-3">
              <p className="text-[11px] text-[var(--text-tertiary)]">{copy.laneHint}</p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
