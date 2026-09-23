'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { AlertCircle, Check, Copy, Download, LoaderCircle, Play, RotateCcw, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { ToolPageLayout } from '@/components/ToolPageLayout';
import { useLocale } from '@/components/providers/locale-provider';
import { EditStampPreview, SignStampPreview, WatermarkPreview, useObjectUrl } from '@/components/tool-ui/pdf-stage-previews';
import { parseRegions, serializeRegions } from '@/lib/pdf-regions';
import { DropZone } from '@/components/ui/DropZone';
import type { PdfEditorPage } from '@/components/ui/PdfPageEditor';
import type { CropRect } from '@/components/ui/crop-math';
import { ResultCard } from '@/components/ui/ResultCard';
import { ContinueMenu } from '@/components/ui/ContinueMenu';
import { formatFileCount, formatMegaBytes } from '@/lib/i18n';
import {
  getLocalizedChoiceLabel,
  getLocalizedOptionLabel,
  getLocalizedPlaceholder,
  getLocalizedToolCopy,
} from '@/lib/tool-localization';
import { getLastRunToolOptions, saveLastRunToolOptions } from '@/lib/tool-option-memory';
import { receiveHandedOffFiles } from '@/lib/file-handoff';
import { partitionByAccept } from '@/lib/file-accept';
import { nextToolIds } from '@/lib/next-tools';
import { getDisplayMetadata, localizeErrorMessage, localizeStage } from '@/lib/error-messages';
import { runTool } from '@/lib/processors';
import { getToolIcon } from '@/lib/tool-icons';
import { categoryStyles } from '@/lib/tool-presentation';
import { pushRecentTool } from '@/lib/recent-tools';
import { cx, downloadBlob, safeFileName } from '@/lib/utils';
import { dedupeFileName } from '@/lib/filename-safety';
import { isOptionApplicable, normalizeToolOptions } from '@/lib/option-schema';
import { ProcessedFile } from '@/types/processor';
import { ToolDefinition, ToolOption } from '@/types/tool';

// Editors load only for the tools that show them.
const BeforeAfterImageCompare = dynamic(() => import('@/components/ui/BeforeAfterImageCompare').then((mod) => mod.BeforeAfterImageCompare), { ssr: false });
const PdfPageEditor = dynamic(() => import('@/components/ui/PdfPageEditor').then((mod) => mod.PdfPageEditor), { ssr: false });
const PdfPagePicker = dynamic(() => import('@/components/ui/PdfPagePicker').then((mod) => mod.PdfPagePicker), { ssr: false });
const PdfPlacementEditor = dynamic(() => import('@/components/ui/PdfPlacementEditor').then((mod) => mod.PdfPlacementEditor), { ssr: false });
const ImageCropEditor = dynamic(() => import('@/components/ui/ImageCropEditor').then((mod) => mod.ImageCropEditor), { ssr: false });
const ImageOverlayEditor = dynamic(() => import('@/components/ui/ImageOverlayEditor').then((mod) => mod.ImageOverlayEditor), { ssr: false });
const ImageTransformPreview = dynamic(() => import('@/components/ui/ImageTransformPreview').then((mod) => mod.ImageTransformPreview), { ssr: false });
const UrlImageCropper = dynamic(() => import('@/components/ui/UrlImageCropper').then((mod) => mod.UrlImageCropper), { ssr: false });
const VideoTimelineEditor = dynamic(() => import('@/components/ui/VideoTimelineEditor').then((mod) => mod.VideoTimelineEditor), { ssr: false });
const BrowserCaptureWorkbench = dynamic(
  () => import('@/components/tool-ui/browser-capture-workbench').then((mod) => mod.BrowserCaptureWorkbench),
  { ssr: false },
);
const DataFilePreview = dynamic(() => import('@/components/ui/DataFilePreview').then((mod) => mod.DataFilePreview), { ssr: false });

const OPTIONAL_FILE_TOOLS = new Set(['qr-generator', 'url-image', 'url-pdf', 'detect-cms']);
const PDF_EDITOR_TOOLS = new Set(['pdf-merge', 'pdf-rearrange']);
const CUSTOM_OPTIONS_IN_PREVIEW_TOOLS = new Set(['pdf-rearrange', 'image-crop', 'video-trim', 'video-crop']);
const IMAGE_COMPARE_EXCLUDED_TOOL_IDS = new Set([
  'image-crop',
  'image-rotate',
  'image-split',
  'image-combine',
  'image-collage',
  'image-color-palette-extract',
  'url-image',
]);
const VIDEO_EDITOR_TOOL_IDS = new Set([
  'video-trim',
  'video-crop',
  'video-thumbnail-generator',
  'video-speed-change',
  'video-resize',
  'video-watermark',
  'video-convert',
  'video-compress',
  'mute-video',
  'extract-audio',
  'video-reverse',
]);
const VIDEO_TRIM_TOOL_IDS = new Set([
  'video-trim',
  'video-crop',
  'video-speed-change',
  'video-resize',
  'video-watermark',
  'video-convert',
  'video-compress',
  'mute-video',
  'extract-audio',
  'video-reverse',
]);
const EMPTY_OPTION_KEY_SET = new Set<string>();
const HIDDEN_OPTION_KEYS_BY_TOOL_ID: Record<string, Set<string>> = {
  'video-trim': new Set(['startTime', 'endTime']),
  'video-crop': new Set(['x', 'y', 'width', 'height', 'cropPreset', 'startTime', 'endTime']),
  'video-thumbnail-generator': new Set(['timestamp']),
  'video-speed-change': new Set(['startTime', 'endTime']),
  'video-resize': new Set(['startTime', 'endTime']),
  'video-watermark': new Set(['startTime', 'endTime']),
  'video-convert': new Set(['startTime', 'endTime']),
  'video-compress': new Set(['startTime', 'endTime']),
  'mute-video': new Set(['startTime', 'endTime']),
  'extract-audio': new Set(['startTime', 'endTime']),
  'video-reverse': new Set(['startTime', 'endTime']),
  // Set by dragging on the picture or page instead of typing coordinates.
  'image-add-text': new Set(['x', 'y']),
  'image-watermark': new Set(['x', 'y']),
  'pdf-sign': new Set(['pageNumber', 'x', 'y', 'width', 'height']),
  'edit-pdf': new Set(['pageNumber', 'x', 'y', 'width', 'height']),
  'pdf-redact': new Set(['pageStart', 'pageEnd', 'x', 'y', 'width', 'height']),
};

