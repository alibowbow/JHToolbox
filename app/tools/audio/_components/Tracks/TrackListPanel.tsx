'use client';

import { Mic, Music4, Radio, Trash2, VolumeX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocale } from '@/components/providers/locale-provider';
import { formatTime, getRangeStyle, parseTimeInput } from '../audio-editor-utils';

export type AudioTrackSource = 'file' | 'recording' | 'generated' | 'mixdown' | (string & {});

export interface AudioTrackListItem {
  id: string;
  name: string;
  source: AudioTrackSource;
  startTime: number;
  gain: number;
  muted: boolean;
  solo: boolean;
  isActive: boolean;
}

interface TrackListPanelProps {
  tracks: AudioTrackListItem[];
  className?: string;
  emptyMessage?: string;
  gainMin?: number;
  gainMax?: number;
  gainStep?: number;
  onSelectTrack?: (trackId: string) => void;
  onStartTimeChange?: (trackId: string, nextStartTime: number) => void;
  onGainChange?: (trackId: string, nextGain: number) => void;
  onMuteToggle?: (trackId: string) => void;
  onSoloToggle?: (trackId: string) => void;
  onRemoveTrack?: (trackId: string) => void;
}

function getTrackCopy(locale: string) {
  if (locale === 'ko') {
    return {
      kicker: '트랙',
      title: '멀티트랙 세션',
      empty: '아직 추가된 트랙이 없습니다.',
      active: '편집하기',
      activeState: '선택됨',
      startTime: '시작 시간',
      gain: '게인',
      mute: '뮤트',
      muted: '뮤트됨',
      solo: '솔로',
      soloed: '솔로 중',
      remove: '트랙 제거',
      trackCount: (count: number) => `${count}개 트랙`,
      sources: {
        file: '파일',
        recording: '녹음',
        generated: '생성',
        mixdown: '믹스다운',
        fallback: '트랙',
      },
    };
  }

  return {
    kicker: 'Tracks',
    title: 'Multitrack session',
    empty: 'No tracks added yet.',
    active: 'Edit',
    activeState: 'Editing',
    startTime: 'Start time',
    gain: 'Gain',
    mute: 'Mute',
    muted: 'Muted',
    solo: 'Solo',
    soloed: 'Solo',
    remove: 'Remove track',
    trackCount: (count: number) => `${count} tracks`,
    sources: {
      file: 'File',
      recording: 'Recording',
      generated: 'Generated',
      mixdown: 'Mixdown',
      fallback: 'Track',
    },
  };
}

