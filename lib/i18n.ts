import { ToolCategory } from '@/types/tool';

export type Locale = 'en' | 'ko';

export const dictionaries = {
  en: {
    appName: 'JH Toolbox',
    appTagline: 'Premium browser utilities for documents, media, and data.',
    nav: {
      home: 'Home',
      allTools: 'All Tools',
      pdf: 'PDF',
      image: 'Image',
      ocr: 'OCR',
      video: 'Video',
      audio: 'Audio',
      file: 'File',
      web: 'Web',
    },
    topbar: {
      searchLabel: 'Tool search',
      searchPlaceholder: 'Search by tool name, description, or tag',
      searchEmpty: 'No matching tools found.',
      searchCta: 'Open tool',
      locale: 'Language',
      theme: 'Theme',
      menu: 'Menu',
      shortcut: 'Ctrl K',
    },
    home: {
      badge: 'Browser-only · No upload · Privacy-first',
      titleLead: 'Every file workflow,',
      titleAccent: 'inside the browser.',
      description:
        'Process PDFs, images, video, audio, and structured data locally with a premium interface designed for focused work.',
      primaryCta: 'Explore all tools',
      secondaryCta: 'Jump to recent',
      categoriesTitle: 'Quick categories',
      recentTitle: 'Recently used',
      recentEmpty: 'Your recent tools will appear here after the first run.',
      openCategory: 'Open category',
      featureOneTitle: '100% local processing',
      featureOneBody: 'Your files stay in the browser and never touch an upload queue.',
      featureTwoTitle: 'WASM powered',
      featureTwoBody: 'FFmpeg, Tesseract, and PDF tooling run directly on-device.',
      featureThreeTitle: 'Static and portable',
      featureThreeBody: 'Deploy as a static app and keep working with minimal infrastructure.',
    },
    directory: {
      title: 'All tools',
      description: 'A categorized browser-native directory for documents, media, data, and web workflows.',
      allTab: 'All categories',
      focusLabel: 'Focus view',
      categorySummary: 'Category overview',
      toolCountSuffix: 'tools',
    },
    categoryPage: {
      summaryLabel: 'Category overview',
      toolCountPrefix: 'Includes',
    },
    workbench: {
      files: 'Files',
      options: 'Options',
      progress: 'Progress',
      results: 'Results',
      inspector: 'Inspector',
      details: 'Details',
      chooseFiles: 'Choose files',
      dropzone: 'Drag files here or click to browse',
      dropzoneOptional: 'Drop files here or run this tool without an upload',
      acceptedInput: 'Accepted input',
      optionalUpload: 'Upload is optional for this tool.',
      noOptions: 'This tool does not require extra options.',
      runTool: 'Run tool',
      running: 'Running',
      downloadAll: 'Download all',
      download: 'Download',
      saveFile: 'Save file',
      emptyResults: 'Processed files will appear here.',
      addFileError: 'Add at least one file before running this tool.',
      success: 'Processing complete.',
      failure: 'Processing failed.',
      selectedFiles: 'Selected files',
      toolId: 'Tool ID',
      tags: 'Tags',
      outputFiles: 'Output files',
      clear: 'Clear',
      statusIdle: 'Waiting',
      statusRunning: 'Running',
      statusDone: 'Done',
      statusError: 'Failed',
    },
    common: {
      open: 'Open',
      browserOnly: 'browser-only',
      versionLine: 'v1.0.0 · browser-only',
      dark: 'Dark',
      light: 'Light',
    },
  },
  ko: {
    appName: 'JH Toolbox',
    appTagline: '문서, 미디어, 데이터 작업을 위한 프리미엄 브라우저 유틸리티 모음입니다.',
    nav: {
      home: '홈',
      allTools: '전체 도구',
      pdf: 'PDF',
      image: '이미지',
      ocr: 'OCR',
      video: '비디오',
      audio: '오디오',
      file: '파일',
      web: '웹',
    },
    topbar: {
      searchLabel: '툴 검색',
      searchPlaceholder: '툴 이름, 설명, 태그로 검색',
      searchEmpty: '일치하는 툴이 없습니다.',
      searchCta: '툴 열기',
      locale: '언어',
      theme: '테마',
      menu: '메뉴',
      shortcut: 'Ctrl K',
    },
    home: {
      badge: '브라우저 전용 · 업로드 없음 · 프라이버시 우선',
      titleLead: '모든 파일 작업을,',
      titleAccent: '브라우저 안에서.',
      description:
        'PDF, 이미지, 비디오, 오디오, 구조화 데이터를 로컬에서 처리하는 프리미엄 브라우저 워크벤치입니다.',
      primaryCta: '전체 도구 보기',
      secondaryCta: '최근 사용 보기',
      categoriesTitle: '빠른 카테고리',
      recentTitle: '최근 사용한 도구',
      recentEmpty: '도구를 한 번 실행하면 최근 사용 목록이 여기에 표시됩니다.',
      openCategory: '카테고리 열기',
      featureOneTitle: '100% 로컬 처리',
      featureOneBody: '파일은 브라우저 안에서만 처리되고 업로드 큐를 거치지 않습니다.',
      featureTwoTitle: 'WASM 기반 실행',
      featureTwoBody: 'FFmpeg, Tesseract, PDF 처리 도구가 기기 안에서 직접 동작합니다.',
      featureThreeTitle: '정적 배포 가능',
      featureThreeBody: '정적 앱으로 배포하고도 가벼운 인프라로 유지할 수 있습니다.',
    },
    directory: {
      title: '전체 도구',
      description: '문서, 미디어, 데이터, 웹 워크플로를 위한 브라우저 네이티브 도구 디렉터리입니다.',
      allTab: '전체 카테고리',
      focusLabel: '보기 전환',
      categorySummary: '카테고리 개요',
      toolCountSuffix: '개 도구',
    },
    categoryPage: {
      summaryLabel: '카테고리 개요',
      toolCountPrefix: '포함 도구',
    },
    workbench: {
      files: '파일',
      options: '옵션',
      progress: '진행 상태',
      results: '결과',
      inspector: '인스펙터',
      details: '세부 정보',
      chooseFiles: '파일 선택',
      dropzone: '파일을 드래그하거나 클릭해서 선택하세요',
      dropzoneOptional: '파일을 드롭하거나 업로드 없이 바로 실행할 수 있습니다',
      acceptedInput: '허용 입력 형식',
      optionalUpload: '이 도구는 파일 업로드 없이도 실행할 수 있습니다.',
      noOptions: '이 도구는 추가 옵션이 필요하지 않습니다.',
      runTool: '도구 실행',
      running: '실행 중',
      downloadAll: '모두 다운로드',
      download: '다운로드',
      saveFile: '파일 저장',
      emptyResults: '처리된 파일이 여기에 표시됩니다.',
      addFileError: '실행하기 전에 파일을 하나 이상 추가하세요.',
      success: '처리가 완료되었습니다.',
      failure: '처리에 실패했습니다.',
      selectedFiles: '선택된 파일',
      toolId: '도구 ID',
      tags: '태그',
      outputFiles: '출력 파일',
      clear: '비우기',
      statusIdle: '대기 중',
      statusRunning: '실행 중',
      statusDone: '완료',
      statusError: '실패',
    },
    common: {
      open: '열기',
      browserOnly: '브라우저 전용',
      versionLine: 'v1.0.0 · browser-only',
      dark: '다크',
      light: '라이트',
    },
  },
} as const;

