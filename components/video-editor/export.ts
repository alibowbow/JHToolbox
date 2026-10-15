import type { EditorEngine } from './engine';

/** MP4 when the browser can record it (Chrome 126+, Safari), else WebM. */
export function pickRecordingType() {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'video/mp4;codecs=avc1.640028,mp4a.40.2',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

export class ExportUnsupportedError extends Error {}

/**
 * Records the project by playing it once onto the canvas: the canvas frames
 * and the sound mix go into a MediaRecorder. The speakers stay quiet; the
 * returned promise resolves with the file when playback reaches the end.
 */
export function exportVideo(
  engine: EditorEngine,
  { longSide, fps = 30, onProgress, signal }: { longSide: number; fps?: number; onProgress: (ratio: number) => void; signal: AbortSignal },
): Promise<{ blob: Blob; extension: string }> {
  return new Promise((resolve, reject) => {
    const mimeType = pickRecordingType();
    const canvas = engine.canvas;
    if (!mimeType || !canvas || typeof canvas.captureStream !== 'function') {
      reject(new ExportUnsupportedError('unsupported'));
      return;
    }
    const previousSide = engine.longSide;
    engine.pause();
    engine.longSide = longSide;
    engine.recording = true;
    engine.resize();

    const stream = canvas.captureStream(fps);
    const sound = engine.recordingStream();
    sound?.getAudioTracks().forEach((track) => stream.addTrack(track));
    const pixels = canvas.width * canvas.height;
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: pixels >= 1920 * 1080 * 0.9 ? 12_000_000 : 6_000_000,
      audioBitsPerSecond: 192_000,
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    const previousOnTime = engine.onTime;
    const previousOnEnded = engine.onEnded;
    let settled = false;
    const restore = () => {
      engine.onTime = previousOnTime;
      engine.onEnded = previousOnEnded;
      engine.recording = false;
      engine.setMonitorMuted(false);
      engine.longSide = previousSide;
      engine.resize();
      engine.seek(0);
      stream.getVideoTracks().forEach((track) => track.stop());
      signal.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      engine.pause();
      if (recorder.state !== 'inactive') recorder.stop();
      restore();
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });

    recorder.onstop = () => {
      if (settled) return;
      settled = true;
      restore();
      const type = mimeType.split(';')[0];
      resolve({ blob: new Blob(chunks, { type }), extension: type.includes('mp4') ? 'mp4' : 'webm' });
    };
    recorder.onerror = () => {
      if (settled) return;
      settled = true;
      engine.pause();
      restore();
      reject(new Error('recorder'));
    };

    engine.onTime = (time) => {
      previousOnTime?.(time);
      onProgress(engine.duration > 0 ? Math.min(1, time / engine.duration) : 0);
    };
    engine.onEnded = () => {
      previousOnEnded?.();
      onProgress(1);
      // Let the last frame and sound reach the recorder.
      window.setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop();
      }, 250);
    };

    engine.setMonitorMuted(true);
    engine.seek(0);
    // Give the first video a moment to show its first frame.
    window.setTimeout(() => {
      if (settled) return;
      recorder.start(500);
      void engine.play();
    }, 400);
  });
}