type SearchParamSource = Pick<URLSearchParams, 'get'>;
type ToolOptionValues = Record<string, string | number | boolean>;

type OptionPreset = {
  id: string;
  label: string;
  values: Record<string, number>;
};

type OptionPresetGroup = {
  title: string;
  presets: OptionPreset[];
};

const RESOLUTION_PRESET_TOOL_IDS = new Set(['image-resize', 'video-resize', 'video-crop']);
const OVERLAY_SIZE_PRESET_TOOL_IDS = new Set(['pdf-redact', 'edit-pdf', 'pdf-sign']);
const OUTPUT_WIDTH_PRESET_TOOL_IDS = new Set([
  'video-convert',
  'images-to-gif',
  'video-thumbnail-generator',
  'video-to-gif',
  'video-to-webp',
]);

const PRESET_COPY = {
  en: {
    recommendedSizesTitle: 'Recommended sizes',
    canvasWidthTitle: 'Common canvas widths',
    outputWidthTitle: 'Common output widths',
    overlaySizeTitle: 'Common box sizes',
    presetSquare: 'Square',
    presetPortrait: 'Portrait',
    presetStory: 'Story',
    presetHd: 'HD',
    presetFullHd: 'Full HD',
    presetMobile: 'Mobile',
    presetTablet: 'Tablet',
    presetLaptop: 'Laptop',
    presetDesktop: 'Desktop',
    presetCompact: 'Compact',
    presetDefault: 'Default',
    presetLarge: 'Large',
    presetWide: 'Wide',
    presetSmall: 'Small',
    presetMedium: 'Medium',
  },
  ko: {
    recommendedSizesTitle: '추천 크기',
    canvasWidthTitle: '자주 쓰는 캔버스 너비',
    outputWidthTitle: '자주 쓰는 출력 너비',
    overlaySizeTitle: '자주 쓰는 박스 크기',
    presetSquare: '정사각형',
    presetPortrait: '세로형',
    presetStory: '스토리',
    presetHd: 'HD',
    presetFullHd: '풀 HD',
    presetMobile: '모바일',
    presetTablet: '태블릿',
    presetLaptop: '노트북',
    presetDesktop: '데스크톱',
    presetCompact: '작게',
    presetDefault: '기본',
    presetLarge: '크게',
    presetWide: '넓게',
    presetSmall: '작게',
    presetMedium: '보통',
  },
} as const;

function clampToOptionBounds(value: number, option: ToolOption) {
  const minimum = option.min ?? Number.NEGATIVE_INFINITY;
  const maximum = option.max ?? Number.POSITIVE_INFINITY;
  return Math.max(minimum, Math.min(maximum, value));
}

function applyPresetValues(
  presetValues: Record<string, number>,
  allOptions: ToolOption[],
  onChange: (key: string, nextValue: string | number | boolean) => void,
) {
  Object.entries(presetValues).forEach(([key, rawValue]) => {
    const matchingOption = allOptions.find((option) => option.key === key);
    if (!matchingOption) {
      return;
    }

    onChange(key, clampToOptionBounds(rawValue, matchingOption));
  });
}

function isPresetActive(preset: OptionPreset, values: ToolOptionValues) {
  return Object.entries(preset.values).every(([key, presetValue]) => Number(values[key]) === presetValue);
}

function buildOverlayPresets(
  locale: 'en' | 'ko',
  widthOption: ToolOption,
  heightOption: ToolOption,
): OptionPreset[] {
  const copy = PRESET_COPY[locale];
  const baseWidth = Number(widthOption.defaultValue);
  const baseHeight = Number(heightOption.defaultValue);
  const scales = [
    { id: 'compact', label: copy.presetCompact, multiplier: 0.75 },
    { id: 'default', label: copy.presetDefault, multiplier: 1 },
    { id: 'large', label: copy.presetLarge, multiplier: 1.4 },
    { id: 'wide', label: copy.presetWide, multiplier: 2 },
  ];

  return scales.map((preset) => ({
    id: preset.id,
    label: `${preset.label} ${Math.round(clampToOptionBounds(baseWidth * preset.multiplier, widthOption))}×${Math.round(
      clampToOptionBounds(baseHeight * preset.multiplier, heightOption),
    )}`,
    values: {
      width: Math.round(clampToOptionBounds(baseWidth * preset.multiplier, widthOption)),
      height: Math.round(clampToOptionBounds(baseHeight * preset.multiplier, heightOption)),
    },
  }));
}

function getOptionPresetGroup(
  tool: ToolDefinition,
  option: ToolOption,
  optionIndex: number,
  allOptions: ToolOption[],
  locale: 'en' | 'ko',
): OptionPresetGroup | null {
  const copy = PRESET_COPY[locale];

  if (option.type !== 'number' || option.key !== 'width') {
    return null;
  }

  const nextOption = allOptions[optionIndex + 1];
  const hasHeightPair = nextOption?.key === 'height' && nextOption.type === 'number';

  if (hasHeightPair && nextOption) {
    if (RESOLUTION_PRESET_TOOL_IDS.has(tool.id)) {
      return {
        title: copy.recommendedSizesTitle,
        presets: [
          { id: 'square', label: `${copy.presetSquare} 1080×1080`, values: { width: 1080, height: 1080 } },
          { id: 'portrait', label: `${copy.presetPortrait} 1080×1350`, values: { width: 1080, height: 1350 } },
          { id: 'story', label: `${copy.presetStory} 1080×1920`, values: { width: 1080, height: 1920 } },
          { id: 'hd', label: `${copy.presetHd} 1280×720`, values: { width: 1280, height: 720 } },
          { id: 'full-hd', label: `${copy.presetFullHd} 1920×1080`, values: { width: 1920, height: 1080 } },
        ],
      };
    }

    if (OVERLAY_SIZE_PRESET_TOOL_IDS.has(tool.id)) {
      return {
        title: copy.overlaySizeTitle,
        presets: buildOverlayPresets(locale, option, nextOption),
      };
    }
  }

  if (/canvas width/i.test(option.label)) {
    return {
      title: copy.canvasWidthTitle,
      presets: [
        { id: 'mobile', label: `${copy.presetMobile} 390px`, values: { width: 390 } },
        { id: 'tablet', label: `${copy.presetTablet} 768px`, values: { width: 768 } },
        { id: 'laptop', label: `${copy.presetLaptop} 1280px`, values: { width: 1280 } },
        { id: 'desktop', label: `${copy.presetDesktop} 1440px`, values: { width: 1440 } },
        { id: 'full-hd', label: `${copy.presetFullHd} 1920px`, values: { width: 1920 } },
      ],
    };
  }

  if (OUTPUT_WIDTH_PRESET_TOOL_IDS.has(tool.id)) {
    return {
      title: copy.outputWidthTitle,
      presets: [
        { id: 'small', label: `${copy.presetSmall} 480px`, values: { width: 480 } },
        { id: 'medium', label: `${copy.presetMedium} 720px`, values: { width: 720 } },
        { id: 'hd', label: `${copy.presetHd} 1280px`, values: { width: 1280 } },
        { id: 'desktop', label: `${copy.presetDesktop} 1440px`, values: { width: 1440 } },
        { id: 'full-hd', label: `${copy.presetFullHd} 1920px`, values: { width: 1920 } },
      ],
    };
  }

  return null;
}