export type AppDictionary = (typeof dictionaries)[Locale];

export const categoryCopy: Record<
  Locale,
  Record<
    ToolCategory,
    {
      nav: string;
      title: string;
      description: string;
      shortDescription: string;
    }
  >
> = {
  en: {
    pdf: {
      nav: 'PDF',
      title: 'PDF Tools',
      description: 'Merge, split, convert, and optimize PDF documents entirely in the browser.',
      shortDescription: 'Merge, split, compress, and convert PDFs.',
    },
    image: {
      nav: 'Image',
      title: 'Image Tools',
      description: 'Resize, convert, edit, and compose images with local-only processing.',
      shortDescription: 'Resize, convert formats, and edit images.',
    },
    ocr: {
      nav: 'OCR',
      title: 'OCR Tools',
      description: 'Extract readable text from images and PDF files.',
      shortDescription: 'Extract text from images and PDFs.',
    },
    video: {
      nav: 'Video',
      title: 'Video Tools',
      description: 'Convert, compress, mute, and extract media from browser-side video workflows.',
      shortDescription: 'Convert, trim, and export video assets.',
    },
    audio: {
      nav: 'Audio',
      title: 'Audio Tools',
      description: 'Convert popular audio formats with focused single-purpose utilities.',
      shortDescription: 'Convert, trim, and clean audio files.',
    },
    file: {
      nav: 'File',
      title: 'File & Data Tools',
      description: 'Transform CSV, JSON, XML, and ZIP workflows without leaving the browser.',
      shortDescription: 'Handle ZIP, CSV, JSON, and XML flows.',
    },
    web: {
      nav: 'Web',
      title: 'Web Tools',
      description: 'Generate QR codes, capture URLs, detect CMS signatures, and inspect metadata.',
      shortDescription: 'Analyze URLs, QR, and metadata.',
    },
  },
  ko: {
    pdf: {
      nav: 'PDF',
      title: 'PDF 도구',
      description: '병합, 분할, 변환, 최적화를 브라우저 안에서 바로 처리합니다.',
      shortDescription: '병합, 분할, 압축, 변환',
    },
    image: {
      nav: '이미지',
      title: '이미지 도구',
      description: '리사이즈, 포맷 변환, 편집, 합성을 로컬 처리로 수행합니다.',
      shortDescription: '리사이즈, 포맷 변환, 편집',
    },
    ocr: {
      nav: 'OCR',
      title: 'OCR 도구',
      description: '이미지와 PDF에서 읽을 수 있는 텍스트를 추출합니다.',
      shortDescription: '이미지와 PDF에서 텍스트 추출',
    },
    video: {
      nav: '비디오',
      title: '비디오 도구',
      description: '변환, 압축, 음소거, 미디어 추출을 브라우저에서 수행합니다.',
      shortDescription: '변환, 트림, 썸네일 추출',
    },
    audio: {
      nav: '오디오',
      title: '오디오 도구',
      description: '자주 쓰는 오디오 포맷 간 변환을 빠르게 처리합니다.',
      shortDescription: '변환, 자르기, 기본 정리',
    },
    file: {
      nav: '파일',
      title: '파일 · 데이터 도구',
      description: 'CSV, JSON, XML, ZIP 기반 작업을 브라우저에서 바로 다룹니다.',
      shortDescription: 'ZIP, CSV, JSON, XML 처리',
    },
    web: {
      nav: '웹',
      title: '웹 도구',
      description: 'QR 생성, URL 캡처, CMS 감지, 메타데이터 검사를 제공합니다.',
      shortDescription: 'URL, QR, 메타데이터 분석',
    },
  },
};

export function getCategoryCopy(locale: Locale, category: ToolCategory) {
  return categoryCopy[locale][category];
}

export function formatToolCount(locale: Locale, count: number) {
  return locale === 'ko' ? `${count}개 도구` : `${count} tools`;
}

export function formatMegaBytes(size: number) {
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}
