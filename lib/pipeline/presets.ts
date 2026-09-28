import type { ToolCategory } from '@/types/tool';
import type { PipelineStep } from './types';

type Copy = { en: string; ko: string };

/** An option worth changing before a run, shown next to the files. */
export interface PresetKeyOption {
  /** Index of the step the option belongs to. */
  step: number;
  key: string;
  /** Options of the same step that take the same value (height with width). */
  alsoSet?: string[];
  label?: Copy;
}

export interface PipelinePreset {
  id: string;
  /** Colour and icon family. */
  category: ToolCategory;
  name: Copy;
  description: Copy;
  /** What to add before running. */
  input: Copy;
  steps: (locale: 'en' | 'ko') => PipelineStep[];
  keyOptions?: PresetKeyOption[];
}

const step = (toolId: string, options: PipelineStep['options'] = {}): PipelineStep => ({ toolId, options });

const shrinkPhotos = (longestSide: number) =>
  step('image-resize', { width: longestSide, height: longestSide, keepAspect: true, shrinkOnly: true, format: 'original' });

/**
 * Ready-made pipelines for everyday jobs that take several tools in a row
 * (submitting documents, sending files under a size limit, posting photos,
 * lecture audio). Each is a real multi-step job: nothing a single tool or the
 * result list's "download all" already does. Every step's output is a valid
 * input for the next and option values are ones the tools offer (checked in
 * scripts/checks/pipeline-presets).
 */
