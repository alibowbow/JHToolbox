import { Locale } from '@/lib/i18n';
import { ToolDefinition, ToolOption } from '@/types/tool';

const koToolNames: Record<string, string> = {
  'pdf-merge': 'PDF 병합',
  'pdf-split': 'PDF 분할',
  'pdf-rearrange': 'PDF 페이지 재정렬',
  'pdf-rotate': 'PDF 회전',
  'pdf-delete-page': 'PDF 페이지 삭제',
  'pdf-add-page-numbers': 'PDF 페이지 번호 추가',
  'pdf-extract-images': 'PDF 이미지 추출',
  'pdf-compress': 'PDF 압축',
  'pdf-to-png': 'PDF를 PNG로 변환',
  'pdf-to-jpg': 'PDF를 JPG로 변환',
  'pdf-to-webp': 'PDF를 WEBP로 변환',
  'image-to-pdf': '이미지를 PDF로 변환',
  'image-resize': '이미지 크기 조정',
  'image-compress': '이미지 압축',
  'image-crop': '이미지 자르기',
  'image-flip': '이미지 뒤집기',
  'image-rotate': '이미지 회전',
  'image-pixelate': '이미지 픽셀화',
  'image-add-text': '이미지 텍스트 추가',
  'image-add-border': '이미지 테두리 추가',
  'image-split': '이미지 분할',
  'image-combine': '이미지 합치기',
  'image-collage': '이미지 콜라주',
  'image-background-transparent': '배경 투명 처리',
  'image-blur-background': '배경 흐리게',
  'png-jpg': 'PNG를 JPG로 변환',
  'jpg-png': 'JPG를 PNG로 변환',
  'png-webp': 'PNG를 WEBP로 변환',
  'webp-png': 'WEBP를 PNG로 변환',
  'webp-jpg': 'WEBP를 JPG로 변환',
  'jpg-webp': 'JPG를 WEBP로 변환',
  'gif-jpg': 'GIF를 JPG로 변환',
  'gif-png': 'GIF를 PNG로 변환',
  'tiff-jpg': 'TIFF를 JPG로 변환',
  'tiff-png': 'TIFF를 PNG로 변환',
  'svg-png': 'SVG를 PNG로 변환',
  'ocr-image-to-text': '이미지 OCR 텍스트 추출',
  'ocr-pdf-to-text': 'PDF OCR 텍스트 추출',
  'video-to-gif': '비디오를 GIF로 변환',
  'video-to-webp': '비디오를 WEBP로 변환',
  'mute-video': '비디오 음소거',
  'extract-audio': '오디오 추출',
  'video-compress': '비디오 압축',
  'mp4-webm': 'MP4를 WEBM으로 변환',
  'mp4-mov': 'MP4를 MOV로 변환',
  'mov-mp4': 'MOV를 MP4로 변환',
  'avi-mp4': 'AVI를 MP4로 변환',
  'm4a-mp3': 'M4A를 MP3로 변환',
  'm4a-wav': 'M4A를 WAV로 변환',
  'aac-mp3': 'AAC를 MP3로 변환',
  'webm-mp3': 'WEBM을 MP3로 변환',
  'mp4-wav': 'MP4를 WAV로 변환',
  'csv-json': 'CSV를 JSON으로 변환',
  'json-csv': 'JSON을 CSV로 변환',
  'excel-csv': 'Excel을 CSV로 변환',
  'csv-excel': 'CSV를 Excel로 변환',
  'xml-json': 'XML을 JSON으로 변환',
  'json-xml': 'JSON을 XML로 변환',
  'xml-csv': 'XML을 CSV로 변환',
  'split-csv': 'CSV 분할',
  'create-zip': 'ZIP 만들기',
  'extract-zip': 'ZIP 압축 해제',
  'qr-generator': 'QR 코드 생성기',
  'url-image': 'URL을 이미지로 변환',
  'url-pdf': 'URL을 PDF로 변환',
  'detect-cms': 'CMS 감지',
  'image-metadata': '이미지 메타데이터 보기',
};

