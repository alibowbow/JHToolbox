'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CircleStop, Download, LoaderCircle, Mic, Monitor, Play, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { ToolPageLayout } from '@/components/ToolPageLayout';
import { useLocale } from '@/components/providers/locale-provider';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ResultCard } from '@/components/ui/ResultCard';
import { Tabs } from '@/components/ui/Tabs';
import { toast } from '@/components/ui/Toast';
import { formatMegaBytes, getCategoryCopy } from '@/lib/i18n';
import { getLocalizedChoiceLabel, getLocalizedOptionLabel, getLocalizedToolCopy } from '@/lib/tool-localization';
import { categoryIcons, categoryStyles } from '@/lib/tool-presentation';
import { downloadBlob } from '@/lib/utils';
import { ProcessedFile } from '@/types/processor';
import { ToolDefinition, ToolOption } from '@/types/tool';

type CaptureStatus = 'idle' | 'starting' | 'recording' | 'done' | 'error';

type CaptureResult = ProcessedFile & {
  details?: Record<string, string | number | boolean>;
};

type CaptureSession = {
  recordStream: MediaStream;
  previewStream: MediaStream;
  cleanup: () => void;
  onEndedTrack?: MediaStreamTrack | null;
};

function getDefaults(tool: ToolDefinition): Record<string, string | number | boolean> {
  const entries = (tool.options ?? []).map((option) => [option.key, option.defaultValue] as const);
  return Object.fromEntries(entries);
}

function getInitialOptions(
  tool: ToolDefinition,
  searchParams: Pick<URLSearchParams, 'get'>,
): Record<string, string | number | boolean> {
  const defaults = getDefaults(tool);

  for (const option of tool.options ?? []) {
    const paramValue = searchParams.get(option.key);
    if (paramValue === null) {
      continue;
    }

    if (option.type === 'number' || option.type === 'range') {
      defaults[option.key] = Number(paramValue);
      continue;
    }

    if (option.type === 'checkbox') {
      defaults[option.key] = paramValue === 'true';
      continue;
    }

    defaults[option.key] = paramValue;
  }

  return defaults;
}

function renderField(
  option: ToolOption,
  value: string | number | boolean | undefined,
  locale: 'en' | 'ko',
  onChange: (key: string, nextValue: string | number | boolean) => void,
) {
  const className = 'input-surface mt-1 w-full';

  if (option.type === 'select') {
    return (
      <select value={String(value)} onChange={(event) => onChange(option.key, event.target.value)} className={className}>
        {(option.options ?? []).map((entry) => (
          <option key={String(entry.value)} value={String(entry.value)}>
            {getLocalizedChoiceLabel(entry.label, locale)}
          </option>
        ))}
      </select>
    );
  }

  if (option.type === 'checkbox') {
    return (
      <label className="mt-2 inline-flex items-center gap-2 text-sm text-ink-muted">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(option.key, event.target.checked)}
          className="h-4 w-4"
        />
        {locale === 'ko' ? 'Enabled' : 'Enabled'}
      </label>
    );
  }

  if (option.type === 'range') {
    return (
      <div className="mt-1 space-y-2">
        <input
          type="range"
          value={Number(value)}
          min={option.min}
          max={option.max}
          step={option.step}
          onChange={(event) => onChange(option.key, Number(event.target.value))}
          className="w-full accent-cyan-400"
        />
        <p className="text-xs font-mono text-ink-muted">{String(value)}</p>
      </div>
    );
  }

  return (
    <input
      type={option.type === 'number' ? 'number' : 'text'}
      value={String(value ?? '')}
      onChange={(event) => onChange(option.key, option.type === 'number' ? Number(event.target.value) : event.target.value)}
      min={option.min}
      max={option.max}
      step={option.step}
      className={className}
    />
  );
}

