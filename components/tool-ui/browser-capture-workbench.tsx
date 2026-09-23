'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Camera, CircleStop, LoaderCircle, Monitor, Play, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { ToolPageLayout } from '@/components/ToolPageLayout';
import { useLocale } from '@/components/providers/locale-provider';
import { ResultCard } from '@/components/ui/ResultCard';
import { formatMegaBytes } from '@/lib/i18n';
import { getLocalizedChoiceLabel, getLocalizedOptionLabel, getLocalizedToolCopy } from '@/lib/tool-localization';
import { getToolIcon } from '@/lib/tool-icons';
import { categoryStyles } from '@/lib/tool-presentation';
import { cx, downloadBlob } from '@/lib/utils';
import { localizeErrorMessage } from '@/lib/error-messages';
import { isOptionApplicable, normalizeToolOptions } from '@/lib/option-schema';
import { ProcessedFile } from '@/types/processor';
import { ToolDefinition, ToolOption } from '@/types/tool';

type CaptureStatus = 'idle' | 'starting' | 'recording' | 'done' | 'error';
type OptionValues = Record<string, string | number | boolean>;

type CaptureResult = ProcessedFile & { duration?: string };

type CaptureSession = {
  recordStream: MediaStream;
  previewStream: MediaStream;
  cleanup: () => void;
  onEndedTrack?: MediaStreamTrack | null;
  /** The user asked for screen sound but did not share it in the picker. */
  missingScreenAudio?: boolean;
};

type DisplayMediaOptions = DisplayMediaStreamOptions & {
  monitorTypeSurfaces?: 'include' | 'exclude';
  preferCurrentTab?: boolean;
  selfBrowserSurface?: 'include' | 'exclude';
  surfaceSwitching?: 'include' | 'exclude';
  systemAudio?: 'include' | 'exclude';
};

const captureCopy = {
  en: {
    startRecording: 'Start recording',
    stopRecording: 'Stop recording',
    captureScreenshot: 'Capture screenshot',
    resetSession: 'Start over',
    captureNotes: 'Capture notes',
    permissionNote: 'The browser asks for permission only when you start.',
    screenAudioNote: 'Screen sound works when you tick “Share audio” in the browser’s share dialog (Chrome and Edge).',
    localOnlyNote: 'Everything stays in this browser tab until you download it.',
    mobileGuidance: 'On supported mobile browsers, choose This Tab or the shared screen option when the browser opens the capture picker.',
    desktopGuidance: 'Press start, then choose a screen, window or browser tab in the dialog.',
    webcamGuidance: 'Press start and allow the camera (and microphone) when asked.',
    mobileDisplayUnsupported:
      'This mobile browser does not expose screen sharing (getDisplayMedia). A web app cannot record the full mobile device screen unless the browser and OS expose that API. Use the device screen recorder or a native app instead.',
    desktopDisplayUnsupported: 'This browser does not expose screen capture APIs.',
    userMediaUnsupported: 'This browser does not expose camera or microphone capture APIs.',
    mediaRecorderUnsupported: 'This browser does not support MediaRecorder for local capture.',
    preparingCapture: 'Preparing capture…',
    recordingLive: 'Recording',
    captureFailed: 'Could not start browser capture.',
    screenshotFailed: 'Could not capture a screenshot.',
    previewFailed: 'Failed to prepare the media preview.',
    imageBuildFailed: 'Failed to build an image from the selected capture source.',
    canvasUnavailable: 'Canvas is unavailable in this browser.',
    missingScreenAudio: 'Screen sound was not shared, so the recording has no screen sound. Tick “Share audio” in the share dialog next time.',
    mobilePlatformLimit: 'If mobile screen capture is unavailable here, that is a browser/OS limitation. A static web app cannot bypass it.',
  },
  ko: {
    startRecording: '녹화 시작',
    stopRecording: '녹화 중지',
    captureScreenshot: '스크린샷 캡처',
    resetSession: '처음부터 다시',
    captureNotes: '캡처 안내',
    permissionNote: '권한 요청은 시작할 때만 브라우저에서 표시됩니다.',
    screenAudioNote: '화면 소리는 공유 창에서 “오디오 공유”를 켜야 녹음됩니다(Chrome, Edge).',
    localOnlyNote: '다운로드하기 전까지 모든 데이터는 이 브라우저 탭 안에만 머뭅니다.',
    mobileGuidance: '지원되는 모바일 브라우저라면 캡처 선택기에서 이 탭 또는 공유 가능한 화면 항목을 선택하세요.',
    desktopGuidance: '시작을 누른 뒤 공유 창에서 화면, 앱 창, 브라우저 탭 중 하나를 고르세요.',
    webcamGuidance: '시작을 누르고 카메라(와 마이크) 권한을 허용하세요.',
    mobileDisplayUnsupported:
      '이 모바일 브라우저는 화면 공유 API(getDisplayMedia)를 제공하지 않습니다. 웹앱만으로 휴대폰 전체 화면을 녹화할 수는 없고, 브라우저와 운영체제가 그 API를 노출해야 합니다. 기기 기본 화면 녹화나 네이티브 앱을 사용해야 합니다.',
    desktopDisplayUnsupported: '이 브라우저는 화면 캡처 API를 제공하지 않습니다.',
    userMediaUnsupported: '이 브라우저는 카메라 또는 마이크 캡처 API를 제공하지 않습니다.',
    mediaRecorderUnsupported: '이 브라우저는 로컬 캡처용 MediaRecorder를 지원하지 않습니다.',
    preparingCapture: '캡처 준비 중…',
    recordingLive: '녹화 중',
    captureFailed: '브라우저 캡처를 시작하지 못했습니다.',
    screenshotFailed: '스크린샷을 캡처하지 못했습니다.',
    previewFailed: '미리보기를 준비하지 못했습니다.',
    imageBuildFailed: '선택한 캡처 소스로 이미지를 만들지 못했습니다.',
    canvasUnavailable: '이 브라우저에서는 캔버스를 사용할 수 없습니다.',
    missingScreenAudio: '화면 소리가 공유되지 않아 녹화에 화면 소리가 없습니다. 다음에는 공유 창에서 “오디오 공유”를 켜 주세요.',
    mobilePlatformLimit: '모바일 기기 캡처가 여기서 동작하지 않는다면 브라우저나 운영체제 제약입니다. 정적 웹앱만으로는 우회할 수 없습니다.',
  },
} as const;