export const PIPELINE_PRESETS: PipelinePreset[] = [
  {
    id: 'id-copy',
    category: 'pdf',
    name: { en: 'ID or bankbook copy for submission', ko: '신분증·통장 사본 만들기' },
    description: {
      en: 'Turns the photo into a PDF covered with a “for submission only” watermark, so the copy cannot be reused elsewhere.',
      ko: '사진을 PDF로 만들고 “제출용” 워터마크를 촘촘히 넣어 다른 곳에 쓰일 수 없게 해요.',
    },
    input: { en: 'Photos or screenshots of the ID or bankbook', ko: '신분증·통장 사진이나 캡처' },
    steps: (locale) => [
      shrinkPhotos(1600),
      step('image-to-pdf'),
      step('pdf-watermark', {
        watermarkType: 'text',
        text: locale === 'ko' ? '제출용 사본 · 다른 용도 사용 금지' : 'COPY · for submission only',
        position: 'tile',
        fontSize: 36,
        opacity: 0.2,
        rotation: -24,
      }),
    ],
    keyOptions: [
      { step: 2, key: 'text', label: { en: 'Watermark text (e.g. “For ACME Bank only”)', ko: '워터마크 문구 (예: ○○은행 제출용)' } },
    ],
  },
  {
    id: 'paper-photos-to-pdf',
    category: 'pdf',
    name: { en: 'Photos of papers into a scanned PDF', ko: '서류·영수증 사진을 스캔한 PDF로' },
    description: {
      en: 'Evens out light and contrast so the text reads clearly, then binds the pages into one light PDF.',
      ko: '밝기와 대비를 고르게 해 글자를 또렷하게 만든 뒤, 가벼운 PDF 한 개로 묶어요.',
    },
    input: { en: 'Photos of the pages, in order', ko: '서류·영수증 사진 (순서대로)' },
    steps: () => [
      shrinkPhotos(2000),
      step('image-auto-enhance', { strength: 0.75, format: 'image/jpeg' }),
      step('image-to-pdf'),
    ],
    keyOptions: [{ step: 1, key: 'strength', label: { en: 'Enhancement', ko: '보정 세기' } }],
  },
  {
    id: 'screenshots-to-pdf',
    category: 'pdf',
    name: { en: 'Screenshots into a numbered PDF', ko: '캡처 여러 장을 증빙용 PDF로' },
    description: {
      en: 'Chat or web screenshots in order in one PDF with page numbers, ready to attach as evidence.',
      ko: '대화·화면 캡처를 순서대로 PDF 한 개에 담고 쪽번호를 넣어, 증빙 자료로 바로 낼 수 있어요.',
    },
    input: { en: 'Screenshots, in order', ko: '캡처 이미지 (순서대로)' },
    steps: () => [
      step('image-compress', { quality: 0.85, format: 'image/jpeg' }),
      step('image-to-pdf'),
      step('pdf-add-page-numbers', { startNumber: 1, fontSize: 12 }),
    ],
  },
  {
    id: 'pdfs-for-email',
    category: 'pdf',
    name: { en: 'Merge PDFs small enough to email', ko: 'PDF 여러 개 합쳐 메일로 보내기' },
    description: {
      en: 'One PDF, reduced to fit attachment limits. The text stays selectable.',
      ko: '하나로 합친 뒤 첨부 용량에 맞게 줄여요. 글자는 그대로 선택돼요.',
    },
    input: { en: 'PDFs, in order', ko: 'PDF 여러 개 (순서대로)' },
    steps: () => [step('pdf-merge'), step('pdf-reduce-size', { mode: 'keep-text', dpi: 150, quality: 0.7, grayscale: false })],
    keyOptions: [{ step: 1, key: 'quality', label: { en: 'Compression', ko: '압축 정도' } }],
  },
  {
    id: 'submission-pdf',
    category: 'pdf',
    name: { en: 'One submission PDF with page numbers', ko: '제출 서류를 PDF 한 부로 (쪽번호)' },
    description: {
      en: 'Binds several documents in order and numbers every page, as offices and schools ask.',
      ko: '여러 서류를 순서대로 합치고 모든 쪽에 번호를 넣어요. 관공서·학교 제출용으로 좋아요.',
    },
    input: { en: 'PDFs, in order', ko: 'PDF 여러 개 (순서대로)' },
    steps: () => [step('pdf-merge'), step('pdf-add-page-numbers', { startNumber: 1, fontSize: 12 })],
    keyOptions: [{ step: 1, key: 'startNumber', label: { en: 'First page number', ko: '시작 번호' } }],
  },
  {
    id: 'scans-black-and-white',
    category: 'pdf',
    name: { en: 'Colour scans into a light black-and-white PDF', ko: '컬러 스캔 PDF를 흑백으로 가볍게' },
    description: {
      en: 'Black and white at a sensible resolution to fit upload limits; several scans become one file.',
      ko: '흑백으로 바꾸고 해상도를 맞춰 업로드 용량 제한에 맞춰요. 여러 개면 하나로 합쳐요.',
    },
    input: { en: 'Scanned PDFs', ko: '스캔한 PDF' },
    steps: () => [step('pdf-merge'), step('pdf-reduce-size', { mode: 'flatten', dpi: 150, quality: 0.7, grayscale: true })],
    keyOptions: [{ step: 1, key: 'dpi', label: { en: 'Resolution', ko: '해상도' } }],
  },
  {
    id: 'photos-for-posting',
    category: 'image',
    name: { en: 'Photos ready to post', ko: '사진 올리기 전 정리 (크기·위치정보)' },
    description: {
      en: 'Shrinks the long side and saves light JPGs for listings, blogs and forms; location and camera data are removed.',
      ko: '긴 쪽을 줄이고 가벼운 JPG로 저장해 중고거래·블로그·신청서에 올리기 좋게 해요. 촬영 위치 같은 정보도 지워져요.',
    },
    input: { en: 'Photos', ko: '사진' },
    steps: () => [shrinkPhotos(1920), step('image-compress', { quality: 0.8, format: 'image/jpeg' })],
    keyOptions: [{ step: 0, key: 'width', alsoSet: ['height'], label: { en: 'Longest side (px)', ko: '긴 쪽 최대 크기 (px)' } }],
  },
  {
    id: 'lecture-video-to-mp3',
    category: 'audio',
    name: { en: 'Lecture video into a listening MP3', ko: '강의·회의 영상을 듣기용 MP3로' },
    description: {
      en: 'Keeps only the sound, as a mono MP3 made for speech: about a tenth of the video size.',
      ko: '영상에서 소리만 꺼내 말소리에 알맞은 모노 MP3로 만들어요. 영상 용량의 10분의 1 정도예요.',
    },
    input: { en: 'Videos', ko: '영상' },
    steps: () => [
      step('extract-audio', { startTime: 0, endTime: 0 }),
      step('audio-convert', { outputFormat: 'mp3', bitrate: '128k', sampleRate: 'keep', channels: '1' }),
    ],
    keyOptions: [{ step: 1, key: 'bitrate', label: { en: 'Quality', ko: '음질' } }],
  },
  {
    id: 'recordings-into-one',
    category: 'audio',
    name: { en: 'Recordings joined into one MP3', ko: '나눠 녹음한 파일을 MP3 하나로' },
    description: {
      en: 'Joins recordings in order (lectures, meetings, interviews) into one mono MP3 suited to speech.',
      ko: '강의·회의·인터뷰처럼 나눠 녹음한 파일을 순서대로 이어 말소리에 알맞은 모노 MP3 하나로 만들어요.',
    },
    input: { en: 'Recordings, in order', ko: '녹음 파일 (순서대로)' },
    steps: () => [
      step('audio-merge', { outputFormat: 'wav' }),
      step('audio-convert', { outputFormat: 'mp3', bitrate: '128k', sampleRate: 'keep', channels: '1' }),
    ],
    keyOptions: [{ step: 1, key: 'bitrate', label: { en: 'Quality', ko: '음질' } }],
  },
];

export function getPipelinePreset(id: string | null | undefined): PipelinePreset | null {
  return PIPELINE_PRESETS.find((preset) => preset.id === id) ?? null;
}
