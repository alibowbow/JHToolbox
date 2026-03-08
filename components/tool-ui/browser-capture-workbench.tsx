'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CircleStop, Download, LoaderCircle, Monitor, Play, RefreshCw, Scissors } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { ToolPageLayout } from '@/components/ToolPageLayout';
import { useLocale } from '@/components/providers/locale-provider';
import { AudioWaveformEditor } from '@/components/ui/AudioWaveformEditor';
import { LiveAudioWaveform } from '@/components/ui/LiveAudioWaveform';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ResultCard } from '@/components/ui/ResultCard';
import { Tabs } from '@/components/ui/Tabs';
import { toast } from '@/components/ui/Toast';
import { formatMegaBytes, getCategoryCopy } from '@/lib/i18n';
import { createWavRecordingSession, type WavRecordingSession } from '@/lib/processors/audio-recording';
import { convertAudioFile, trimAudioFile } from '@/lib/processors/media';
import { getLocalizedChoiceLabel, getLocalizedOptionLabel, getLocalizedToolCopy } from '@/lib/tool-localization';
import { categoryIcons, categoryStyles } from '@/lib/tool-presentation';
import { downloadBlob } from '@/lib/utils';
import { ProcessedFile } from '@/types/processor';
import { ToolDefinition, ToolOption } from '@/types/tool';

type CaptureStatus = 'idle' | 'starting' | 'recording' | 'done' | 'error';
type BrowserCaptureKind = 'display' | 'user-media';

type CaptureResult = ProcessedFile & {
  details?: Record<string, string | number | boolean>;
};