type CaptureCopy = (typeof captureCopy)[keyof typeof captureCopy];

/** Old separate recorders open the merged screen recorder with these settings. */
const LEGACY_RECORDER_SETTINGS: Record<string, { audio: string; camera?: boolean }> = {
  'screen-audio-recorder': { audio: 'system' },
  'screen-mic-recorder': { audio: 'mic' },
  'screen-camera-recorder': { audio: 'system', camera: true },
};

function recorderSettings(toolId: string, options: OptionValues) {
  const legacy = LEGACY_RECORDER_SETTINGS[toolId];
  return {
    audio: String(legacy?.audio ?? options.audio ?? 'none'),
    camera: Boolean(legacy?.camera ?? options.camera ?? false),
  };
}

function getInitialOptions(tool: ToolDefinition, searchParams: Pick<URLSearchParams, 'get'>): OptionValues {
  const raw: Record<string, unknown> = {};
  for (const option of tool.options ?? []) {
    raw[option.key] = searchParams.get(option.key) ?? option.defaultValue;
  }
  return normalizeToolOptions(tool.options ?? [], raw);
}

function renderField(
  option: ToolOption,
  value: string | number | boolean | undefined,
  locale: 'en' | 'ko',
  inputId: string,
  onChange: (key: string, nextValue: string | number | boolean) => void,
) {
  if (option.type === 'select') {
    return (
      <select id={inputId} value={String(value)} onChange={(event) => onChange(option.key, event.target.value)} className="input-surface h-10 w-full">
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
      <label className="inline-flex items-center gap-2 text-sm text-ink-muted">
        <input
          id={inputId}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(option.key, event.target.checked)}
          className="h-4 w-4 rounded accent-prime"
        />
        {getLocalizedChoiceLabel('Enabled', locale)}
      </label>
    );
  }

  if (option.type === 'range') {
    return (
      <div className="flex items-center gap-3">
        <input
          id={inputId}
          type="range"
          value={Number(value)}
          min={option.min}
          max={option.max}
          step={option.step}
          onChange={(event) => onChange(option.key, Number(event.target.value))}
          className="w-full accent-prime"
        />
        <output htmlFor={inputId} className="w-12 shrink-0 text-right text-sm font-medium tabular-nums text-ink">
          {String(value)}
        </output>
      </div>
    );
  }

  return (
    <input
      id={inputId}
      type={option.type === 'number' ? 'number' : 'text'}
      value={String(value ?? '')}
      onChange={(event) => onChange(option.key, option.type === 'number' ? Number(event.target.value) : event.target.value)}
      min={option.min}
      max={option.max}
      step={option.step}
      className="input-surface h-10 w-full"
    />
  );
}

