'use client';

import {
  FolderPlus,
  GripVertical,
  Mic,
  Music4,
  Play,
  Radio,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
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
  onMuteToggle?: (trackId: string) => void;
  onRemoveTrack?: (trackId: string) => void;
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
      timelineDuration: number;
    }
  | {
      kind: 'selection';
      trackId: string;
      trackStartTime: number;
      trackDuration: number;
      anchorTime: number;
      handle: SelectionHandle | null;
      initialStart: number;
      initialEnd: number;
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
      timeline: '멀티트랙',
      addTrack: '트랙 추가',
      previewMix: '믹스 미리듣기',
      empty: '트랙이 아직 없습니다.',
      emptyTrack: '빈 트랙',
      start: '시작',
      file: '파일',
      recording: '녹음',
      generated: '생성',
      emptySource: '빈 트랙',
      mute: '뮤트',
      unmute: '뮤트 해제',
      remove: '삭제',
      dragTrack: '트랙 이동',
      playhead: '재생 헤드 이동',
    };
  }

  return {
    timeline: 'Multitrack',
    addTrack: 'Add track',
    previewMix: 'Preview mix',
    empty: 'No tracks yet.',
    emptyTrack: 'Empty track',
    start: 'Start',
    file: 'File',
    recording: 'Recording',
    generated: 'Generated',
    emptySource: 'Empty',
    mute: 'Mute',
    unmute: 'Unmute',
    remove: 'Delete',
    dragTrack: 'Move track',
    playhead: 'Move playhead',
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
    case 'empty':
      return copy.emptySource;
    default:
      return copy.file;
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
      context.fillStyle = theme === 'dark' ? 'rgba(2, 6, 23, 0.52)' : 'rgba(255, 255, 255, 0.44)';
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
  onMuteToggle,
  onRemoveTrack,
}: TrackTimelineStackProps) {
  const { locale } = useLocale();
  const { theme } = useTheme();
  const copy = getCopy(locale);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [interaction, setInteraction] = useState<InteractionState>(null);
  const contentPadding = 24;

  const maxTrackEnd = useMemo(
    () => tracks.reduce((maxValue, track) => Math.max(maxValue, track.startTime + (track.buffer?.duration ?? 0)), 0),
    [tracks],
  );
  const safeDuration = Math.max(
    duration,
    maxTrackEnd + Math.max(2, duration * 0.15),
    currentTime + 1,
    6,
  );
  const canvasWidth = Math.max(viewportWidth, Math.round(Math.max(viewportWidth, 720) * Math.max(zoom, 1)), 720);
  const contentWidth = Math.max(canvasWidth - contentPadding * 2, 480);
  const playheadLeft = contentPadding + clamp(currentTime / safeDuration, 0, 1) * contentWidth;

  useEffect(() => {
    if (!viewportRef.current || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? 0;
      setViewportWidth(Math.max(720, Math.floor(nextWidth)));
    });

    observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, []);

  const getProjectTimeFromClientX = (clientX: number, durationScale = safeDuration) => {
    const viewportNode = viewportRef.current;
    if (!viewportNode) {
      return 0;
    }

    const rect = viewportNode.getBoundingClientRect();
    const x = clamp(clientX - rect.left + viewportNode.scrollLeft - contentPadding, 0, contentWidth);
    return clamp((x / contentWidth) * durationScale, 0, durationScale);
  };

  useEffect(() => {
    if (!interaction) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const projectTime =
        interaction.kind === 'move-track'
          ? getProjectTimeFromClientX(event.clientX, interaction.timelineDuration)
          : getProjectTimeFromClientX(event.clientX);

      if (interaction.kind === 'move-playhead') {
        onSeek?.(projectTime);
        return;
      }

      if (interaction.kind === 'move-track') {
        const nextStartTime = Math.max(0, projectTime - interaction.pointerOffsetTime);
        onMoveTrack?.(interaction.trackId, Number(nextStartTime.toFixed(3)));
        return;
      }

      const localTime = clamp(projectTime - interaction.trackStartTime, 0, interaction.trackDuration);

      if (interaction.handle === 'start') {
        onSelectionChange?.(interaction.trackId, {
          start: localTime,
          end: interaction.initialEnd,
        });
        return;
      }

      if (interaction.handle === 'end') {
        onSelectionChange?.(interaction.trackId, {
          start: interaction.initialStart,
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
  }, [contentWidth, interaction, onMoveTrack, onSeek, onSelectionChange, safeDuration]);

  return (
    <section data-testid="audio-track-timeline-stack" className="audio-panel overflow-hidden rounded-[20px]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-3">
          <p className="audio-section-kicker mb-0">{copy.timeline}</p>
          <span className="audio-mono text-xs text-[var(--text-tertiary)]">{formatTime(safeDuration)}</span>
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
          <div className="pt-3">
            <div style={{ width: `${contentWidth}px`, marginLeft: `${contentPadding}px` }}>
              <WaveformTimeline duration={safeDuration} zoom={zoom} />
            </div>
          </div>

          <div className="relative pb-4 pt-2">
            <div
              data-testid="audio-playhead"
              className="absolute bottom-4 top-2 z-20 w-4 -translate-x-1/2 cursor-ew-resize"
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
                aria-label={copy.playhead}
              >
                <span className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-[var(--playhead)]" />
                <span className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 rounded-full border border-[var(--bg-base)] bg-[var(--playhead)]" />
              </button>
            </div>

            <div className="space-y-2 px-3 pb-2">
              {tracks.length === 0 ? (
                <div className="px-3 py-8 text-sm text-[var(--text-secondary)]">{copy.empty}</div>
              ) : (
                tracks.map((track, trackIndex) => {
                  const clipDuration = track.buffer?.duration ?? 0;
                  const clipLeft = contentPadding + clamp(track.startTime / safeDuration, 0, 1) * contentWidth;
                  const clipWidth = track.buffer ? Math.max((clipDuration / safeDuration) * contentWidth, 72) : 0;
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
                  const SourceIcon = getSourceIcon(track.source);
                  const sourceLabel = getSourceLabel(track.source, locale);
                  const trackLabel =
                    track.source === 'empty'
                      ? `${copy.emptyTrack} ${trackIndex + 1}`
                      : track.name;

                  return (
                    <div
                      key={track.id}
                      data-testid="audio-track-stack-row"
                      className={`relative py-2 ${track.isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}
                    >
                      <div className="flex flex-wrap items-center gap-2 px-1 pb-2">
                        <button
                          type="button"
                          onClick={() => onSelectTrack?.(track.id)}
                          className={`truncate text-left text-sm font-medium transition ${
                            track.isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          {trackLabel}
                        </button>
                        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-tertiary)]">
                          <SourceIcon size={11} strokeWidth={1.5} />
                          {sourceLabel}
                        </span>
                        <span className="audio-mono text-xs text-[var(--text-secondary)]">
                          {copy.start} {formatTime(track.startTime)}
                        </span>
                        {track.buffer ? (
                          <span className="audio-mono text-xs text-[var(--text-tertiary)]">{formatTime(track.buffer.duration)}</span>
                        ) : (
                          <span className="audio-mono text-xs text-[var(--text-tertiary)]">{copy.emptySource}</span>
                        )}

                        <div className="ml-auto flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            data-track-drag-handle
                            data-testid="audio-track-drag-handle"
                            onPointerDown={(event) => {
                              if (!track.buffer) {
                                return;
                              }

                              event.preventDefault();
                              event.stopPropagation();
                              onSelectTrack?.(track.id);
                              const pointerTime = getProjectTimeFromClientX(event.clientX);
                                setInteraction({
                                  kind: 'move-track',
                                  trackId: track.id,
                                  clipDuration,
                                  pointerOffsetTime: clamp(pointerTime - track.startTime, 0, clipDuration),
                                  timelineDuration: safeDuration,
                                });
                              }}
                            className="audio-focus-ring inline-flex h-8 items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-xs text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                            aria-label={copy.dragTrack}
                          >
                            <GripVertical size={13} strokeWidth={1.5} />
                            {copy.dragTrack}
                          </button>
                          {onMuteToggle ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onMuteToggle(track.id);
                              }}
                              className={`audio-focus-ring inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs transition ${
                                track.muted
                                  ? 'border-[var(--accent)] bg-[rgba(0,212,200,0.12)] text-[var(--accent)]'
                                  : 'border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                              }`}
                              aria-label={track.muted ? copy.unmute : copy.mute}
                            >
                              {track.muted ? <VolumeX size={13} strokeWidth={1.5} /> : <Volume2 size={13} strokeWidth={1.5} />}
                              {track.muted ? copy.unmute : copy.mute}
                            </button>
                          ) : null}
                          {onRemoveTrack ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onRemoveTrack(track.id);
                              }}
                              className="audio-focus-ring inline-flex h-8 items-center gap-1 rounded-full border border-[rgba(255,77,77,0.35)] bg-[rgba(255,77,77,0.08)] px-3 text-xs text-[var(--status-recording)] transition hover:bg-[rgba(255,77,77,0.14)]"
                              aria-label={copy.remove}
                            >
                              <Trash2 size={13} strokeWidth={1.5} />
                              {copy.remove}
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <div
                        className="relative h-20 overflow-hidden"
                        onPointerDown={(event) => {
                          const target = event.target as HTMLElement;
                          if (
                            target.closest('[data-track-clip]') ||
                            target.closest('[data-selection-handle]') ||
                            target.closest('[data-track-drag-handle]')
                          ) {
                            return;
                          }

                          onSelectTrack?.(track.id);
                          onSeek?.(track.buffer ? getProjectTimeFromClientX(event.clientX) : track.startTime, track.id);
                        }}
                      >
                        <div
                          className="pointer-events-none absolute inset-y-1 left-[24px] right-[24px] opacity-25"
                          style={{
                            backgroundImage:
                              'linear-gradient(to right, var(--border) 0, var(--border) 1px, transparent 1px, transparent 100%)',
                            backgroundSize: `${Math.max(contentWidth / Math.max(safeDuration, 1), 24)}px calc(100% - 8px)`,
                          }}
                        />

                        <div className="pointer-events-none absolute inset-x-[24px] top-1/2 h-px -translate-y-1/2 bg-[var(--border)] opacity-60" />

                        {track.buffer ? (
                          <div
                            data-track-clip
                            data-testid="audio-track-waveform-surface"
                            className={`absolute inset-y-1 overflow-hidden rounded-[12px] ${
                              track.isActive
                                ? 'bg-[rgba(0,212,200,0.12)] ring-1 ring-[var(--accent)]'
                                : 'bg-[rgba(0,212,200,0.06)] ring-1 ring-[rgba(255,255,255,0.08)]'
                            }`}
                            style={{
                              left: `${clipLeft}px`,
                              width: `${clipWidth}px`,
                            }}
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              onSelectTrack?.(track.id);
                              const trackBuffer = track.buffer;
                              if (!trackBuffer) {
                                return;
                              }

                              const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-selection-handle]')
                                ?.dataset.selectionHandle as SelectionHandle | undefined;
                              const projectTime = getProjectTimeFromClientX(event.clientX);
                              const localTime = clamp(projectTime - track.startTime, 0, trackBuffer.duration);

                              onSeek?.(projectTime, track.id);
                              setInteraction({
                                kind: 'selection',
                                trackId: track.id,
                                trackStartTime: track.startTime,
                                trackDuration: trackBuffer.duration,
                                anchorTime: localTime,
                                handle: handle ?? null,
                                initialStart: track.isActive ? selectionStart : 0,
                                initialEnd: track.isActive ? selectionEnd : trackBuffer.duration,
                              });
                            }}
                          >
                            <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-[var(--accent)] opacity-80" />
                            <ClipWaveform
                              audioBuffer={track.buffer}
                              width={Math.max(clipWidth, 32)}
                              height={80}
                              theme={theme}
                              isMuted={track.muted}
                            />

                            {track.isActive ? (
                              <>
                                {!isFullSelection ? (
                                  <div
                                    data-testid="audio-selection-overlay"
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
                          </div>
                        ) : (
                          <div
                            data-testid="audio-track-empty-lane"
                            className={`absolute inset-y-1 left-[24px] right-[24px] flex items-center rounded-[12px] border border-dashed px-4 text-sm ${
                              track.isActive
                                ? 'border-[var(--accent)] text-[var(--text-primary)]'
                                : 'border-[var(--border)] text-[var(--text-secondary)]'
                            }`}
                          >
                            {copy.emptyTrack}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