function pickSupportedMimeType(kind: 'video' | 'audio') {
  const candidates =
    kind === 'video'
      ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4']
      : ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4'];

  if (typeof MediaRecorder === 'undefined') {
    return '';
  }

  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? '';
}

function mimeTypeToExtension(mimeType: string) {
  if (mimeType.includes('png')) {
    return 'png';
  }

  if (mimeType.includes('jpeg')) {
    return 'jpg';
  }

  if (mimeType.includes('ogg')) {
    return 'ogg';
  }

  if (mimeType.includes('mpeg')) {
    return 'mp3';
  }

  if (mimeType.includes('wav')) {
    return 'wav';
  }

  if (mimeType.includes('aac')) {
    return 'aac';
  }

  if (mimeType.includes('quicktime')) {
    return 'mov';
  }

  if (mimeType.includes('mp4')) {
    return mimeType.startsWith('audio/') ? 'm4a' : 'mp4';
  }

  if (mimeType.includes('webm')) {
    return 'webm';
  }

  return 'bin';
}

type BrowserCaptureKind = 'display' | 'user-media';

type DisplayMediaOptions = DisplayMediaStreamOptions & {
  monitorTypeSurfaces?: 'include' | 'exclude';
  preferCurrentTab?: boolean;
  selfBrowserSurface?: 'include' | 'exclude';
  surfaceSwitching?: 'include' | 'exclude';
  systemAudio?: 'include' | 'exclude';
};

function createDisplayMediaOptions(includeAudio: boolean): DisplayMediaOptions {
  return {
    video: {
      frameRate: { ideal: 30, max: 30 },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: includeAudio,
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
    surfaceSwitching: 'include',
    monitorTypeSurfaces: 'include',
    systemAudio: includeAudio ? 'include' : 'exclude',
  };
}

function isRecoverableDisplayAudioError(cause: unknown) {
  return cause instanceof DOMException && ['NotFoundError', 'OverconstrainedError', 'TypeError'].includes(cause.name);
}

async function getDisplayCaptureStream(includeAudio: boolean) {
  try {
    return await navigator.mediaDevices.getDisplayMedia(createDisplayMediaOptions(includeAudio));
  } catch (cause) {
    if (includeAudio && isRecoverableDisplayAudioError(cause)) {
      return await navigator.mediaDevices.getDisplayMedia(createDisplayMediaOptions(false));
    }

    throw cause;
  }
}

function detectMobileViewport() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }

  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const touchPoints = navigator.maxTouchPoints > 0;
  const userAgent = navigator.userAgent.toLowerCase();
  return coarsePointer || touchPoints || /android|iphone|ipad|ipod/.test(userAgent);
}

function getCaptureCapability(kind: BrowserCaptureKind) {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
    return false;
  }

  if (kind === 'display') {
    return typeof navigator.mediaDevices.getDisplayMedia === 'function';
  }

  return typeof navigator.mediaDevices.getUserMedia === 'function';
}

async function waitForVideoReady(video: HTMLVideoElement) {
  if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Failed to prepare the media preview.'));
    };
    const cleanup = () => {
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('error', onError);
    };

    video.addEventListener('loadeddata', onLoaded);
    video.addEventListener('error', onError);
  });
}

async function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string) {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to build an image from the selected capture source.'));
          return;
        }

        resolve(blob);
      },
      mimeType,
      mimeType === 'image/jpeg' ? 0.92 : 1,
    );
  });
}