function pickSupportedMimeType() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
  ];
  if (typeof MediaRecorder === 'undefined') {
    return '';
  }
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? '';
}

function mimeTypeToExtension(mimeType: string) {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('jpeg')) return 'jpg';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('webm')) return 'webm';
  return 'bin';
}

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

function getCaptureCapability(kind: 'display' | 'user-media') {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
    return false;
  }
  return kind === 'display'
    ? typeof navigator.mediaDevices.getDisplayMedia === 'function'
    : typeof navigator.mediaDevices.getUserMedia === 'function';
}

async function waitForVideoReady(video: HTMLVideoElement, failureMessage: string) {
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
      reject(new Error(failureMessage));
    };
    const cleanup = () => {
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('loadeddata', onLoaded);
    video.addEventListener('error', onError);
  });
}

async function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, failureMessage: string) {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(failureMessage))),
      mimeType,
      mimeType === 'image/jpeg' ? 0.92 : 1,
    );
  });
}

/**
 * MediaRecorder WebM files carry no duration, so players show "Infinity" and
 * no seek bar. Seeking far past the end makes the browser scan the file and
 * learn the real duration; then jump back to the start.
 */
function fixUnknownDuration(event: React.SyntheticEvent<HTMLMediaElement>) {
  const media = event.currentTarget;
  if (media.duration !== Infinity) {
    return;
  }
  const restore = () => {
    media.removeEventListener('durationchange', restore);
    media.currentTime = 0;
  };
  media.addEventListener('durationchange', restore);
  media.currentTime = Number.MAX_SAFE_INTEGER;
}