type CaptureSession = {
  recordStream: MediaStream;
  previewStream: MediaStream;
  cleanup: () => void;
  onEndedTrack?: MediaStreamTrack | null;
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
    enabled: 'Enabled',
    liveCapture: 'Live capture',
    screenshotSource: 'Screenshot source',
    liveCaptureDescription: 'Pick a source, preview it live, then stop to save a browser-side recording.',
    screenshotSourceDescription: 'Pick a source and save a still frame without uploading any data.',
    microphonePreview: 'Microphone preview',
    microphonePreviewDescription: 'The browser will ask for microphone permission when you start.',
    microphoneEditorDescription: 'After recording stops, the waveform editor will appear here so you can trim before export.',
    noScreenshotYet: 'No screenshot captured yet',
    noLiveCapture: 'No live capture running',
    screenshotIdleDescription: 'Start a one-shot capture and the image preview will appear here.',
    liveCaptureIdleDescription: 'Start capture to see the live preview before exporting the recording.',
    startCapture: 'Start capture',
    stopCapture: 'Stop capture',
    startRecording: 'Start recording',
    stopRecording: 'Stop recording',
    captureScreenshot: 'Capture screenshot',
    resetSession: 'Start over',
    captureNotes: 'Capture notes',
    permissionNote: 'Browser permissions are requested only when capture starts.',
    screenAudioNote: 'Screen audio depends on browser and operating system support.',
    localOnlyNote: 'Everything stays local to this browser tab until you download it.',
    mobileGuidance: 'On supported mobile browsers, choose This Tab or the shared screen option when the browser opens the capture picker.',
    desktopGuidance: 'On desktop browsers, use the system picker to choose a screen, app window, or browser tab.',
    mobileDisplayUnsupported:
      'This mobile browser does not expose screen sharing (getDisplayMedia). A web app cannot record the full mobile device screen unless the browser and OS expose that API. Use the device screen recorder or a native app instead.',
    desktopDisplayUnsupported: 'This browser does not expose screen capture APIs.',
    userMediaUnsupported: 'This browser does not expose camera or microphone capture APIs.',
    mediaRecorderUnsupported: 'This browser does not support MediaRecorder for local capture.',
    genericCaptureUnsupported: 'This browser does not support in-browser recording APIs.',
    preparingCapture: 'Preparing browser capture',
    recordingLive: 'Recording live',
    captureReady: 'Capture ready',
    preparingAudio: 'Preparing audio editor',
    waveformEditor: 'Waveform editor',
    waveformEditorDescription: 'Review the master WAV recording, adjust the selection, then export WAV or MP3.',
    exportEditedAudio: 'Export edited audio',
    masterRecordingReady: 'Master recording ready',
    currentAudioOutput: 'Current output',
    recordingReadyToast: 'The recording is ready in the waveform editor.',
    audioExportReadyToast: 'The edited recording is ready to download.',
    screenshotReadyToast: 'The screenshot is ready.',
    captureFailed: 'Could not start browser capture.',
    screenshotFailed: 'Could not capture a screenshot.',
    unsupportedTool: 'Unsupported browser capture tool.',
    previewFailed: 'Failed to prepare the media preview.',
    imageBuildFailed: 'Failed to build an image from the selected capture source.',
    canvasUnavailable: 'Canvas is unavailable in this browser.',
    rawInputFormat: 'Recorded input',
    editedOutput: 'Edited output',
    selectionMode: 'Selection mode',
    keepSelection: 'Keep selection',
    removeSelection: 'Remove selection',
    mobilePlatformLimit: 'If mobile screen capture is unavailable here, that is a browser/OS limitation. A static web app cannot bypass it.',
  },
  ko: {
    enabled: '사용',
    liveCapture: '실시간 캡처',
    screenshotSource: '스크린샷 대상',
    liveCaptureDescription: '소스를 선택하고 실시간으로 확인한 뒤, 중지해서 브라우저 안에서 바로 저장합니다.',
    screenshotSourceDescription: '소스를 선택해 정지 이미지를 로컬에서 바로 저장합니다.',
    microphonePreview: '마이크 미리 듣기',
    microphonePreviewDescription: '녹음을 시작할 때 브라우저가 마이크 권한을 요청합니다.',
    microphoneEditorDescription: '녹음이 끝나면 여기에서 파형 편집기를 열어 잘라낸 뒤 저장할 수 있습니다.',
    noScreenshotYet: '아직 캡처한 스크린샷이 없습니다.',
    noLiveCapture: '현재 실행 중인 캡처가 없습니다.',
    screenshotIdleDescription: '한 번 캡처를 시작하면 결과 이미지가 여기에 표시됩니다.',
    liveCaptureIdleDescription: '캡처를 시작하면 저장 전에 실시간 미리보기가 여기에 표시됩니다.',
    startCapture: '캡처 시작',
    stopCapture: '캡처 중지',
    startRecording: '녹음 시작',
    stopRecording: '녹음 중지',
    captureScreenshot: '스크린샷 캡처',
    resetSession: '처음부터 다시',
    captureNotes: '캡처 안내',
    permissionNote: '권한 요청은 캡처를 시작할 때만 브라우저에서 표시됩니다.',
    screenAudioNote: '화면 오디오는 브라우저와 운영체제 지원 여부에 따라 달라집니다.',
    localOnlyNote: '다운로드하기 전까지 모든 데이터는 이 브라우저 탭 안에만 머뭅니다.',
    mobileGuidance: '지원되는 모바일 브라우저라면 캡처 선택기에서 이 탭 또는 공유 가능한 화면 항목을 선택하세요.',
    desktopGuidance: '데스크톱 브라우저에서는 시스템 선택기에서 화면, 앱 창, 브라우저 탭을 고를 수 있습니다.',
    mobileDisplayUnsupported:
      '이 모바일 브라우저는 화면 공유 API(getDisplayMedia)를 제공하지 않습니다. 웹앱만으로 휴대폰 전체 화면을 녹화할 수는 없고, 브라우저와 운영체제가 그 API를 노출해야 합니다. 기기 기본 화면 녹화나 네이티브 앱을 사용해야 합니다.',
    desktopDisplayUnsupported: '이 브라우저는 화면 캡처 API를 제공하지 않습니다.',
    userMediaUnsupported: '이 브라우저는 카메라 또는 마이크 캡처 API를 제공하지 않습니다.',
    mediaRecorderUnsupported: '이 브라우저는 로컬 캡처용 MediaRecorder를 지원하지 않습니다.',
    genericCaptureUnsupported: '이 브라우저는 브라우저 내 녹화 API를 지원하지 않습니다.',
    preparingCapture: '브라우저 캡처 준비 중',
    recordingLive: '실시간 녹화 중',
    captureReady: '캡처 준비 완료',
    preparingAudio: '오디오 편집기 준비 중',
    waveformEditor: '파형 편집기',
    waveformEditorDescription: '마스터 WAV 녹음을 확인하고, 구간을 조정한 뒤 WAV 또는 MP3로 내보내세요.',
    exportEditedAudio: '편집한 오디오 저장',
    masterRecordingReady: '마스터 녹음 준비 완료',
    currentAudioOutput: '현재 출력',
    recordingReadyToast: '녹음이 파형 편집기에 준비되었습니다.',
    audioExportReadyToast: '편집한 녹음 파일이 준비되었습니다.',
    screenshotReadyToast: '스크린샷이 준비되었습니다.',
    captureFailed: '브라우저 캡처를 시작하지 못했습니다.',
    screenshotFailed: '스크린샷을 캡처하지 못했습니다.',
    unsupportedTool: '지원되지 않는 브라우저 캡처 도구입니다.',
    previewFailed: '미리보기를 준비하지 못했습니다.',
    imageBuildFailed: '선택한 캡처 소스로 이미지를 만들지 못했습니다.',
    canvasUnavailable: '이 브라우저에서는 캔버스를 사용할 수 없습니다.',
    rawInputFormat: '녹음 입력 포맷',
    editedOutput: '편집 결과 포맷',
    selectionMode: '선택 처리',
    keepSelection: '선택 구간 유지',
    removeSelection: '선택 구간 제거',
    mobilePlatformLimit: '모바일 기기 캡처가 여기서 동작하지 않는다면 브라우저나 운영체제 제약입니다. 정적 웹앱만으로는 우회할 수 없습니다.',
  },
} as const;