function createTimestampLabel() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function stopTracks(stream?: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function combineStreams(streams: Array<MediaStream | null | undefined>) {
  return new MediaStream(streams.flatMap((stream) => stream?.getTracks() ?? []));
}

async function captureStillFromDisplay(mimeType: string): Promise<CaptureResult> {
  const displayStream = await getDisplayCaptureStream(false);

  try {
    const video = document.createElement('video');
    video.srcObject = displayStream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    await waitForVideoReady(video);
    await new Promise((resolve) => window.setTimeout(resolve, 120));

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas is unavailable in this browser.');
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await canvasToBlob(canvas, mimeType);

    return {
      name: `screenshot-${createTimestampLabel()}.${mimeTypeToExtension(mimeType)}`,
      blob,
      mimeType,
      details: {
        width: canvas.width,
        height: canvas.height,
        size: formatMegaBytes(blob.size),
      },
    };
  } finally {
    stopTracks(displayStream);
  }
}

async function createScreenCameraSession(
  options: Record<string, string | number | boolean>,
): Promise<CaptureSession> {
  const displayStream = await getDisplayCaptureStream(true);
  const cameraStream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    },
    audio: false,
  });

  const screenVideo = document.createElement('video');
  screenVideo.srcObject = displayStream;
  screenVideo.muted = true;
  screenVideo.playsInline = true;

  const cameraVideo = document.createElement('video');
  cameraVideo.srcObject = cameraStream;
  cameraVideo.muted = true;
  cameraVideo.playsInline = true;

  await Promise.all([screenVideo.play(), cameraVideo.play()]);
  await Promise.all([waitForVideoReady(screenVideo), waitForVideoReady(cameraVideo)]);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(640, screenVideo.videoWidth || 1280);
  canvas.height = Math.max(360, screenVideo.videoHeight || 720);
  const context = canvas.getContext('2d');
  if (!context) {
    stopTracks(displayStream);
    stopTracks(cameraStream);
    throw new Error('Canvas is unavailable in this browser.');
  }

  const scale = Math.max(0.12, Math.min(0.42, Number(options.cameraScale ?? 0.24)));
  const position = String(options.cameraPosition ?? 'bottom-right');
  const margin = 24;
  let rafId = 0;
  let closed = false;

  const draw = () => {
    if (closed) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);

    const overlayWidth = Math.round(canvas.width * scale);
    const aspect = cameraVideo.videoWidth / Math.max(cameraVideo.videoHeight, 1);
    const overlayHeight = Math.max(1, Math.round(overlayWidth / Math.max(aspect, 0.1)));
    const left = position.endsWith('left') ? margin : canvas.width - overlayWidth - margin;
    const top = position.startsWith('top') ? margin : canvas.height - overlayHeight - margin;

    context.save();
    context.fillStyle = 'rgba(15, 23, 42, 0.22)';
    context.beginPath();
    context.roundRect(left - 4, top - 4, overlayWidth + 8, overlayHeight + 8, 20);
    context.fill();
    context.beginPath();
    context.roundRect(left, top, overlayWidth, overlayHeight, 18);
    context.clip();
    context.drawImage(cameraVideo, left, top, overlayWidth, overlayHeight);
    context.restore();

    rafId = window.requestAnimationFrame(draw);
  };

  draw();

  const composedVideoStream = canvas.captureStream(30);
  const audioTracks = displayStream.getAudioTracks();
  const recordStream = new MediaStream([
    ...composedVideoStream.getVideoTracks(),
    ...audioTracks,
  ]);

  return {
    recordStream,
    previewStream: recordStream,
    onEndedTrack: displayStream.getVideoTracks()[0] ?? null,
    cleanup: () => {
      closed = true;
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      stopTracks(composedVideoStream);
      stopTracks(displayStream);
      stopTracks(cameraStream);
    },
  };
}