const koToolDescriptions: Record<string, string> = {
  'pdf-merge': '여러 PDF 파일을 하나의 문서로 합칩니다.',
  'pdf-split': '선택한 페이지 단위로 PDF를 분할합니다.',
  'pdf-rearrange': 'PDF 페이지 순서를 다시 정렬합니다.',
  'pdf-rotate': 'PDF 페이지를 원하는 각도로 회전합니다.',
  'pdf-delete-page': '선택한 PDF 페이지를 제거합니다.',
  'pdf-add-page-numbers': 'PDF 각 페이지에 번호를 추가합니다.',
  'pdf-extract-images': 'PDF에 포함된 이미지를 추출합니다.',
  'pdf-compress': 'PDF 용량을 줄여 더 가볍게 만듭니다.',
  'pdf-to-png': 'PDF 페이지를 PNG 이미지로 변환합니다.',
  'pdf-to-jpg': 'PDF 페이지를 JPG 이미지로 변환합니다.',
  'pdf-to-webp': 'PDF 페이지를 WEBP 이미지로 변환합니다.',
  'image-to-pdf': '이미지 파일을 PDF 문서로 변환합니다.',
  'image-resize': '이미지 크기를 픽셀 단위로 조정합니다.',
  'image-compress': '이미지 품질을 조절해 용량을 줄입니다.',
  'image-crop': '원하는 영역만 잘라 새 이미지로 만듭니다.',
  'image-flip': '이미지를 가로 또는 세로로 뒤집습니다.',
  'image-rotate': '이미지를 원하는 각도로 회전합니다.',
  'image-pixelate': '이미지에 픽셀화 효과를 적용합니다.',
  'image-add-text': '이미지 위에 텍스트를 배치합니다.',
  'image-add-border': '이미지 가장자리에 테두리를 추가합니다.',
  'image-split': '이미지를 여러 조각으로 분할합니다.',
  'image-combine': '여러 이미지를 한 장으로 이어 붙입니다.',
  'image-collage': '여러 이미지를 콜라주 레이아웃으로 배치합니다.',
  'image-background-transparent': '배경을 투명하게 정리합니다.',
  'image-blur-background': '배경만 흐리게 처리해 피사체를 강조합니다.',
  'png-jpg': 'PNG 파일을 JPG 형식으로 변환합니다.',
  'jpg-png': 'JPG 파일을 PNG 형식으로 변환합니다.',
  'png-webp': 'PNG 파일을 WEBP 형식으로 변환합니다.',
  'webp-png': 'WEBP 파일을 PNG 형식으로 변환합니다.',
  'webp-jpg': 'WEBP 파일을 JPG 형식으로 변환합니다.',
  'jpg-webp': 'JPG 파일을 WEBP 형식으로 변환합니다.',
  'gif-jpg': 'GIF 파일을 JPG 형식으로 변환합니다.',
  'gif-png': 'GIF 파일을 PNG 형식으로 변환합니다.',
  'tiff-jpg': 'TIFF 파일을 JPG 형식으로 변환합니다.',
  'tiff-png': 'TIFF 파일을 PNG 형식으로 변환합니다.',
  'svg-png': 'SVG 파일을 PNG 형식으로 렌더링합니다.',
  'ocr-image-to-text': '이미지에서 텍스트를 인식해 추출합니다.',
  'ocr-pdf-to-text': 'PDF에서 OCR로 텍스트를 추출합니다.',
  'video-to-gif': '비디오를 GIF 애니메이션으로 변환합니다.',
  'video-to-webp': '비디오를 WEBP 애니메이션으로 변환합니다.',
  'mute-video': '비디오에서 오디오 트랙을 제거합니다.',
  'extract-audio': '비디오에서 오디오만 추출합니다.',
  'video-compress': '비디오 품질을 조절해 용량을 줄입니다.',
  'mp4-webm': 'MP4 비디오를 WEBM 형식으로 변환합니다.',
  'mp4-mov': 'MP4 비디오를 MOV 형식으로 변환합니다.',
  'mov-mp4': 'MOV 비디오를 MP4 형식으로 변환합니다.',
  'avi-mp4': 'AVI 비디오를 MP4 형식으로 변환합니다.',
  'm4a-mp3': 'M4A 오디오를 MP3 형식으로 변환합니다.',
  'm4a-wav': 'M4A 오디오를 WAV 형식으로 변환합니다.',
  'aac-mp3': 'AAC 오디오를 MP3 형식으로 변환합니다.',
  'webm-mp3': 'WEBM 파일에서 MP3 오디오를 추출합니다.',
  'mp4-wav': 'MP4 파일에서 WAV 오디오를 추출합니다.',
  'csv-json': 'CSV 데이터를 JSON 형식으로 변환합니다.',
  'json-csv': 'JSON 데이터를 CSV 형식으로 변환합니다.',
  'excel-csv': 'Excel 시트를 CSV 파일로 변환합니다.',
  'csv-excel': 'CSV 데이터를 Excel 파일로 변환합니다.',
  'xml-json': 'XML 데이터를 JSON 형식으로 변환합니다.',
  'json-xml': 'JSON 데이터를 XML 형식으로 변환합니다.',
  'xml-csv': 'XML 데이터를 CSV 형식으로 변환합니다.',
  'split-csv': '행 수 기준으로 CSV를 여러 파일로 나눕니다.',
  'create-zip': '여러 파일을 하나의 ZIP으로 압축합니다.',
  'extract-zip': 'ZIP 파일을 풀어 개별 파일로 꺼냅니다.',
  'qr-generator': '텍스트나 URL로 QR 코드를 생성합니다.',
  'url-image': '웹 페이지를 이미지로 캡처합니다.',
  'url-pdf': '웹 페이지를 PDF로 저장합니다.',
  'detect-cms': '웹 페이지의 CMS 사용 여부를 분석합니다.',
  'image-metadata': '이미지 메타데이터를 확인합니다.',
};