function getSourceLabel(source: AudioTrackSource, locale: string) {
  const copy = getTrackCopy(locale);

  switch (source) {
    case 'file':
      return copy.sources.file;
    case 'recording':
      return copy.sources.recording;
    case 'generated':
      return copy.sources.generated;
    case 'mixdown':
      return copy.sources.mixdown;
    default:
      return source || copy.sources.fallback;
  }
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

function buildStartInputs(tracks: AudioTrackListItem[]) {
  return Object.fromEntries(tracks.map((track) => [track.id, formatTime(track.startTime)]));
}

export function TrackListPanel({
  tracks,
  className,
  emptyMessage,
  gainMin = 0,
  gainMax = 2,
  gainStep = 0.05,
  onSelectTrack,
  onStartTimeChange,
  onGainChange,
  onMuteToggle,
  onSoloToggle,
  onRemoveTrack,
}: TrackListPanelProps) {
  const { locale } = useLocale();
  const copy = getTrackCopy(locale);
  const [startInputs, setStartInputs] = useState<Record<string, string>>(() => buildStartInputs(tracks));
  const [focusedTrackId, setFocusedTrackId] = useState<string | null>(null);

  useEffect(() => {
    setStartInputs((current) => {
      const next = { ...current };

      for (const track of tracks) {
        if (focusedTrackId !== track.id) {
          next[track.id] = formatTime(track.startTime);
        }
      }

      for (const trackId of Object.keys(next)) {
        if (!tracks.some((track) => track.id === trackId)) {
          delete next[trackId];
        }
      }

      return next;
    });
  }, [focusedTrackId, tracks]);

  const commitStartTime = (track: AudioTrackListItem) => {
    const rawValue = startInputs[track.id] ?? formatTime(track.startTime);
    const nextValue = parseTimeInput(rawValue, track.startTime);

    setStartInputs((current) => ({
      ...current,
      [track.id]: formatTime(nextValue),
    }));
    onStartTimeChange?.(track.id, nextValue);
  };

  return (
    <section
      data-testid="audio-track-list-panel"
      className={`audio-panel flex h-full min-h-[18rem] flex-col rounded-[20px] p-4 ${className ?? ''}`.trim()}
    >
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] pb-4">
        <div>
          <p className="audio-section-kicker">{copy.kicker}</p>
          <h2 className="mt-1 text-sm font-medium text-[var(--text-primary)]">{copy.title}</h2>
        </div>
        <span className="audio-mono rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)]">
          {copy.trackCount(tracks.length)}
        </span>
      </div>

      <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
        {tracks.length === 0 ? (
          <div className="audio-surface-muted flex min-h-[9rem] items-center justify-center rounded-[14px] px-4 text-center text-sm text-[var(--text-secondary)]">
            {emptyMessage ?? copy.empty}
          </div>
        ) : null}

        {tracks.map((track) => {
          const SourceIcon = getSourceIcon(track.source);
          const sourceLabel = getSourceLabel(track.source, locale);
          const startValue = startInputs[track.id] ?? formatTime(track.startTime);

          return (
            <div
              key={track.id}
              data-testid="audio-track-row"
              className={`rounded-[14px] border p-3 transition-colors ${
                track.isActive
                  ? 'border-[var(--accent)] bg-[rgba(0,212,200,0.08)]'
                  : 'border-[var(--border)] bg-[var(--surface-muted)]'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">{track.name}</p>
                    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1 text-[11px] text-[var(--text-secondary)]">
                      <SourceIcon size={11} strokeWidth={1.5} />
                      {sourceLabel}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onRemoveTrack?.(track.id)}
                  disabled={!onRemoveTrack}
                  className="audio-button-danger audio-focus-ring h-8 w-8 p-0"
                  aria-label={copy.remove}
                >
                  <Trash2 size={14} strokeWidth={1.5} />
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onSelectTrack?.(track.id)}
                  disabled={!onSelectTrack}
                  className={`audio-focus-ring inline-flex h-8 items-center justify-center rounded-[10px] border px-3 text-sm transition ${
                    track.isActive
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--bg-base)]'
                      : 'border-[var(--border-strong)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-overlay)]'
                  }`}
                >
                  {track.isActive ? copy.activeState : copy.active}
                </button>

                <button
                  type="button"
                  onClick={() => onMuteToggle?.(track.id)}
                  disabled={!onMuteToggle}
                  className={`audio-focus-ring inline-flex h-8 items-center justify-center gap-1.5 rounded-[10px] border px-3 text-sm transition ${
                    track.muted
                      ? 'border-[rgba(255,77,77,0.4)] bg-[rgba(255,77,77,0.12)] text-[var(--status-recording)]'
                      : 'border-[var(--border)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)]'
                  }`}
                >
                  <VolumeX size={13} strokeWidth={1.5} />
                  {track.muted ? copy.muted : copy.mute}
                </button>

                <button
                  type="button"
                  onClick={() => onSoloToggle?.(track.id)}
                  disabled={!onSoloToggle}
                  className={`audio-focus-ring inline-flex h-8 items-center justify-center gap-1.5 rounded-[10px] border px-3 text-sm transition ${
                    track.solo
                      ? 'border-[var(--accent)] bg-[rgba(0,212,200,0.12)] text-[var(--text-primary)]'
                      : 'border-[var(--border)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)]'
                  }`}
                >
                  <Radio size={13} strokeWidth={1.5} />
                  {track.solo ? copy.soloed : copy.solo}
                </button>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-[8.5rem_minmax(0,1fr)]">
                <label className="space-y-2">
                  <span className="audio-range-label">{copy.startTime}</span>
                  <input
                    type="text"
                    value={startValue}
                    onChange={(event) =>
                      setStartInputs((current) => ({
                        ...current,
                        [track.id]: event.target.value,
                      }))
                    }
                    onFocus={() => setFocusedTrackId(track.id)}
                    onBlur={() => {
                      setFocusedTrackId((current) => (current === track.id ? null : current));
                      commitStartTime(track);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        commitStartTime(track);
                        (event.currentTarget as HTMLInputElement).blur();
                      }
                    }}
                    disabled={!onStartTimeChange}
                    className="audio-field audio-focus-ring w-full"
                    aria-label={`${track.name} ${copy.startTime}`}
                  />
                </label>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="audio-range-label">{copy.gain}</span>
                    <span className="audio-value">{track.gain.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min={gainMin}
                    max={gainMax}
                    step={gainStep}
                    value={track.gain}
                    onChange={(event) => onGainChange?.(track.id, Number(event.target.value))}
                    style={getRangeStyle(track.gain, gainMin, gainMax)}
                    disabled={!onGainChange}
                    className="audio-range audio-focus-ring"
                    aria-label={`${track.name} ${copy.gain}`}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
