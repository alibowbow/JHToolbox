import { clamp } from '@/components/ui/crop-math';

const MIN_TRIM_DURATION = 0.05;

export function normalizeTrimRange(startTime: number, endTime: number, duration: number) {
  const safeDuration = Math.max(duration, MIN_TRIM_DURATION);
  let nextStart = clamp(startTime, 0, safeDuration);
  let nextEnd = clamp(endTime > 0 ? endTime : safeDuration, 0, safeDuration);

  if (nextEnd < nextStart) {
    [nextStart, nextEnd] = [nextEnd, nextStart];
  }

  if (nextEnd - nextStart < MIN_TRIM_DURATION) {
    if (nextEnd + MIN_TRIM_DURATION <= safeDuration) {
      nextEnd = nextStart + MIN_TRIM_DURATION;
    } else {
      nextStart = Math.max(0, nextEnd - MIN_TRIM_DURATION);
    }
  }

  return {
    startTime: Number(nextStart.toFixed(3)),
    endTime: Number(nextEnd.toFixed(3)),
  };
}

/** 83.456 → "1:23.45" */
export function formatEditorTime(value: number) {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  const minutes = Math.floor(safeValue / 60);
  const seconds = Math.floor(safeValue % 60);
  const hundredths = Math.floor((safeValue - Math.floor(safeValue)) * 100);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

/** "1:23.45", "83.45", "1:02:03" → seconds; null when it is not a time. */
export function parseEditorTime(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (!/^\d+(?::\d{1,2}){0,2}(?:\.\d+)?$/.test(trimmed)) {
    return null;
  }
  const parts = trimmed.split(':');
  const seconds = Number(parts.pop());
  const minutes = parts.length > 0 ? Number(parts.pop()) : 0;
  const hours = parts.length > 0 ? Number(parts.pop()) : 0;
  const total = hours * 3600 + minutes * 60 + seconds;
  return Number.isFinite(total) ? total : null;
}

/**
 * The real duration of a media element. Files from MediaRecorder carry no
 * duration (the element reports Infinity) until the browser has scanned to
 * the end, which seeking far past the end triggers.
 */
export function resolveMediaDuration(media: HTMLMediaElement): Promise<number> {
  if (Number.isFinite(media.duration) && media.duration > 0) {
    return Promise.resolve(media.duration);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      media.removeEventListener('durationchange', onChange);
      media.removeEventListener('timeupdate', onChange);
      window.clearTimeout(timer);
      const duration = Number.isFinite(media.duration) ? media.duration : 0;
      media.currentTime = 0;
      resolve(duration);
    };
    const onChange = () => {
      if (Number.isFinite(media.duration) && media.duration > 0) {
        finish();
      }
    };
    const timer = window.setTimeout(finish, 5000);
    media.addEventListener('durationchange', onChange);
    media.addEventListener('timeupdate', onChange);
    media.currentTime = 1e101;
  });
}