export function BrowserCaptureWorkbench({ tool }: { tool: ToolDefinition }) {
  const { locale, messages } = useLocale();
  const searchParams = useSearchParams();
  const localizedTool = getLocalizedToolCopy(tool, locale);
  const Icon = categoryIcons[tool.category];
  const style = categoryStyles[tool.category];
  const category = getCategoryCopy(locale, tool.category);
  const captureKind: BrowserCaptureKind = tool.id === 'webcam-recorder' || tool.id === 'audio-recorder' ? 'user-media' : 'display';
  const isMobileDevice = useMemo(() => detectMobileViewport(), []);
  const captureSupported = useMemo(() => getCaptureCapability(captureKind), [captureKind]);
  const mediaRecorderSupported = typeof MediaRecorder !== 'undefined';
  const isCaptureAvailable = captureSupported && mediaRecorderSupported;
  const capabilityMessage = useMemo(() => {
    if (isCaptureAvailable) {
      return null;
    }

    if (!captureSupported) {
      if (captureKind === 'display') {
        return isMobileDevice
          ? 'This mobile browser does not expose screen sharing. Use a Chromium-based mobile browser that supports screen capture, or switch to desktop.'
          : 'This browser does not expose screen capture APIs.';
      }

      return 'This browser does not expose camera or microphone capture APIs.';
    }

    return 'This browser does not support MediaRecorder for local capture.';
  }, [captureKind, captureSupported, isCaptureAvailable, isMobileDevice]);
  const [options, setOptions] = useState<Record<string, string | number | boolean>>(() => getInitialOptions(tool, searchParams));
  const [status, setStatus] = useState<CaptureStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [livePreviewStream, setLivePreviewStream] = useState<MediaStream | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const cleanupRef = useRef<(() => void) | null>(null);
  const endedTrackRef = useRef<MediaStreamTrack | null>(null);
  const timerRef = useRef<number | null>(null);
  const resultPreviewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    setOptions(getInitialOptions(tool, searchParams));
    setStatus('idle');
    setError(null);
    setElapsedSeconds(0);
    setResult((currentResult) => {
      if (currentResult?.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(currentResult.previewUrl);
      }
      return null;
    });
  }, [searchParams, tool]);

  useEffect(() => {
    const video = previewVideoRef.current;
    if (!video) {
      return;
    }

    video.srcObject = livePreviewStream;
    return () => {
      video.srcObject = null;
    };
  }, [livePreviewStream]);

  useEffect(() => {
    const audio = previewAudioRef.current;
    if (!audio) {
      return;
    }

    audio.srcObject = livePreviewStream;
    return () => {
      audio.srcObject = null;
    };
  }, [livePreviewStream]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }

      mediaRecorderRef.current?.stop();
      cleanupRef.current?.();
      if (resultPreviewUrlRef.current) {
        URL.revokeObjectURL(resultPreviewUrlRef.current);
      }
    };
  }, []);

  const stopActiveCapture = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    mediaRecorderRef.current = null;
    cleanupRef.current?.();
    cleanupRef.current = null;
    endedTrackRef.current = null;
    setLivePreviewStream(null);
  };

  const setSingleResult = (nextResult: CaptureResult) => {
    setResult((currentResult) => {
      if (currentResult?.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(currentResult.previewUrl);
      }
      return nextResult;
    });
  };

  const finalizeRecording = (blob: Blob, mimeType: string) => {
    const previewUrl = URL.createObjectURL(blob);
    resultPreviewUrlRef.current = previewUrl;
    setSingleResult({
      name: `${tool.id}-${createTimestampLabel()}.${mimeTypeToExtension(mimeType)}`,
      blob,
      mimeType,
      previewUrl,
      details: {
        duration: `${elapsedSeconds.toFixed(1)} s`,
        size: formatMegaBytes(blob.size),
      },
    });
    setStatus('done');
    toast.success(messages.workbench.success);
    stopActiveCapture();
  };

  const startElapsedTimer = () => {
    setElapsedSeconds(0);
    timerRef.current = window.setInterval(() => {
      setElapsedSeconds((current) => Number((current + 0.1).toFixed(1)));
    }, 100);
  };

  const startRecording = async () => {
    if (!isCaptureAvailable || !navigator.mediaDevices || typeof MediaRecorder === 'undefined') {
      const message = capabilityMessage ?? 'This browser does not support in-browser recording APIs.';
      setError(message);
      setStatus('error');
      toast.error(message);
      return;
    }

    try {
      setStatus('starting');
      setError(null);
      setResult((currentResult) => {
        if (currentResult?.previewUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(currentResult.previewUrl);
        }
        return null;
      });

      let session: CaptureSession;
      const includeMic = Boolean(options.includeMicrophone ?? true);

      if (tool.id === 'screen-recorder') {
        const displayStream = await getDisplayCaptureStream(false);
        session = {
          recordStream: displayStream,
          previewStream: displayStream,
          onEndedTrack: displayStream.getVideoTracks()[0] ?? null,
          cleanup: () => stopTracks(displayStream),
        };
      } else if (tool.id === 'screen-audio-recorder') {
        const displayStream = await getDisplayCaptureStream(true);
        session = {
          recordStream: displayStream,
          previewStream: displayStream,
          onEndedTrack: displayStream.getVideoTracks()[0] ?? null,
          cleanup: () => stopTracks(displayStream),
        };
      } else if (tool.id === 'screen-mic-recorder') {
        const displayStream = await getDisplayCaptureStream(false);
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        const mergedStream = combineStreams([displayStream, micStream]);
        session = {
          recordStream: mergedStream,
          previewStream: displayStream,
          onEndedTrack: displayStream.getVideoTracks()[0] ?? null,
          cleanup: () => {
            stopTracks(mergedStream);
            stopTracks(displayStream);
            stopTracks(micStream);
          },
        };
      } else if (tool.id === 'screen-camera-recorder') {
        session = await createScreenCameraSession(options);
      } else if (tool.id === 'webcam-recorder') {
        const cameraStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
          audio: includeMic,
        });
        session = {
          recordStream: cameraStream,
          previewStream: cameraStream,
          onEndedTrack: cameraStream.getVideoTracks()[0] ?? null,
          cleanup: () => stopTracks(cameraStream),
        };
      } else if (tool.id === 'audio-recorder') {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        session = {
          recordStream: audioStream,
          previewStream: audioStream,
          onEndedTrack: audioStream.getAudioTracks()[0] ?? null,
          cleanup: () => stopTracks(audioStream),
        };
      } else {
        throw new Error('Unsupported browser capture tool.');
      }

      cleanupRef.current = session.cleanup;
      endedTrackRef.current = session.onEndedTrack ?? null;
      setLivePreviewStream(session.previewStream);

      const mimeType = pickSupportedMimeType(tool.id === 'audio-recorder' ? 'audio' : 'video');
      const recorder = mimeType ? new MediaRecorder(session.recordStream, { mimeType }) : new MediaRecorder(session.recordStream);
      chunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const outputMimeType = recorder.mimeType || mimeType || pickSupportedMimeType(tool.id === 'audio-recorder' ? 'audio' : 'video') || (tool.id === 'audio-recorder' ? 'audio/webm' : 'video/webm');
        const blob = new Blob(chunksRef.current, { type: outputMimeType });
        finalizeRecording(blob, outputMimeType);
      };

      session.onEndedTrack?.addEventListener(
        'ended',
        () => {
          if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
          }
        },
        { once: true },
      );

      recorder.start(250);
      startElapsedTimer();
      setStatus('recording');
    } catch (cause) {
      stopActiveCapture();
      const message = cause instanceof Error ? cause.message : 'Could not start browser capture.';
      setError(message);
      setStatus('error');
      toast.error(message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const takeScreenshot = async () => {
    if (!isCaptureAvailable) {
      const message = capabilityMessage ?? 'This browser does not support screen capture.';
      setError(message);
      setStatus('error');
      toast.error(message);
      return;
    }

    try {
      setStatus('starting');
      setError(null);
      const mimeType = String(options.format ?? 'image/png');
      const capture = await captureStillFromDisplay(mimeType);
      const previewUrl = URL.createObjectURL(capture.blob);
      resultPreviewUrlRef.current = previewUrl;
      setSingleResult({
        ...capture,
        previewUrl,
      });
      setStatus('done');
      toast.success(messages.workbench.success);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not capture a screenshot.';
      setError(message);
      setStatus('error');
      toast.error(message);
    }
  };

  const isRecorder = tool.id !== 'screenshot-capture';
  const showProgress = status === 'starting' || status === 'recording' || status === 'error' || status === 'done';
  const progressValue = status === 'starting' ? 15 : status === 'recording' ? Math.min(95, 35 + elapsedSeconds * 2) : status === 'done' ? 100 : 0;
  const progressLabel =
    status === 'starting'
      ? 'Preparing browser capture'
      : status === 'recording'
        ? `Recording live (${elapsedSeconds.toFixed(1)} s)`
        : status === 'done'
          ? 'Capture ready'
          : error ?? messages.workbench.statusIdle;

  const resultTabs = [{ id: 'result', label: messages.workbench.results }];
  const mobileGuidance = isMobileDevice
    ? 'On supported mobile browsers, choose This Tab or the shared screen option when the browser opens the capture picker.'
    : 'On desktop browsers, use the system picker to choose a screen, app window, or browser tab.';

  return (
    <ToolPageLayout title={localizedTool.name} description={localizedTool.description} icon={Icon} iconColor={style.icon}>
      <div className="space-y-6">
        <section className="card grid grid-cols-1 gap-4 p-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">{isRecorder ? 'Live capture' : 'Screenshot source'}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  {isRecorder
                    ? 'Pick a source, preview it live, then stop to save a browser-side recording.'
                    : 'Pick a source and save a still frame without uploading any data.'}
                </p>
              </div>
              <span className={`badge border ${style.badge}`}>{category.nav}</span>
            </div>

            {capabilityMessage ? (
              <div className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
                {capabilityMessage}
              </div>
            ) : null}

            {tool.id === 'audio-recorder' ? (
              <div className="rounded-xl border border-border bg-base-elevated p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-base-subtle text-accent">
                    <Mic size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-ink">Microphone preview</p>
                    <p className="mt-1 text-xs text-ink-muted">The browser will ask for microphone permission when you start.</p>
                  </div>
                </div>
                <audio ref={previewAudioRef} autoPlay muted controls={Boolean(livePreviewStream)} className="mt-4 w-full" />
              </div>
            ) : livePreviewStream ? (
              <div className="rounded-xl border border-border bg-base-elevated p-3">
                <video ref={previewVideoRef} autoPlay muted playsInline controls={false} className="max-h-[26rem] w-full rounded-xl bg-base" />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-base-elevated/70 p-8">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-base-subtle text-prime">
                    {tool.id === 'screenshot-capture' ? <Monitor size={20} /> : tool.id === 'webcam-recorder' ? <Camera size={20} /> : <Play size={20} />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {tool.id === 'screenshot-capture' ? 'No screenshot captured yet' : 'No live capture running'}
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {tool.id === 'screenshot-capture'
                        ? 'Start a one-shot capture and the image preview will appear here.'
                        : 'Start capture to see the live preview before exporting the recording.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              {tool.id === 'screenshot-capture' ? (
                <button type="button" onClick={() => void takeScreenshot()} disabled={!isCaptureAvailable || status === 'starting'} className="btn-primary disabled:cursor-not-allowed disabled:opacity-60">
                  {status === 'starting' ? <LoaderCircle size={16} className="animate-spin" /> : <Monitor size={16} />}
                  Capture screenshot
                </button>
              ) : status === 'recording' ? (
                <button type="button" onClick={stopRecording} className="btn-primary">
                  <CircleStop size={16} />
                  Stop capture
                </button>
              ) : (
                <button type="button" onClick={() => void startRecording()} disabled={!isCaptureAvailable || status === 'starting'} className="btn-primary disabled:cursor-not-allowed disabled:opacity-60">
                  {status === 'starting' ? <LoaderCircle size={16} className="animate-spin" /> : <Play size={16} />}
                  Start capture
                </button>
              )}

              {result ? (
                <button
                  type="button"
                  onClick={() => {
                    downloadBlob(result.blob, result.name);
                  }}
                  className="btn-ghost"
                >
                  <Download size={16} />
                  {messages.workbench.download}
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  stopActiveCapture();
                  setStatus('idle');
                  setError(null);
                  setElapsedSeconds(0);
                  setResult((currentResult) => {
                    if (currentResult?.previewUrl?.startsWith('blob:')) {
                      URL.revokeObjectURL(currentResult.previewUrl);
                    }
                    return null;
                  });
                }}
                className="btn-ghost"
              >
                <RefreshCw size={16} />
                {messages.workbench.retry}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <section className="rounded-xl border border-border bg-base-elevated p-4">
              <p className="text-sm font-semibold text-ink">{messages.workbench.options}</p>
              {tool.options?.length ? (
                <div className="mt-4 space-y-4">
                  {tool.options.map((option) => (
                    <div key={option.key}>
                      <label className="text-xs font-medium uppercase tracking-[0.16em] text-ink-faint">
                        {getLocalizedOptionLabel(option, locale)}
                      </label>
                      {renderField(option, options[option.key], locale, (key, nextValue) =>
                        setOptions((currentOptions) => ({
                          ...currentOptions,
                          [key]: nextValue,
                        }))
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-ink-muted">{messages.workbench.noOptions}</p>
              )}
            </section>

            <section className="rounded-xl border border-border bg-base-elevated p-4">
              <p className="text-sm font-semibold text-ink">Capture notes</p>
              <ul className="mt-3 space-y-2 text-sm text-ink-muted">
                <li>Browser permissions are requested only when capture starts.</li>
                <li>Screen audio depends on browser and operating system support.</li>
                <li>{mobileGuidance}</li>
                <li>Everything stays local to this browser tab until you download it.</li>
              </ul>
            </section>
          </div>
        </section>

        {showProgress ? (
          <section className="card p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">{messages.workbench.progress}</p>
                <p className="mt-1 text-xs text-ink-muted">{progressLabel}</p>
              </div>
              <span className={`badge border ${style.badge}`}>{status}</span>
            </div>
            <ProgressBar
              value={progressValue}
              label={progressLabel}
              status={status === 'error' ? 'error' : status === 'done' ? 'done' : status === 'recording' || status === 'starting' ? 'running' : 'idle'}
            />
          </section>
        ) : null}

        {result ? (
          <Tabs tabs={resultTabs}>
            {() => (
              <div className="space-y-4">
                <ResultCard
                  fileName={result.name}
                  fileSize={formatMegaBytes(result.blob.size)}
                  onDownload={() => downloadBlob(result.blob, result.name)}
                />

                <div className="card space-y-4 p-5">
                  {result.previewUrl && result.mimeType.startsWith('image/') ? (
                    <img src={result.previewUrl} alt={result.name} className="max-h-[34rem] w-full rounded-xl object-contain" />
                  ) : null}
                  {result.previewUrl && result.mimeType.startsWith('video/') ? (
                    <video src={result.previewUrl} controls className="max-h-[34rem] w-full rounded-xl" />
                  ) : null}
                  {result.previewUrl && result.mimeType.startsWith('audio/') ? (
                    <audio src={result.previewUrl} controls className="w-full" />
                  ) : null}
                  {result.details ? (
                    <pre className="overflow-auto rounded-xl border border-border bg-base-subtle p-3 text-xs text-ink">
                      {JSON.stringify(result.details, null, 2)}
                    </pre>
                  ) : null}
                </div>
              </div>
            )}
          </Tabs>
        ) : error ? (
          <section className="card border-danger/30 bg-danger/5 p-5 text-sm text-danger">{error}</section>
        ) : null}
      </div>
    </ToolPageLayout>
  );
}