function getDefaults(tool: ToolDefinition): Record<string, string | number | boolean> {
  const entries = (tool.options ?? []).map((option) => [option.key, option.defaultValue] as const);
  return Object.fromEntries(entries);
}

function getInitialOptions(
  tool: ToolDefinition,
  searchParams: SearchParamSource,
  restoredOptions?: Record<string, string | number | boolean> | null,
): Record<string, string | number | boolean> {
  const raw: Record<string, unknown> = { ...getDefaults(tool) };
  if (restoredOptions) {
    Object.assign(raw, restoredOptions);
  }

  for (const option of tool.options ?? []) {
    const paramValue = searchParams.get(option.key);
    if (paramValue !== null) {
      raw[option.key] = paramValue;
    }
  }

  // Coerce/validate every value (defaults, restored preset, URL params) against
  // the option schema so out-of-range numbers, NaN, bad select choices, and
  // string booleans can never reach the UI or a processor.
  return normalizeToolOptions(tool.options ?? [], raw);
}

function hasSearchParamOverrides(tool: ToolDefinition, searchParams: SearchParamSource) {
  return (tool.options ?? []).some((option) => searchParams.get(option.key) !== null);
}

async function copyTextContent(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function renderField(
  option: ToolOption,
  value: string | number | boolean | undefined,
  locale: 'en' | 'ko',
  inputId: string,
  onChange: (key: string, nextValue: string | number | boolean) => void,
) {
  const commonClassName = 'input-surface h-10 w-full';

  if (option.type === 'select') {
    return (
      <select id={inputId} value={String(value)} onChange={(event) => onChange(option.key, event.target.value)} className={commonClassName}>
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
        {locale === 'ko' ? '사용' : 'Enabled'}
      </label>
    );
  }

  if (option.type === 'color') {
    return (
      <input
        id={inputId}
        type="color"
        value={String(value)}
        onChange={(event) => onChange(option.key, event.target.value)}
        className="h-10 w-full cursor-pointer rounded-[10px] border border-border-strong bg-base-elevated p-1"
      />
    );
  }

  if (option.type === 'range') {
    return (
      <div className="flex items-center gap-3">
        <input
          id={inputId}
          type="range"
          value={Number(value)}
          onChange={(event) => onChange(option.key, Number(event.target.value))}
          min={option.min}
          max={option.max}
          step={option.step}
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
      onChange={(event) =>
        onChange(option.key, option.type === 'number' ? Number(event.target.value) : event.target.value)
      }
      min={option.min}
      max={option.max}
      step={option.step}
      placeholder={getLocalizedPlaceholder(option, locale)}
      className={commonClassName}
    />
  );
}

function renderOptionField(
  tool: ToolDefinition,
  option: ToolOption,
  optionIndex: number,
  allOptions: ToolOption[],
  values: ToolOptionValues,
  locale: 'en' | 'ko',
  onChange: (key: string, nextValue: string | number | boolean) => void,
) {
  const presetGroup = getOptionPresetGroup(tool, option, optionIndex, allOptions, locale);
  const inputId = `tool-option-${tool.id}-${option.key}`;

  return (
    <div key={option.key} className="space-y-2">
      <label htmlFor={inputId} className="block text-sm font-medium text-ink">
        {getLocalizedOptionLabel(option, locale)}
      </label>
      {presetGroup ? (
        <div className="space-y-1.5">
          <p className="text-xs text-ink-faint">{presetGroup.title}</p>
          <div className="flex flex-wrap gap-1.5">
            {presetGroup.presets.map((preset) => {
              const active = isPresetActive(preset, values);

              return (
                <button
                  key={preset.id}
                  type="button"
                  data-testid={`option-preset-${option.key}-${preset.id}`}
                  onClick={() => applyPresetValues(preset.values, allOptions, onChange)}
                  aria-pressed={active}
                  className={cx(
                    'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                    active
                      ? 'border-prime/50 bg-prime/10 text-prime'
                      : 'border-border bg-base-elevated text-ink-muted hover:border-border-bright hover:text-ink',
                  )}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {renderField(option, values[option.key], locale, inputId, onChange)}
    </div>
  );
}

export function ToolWorkbench({ tool, categoryId }: { tool: ToolDefinition; categoryId?: ToolDefinition['category'] }) {
  if (tool.inputMode === 'capture') {
    return <BrowserCaptureWorkbench tool={tool} />;
  }

  return <StandardToolWorkbench tool={tool} categoryId={categoryId} />;
}

function resultToFile(result: ProcessedFile) {
  return new File([result.blob], result.name, { type: result.mimeType });
}

function fileSignature(files: File[]) {
  return files.map((file) => `${file.name}:${file.size}:${file.lastModified}`).join('|');
}

function optionsSignature(options: ToolOptionValues) {
  return JSON.stringify(Object.keys(options).sort().map((key) => [key, options[key]]));
}

/** Tools where input order matters, so file rows get move buttons. */
const REORDERABLE_TOOL_IDS = new Set(['pdf-merge', 'image-to-pdf', 'images-to-gif', 'image-combine', 'image-collage', 'create-zip']);
const SIZE_REDUCTION_TOOL_IDS = new Set(['pdf-compress', 'pdf-reduce-size', 'image-compress', 'video-compress']);
const TEXT_PREVIEW_LIMIT = 4000;
/** Data converters: the input is shown as a table before converting. */
const DATA_PREVIEW_TOOL_IDS = new Set(['csv-json', 'csv-excel', 'split-csv', 'json-csv', 'json-xml', 'xml-json', 'xml-csv', 'excel-csv']);
/** PDF tools that also take an image (signature, overlay, watermark) to preview on the page. */
const PDF_OVERLAY_TOOL_IDS = new Set(['pdf-sign', 'edit-pdf', 'pdf-watermark']);

function StandardToolWorkbench({
  tool,
  categoryId,
}: {
  tool: ToolDefinition;
  categoryId?: ToolDefinition['category'];
}) {
  const { locale, messages } = useLocale();
  const rawSearchParams = useSearchParams();
  const searchParams: SearchParamSource = rawSearchParams ?? new URLSearchParams();
  const searchParamString = rawSearchParams?.toString() ?? '';
  const [files, setFiles] = useState<File[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [options, setOptions] = useState<Record<string, string | number | boolean>>(() =>
    getInitialOptions(tool, searchParams),
  );
  const optionsRef = useRef(options);
  const [progress, setProgress] = useState<{ percent: number; stage: string }>({ percent: 0, stage: '' });
  const [results, setResults] = useState<ProcessedFile[]>([]);
  const [resultsSignature, setResultsSignature] = useState<string | null>(null);
  const [inputPreviewUrl, setInputPreviewUrl] = useState<string | null>(null);
  const [restoredFromLastRun, setRestoredFromLastRun] = useState(false);
  const [copied, setCopied] = useState<{ key: string; ok: boolean } | null>(null);
  const resultsSectionRef = useRef<HTMLElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastToolIdRef = useRef<string | null>(null);
  const runIdRef = useRef(0);

  const displayCategoryId = categoryId ?? tool.category;
  const Icon = getToolIcon(tool.id, displayCategoryId);
  const style = categoryStyles[displayCategoryId];
  const localizedTool = getLocalizedToolCopy(tool, locale);
  const toolOptions = tool.options ?? [];
  const hiddenOptionKeys = HIDDEN_OPTION_KEYS_BY_TOOL_ID[tool.id] ?? EMPTY_OPTION_KEY_SET;
  const visibleToolOptions = toolOptions.filter((option) => !option.hidden && !hiddenOptionKeys.has(option.key));
  // Values an editor sets for the current file (trim range, crop box, capture
  // time) are not preferences: remembering them would silently apply them to
  // the next, different file.
  const rememberableOptions = visibleToolOptions;
  const usesDirectInput = tool.inputMode === 'url';
  const usesPdfEditor = PDF_EDITOR_TOOLS.has(tool.id);
  const hasOptions = visibleToolOptions.length > 0;
  const supportsOptionMemory = rememberableOptions.length > 0 && !CUSTOM_OPTIONS_IN_PREVIEW_TOOLS.has(tool.id);
  const showOptionsPanel = hasOptions && !CUSTOM_OPTIONS_IN_PREVIEW_TOOLS.has(tool.id);
  const fileOptional = usesDirectInput || OPTIONAL_FILE_TOOLS.has(tool.id);
  const dropLabel = fileOptional ? messages.workbench.dropzoneOptional : messages.workbench.dropzone;
  const imageCropRect: CropRect = {
    x: Number(options.x ?? 0),
    y: Number(options.y ?? 0),
    width: Number(options.width ?? 0),
    height: Number(options.height ?? 0),
  };
  const sourceVideoFiles = files.filter((file) => file.type.startsWith('video/'));
  const primaryVideoFile = sourceVideoFiles[0] ?? null;
  const previewSourceFile =
    VIDEO_EDITOR_TOOL_IDS.has(tool.id) && primaryVideoFile
      ? primaryVideoFile
      : files[0] ?? null;
  const videoEditorEnabled = Boolean(inputPreviewUrl && primaryVideoFile && sourceVideoFiles.length === 1 && VIDEO_EDITOR_TOOL_IDS.has(tool.id));
  const inputSignature = useMemo(() => `${fileSignature(files)}#${optionsSignature(options)}`, [files, options]);
  const showResults = results.length > 0 || error !== null;

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    abortRef.current?.abort();
    runIdRef.current += 1;
    const restoredOptions =
      supportsOptionMemory && !hasSearchParamOverrides(tool, searchParams)
        ? getLastRunToolOptions(tool.id, rememberableOptions)
        : null;

    setOptions(getInitialOptions(tool, searchParams, restoredOptions));
    // Results sent here with "continue with…" from the previous tool. Files
    // are cleared only when the tool changes: on first mount the drop zone
    // may already have picked up files chosen while the page was loading.
    const toolChanged = lastToolIdRef.current !== null && lastToolIdRef.current !== tool.id;
    lastToolIdRef.current = tool.id;
    const handedOff = receiveHandedOffFiles(tool.id);
    if (handedOff) {
      const { accepted } = partitionByAccept(handedOff, tool.accept === '*' ? undefined : tool.accept);
      setFiles(tool.multiple ? accepted : accepted.slice(0, 1));
    } else if (toolChanged) {
      setFiles([]);
    }
    setResults([]);
    setResultsSignature(null);
    setError(null);
    setNotice(null);
    setRunning(false);
    setInputPreviewUrl(null);
    setProgress({ percent: 0, stage: '' });
    setRestoredFromLastRun(Boolean(restoredOptions));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the tool or its URL parameters change
  }, [searchParamString, supportsOptionMemory, tool, tool.id]);

  // Trim ranges, crop boxes and capture times belong to one particular file:
  // a new set of files starts from the defaults (the editor fills them in again).
  // Values that came with the page link are kept for the first upload.
  const filesKey = useMemo(() => fileSignature(files), [files]);
  const previousFilesKeyRef = useRef('');
  useEffect(() => {
    const previous = previousFilesKeyRef.current;
    previousFilesKeyRef.current = filesKey;
    const perFileKeys = toolOptions.filter((option) => option.hidden || hiddenOptionKeys.has(option.key)).map((option) => option.key);
    if (!previous || perFileKeys.length === 0) {
      return;
    }
    const defaults = getDefaults(tool);
    setOptions((current) => {
      const next = { ...current };
      perFileKeys.forEach((key) => {
        next[key] = defaults[key];
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the files change
  }, [filesKey]);

  // A result belongs to the inputs that produced it: once the files or options
  // change, the old output (or error) would be misleading, so it goes away.
  useEffect(() => {
    if (resultsSignature !== null && resultsSignature !== inputSignature) {
      setResults([]);
      setError(null);
      setResultsSignature(null);
    }
  }, [inputSignature, resultsSignature]);

  useEffect(() => {
    setNotice(null);
  }, [inputSignature]);

  // Bring the outcome into view once a run finishes; on long pages it renders
  // below the fold and is easy to miss.
  useEffect(() => {
    if (results.length > 0 || error) {
      resultsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [error, results.length]);

  useEffect(() => {
    return () => {
      results.forEach((result) => {
        if (result.previewUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(result.previewUrl);
        }
      });
    };
  }, [results]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!previewSourceFile) {
      setInputPreviewUrl(null);
      return;
    }

    const firstFile = previewSourceFile;
    if (
      !firstFile.type.startsWith('image/') &&
      !firstFile.type.startsWith('audio/') &&
      !firstFile.type.startsWith('video/')
    ) {
      setInputPreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(firstFile);
    setInputPreviewUrl(previewUrl);

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewSourceFile]);

  const handlePdfPlanChange = (pages: PdfEditorPage[]) => {
    setOptions((currentOptions) => {
      const nextOptions = { ...currentOptions };

      if (tool.id === 'pdf-merge') {
        nextOptions.mergePlan = JSON.stringify(
          pages.map((page) => ({
            fileIndex: page.fileIndex,
            pageIndex: page.pageIndex,
          })),
        );
      }

      if (tool.id === 'pdf-rearrange') {
        nextOptions.order = pages.map((page) => page.pageNumber).join(',');
      }

      return nextOptions;
    });
  };

  const updateOptionValue = (key: string, nextValue: string | number | boolean) => {
    setOptions((currentOptions) => ({
      ...currentOptions,
      [key]: nextValue,
    }));
    optionsRef.current = {
      ...optionsRef.current,
      [key]: nextValue,
    };
  };

  const resetOptionsToDefaults = () => {
    setOptions(getInitialOptions(tool, searchParams));
    setRestoredFromLastRun(false);
  };

  const onCancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    runIdRef.current += 1;
    setRunning(false);
    setProgress({ percent: 0, stage: '' });
    setNotice(messages.workbench.cancelled);
  };

  const onProcess = async () => {
    const currentOptions = optionsRef.current;

    if (!files.length && !fileOptional) {
      setNotice(messages.workbench.addFileError);
      return;
    }

    // URL tools need an address; say so here instead of failing after a request.
    if (usesDirectInput && toolOptions.some((option) => option.key === 'url') && !String(currentOptions.url ?? '').trim()) {
      setNotice(localizeErrorMessage(new Error('Enter a URL to continue.'), locale));
      return;
    }

    if (
      (tool.id === 'pdf-merge' && files.length > 0 && String(currentOptions.mergePlan ?? '').trim() === '') ||
      (tool.id === 'pdf-rearrange' && files.length > 0 && String(currentOptions.order ?? '').trim() === '')
    ) {
      setNotice(messages.workbench.addPageError);
      return;
    }

    if (VIDEO_TRIM_TOOL_IDS.has(tool.id)) {
      const startTime = Number(currentOptions.startTime ?? 0);
      const endTime = Number(currentOptions.endTime ?? 0);
      if (endTime > 0 && endTime <= startTime + 0.01) {
        setNotice(messages.workbench.invalidTrimRange);
        return;
      }
    }

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    const controller = new AbortController();
    abortRef.current = controller;
    const signature = `${fileSignature(files)}#${optionsSignature(currentOptions)}`;
    const isCurrent = () => runIdRef.current === runId && !controller.signal.aborted;

    setNotice(null);
    setError(null);
    setResults([]);
    setResultsSignature(null);
    setRunning(true);
    setProgress({ percent: 2, stage: messages.workbench.statusRunning });

    try {
      const processedFiles = await runTool({
        toolId: tool.id,
        files,
        options: currentOptions,
        onProgress: (next) => {
          if (isCurrent()) {
            setProgress(next);
          }
        },
        signal: controller.signal,
      });

      if (!isCurrent()) {
        return;
      }

      const filesWithPreview = processedFiles.map((item) => {
        if (item.previewUrl) {
          return item;
        }

        if (
          item.mimeType.startsWith('image/') ||
          item.mimeType.startsWith('video/') ||
          item.mimeType.startsWith('audio/')
        ) {
          return {
            ...item,
            previewUrl: URL.createObjectURL(item.blob),
          };
        }

        return item;
      });

      setResults(filesWithPreview);
      setResultsSignature(signature);
      if (supportsOptionMemory) {
        saveLastRunToolOptions(tool.id, rememberableOptions, currentOptions);
      }
      pushRecentTool(tool.id);
    } catch (cause) {
      if (!isCurrent()) {
        return;
      }
      setError(localizeErrorMessage(cause, locale));
      setResultsSignature(signature);
    } finally {
      if (runIdRef.current === runId) {
        setRunning(false);
        setProgress({ percent: 0, stage: '' });
        abortRef.current = null;
      }
    }
  };

  const onDownloadAll = async () => {
    if (!results.length) {
      return;
    }

    if (results.length === 1) {
      downloadBlob(results[0].blob, results[0].name);
      return;
    }

    const zip = new JSZip();
    const seenNames = new Set<string>();
    results.forEach((result) => {
      zip.file(dedupeFileName(safeFileName(result.name), seenNames), result.blob);
    });

    const blob = await zip.generateAsync({ type: 'blob' });
    const baseNameForZip = files[0]?.name.replace(/\.[^/.]+$/, '') || tool.id;
    downloadBlob(blob, `${safeFileName(baseNameForZip)}.zip`);
  };

  // The button itself says "Copied" for a moment; no toast.
  const onCopyResultText = async (text: string, key: string) => {
    try {
      await copyTextContent(text);
      setCopied({ key, ok: true });
    } catch {
      setCopied({ key, ok: false });
    }
    window.setTimeout(() => setCopied((current) => (current?.key === key ? null : current)), 1800);
  };

  const optionsHeader = (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-semibold text-ink">{usesDirectInput ? messages.workbench.directInputTitle : messages.workbench.options}</h2>
      {supportsOptionMemory ? (
        <button
          type="button"
          onClick={resetOptionsToDefaults}
          disabled={running}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-base-subtle hover:text-ink disabled:opacity-50"
          data-testid="tool-reset-options"
        >
          <RotateCcw size={13} aria-hidden="true" />
          {messages.workbench.resetOptions}
        </button>
      ) : null}
    </div>
  );

  const restoredNote = restoredFromLastRun ? (
    <p className="mt-1.5 text-xs text-ink-faint" data-testid="tool-option-memory-restored">
      {messages.workbench.restoredFromLastRun}
    </p>
  ) : null;

  const optionFields = visibleToolOptions
    .filter((option) => isOptionApplicable(option, options))
    .map((option, optionIndex, allOptions) => renderOptionField(tool, option, optionIndex, allOptions, options, locale, updateOptionValue));

  const pdfInput = useMemo(() => files.find((file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name)), [files]);
  const overlayImageFile = useMemo(() => files.find((file) => file.type.startsWith('image/')), [files]);
  const overlayImageUrl = useObjectUrl(PDF_OVERLAY_TOOL_IDS.has(tool.id) ? overlayImageFile : undefined);
  // image-watermark takes the watermark picture as the last file.
  const watermarkImageUrl = useObjectUrl(
    tool.id === 'image-watermark' && String(options.watermarkType ?? 'text') === 'image' && files.length >= 2
      ? files[files.length - 1]
      : undefined,
  );

  // A stable array: a new one on every render would make the page editor reload.
  const pdfEditorFiles = useMemo(() => (tool.id === 'pdf-rearrange' ? files.slice(0, 1) : files), [files, tool.id]);

  // The editor or preview for the current input (null when a file row is enough).
  const renderInputStage = () => {
    if (files.length === 0) {
      return null;
    }

    if (usesPdfEditor) {
      return (
        <PdfPageEditor
          files={pdfEditorFiles}
          mode={tool.id === 'pdf-merge' ? 'merge' : 'rearrange'}
          onChange={handlePdfPlanChange}
        />
      );
    }

    if ((tool.id === 'pdf-delete-page' || tool.id === 'pdf-rotate' || tool.id === 'pdf-to-image') && files.length === 1 && pdfInput) {
      return (
        <PdfPagePicker
          file={pdfInput}
          value={String(options.pages ?? '')}
          onChange={(next) => updateOptionValue('pages', next)}
          mode={tool.id === 'pdf-rotate' ? 'rotate' : tool.id === 'pdf-to-image' ? 'pick' : 'delete'}
          rotation={Number(options.degrees ?? 90)}
        />
      );
    }

    if (tool.id === 'pdf-redact' && pdfInput) {
      return (
        <PdfPlacementEditor
          file={pdfInput}
          mode="regions"
          regions={parseRegions(options.regions)}
          onRegionsChange={(regions) => updateOptionValue('regions', serializeRegions(regions))}
          boxColor={String(options.color ?? '#000000')}
          testIdPrefix="pdf-redact"
        />
      );
    }

    if ((tool.id === 'pdf-sign' || tool.id === 'edit-pdf') && pdfInput) {
      return (
        <PdfPlacementEditor
          file={pdfInput}
          mode="stamp"
          placement={{
            pageNumber: Number(options.pageNumber ?? 1),
            x: Number(options.x ?? 40),
            y: Number(options.y ?? 40),
            width: Number(options.width ?? 180),
            height: Number(options.height ?? 72),
          }}
          onPlacementChange={(next) => setOptions((current) => ({ ...current, ...next }))}
          renderStamp={(size) =>
            tool.id === 'pdf-sign' ? (
              <SignStampPreview options={options} imageUrl={overlayImageUrl} size={size} />
            ) : (
              <EditStampPreview options={options} imageUrl={overlayImageUrl} size={size} />
            )
          }
          testIdPrefix={tool.id}
        />
      );
    }

    if (tool.id === 'pdf-watermark' && pdfInput) {
      return (
        <PdfPlacementEditor
          file={pdfInput}
          mode="view"
          overlay={(page) => <WatermarkPreview options={options} imageUrl={overlayImageUrl} page={page} />}
          testIdPrefix="pdf-watermark"
        />
      );
    }

    if (DATA_PREVIEW_TOOL_IDS.has(tool.id) && files.length === 1) {
      return <DataFilePreview file={files[0]} />;
    }

    if (!inputPreviewUrl) {
      return null;
    }

    if ((tool.id === 'image-rotate' || tool.id === 'image-flip') && files[0]?.type.startsWith('image/')) {
      return (
        <ImageTransformPreview
          imageUrl={inputPreviewUrl}
          degrees={tool.id === 'image-rotate' ? Number(options.degrees ?? 90) : 0}
          flipHorizontal={tool.id === 'image-flip' && Boolean(options.horizontal)}
          flipVertical={tool.id === 'image-flip' && Boolean(options.vertical)}
          onRotate={tool.id === 'image-rotate' ? (next) => updateOptionValue('degrees', next) : undefined}
        />
      );
    }

    if ((tool.id === 'image-add-text' || tool.id === 'image-watermark') && files[0]?.type.startsWith('image/')) {
      const imageWatermark = tool.id === 'image-watermark' && String(options.watermarkType ?? 'text') === 'image';
      if (imageWatermark && !watermarkImageUrl) {
        return null;
      }
      return (
        <ImageOverlayEditor
          imageUrl={inputPreviewUrl}
          overlay={
            imageWatermark && watermarkImageUrl
              ? { kind: 'image', url: watermarkImageUrl, scale: Number(options.scale ?? 0.24), opacity: Number(options.opacity ?? 0.5) }
              : {
                  kind: 'text',
                  text: String(options.text ?? ''),
                  fontSize: Number(options.fontSize ?? 42),
                  color: String(options.color ?? '#ffffff'),
                  opacity: tool.id === 'image-watermark' ? Number(options.opacity ?? 0.5) : 1,
                }
          }
          position={{ x: Number(options.x ?? 20), y: Number(options.y ?? 20) }}
          onPositionChange={(next) => setOptions((current) => ({ ...current, x: next.x, y: next.y }))}
          testIdPrefix={tool.id}
        />
      );
    }

    if (tool.id === 'image-crop' && files[0]?.type.startsWith('image/')) {
      return (
        <ImageCropEditor
          crop={imageCropRect}
          previewUrl={inputPreviewUrl}
          onCropChange={(nextCrop) => setOptions((currentOptions) => ({ ...currentOptions, ...nextCrop }))}
          resetOnImageLoad
        />
      );
    }

    if (videoEditorEnabled && primaryVideoFile) {
      return (
        <VideoTimelineEditor
          // A new file gets a fresh editor: no state from the previous clip.
          key={inputPreviewUrl}
          file={primaryVideoFile}
          previewUrl={inputPreviewUrl}
          trimEnabled={VIDEO_TRIM_TOOL_IDS.has(tool.id)}
          trimStart={Number(options.startTime ?? 0)}
          trimEnd={Number(options.endTime ?? 0)}
          onTrimChange={(nextValues) => setOptions((currentOptions) => ({ ...currentOptions, ...nextValues }))}
          captureEnabled={tool.id === 'video-thumbnail-generator'}
          captureTime={Number(options.timestamp ?? 0)}
          onCaptureTimeChange={(nextValue) => updateOptionValue('timestamp', Number(nextValue.toFixed(3)))}
          cropEnabled={tool.id === 'video-crop'}
          crop={imageCropRect}
          onCropChange={(nextCrop) => setOptions((currentOptions) => ({ ...currentOptions, ...nextCrop }))}
          aspectPresetId={String(options.cropPreset ?? 'free')}
          onAspectPresetChange={(nextAspectPresetId) => updateOptionValue('cropPreset', nextAspectPresetId)}
          testIdPrefix={tool.id === 'video-crop' ? 'video-crop' : 'video-editor'}
        />
      );
    }

    if (previewSourceFile?.type.startsWith('audio/')) {
      return <audio src={inputPreviewUrl} controls className="w-full" />;
    }

    if (previewSourceFile?.type.startsWith('video/')) {
      return <video src={inputPreviewUrl} controls className="max-h-[20rem] w-full rounded-lg bg-black" />;
    }

    return null;
  };
  const inputStage = renderInputStage();

  const totalInputBytes = files.reduce((sum, file) => sum + file.size, 0);
  const statusText = notice
    ? notice
    : files.length > 0
      ? `${formatFileCount(locale, files.length)} · ${formatMegaBytes(totalInputBytes)}`
      : fileOptional
        ? messages.workbench.readyToRun
        : messages.workbench.addFilesHint;
  const oneToOneResults = files.length > 0 && results.length === files.length;
  const compactResults = results.length > 3;

  return (
    <ToolPageLayout
      title={localizedTool.name}
      description={localizedTool.description}
      icon={Icon}
      iconColor={style.icon}
      iconBg={style.iconBg}
    >
      <div
        className={cx(
          'grid grid-cols-1 gap-5 lg:gap-6',
          !usesDirectInput && showOptionsPanel && 'xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] xl:items-start',
        )}
      >
        {usesDirectInput ? (
          <section className="workspace-panel p-5 sm:p-6">
            {optionsHeader}
            {restoredNote}
            <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">{optionFields}</div>
          </section>
        ) : (
          <>
            <section className="workspace-panel space-y-4 p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-semibold text-ink">{messages.workbench.files}</h2>
              </div>

              <DropZone
                files={files}
                onFiles={setFiles}
                accept={tool.accept === '*' ? undefined : tool.accept}
                multiple={Boolean(tool.multiple)}
                reorderable={REORDERABLE_TOOL_IDS.has(tool.id)}
                disabled={running}
                label={dropLabel}
              />

              {inputStage ? <div className="editor-stage">{inputStage}</div> : null}
            </section>

            {showOptionsPanel ? (
              <aside
                className="workspace-panel p-5 sm:p-6 xl:sticky xl:top-[4.5rem] xl:self-start"
              >
                {optionsHeader}
                {restoredNote}
                <div className="mt-5 space-y-5">{optionFields}</div>
              </aside>
            ) : null}
          </>
        )}
      </div>

      {showResults ? (
        <section ref={resultsSectionRef} className="scroll-mt-20 space-y-3" aria-live="polite">
          {error ? (
            <div role="alert" className="flex items-start gap-3 rounded-2xl border border-danger/25 bg-danger/5 p-4 text-sm text-danger">
              <AlertCircle size={18} className="mt-px shrink-0" aria-hidden="true" />
              <p className="min-w-0 break-words">{error}</p>
            </div>
          ) : null}

          {results.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[15px] font-semibold text-ink">
                  {messages.workbench.results}
                  {results.length > 1 ? <span className="ml-1.5 text-sm font-normal tabular-nums text-ink-faint">{results.length}</span> : null}
                </h2>
                {results.length > 1 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <ContinueMenu
                      toolIds={nextToolIds(results, tool.id)}
                      getFiles={() => results.map(resultToFile)}
                      label={messages.workbench.continueAll}
                    />
                    <button type="button" onClick={onDownloadAll} className="btn-primary px-3.5 py-2 text-sm">
                      <Download size={16} aria-hidden="true" />
                      {messages.workbench.downloadAll}
                    </button>
                  </div>
                ) : null}
              </div>

              <div className={cx('grid grid-cols-1 gap-3', results.length > 1 && 'md:grid-cols-2', compactResults && 'xl:grid-cols-3')}>
                {results.map((result, index) => {
                  const isUrlImage = tool.id === 'url-image' && Boolean(result.previewUrl) && result.mimeType.startsWith('image/');
                  const showImageCompare =
                    index === 0 &&
                    Boolean(inputPreviewUrl) &&
                    files.length === 1 &&
                    results.length === 1 &&
                    Boolean(files[0]?.type.startsWith('image/')) &&
                    Boolean(result.previewUrl) &&
                    result.mimeType.startsWith('image/') &&
                    !IMAGE_COMPARE_EXCLUDED_TOOL_IDS.has(tool.id);
                  const sourceFile = oneToOneResults ? files[index] : files.length === 1 && results.length === 1 ? files[0] : undefined;
                  const textPreview = result.textContent
                    ? result.textContent.length > TEXT_PREVIEW_LIMIT
                      ? `${result.textContent.slice(0, TEXT_PREVIEW_LIMIT)}\n…`
                      : result.textContent
                    : '';
                  const metadataEntries = getDisplayMetadata(result.metadata, locale);
                  const metadataFacts = metadataEntries.filter((entry) => !entry.long);
                  const metadataNotes = metadataEntries.filter((entry) => entry.long);

                  return (
                    <ResultCard
                      key={`${result.name}-${index}`}
                      fileName={result.name}
                      fileSize={formatMegaBytes(result.blob.size)}
                      mimeType={result.mimeType}
                      thumbnailUrl={result.previewUrl && result.mimeType.startsWith('image/') ? result.previewUrl : undefined}
                      originalBytes={sourceFile?.size}
                      outputBytes={result.blob.size}
                      warnWhenLarger={SIZE_REDUCTION_TOOL_IDS.has(tool.id)}
                      primary={results.length === 1}
                      actionLabel={isUrlImage ? messages.workbench.downloadOriginal : messages.workbench.download}
                      onDownload={() => downloadBlob(result.blob, result.name)}
                      actions={
                        compactResults ? null : (
                          <ContinueMenu
                            toolIds={nextToolIds([result], tool.id)}
                            getFiles={() => [resultToFile(result)]}
                            label={messages.workbench.continueWith}
                          />
                        )
                      }
                    >
                      {isUrlImage && result.previewUrl ? (
                        <UrlImageCropper fileName={result.name} outputMimeType={result.mimeType} previewUrl={result.previewUrl} />
                      ) : null}
                      {showImageCompare && inputPreviewUrl && result.previewUrl ? (
                        <BeforeAfterImageCompare
                          beforeUrl={inputPreviewUrl}
                          afterUrl={result.previewUrl}
                          beforeLabel={messages.workbench.compareBefore}
                          afterLabel={messages.workbench.compareAfter}
                          sliderLabel={messages.workbench.compareSliderLabel}
                        />
                      ) : null}
                      {!compactResults && !showImageCompare && !isUrlImage && result.previewUrl && result.mimeType.startsWith('image/') ? (
                        <img src={result.previewUrl} alt={result.name} className="max-h-80 w-full rounded-xl bg-base-subtle object-contain" />
                      ) : null}
                      {!compactResults && result.previewUrl && result.mimeType.startsWith('video/') ? (
                        <video src={result.previewUrl} controls className="max-h-80 w-full rounded-xl" />
                      ) : null}
                      {!compactResults && result.previewUrl && result.mimeType.startsWith('audio/') ? (
                        <audio src={result.previewUrl} controls className="w-full" />
                      ) : null}
                      {textPreview ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-medium text-ink-muted">
                              {tool.category === 'ocr' ? messages.workbench.extractedText : messages.workbench.resultPreview}
                            </p>
                            <button
                              type="button"
                              data-testid="result-copy-text"
                              onClick={() => void onCopyResultText(result.textContent ?? '', `${result.name}-${index}`)}
                              className={cx(
                                'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors hover:bg-base-subtle',
                                copied?.key === `${result.name}-${index}`
                                  ? copied.ok
                                    ? 'text-ok'
                                    : 'text-danger'
                                  : 'text-ink-muted hover:text-ink',
                              )}
                            >
                              {copied?.key === `${result.name}-${index}` && copied.ok ? (
                                <Check size={13} aria-hidden="true" />
                              ) : (
                                <Copy size={13} aria-hidden="true" />
                              )}
                              {copied?.key === `${result.name}-${index}`
                                ? copied.ok
                                  ? messages.workbench.copied
                                  : messages.workbench.copyTextError
                                : messages.workbench.copyText}
                            </button>
                          </div>
                          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-base-subtle p-3 font-mono text-xs leading-relaxed text-ink">
                            {textPreview}
                          </pre>
                        </div>
                      ) : null}
                      {metadataFacts.length > 0 ? (
                        <dl className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
                          {metadataFacts.map((entry) => (
                            <div key={entry.key} className="flex items-baseline gap-1.5">
                              <dt className="text-ink-faint">{entry.label}</dt>
                              <dd className="break-words font-medium text-ink">{entry.value}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                      {metadataNotes.map((entry) => (
                        <p key={entry.key} className="text-xs leading-relaxed text-ink-muted">
                          {entry.value}
                        </p>
                      ))}
                    </ResultCard>
                  );
                })}
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 md:bottom-5">
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-base-elevated/95 p-2 pl-4 shadow-pop backdrop-blur-md sm:gap-3">
          <div className="min-w-0 flex-1" aria-live="polite">
            {running ? (
              <div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-ink-muted">{localizeStage(progress.stage, locale) || messages.workbench.statusRunning}</span>
                  <span className="shrink-0 font-medium tabular-nums text-ink">{Math.round(progress.percent)}%</span>
                </div>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress.percent)}
                  aria-label={messages.workbench.statusRunning}
                  className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-base-subtle"
                >
                  <div className="h-full rounded-full bg-prime transition-[width] duration-300" style={{ width: `${Math.max(2, Math.min(100, progress.percent))}%` }} />
                </div>
              </div>
            ) : (
              <p className={cx('truncate text-sm', notice ? 'font-medium text-warn' : 'text-ink-muted')}>{statusText}</p>
            )}
          </div>
          {running ? (
            <button type="button" onClick={onCancel} className="btn-ghost h-11 shrink-0 px-3.5">
              <X size={16} aria-hidden="true" />
              {messages.workbench.cancel}
            </button>
          ) : null}
          <button type="button" disabled={running} onClick={onProcess} className="btn-primary h-11 shrink-0 px-5" data-testid="tool-run-button">
            {running ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
            {running ? messages.workbench.running : messages.workbench.runTool}
          </button>
        </div>
      </div>
    </ToolPageLayout>
  );
}