function getDefaults(tool: ToolDefinition): Record<string, string | number | boolean> {
  const entries = (tool.options ?? []).map((option) => [option.key, option.defaultValue] as const);
  return Object.fromEntries(entries);
}

function getInitialOptions(tool: ToolDefinition, searchParams: Pick<URLSearchParams, 'get'>) {
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
        {getLocalizedChoiceLabel('Enabled', locale)}
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
      onChange={(event) =>
        onChange(option.key, option.type === 'number' ? Number(event.target.value) : event.target.value)
      }
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
      ? [
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp8,opus',
          'video/webm',
          'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
          'video/mp4',
        ]
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
      (blob) => {
        if (!blob) {
          reject(new Error(failureMessage));
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

async function captureStillFromDisplay(
  mimeType: string,
  copy: (typeof captureCopy)[keyof typeof captureCopy],
): Promise<CaptureResult> {
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
  copy: (typeof captureCopy)[keyof typeof captureCopy],
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
  await Promise.all([waitForVideoReady(screenVideo, copy.previewFailed), waitForVideoReady(cameraVideo, copy.previewFailed)]);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(640, screenVideo.videoWidth || 1280);
  canvas.height = Math.max(360, screenVideo.videoHeight || 720);
  const context = canvas.getContext('2d');
  if (!context) {
    stopTracks(displayStream);
    stopTracks(cameraStream);
    throw new Error(copy.canvasUnavailable);
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
  const recordStream = new MediaStream([...composedVideoStream.getVideoTracks(), ...audioTracks]);

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
  const copy = captureCopy[locale];
  const captureKind: BrowserCaptureKind =
    tool.id === 'webcam-recorder' || tool.id === 'audio-recorder' ? 'user-media' : 'display';
  const isMobileDevice = useMemo(() => detectMobileViewport(), []);
  const captureSupported = useMemo(() => getCaptureCapability(captureKind), [captureKind]);
  const mediaRecorderSupported = typeof MediaRecorder !== 'undefined';
  const isCaptureAvailable = captureSupported && mediaRecorderSupported;
  const isAudioRecorder = tool.id === 'audio-recorder';
  const isRecorder = tool.id !== 'screenshot-capture';
  const [options, setOptions] = useState<Record<string, string | number | boolean>>(() =>
    getInitialOptions(tool, searchParams),
  );
  const [status, setStatus] = useState<CaptureStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [livePreviewStream, setLivePreviewStream] = useState<MediaStream | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [audioEditorFile, setAudioEditorFile] = useState<File | null>(null);
  const [audioEditorPreviewUrl, setAudioEditorPreviewUrl] = useState<string | null>(null);
  const [liveAudioPeaks, setLiveAudioPeaks] = useState<number[]>([]);
  const [progress, setProgress] = useState<{ percent: number; stage: string }>({
    percent: 0,
    stage: messages.workbench.statusIdle,
  });
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const wavRecorderRef = useRef<WavRecordingSession | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const cleanupRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<number | null>(null);
  const resultPreviewUrlRef = useRef<string | null>(null);
  const editorPreviewUrlRef = useRef<string | null>(null);

  const capabilityMessage = useMemo(() => {
    if (isCaptureAvailable) {
      return null;
    }

    if (!captureSupported) {
      if (captureKind === 'display') {
        return isMobileDevice ? copy.mobileDisplayUnsupported : copy.desktopDisplayUnsupported;
      }

      return copy.userMediaUnsupported;
    }

    return copy.mediaRecorderUnsupported;
  }, [captureKind, captureSupported, copy, isCaptureAvailable, isMobileDevice]);

  useEffect(() => {
    setOptions(getInitialOptions(tool, searchParams));
    setStatus('idle');
    setError(null);
    setElapsedSeconds(0);
    setLiveAudioPeaks([]);
    setProgress({ percent: 0, stage: messages.workbench.statusIdle });
    setResult((currentResult) => {
      if (currentResult?.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(currentResult.previewUrl);
      }
      resultPreviewUrlRef.current = null;
      return null;
    });
    setAudioEditorPreviewUrl((currentUrl) => {
      if (currentUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(currentUrl);
      }
      editorPreviewUrlRef.current = null;
      return null;
    });
    setAudioEditorFile(null);
  }, [messages.workbench.statusIdle, searchParams, tool]);

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
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }

      mediaRecorderRef.current?.stop();
      void wavRecorderRef.current?.cleanup();
      cleanupRef.current?.();
      if (resultPreviewUrlRef.current) {
        URL.revokeObjectURL(resultPreviewUrlRef.current);
      }
      if (editorPreviewUrlRef.current) {
        URL.revokeObjectURL(editorPreviewUrlRef.current);
      }
    };
  }, []);

  const setSingleResult = (nextResult: CaptureResult) => {
    setResult((currentResult) => {
      if (currentResult?.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(currentResult.previewUrl);
      }
      resultPreviewUrlRef.current = nextResult.previewUrl ?? null;
      return nextResult;
    });
  };

  const setAudioEditorSource = (file: File) => {
    setAudioEditorPreviewUrl((currentUrl) => {
      if (currentUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(currentUrl);
      }
      const nextUrl = URL.createObjectURL(file);
      editorPreviewUrlRef.current = nextUrl;
      return nextUrl;
    });
    setAudioEditorFile(file);
  };

  const stopActiveCapture = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    mediaRecorderRef.current = null;
    wavRecorderRef.current = null;
    cleanupRef.current?.();
    cleanupRef.current = null;
    setLivePreviewStream(null);
  };

  const resetSession = () => {
    stopActiveCapture();
    setStatus('idle');
    setError(null);
    setElapsedSeconds(0);
    setLiveAudioPeaks([]);
    setProgress({ percent: 0, stage: messages.workbench.statusIdle });
    setResult((currentResult) => {
      if (currentResult?.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(currentResult.previewUrl);
      }
      resultPreviewUrlRef.current = null;
      return null;
    });
    setAudioEditorPreviewUrl((currentUrl) => {
      if (currentUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(currentUrl);
      }
      editorPreviewUrlRef.current = null;
      return null;
    });
    setAudioEditorFile(null);
  };

  const startElapsedTimer = () => {
    setElapsedSeconds(0);
    timerRef.current = window.setInterval(() => {
      setElapsedSeconds((current) => Number((current + 0.1).toFixed(1)));
    }, 100);
  };

  const finalizeCaptureResult = (nextResult: CaptureResult, successMessage: string) => {
    setSingleResult(nextResult);
    setProgress({ percent: 100, stage: copy.captureReady });
    setStatus('done');
    toast.success(successMessage);
  };

  const finalizeAudioRecording = async (blob: Blob, mimeType: string) => {
    stopActiveCapture();
    setStatus('starting');
    setProgress({ percent: 8, stage: copy.preparingAudio });

    try {
      const timestamp = createTimestampLabel();
      const inputExt = mimeTypeToExtension(mimeType);
      const rawFile = new File([blob], `audio-recording-${timestamp}.${inputExt}`, {
        type: mimeType || 'audio/webm',
      });
      const masterResult = await convertAudioFile(rawFile, {
        outputFormat: 'wav',
        outputName: `audio-recording-${timestamp}.wav`,
        onProgress: ({ percent, stage }) =>
          setProgress({
            percent,
            stage: locale === 'ko' ? '파형 편집용 WAV 준비 중' : stage,
          }),
      });
      const masterFile = new File([masterResult.blob], masterResult.name, {
        type: masterResult.mimeType,
      });
      setAudioEditorSource(masterFile);
      setOptions((currentOptions) => ({
        ...currentOptions,
        startTime: 0,
        endTime: 0,
      }));

      const previewUrl = URL.createObjectURL(masterResult.blob);
      finalizeCaptureResult(
        {
          ...masterResult,
          previewUrl,
          details: {
            duration: `${elapsedSeconds.toFixed(1)} s`,
            size: formatMegaBytes(masterResult.blob.size),
            [copy.rawInputFormat]: inputExt.toUpperCase(),
            [copy.editedOutput]: 'WAV',
          },
        },
        copy.recordingReadyToast,
      );
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : copy.captureFailed;
      setError(message);
      setStatus('error');
      setProgress({ percent: 0, stage: message });
      toast.error(message);
    }
  };

  const finalizeDirectAudioRecording = async (file: File, duration: number) => {
    stopActiveCapture();

    try {
      setAudioEditorSource(file);
      setOptions((currentOptions) => ({
        ...currentOptions,
        startTime: 0,
        endTime: Number(duration.toFixed(3)),
      }));
      setElapsedSeconds(Number(duration.toFixed(1)));
      setStatus('idle');
      setProgress({ percent: 0, stage: messages.workbench.statusIdle });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : copy.captureFailed;
      setError(message);
      setStatus('error');
      setProgress({ percent: 0, stage: message });
      toast.error(message);
    }
  };

  const exportEditedAudio = async () => {
    if (!audioEditorFile) {
      return;
    }

    try {
      setStatus('starting');
      setError(null);
      setResult((currentResult) => {
        if (currentResult?.previewUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(currentResult.previewUrl);
        }
        resultPreviewUrlRef.current = null;
        return null;
      });
      const outputFormat = String(options.outputFormat ?? 'wav');
      const trimMode = String(options.trimMode ?? 'keep');
      const editedResult = await trimAudioFile(audioEditorFile, {
        outputFormat,
        trimMode,
        startTime: Number(options.startTime ?? 0),
        endTime: Number(options.endTime ?? 0),
        outputName: `audio-recording-${createTimestampLabel()}-edited.${outputFormat}`,
        onProgress: ({ percent, stage }) =>
          setProgress({
            percent,
            stage: locale === 'ko' ? '편집한 오디오를 내보내는 중' : stage,
          }),
      });
      downloadBlob(editedResult.blob, editedResult.name);
      toast.success(copy.audioExportReadyToast);
      setStatus('idle');
      setProgress({ percent: 0, stage: messages.workbench.statusIdle });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : copy.captureFailed;
      setError(message);
      setStatus('error');
      setProgress({ percent: 0, stage: message });
      toast.error(message);
    }
  };

  const clearAudioEditorState = () => {
    setAudioEditorPreviewUrl((currentUrl) => {
      if (currentUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(currentUrl);
      }
      editorPreviewUrlRef.current = null;
      return null;
    });
    setAudioEditorFile(null);
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices || (!isAudioRecorder && (!isCaptureAvailable || typeof MediaRecorder === 'undefined'))) {
      const message = capabilityMessage ?? copy.genericCaptureUnsupported;
      setError(message);
      setStatus('error');
      setProgress({ percent: 0, stage: message });
      toast.error(message);
      return;
    }

    try {
      setStatus('starting');
      setError(null);
      setProgress({ percent: 15, stage: copy.preparingCapture });
      setResult((currentResult) => {
        if (currentResult?.previewUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(currentResult.previewUrl);
        }
        resultPreviewUrlRef.current = null;
        return null;
      });
      clearAudioEditorState();
      setLiveAudioPeaks([]);

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
        session = await createScreenCameraSession(options, copy);
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
        throw new Error(copy.unsupportedTool);
      }

      cleanupRef.current = session.cleanup;
      setLivePreviewStream(session.previewStream);

      if (isAudioRecorder) {
        const wavRecorder = await createWavRecordingSession(session.recordStream, {
          outputName: `audio-recording-${createTimestampLabel()}.wav`,
          onPeak: (peak) =>
            setLiveAudioPeaks((currentPeaks) => [...currentPeaks, Number(peak.toFixed(4))]),
        });

        wavRecorderRef.current = wavRecorder;
        startElapsedTimer();
        setStatus('recording');
        setProgress({ percent: 0, stage: `${copy.recordingLive} (${elapsedSeconds.toFixed(1)} s)` });
        return;
      }

      const mimeType = pickSupportedMimeType('video');
      const recorder = mimeType ? new MediaRecorder(session.recordStream, { mimeType }) : new MediaRecorder(session.recordStream);
      chunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const outputMimeType =
          recorder.mimeType ||
          mimeType ||
          pickSupportedMimeType('video') ||
          'video/webm';
        const blobResult = new Blob(chunksRef.current, { type: outputMimeType });

        stopActiveCapture();
        const previewUrl = URL.createObjectURL(blobResult);
        finalizeCaptureResult(
          {
            name: `${tool.id}-${createTimestampLabel()}.${mimeTypeToExtension(outputMimeType)}`,
            blob: blobResult,
            mimeType: outputMimeType,
            previewUrl,
            details: {
              duration: `${elapsedSeconds.toFixed(1)} s`,
              size: formatMegaBytes(blobResult.size),
            },
          },
          messages.workbench.success,
        );
      };

      session.onEndedTrack?.addEventListener(
        'ended',
        () => {
          if (isAudioRecorder && wavRecorderRef.current) {
            void stopRecording();
            return;
          }

          if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
          }
        },
        { once: true },
      );

      recorder.start(250);
      startElapsedTimer();
      setStatus('recording');
      setProgress({ percent: 35, stage: `${copy.recordingLive} (${elapsedSeconds.toFixed(1)} s)` });
    } catch (cause) {
      stopActiveCapture();
      const message = cause instanceof Error ? cause.message : copy.captureFailed;
      setError(message);
      setStatus('error');
      setProgress({ percent: 0, stage: message });
      toast.error(message);
    }
  };

  const stopRecording = async () => {
    if (isAudioRecorder && wavRecorderRef.current) {
      try {
        const recording = await wavRecorderRef.current.stop();
        await finalizeDirectAudioRecording(recording.file, recording.duration);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : copy.captureFailed;
        setError(message);
        setStatus('error');
        toast.error(message);
      }
      return;
    }

    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const takeScreenshot = async () => {
    if (!isCaptureAvailable) {
      const message = capabilityMessage ?? copy.desktopDisplayUnsupported;
      setError(message);
      setStatus('error');
      setProgress({ percent: 0, stage: message });
      toast.error(message);
      return;
    }

    try {
      setStatus('starting');
      setError(null);
      setProgress({ percent: 15, stage: copy.preparingCapture });
      const mimeType = String(options.format ?? 'image/png');
      const capture = await captureStillFromDisplay(mimeType, copy);
      const previewUrl = URL.createObjectURL(capture.blob);
      finalizeCaptureResult({ ...capture, previewUrl }, copy.screenshotReadyToast);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : copy.screenshotFailed;
      setError(message);
      setStatus('error');
      setProgress({ percent: 0, stage: message });
      toast.error(message);
    }
  };

  const showProgress = !isAudioRecorder && (status === 'starting' || status === 'recording' || status === 'error' || status === 'done');
  const progressValue =
    progress.percent > 0
      ? progress.percent
      : status === 'starting'
        ? 15
        : status === 'recording'
          ? Math.min(95, 35 + elapsedSeconds * 2)
          : status === 'done'
            ? 100
            : 0;
  const progressLabel =
    progress.stage ||
    (status === 'starting'
      ? copy.preparingCapture
      : status === 'recording'
        ? `${copy.recordingLive} (${elapsedSeconds.toFixed(1)} s)`
        : status === 'done'
          ? copy.captureReady
          : error ?? messages.workbench.statusIdle);
  const resultTabs = [{ id: 'result', label: messages.workbench.results }];
  const guidanceLine = isMobileDevice ? copy.mobileGuidance : copy.desktopGuidance;
  const audioOutputFormat = String(options.outputFormat ?? 'wav');
  const trimMode = String(options.trimMode ?? 'keep');
  const showStandaloneResults = Boolean(result) && !isAudioRecorder;
  const captureNotes = isAudioRecorder
    ? [copy.permissionNote, copy.localOnlyNote]
    : [copy.permissionNote, copy.screenAudioNote, guidanceLine, copy.mobilePlatformLimit, copy.localOnlyNote];

  return (
    <ToolPageLayout title={localizedTool.name} description={localizedTool.description} icon={Icon} iconColor={style.icon}>
      <div className="space-y-6">
        <section
          className={`card grid grid-cols-1 gap-4 p-5 ${
            isAudioRecorder ? '' : 'xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]'
          }`}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">{isRecorder ? copy.liveCapture : copy.screenshotSource}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  {isRecorder ? copy.liveCaptureDescription : copy.screenshotSourceDescription}
                </p>
              </div>
              <span className={`badge border ${style.badge}`}>{category.nav}</span>
            </div>

            {capabilityMessage ? <div className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">{capabilityMessage}</div> : null}

            {isAudioRecorder ? (
              audioEditorFile && audioEditorPreviewUrl ? (
                <section className="space-y-4 rounded-xl border border-border bg-base-elevated p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{copy.waveformEditor}</p>
                      <p className="mt-1 text-xs text-ink-muted">{copy.waveformEditorDescription}</p>
                    </div>
                    <span className="badge border border-border bg-base-subtle text-ink-muted">WAV master</span>
                  </div>

                  <AudioWaveformEditor
                    file={audioEditorFile}
                    previewUrl={audioEditorPreviewUrl}
                    trimMode={trimMode}
                    startTime={Number(options.startTime ?? 0)}
                    endTime={Number(options.endTime ?? 0)}
                    onChange={(nextValues) => setOptions((currentOptions) => ({ ...currentOptions, ...nextValues }))}
                  />

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-base-subtle p-1">
                      {(['wav', 'mp3'] as const).map((format) => {
                        const active = audioOutputFormat === format;
                        return (
                          <button
                            key={format}
                            type="button"
                            onClick={() => setOptions((currentOptions) => ({ ...currentOptions, outputFormat: format }))}
                            className={
                              active
                                ? 'btn-primary px-3 py-2 text-xs'
                                : 'btn-ghost border-0 px-3 py-2 text-xs'
                            }
                          >
                            {format.toUpperCase()}
                          </button>
                        );
                      })}
                    </div>
                    <button type="button" onClick={() => void exportEditedAudio()} disabled={status === 'starting' || status === 'recording'} className="btn-primary disabled:cursor-not-allowed disabled:opacity-60">
                      {status === 'starting' ? <LoaderCircle size={16} className="animate-spin" /> : <Scissors size={16} />}
                      {copy.exportEditedAudio}
                    </button>
                  </div>

                </section>
              ) : (
                <LiveAudioWaveform
                  peaks={liveAudioPeaks}
                  isRecording={status === 'recording'}
                  title={copy.waveformEditor}
                  description={status === 'recording' ? copy.localOnlyNote : copy.permissionNote}
                  statusLabel={
                    status === 'recording'
                      ? `${copy.recordingLive} (${elapsedSeconds.toFixed(1)} s)`
                      : messages.workbench.statusIdle
                  }
                />
              )
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
                    <p className="text-sm font-semibold text-ink">{tool.id === 'screenshot-capture' ? copy.noScreenshotYet : copy.noLiveCapture}</p>
                    <p className="mt-1 text-xs text-ink-muted">{tool.id === 'screenshot-capture' ? copy.screenshotIdleDescription : copy.liveCaptureIdleDescription}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              {tool.id === 'screenshot-capture' ? (
                <button type="button" onClick={() => void takeScreenshot()} disabled={!isCaptureAvailable || status === 'starting'} className="btn-primary disabled:cursor-not-allowed disabled:opacity-60">
                  {status === 'starting' ? <LoaderCircle size={16} className="animate-spin" /> : <Monitor size={16} />}
                  {copy.captureScreenshot}
                </button>
              ) : status === 'recording' ? (
                <button type="button" onClick={() => void stopRecording()} className="btn-primary">
                  <CircleStop size={16} />
                  {isAudioRecorder ? copy.stopRecording : copy.stopCapture}
                </button>
              ) : (
                <button type="button" onClick={() => void startRecording()} disabled={!isCaptureAvailable || status === 'starting'} className="btn-primary disabled:cursor-not-allowed disabled:opacity-60">
                  {status === 'starting' ? <LoaderCircle size={16} className="animate-spin" /> : <Play size={16} />}
                  {isAudioRecorder ? copy.startRecording : copy.startCapture}
                </button>
              )}

              {result && !isAudioRecorder ? (
                <button type="button" onClick={() => downloadBlob(result.blob, result.name)} className="btn-ghost">
                  <Download size={16} />
                  {messages.workbench.download}
                </button>
              ) : null}

              <button type="button" onClick={resetSession} className="btn-ghost">
                <RefreshCw size={16} />
                {copy.resetSession}
              </button>
            </div>
          </div>

          {!isAudioRecorder ? (
            <div className="space-y-4">
              <section className="rounded-xl border border-border bg-base-elevated p-4">
                <p className="text-sm font-semibold text-ink">{messages.workbench.options}</p>
                {tool.options?.length ? (
                  <div className="mt-4 space-y-4">
                    {tool.options.map((option) => (
                      <div key={option.key}>
                        <label className="text-xs font-medium uppercase tracking-[0.16em] text-ink-faint">{getLocalizedOptionLabel(option, locale)}</label>
                        {renderField(option, options[option.key], locale, (key, nextValue) =>
                          setOptions((currentOptions) => ({ ...currentOptions, [key]: nextValue }))
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-ink-muted">{messages.workbench.noOptions}</p>
                )}
              </section>

              <section className="rounded-xl border border-border bg-base-elevated p-4">
                <p className="text-sm font-semibold text-ink">{copy.captureNotes}</p>
                <ul className="mt-3 space-y-2 text-sm text-ink-muted">
                  {captureNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </section>
            </div>
          ) : null}
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
            <ProgressBar value={progressValue} label={progressLabel} status={status === 'error' ? 'error' : status === 'done' ? 'done' : status === 'recording' || status === 'starting' ? 'running' : 'idle'} />
          </section>
        ) : null}

        {showStandaloneResults && result ? (
          <Tabs tabs={resultTabs}>
            {() => (
              <div className="space-y-4">
                <ResultCard
                  fileName={result.name}
                  fileSize={formatMegaBytes(result.blob.size)}
                  title={messages.workbench.success}
                  onDownload={() => downloadBlob(result.blob, result.name)}
                />

                <div className="card space-y-4 p-5">
                  {result.previewUrl && result.mimeType.startsWith('image/') ? <img src={result.previewUrl} alt={result.name} className="max-h-[34rem] w-full rounded-xl object-contain" /> : null}
                  {result.previewUrl && result.mimeType.startsWith('video/') ? <video src={result.previewUrl} controls className="max-h-[34rem] w-full rounded-xl" /> : null}
                  {result.previewUrl && result.mimeType.startsWith('audio/') ? <audio src={result.previewUrl} controls className="w-full" /> : null}
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