const koOptionLabelsByLabel: Record<string, string> = {
  'Page order': '페이지 순서',
  Rotation: '회전 각도',
  'Pages to delete': '삭제할 페이지',
  'Start number': '시작 번호',
  'Font size': '글자 크기',
  'JPG quality': 'JPG 품질',
  'WEBP quality': 'WEBP 품질',
  Width: '너비',
  Height: '높이',
  'Output format': '출력 형식',
  Quality: '품질',
  X: 'X',
  Y: 'Y',
  'Flip horizontally': '좌우 반전',
  'Flip vertically': '상하 반전',
  'Pixel block size': '픽셀 블록 크기',
  Text: '텍스트',
  'Text color': '텍스트 색상',
  'X position': 'X 위치',
  'Y position': 'Y 위치',
  'Border size': '테두리 두께',
  'Border color': '테두리 색상',
  Rows: '행 수',
  Columns: '열 수',
  'Layout direction': '배열 방향',
  Gap: '간격',
  'Background color': '배경색',
  'White threshold': '흰색 임계값',
  'Blur radius': '블러 강도',
  'OCR language': 'OCR 언어',
  FPS: 'FPS',
  'CRF (lower = better quality)': 'CRF (낮을수록 고품질)',
  'Rows per file': '파일당 행 수',
  'QR content': 'QR 내용',
  'Size (px)': '크기 (px)',
  'Target URL': '대상 URL',
  'Canvas width': '캔버스 너비',
};

const koOptionLabelsByKey: Record<string, string> = {
  order: '페이지 순서',
  degrees: '회전 각도',
  pages: '페이지',
  startNumber: '시작 번호',
  fontSize: '글자 크기',
  quality: '품질',
  width: '너비',
  height: '높이',
  format: '출력 형식',
  x: 'X',
  y: 'Y',
  text: '텍스트',
  color: '색상',
  size: '크기',
  rows: '행 수',
  cols: '열 수',
  direction: '배열 방향',
  gap: '간격',
  columns: '열 수',
  background: '배경색',
  threshold: '흰색 임계값',
  radius: '블러 강도',
  lang: 'OCR 언어',
  fps: 'FPS',
  crf: 'CRF',
  rowsPerFile: '파일당 행 수',
  content: 'QR 내용',
  url: '대상 URL',
};

const koChoiceLabels: Record<string, string> = {
  '90 degrees': '90도',
  '180 degrees': '180도',
  '270 degrees': '270도',
  Horizontal: '가로',
  Vertical: '세로',
  'English (eng)': '영어 (eng)',
  'Korean + English (kor+eng)': '한국어 + 영어 (kor+eng)',
};

const koPlaceholders: Record<string, string> = {
  'e.g. 3,1,2': '예: 3,1,2',
  'e.g. 2,5': '예: 2,5',
};

function getFallbackKoDescription(tool: ToolDefinition, name: string) {
  if (tool.id.includes('-to-')) {
    return `${name} 작업을 브라우저 안에서 로컬로 처리합니다.`;
  }

  if (tool.id.startsWith('ocr-')) {
    return `${name} 기능으로 텍스트를 인식하고 추출합니다.`;
  }

  if (tool.id.endsWith('-compress')) {
    return `${name} 작업으로 파일 용량을 줄입니다.`;
  }

  return `${name} 작업을 브라우저 안에서 로컬로 실행합니다.`;
}

export function getLocalizedToolCopy(tool: ToolDefinition, locale: Locale) {
  if (locale === 'en') {
    return {
      name: tool.name,
      description: tool.description,
    };
  }

  const name = koToolNames[tool.id] ?? tool.name;
  return {
    name,
    description: koToolDescriptions[tool.id] ?? getFallbackKoDescription(tool, name),
  };
}

export function getLocalizedOptionLabel(option: ToolOption, locale: Locale) {
  if (locale === 'en') {
    return option.label;
  }

  return koOptionLabelsByLabel[option.label] ?? koOptionLabelsByKey[option.key] ?? option.label;
}

export function getLocalizedPlaceholder(option: ToolOption, locale: Locale) {
  if (locale === 'en' || !option.placeholder) {
    return option.placeholder;
  }

  return koPlaceholders[option.placeholder] ?? option.placeholder;
}

export function getLocalizedChoiceLabel(label: string, locale: Locale) {
  if (locale === 'en') {
    return label;
  }

  return koChoiceLabels[label] ?? label;
}