/** 75.4 → "1:15" */
function formatClock(totalSeconds: number) {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function createTimestampLabel() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function stopTracks(stream?: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

/**
 * One audio track from several sources. MediaRecorder records only the first
 * audio track of a stream, so screen sound + microphone must be mixed.
 */
function mixAudio(streams: Array<MediaStream | null>): { tracks: MediaStreamTrack[]; cleanup: () => void } {
  const withAudio = streams.filter((stream): stream is MediaStream => Boolean(stream && stream.getAudioTracks().length > 0));
  if (withAudio.length <= 1) {
    return { tracks: withAudio[0]?.getAudioTracks() ?? [], cleanup: () => undefined };
  }
  const context = new AudioContext();
  const destination = context.createMediaStreamDestination();
  withAudio.forEach((stream) => context.createMediaStreamSource(stream).connect(destination));
  return { tracks: destination.stream.getAudioTracks(), cleanup: () => void context.close() };
}

async function captureStillFromDisplay(mimeType: string, copy: CaptureCopy): Promise<CaptureResult> {
  const displayStream = await getDisplayCaptureStream(false);
  try {
    const video = document.createElement('video');
    video.srcObject = displayStream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    await waitForVideoReady(video, copy.previewFailed);
    await new Promise((resolve) => window.setTimeout(resolve, 120));

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error(copy.canvasUnavailable);
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await canvasToBlob(canvas, mimeType, copy.imageBuildFailed);
    return { name: `screenshot-${createTimestampLabel()}.${mimeTypeToExtension(mimeType)}`, blob, mimeType };
  } finally {
    stopTracks(displayStream);
  }
}

/** The screen with the camera in a rounded corner box, drawn onto a canvas. */
async function composeCameraOverlay(displayStream: MediaStream, options: OptionValues, copy: CaptureCopy) {
  const cameraStream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
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

  try {
    await Promise.all([screenVideo.play(), cameraVideo.play()]);
    await Promise.all([waitForVideoReady(screenVideo, copy.previewFailed), waitForVideoReady(cameraVideo, copy.previewFailed)]);
  } catch (cause) {
    stopTracks(cameraStream);
    throw cause;
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(640, screenVideo.videoWidth || 1280);
  canvas.height = Math.max(360, screenVideo.videoHeight || 720);
  const context = canvas.getContext('2d');
  if (!context) {
    stopTracks(cameraStream);
    throw new Error(copy.canvasUnavailable);
  }

  const scale = Math.max(0.12, Math.min(0.42, Number(options.cameraScale ?? 0.24)));
  const position = String(options.cameraPosition ?? 'bottom-right');
  const margin = 24;
  let rafId = 0;
  let closed = false;

  const draw = () => {
    if (closed) return;
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

  const stream = canvas.captureStream(30);
  return {
    stream,
    cleanup: () => {
      closed = true;
      window.cancelAnimationFrame(rafId);
      stopTracks(stream);
      stopTracks(cameraStream);
    },
  };
}

/** Screen video plus the chosen sound (screen, microphone or both) and camera. */
async function createScreenSession(toolId: string, options: OptionValues, copy: CaptureCopy): Promise<CaptureSession> {
  const { audio, camera } = recorderSettings(toolId, options);
  const wantsScreenSound = audio === 'system' || audio === 'both';
  const wantsMic = audio === 'mic' || audio === 'both';
  const displayStream = await getDisplayCaptureStream(wantsScreenSound);
  const cleanups: Array<() => void> = [() => stopTracks(displayStream)];

  try {
    let micStream: MediaStream | null = null;
    if (wantsMic) {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const mic = micStream;
      cleanups.push(() => stopTracks(mic));
    }

    let previewStream = displayStream;
    let videoTracks = displayStream.getVideoTracks();
    if (camera) {
      const overlay = await composeCameraOverlay(displayStream, options, copy);
      cleanups.push(overlay.cleanup);
      previewStream = overlay.stream;
      videoTracks = overlay.stream.getVideoTracks();
    }

    const sound = mixAudio([wantsScreenSound ? displayStream : null, micStream]);
    cleanups.push(sound.cleanup);

    return {
      recordStream: new MediaStream([...videoTracks, ...sound.tracks]),
      previewStream,
      onEndedTrack: displayStream.getVideoTracks()[0] ?? null,
      missingScreenAudio: wantsScreenSound && displayStream.getAudioTracks().length === 0,
      cleanup: () => [...cleanups].reverse().forEach((cleanup) => cleanup()),
    };
  } catch (cause) {
    [...cleanups].reverse().forEach((cleanup) => cleanup());
    throw cause;
  }
}

async function createWebcamSession(options: OptionValues): Promise<CaptureSession> {
  const cameraStream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
    audio: Boolean(options.includeMicrophone ?? true),
  });
  return {
    recordStream: cameraStream,
    previewStream: cameraStream,
    onEndedTrack: cameraStream.getVideoTracks()[0] ?? null,
    cleanup: () => stopTracks(cameraStream),
  };
}

export function BrowserCaptureWorkbench({ tool }: { tool: ToolDefinition }) {
  const { locale, messages } = useLocale();
  const rawSearchParams = useSearchParams();
  const searchParams: Pick<URLSearchParams, 'get'> = useMemo(() => rawSearchParams ?? new URLSearchParams(), [rawSearchParams]);
  const localizedTool = getLocalizedToolCopy(tool, locale);
  const Icon = getToolIcon(tool.id, tool.category);
  const style = categoryStyles[tool.category];
  const copy = captureCopy[locale];
  const isScreenshot = tool.id === 'screenshot-capture';
  const isWebcam = tool.id === 'webcam-recorder';
  const captureKind = isWebcam ? 'user-media' : 'display';
  const isMobileDevice = useMemo(() => detectMobileViewport(), []);
  const captureSupported = useMemo(() => getCaptureCapability(captureKind), [captureKind]);
  const mediaRecorderSupported = typeof MediaRecorder !== 'undefined';
  const isCaptureAvailable = captureSupported && (isScreenshot || mediaRecorderSupported);
  const [options, setOptions] = useState<OptionValues>(() => getInitialOptions(tool, searchParams));
  const [status, setStatus] = useState<CaptureStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [livePreviewStream, setLivePreviewStream] = useState<MediaStream | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const cleanupRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<number | null>(null);
  const elapsedRef = useRef(0);
  const resultUrlRef = useRef<string | null>(null);

  const capabilityMessage = useMemo(() => {
    if (isCaptureAvailable) return null;
    if (!captureSupported) {
      if (captureKind === 'display') {
        return isMobileDevice ? copy.mobileDisplayUnsupported : copy.desktopDisplayUnsupported;
      }
      return copy.userMediaUnsupported;
    }
    return copy.mediaRecorderUnsupported;
  }, [captureKind, captureSupported, copy, isCaptureAvailable, isMobileDevice]);

  const replaceResult = (next: CaptureResult | null) => {
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
    }
    resultUrlRef.current = next?.previewUrl ?? null;
    setResult(next);
  };

  const stopActiveCapture = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    mediaRecorderRef.current = null;
    cleanupRef.current?.();
    cleanupRef.current = null;
    setLivePreviewStream(null);
  };

  useEffect(() => {
    setOptions(getInitialOptions(tool, searchParams));
    setStatus('idle');
    setError(null);
    setNotice(null);
    setElapsedSeconds(0);
    replaceResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the tool or its link changes
  }, [searchParams, tool]);

  useEffect(() => {
    const video = previewVideoRef.current;
    if (!video) return;
    video.srcObject = livePreviewStream;
    return () => {
      video.srcObject = null;
    };
  }, [livePreviewStream]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      mediaRecorderRef.current?.stop();
      cleanupRef.current?.();
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, []);

  const startElapsedTimer = () => {
    const startedAt = performance.now();
    elapsedRef.current = 0;
    setElapsedSeconds(0);
    timerRef.current = window.setInterval(() => {
      elapsedRef.current = (performance.now() - startedAt) / 1000;
      setElapsedSeconds(Number(elapsedRef.current.toFixed(1)));
    }, 200);
  };

  const fail = (cause: unknown, fallback: string) => {
    stopActiveCapture();
    setError(localizeErrorMessage(cause, locale) || fallback);
    setStatus('error');
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices || !isCaptureAvailable) {
      setError(capabilityMessage ?? copy.desktopDisplayUnsupported);
      setStatus('error');
      return;
    }

    try {
      setStatus('starting');
      setError(null);
      setNotice(null);
      replaceResult(null);

      const session = isWebcam ? await createWebcamSession(options) : await createScreenSession(tool.id, options, copy);
      cleanupRef.current = session.cleanup;
      setLivePreviewStream(session.previewStream);
      if (session.missingScreenAudio) {
        setNotice(copy.missingScreenAudio);
      }

      const mimeType = pickSupportedMimeType();
      const recorder = mimeType ? new MediaRecorder(session.recordStream, { mimeType }) : new MediaRecorder(session.recordStream);
      chunksRef.current = [];
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const outputMimeType = recorder.mimeType || mimeType || 'video/webm';
        const blob = new Blob(chunksRef.current, { type: outputMimeType });
        stopActiveCapture();
        replaceResult({
          name: `${tool.id}-${createTimestampLabel()}.${mimeTypeToExtension(outputMimeType)}`,
          blob,
          mimeType: outputMimeType,
          previewUrl: URL.createObjectURL(blob),
          duration: formatClock(elapsedRef.current),
        });
        setStatus('done');
      };
      // Stopping the share from the browser's own bar ends the recording too.
      session.onEndedTrack?.addEventListener(
        'ended',
        () => {
          if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
        },
        { once: true },
      );

      recorder.start(250);
      startElapsedTimer();
      setStatus('recording');
    } catch (cause) {
      fail(cause, copy.captureFailed);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const takeScreenshot = async () => {
    if (!isCaptureAvailable) {
      setError(capabilityMessage ?? copy.desktopDisplayUnsupported);
      setStatus('error');
      return;
    }
    try {
      setStatus('starting');
      setError(null);
      const capture = await captureStillFromDisplay(String(options.format ?? 'image/png'), copy);
      replaceResult({ ...capture, previewUrl: URL.createObjectURL(capture.blob) });
      setStatus('done');
    } catch (cause) {
      fail(cause, copy.screenshotFailed);
    }
  };

  const resetSession = () => {
    stopActiveCapture();
    setStatus('idle');
    setError(null);
    setNotice(null);
    setElapsedSeconds(0);
    replaceResult(null);
  };

  const guidanceLine = isWebcam ? copy.webcamGuidance : isMobileDevice ? copy.mobileGuidance : copy.desktopGuidance;
  const captureNotes = isWebcam
    ? [copy.permissionNote, copy.localOnlyNote]
    : [copy.permissionNote, copy.screenAudioNote, copy.mobilePlatformLimit, copy.localOnlyNote];
  const visibleOptions = (tool.options ?? []).filter((option) => !option.hidden && isOptionApplicable(option, options));
  const IdleIcon = isScreenshot ? Monitor : isWebcam ? Camera : Play;
  const busy = status === 'starting' || status === 'recording';

  return (
    <ToolPageLayout
      title={localizedTool.name}
      description={localizedTool.description}
      icon={Icon}
      iconColor={style.icon}
      iconBg={style.iconBg}
    >
      <div className="space-y-5">
        <div className={cx('grid grid-cols-1 gap-5', visibleOptions.length > 0 && 'xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] xl:items-start')}>
          <section className="workspace-panel space-y-4 p-5 sm:p-6">
            {capabilityMessage ? (
              <div role="status" className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
                {capabilityMessage}
              </div>
            ) : null}

            {livePreviewStream ? (
              <div className="overflow-hidden rounded-2xl border border-border bg-black">
                <video ref={previewVideoRef} autoPlay muted playsInline controls={false} className="max-h-[26rem] w-full" />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border-strong bg-base-subtle/40 px-6 py-10 text-center sm:py-12">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-prime/10 text-prime">
                  <IdleIcon size={21} aria-hidden="true" />
                </span>
                <p className="max-w-md text-sm text-ink-muted">{guidanceLine}</p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {isScreenshot ? (
                <button
                  type="button"
                  onClick={() => void takeScreenshot()}
                  disabled={!isCaptureAvailable || status === 'starting'}
                  className="btn-primary h-11 px-5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {status === 'starting' ? <LoaderCircle size={17} className="animate-spin" /> : <Monitor size={17} />}
                  {copy.captureScreenshot}
                </button>
              ) : status === 'recording' ? (
                <button type="button" onClick={stopRecording} className="btn-primary h-11 px-5">
                  <CircleStop size={17} />
                  {copy.stopRecording}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void startRecording()}
                  disabled={!isCaptureAvailable || status === 'starting'}
                  className="btn-primary h-11 px-5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {status === 'starting' ? <LoaderCircle size={17} className="animate-spin" /> : <Play size={17} />}
                  {copy.startRecording}
                </button>
              )}

              {status === 'recording' ? (
                <span className="inline-flex items-center gap-2 text-sm font-semibold tabular-nums text-danger">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" aria-hidden="true" />
                  {copy.recordingLive} {formatClock(elapsedSeconds)}
                </span>
              ) : status === 'starting' ? (
                <span className="text-sm text-ink-muted">{copy.preparingCapture}</span>
              ) : null}

              {(result || error) && !busy ? (
                <button type="button" onClick={resetSession} className="btn-ghost ml-auto h-11">
                  <RefreshCw size={16} />
                  {copy.resetSession}
                </button>
              ) : null}
            </div>

            {notice ? (
              <p role="status" className="rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
                {notice}
              </p>
            ) : null}

            <details className="text-sm text-ink-muted">
              <summary className="cursor-pointer select-none text-xs font-medium text-ink-faint hover:text-ink">{copy.captureNotes}</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed">
                {captureNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </details>
          </section>

          {visibleOptions.length > 0 ? (
            <aside className="workspace-panel p-5 sm:p-6 xl:sticky xl:top-[4.5rem]">
              <h2 className="text-[15px] font-semibold text-ink">{messages.workbench.options}</h2>
              <div className="mt-5 space-y-5">
                {visibleOptions.map((option) => {
                  const inputId = `capture-option-${option.key}`;
                  return (
                    <div key={option.key} className="space-y-2">
                      <label htmlFor={inputId} className="block text-sm font-medium text-ink">
                        {getLocalizedOptionLabel(option, locale)}
                      </label>
                      {renderField(option, options[option.key], locale, inputId, (key, nextValue) =>
                        setOptions((currentOptions) => ({ ...currentOptions, [key]: nextValue })),
                      )}
                    </div>
                  );
                })}
              </div>
            </aside>
          ) : null}
        </div>

        {error ? (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-danger/25 bg-danger/5 p-4 text-sm text-danger">
            <AlertCircle size={18} className="mt-px shrink-0" aria-hidden="true" />
            <p className="min-w-0 break-words">{error}</p>
          </div>
        ) : null}

        {result ? (
          <ResultCard
            fileName={result.name}
            fileSize={[formatMegaBytes(result.blob.size), result.duration ?? null].filter(Boolean).join(' · ')}
            mimeType={result.mimeType}
            thumbnailUrl={result.previewUrl && result.mimeType.startsWith('image/') ? result.previewUrl : undefined}
            primary
            onDownload={() => downloadBlob(result.blob, result.name)}
          >
            {result.previewUrl && result.mimeType.startsWith('image/') ? (
              <img src={result.previewUrl} alt={result.name} className="max-h-[34rem] w-full rounded-xl object-contain" />
            ) : null}
            {result.previewUrl && result.mimeType.startsWith('video/') ? (
              <video src={result.previewUrl} controls onLoadedMetadata={fixUnknownDuration} className="max-h-[34rem] w-full rounded-xl bg-black" />
            ) : null}
          </ResultCard>
        ) : null}
      </div>
    </ToolPageLayout>
  );
}
