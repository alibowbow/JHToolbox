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
  'pdf-to-png': 'PDF를 PNG로',
  'pdf-to-jpg': 'PDF를 JPG로',
  'pdf-to-webp': 'PDF를 WEBP로',
  'image-to-pdf': '이미지를 PDF로',
  'image-resize': '이미지 크기 조정',
  'image-compress': '이미지 압축',
  'image-crop': '이미지 자르기',
  'image-flip': '이미지 뒤집기',
  'image-rotate': '이미지 회전',
  'image-pixelate': '이미지 픽셀화',
  'image-add-text': '이미지에 텍스트 추가',
  'image-add-border': '테두리 추가',
  'image-split': '이미지 분할',
  'image-combine': '이미지 결합',
  'image-collage': '콜라주 만들기',
  'image-background-transparent': '흰 배경 투명화',
  'image-blur-background': '이미지 블러',
  'png-jpg': 'PNG를 JPG로',
  'jpg-png': 'JPG를 PNG로',
  'png-webp': 'PNG를 WEBP로',
  'webp-png': 'WEBP를 PNG로',
  'webp-jpg': 'WEBP를 JPG로',
  'jpg-webp': 'JPG를 WEBP로',
  'gif-jpg': 'GIF를 JPG로',
  'gif-png': 'GIF를 PNG로',
  'tiff-jpg': 'TIFF를 JPG로',
  'tiff-png': 'TIFF를 PNG로',
  'svg-png': 'SVG를 PNG로',
  'ocr-image-to-text': '이미지에서 텍스트 추출',
  'ocr-pdf-to-text': 'PDF에서 텍스트 추출',
  'video-to-gif': '비디오를 GIF로',
  'video-to-webp': '비디오를 WEBP로',
  'mute-video': '비디오 음소거',
  'extract-audio': '오디오 추출',
  'video-compress': '비디오 압축',
  'video-convert': '비디오 변환기',
  'mp4-webm': 'MP4를 WEBM으로',
  'mp4-mov': 'MP4를 MOV로',
  'mov-mp4': 'MOV를 MP4로',
  'avi-mp4': 'AVI를 MP4로',
  'audio-convert': '오디오 변환기',
  'audio-cut': '오디오 자르기',
  'm4a-mp3': 'M4A를 MP3로',
  'm4a-wav': 'M4A를 WAV로',
  'aac-mp3': 'AAC를 MP3로',
  'webm-mp3': 'WEBM을 MP3로',
  'mp4-wav': 'MP4를 WAV로',
  'csv-json': 'CSV를 JSON으로',
  'json-csv': 'JSON을 CSV로',
  'excel-csv': 'Excel을 CSV로',
  'csv-excel': 'CSV를 Excel로',
  'xml-json': 'XML을 JSON으로',
  'json-xml': 'JSON을 XML로',
  'xml-csv': 'XML을 CSV로',
  'split-csv': 'CSV 분할',
  'create-zip': 'ZIP 만들기',
  'extract-zip': 'ZIP 압축 해제',
  'qr-generator': 'QR 코드 생성기',
  'url-image': '웹페이지를 이미지로',
  'url-pdf': 'URL 전체 스크롤을 PDF로',
  'detect-cms': 'CMS 감지',
  'image-metadata': '이미지 메타데이터 보기',
};

const koToolDescriptions: Record<string, string> = {
  'pdf-merge': '여러 PDF의 페이지를 확인하고 순서를 정한 뒤 하나의 문서로 병합합니다.',
  'pdf-split': 'PDF를 페이지 단위의 개별 파일로 분할합니다.',
  'pdf-rearrange': 'PDF 페이지의 순서를 바꾸고 필요 없는 페이지를 제거합니다.',
  'pdf-rotate': 'PDF의 모든 페이지를 같은 각도로 회전합니다.',
  'pdf-delete-page': '선택한 페이지를 PDF에서 제거합니다.',
  'pdf-add-page-numbers': 'PDF 각 페이지에 페이지 번호를 추가합니다.',
  'pdf-extract-images': 'PDF 페이지를 이미지로 추출합니다.',
  'pdf-compress': 'PDF를 다시 저장해 파일 크기를 줄입니다.',
  'pdf-to-png': 'PDF 페이지를 PNG 이미지로 변환합니다.',
  'pdf-to-jpg': 'PDF 페이지를 JPG 이미지로 변환합니다.',
  'pdf-to-webp': 'PDF 페이지를 WEBP 이미지로 변환합니다.',
  'image-to-pdf': '여러 이미지를 한 개의 PDF로 묶습니다.',
  'image-resize': '이미지 크기를 원하는 가로와 세로 값으로 조정합니다.',
  'image-compress': '품질과 포맷을 조정해 이미지 용량을 줄입니다.',
  'image-crop': '필요한 영역만 남기도록 이미지를 자릅니다.',
  'image-flip': '이미지를 좌우 또는 상하로 뒤집습니다.',
  'image-rotate': '이미지를 원하는 각도로 회전합니다.',
  'image-pixelate': '이미지에 픽셀 블록 효과를 적용합니다.',
  'image-add-text': '이미지 위에 텍스트를 배치합니다.',
  'image-add-border': '이미지 바깥쪽에 테두리를 추가합니다.',
  'image-split': '이미지를 여러 조각으로 분할합니다.',
  'image-combine': '여러 이미지를 하나의 결과물로 이어 붙입니다.',
  'image-collage': '여러 이미지를 그리드형 콜라주로 배치합니다.',
  'image-background-transparent': '흰색 배경을 투명하게 정리합니다.',
  'image-blur-background': '이미지 전체에 블러 효과를 적용합니다.',
  'png-jpg': 'PNG 파일을 JPG 포맷으로 변환합니다.',
  'jpg-png': 'JPG 파일을 PNG 포맷으로 변환합니다.',
  'png-webp': 'PNG 파일을 WEBP 포맷으로 변환합니다.',
  'webp-png': 'WEBP 파일을 PNG 포맷으로 변환합니다.',
  'webp-jpg': 'WEBP 파일을 JPG 포맷으로 변환합니다.',
  'jpg-webp': 'JPG 파일을 WEBP 포맷으로 변환합니다.',
  'gif-jpg': 'GIF 파일을 JPG 포맷으로 변환합니다.',
  'gif-png': 'GIF 파일을 PNG 포맷으로 변환합니다.',
  'tiff-jpg': 'TIFF 파일을 JPG 포맷으로 변환합니다.',
  'tiff-png': 'TIFF 파일을 PNG 포맷으로 변환합니다.',
  'svg-png': 'SVG 파일을 PNG 이미지로 렌더링합니다.',
  'ocr-image-to-text': '이미지 안의 문자를 인식해 텍스트로 추출합니다.',
  'ocr-pdf-to-text': 'PDF 안의 문자를 추출해 텍스트로 만듭니다.',
  'video-to-gif': '비디오를 GIF 애니메이션으로 변환합니다.',
  'video-to-webp': '비디오를 WEBP 애니메이션으로 변환합니다.',
  'mute-video': '비디오에서 오디오 트랙을 제거합니다.',
  'extract-audio': '비디오에서 오디오만 추출합니다.',
  'video-compress': '비디오 용량을 줄이기 위해 다시 인코딩합니다.',
  'video-convert': 'MP4, WEBM, MOV, AVI 같은 비디오 파일을 원하는 출력 포맷으로 한 번에 변환합니다.',
  'mp4-webm': 'MP4 비디오를 WEBM 포맷으로 변환합니다.',
  'mp4-mov': 'MP4 비디오를 MOV 포맷으로 변환합니다.',
  'mov-mp4': 'MOV 비디오를 MP4 포맷으로 변환합니다.',
  'avi-mp4': 'AVI 비디오를 MP4 포맷으로 변환합니다.',
  'audio-convert': '여러 오디오 파일을 MP3, WAV, M4A, AAC 중 원하는 포맷으로 한 번에 변환합니다.',
  'audio-cut': '파형을 보며 필요한 구간만 남기거나 제거한 뒤 바로 저장합니다.',
  'm4a-mp3': 'M4A 오디오를 MP3 포맷으로 변환합니다.',
  'm4a-wav': 'M4A 오디오를 WAV 포맷으로 변환합니다.',
  'aac-mp3': 'AAC 오디오를 MP3 포맷으로 변환합니다.',
  'webm-mp3': 'WEBM 파일에서 MP3 오디오를 추출합니다.',
  'mp4-wav': 'MP4 파일에서 WAV 오디오를 추출합니다.',
  'csv-json': 'CSV 데이터를 JSON 포맷으로 변환합니다.',
  'json-csv': 'JSON 데이터를 CSV 포맷으로 변환합니다.',
  'excel-csv': 'Excel 시트를 CSV 파일로 변환합니다.',
  'csv-excel': 'CSV 데이터를 Excel 파일로 변환합니다.',
  'xml-json': 'XML 데이터를 JSON 포맷으로 변환합니다.',
  'json-xml': 'JSON 데이터를 XML 포맷으로 변환합니다.',
  'xml-csv': 'XML 데이터를 CSV 포맷으로 변환합니다.',
  'split-csv': '행 수 기준으로 CSV를 여러 파일로 분할합니다.',
  'create-zip': '여러 파일을 ZIP 아카이브로 묶습니다.',
  'extract-zip': 'ZIP 파일을 개별 파일로 압축 해제합니다.',
  'qr-generator': '텍스트나 URL로 QR 코드를 생성합니다.',
  'url-image': 'URL을 이미지로 캡처합니다.',
  'url-pdf': '웹 페이지 전체 스크롤을 PDF로 저장합니다.',
  'detect-cms': '웹 페이지의 CMS 사용 여부를 추정합니다.',
  'image-metadata': '이미지 안에 포함된 메타데이터를 확인합니다.',
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
  'Output format': '출력 포맷',
  Bitrate: '비트레이트',
  'Sample rate': '샘플레이트',
  Channels: '채널',
  'Selection mode': '선택 처리',
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
  Rows: '행',
  Columns: '열',
  'Layout direction': '배치 방향',
  Gap: '간격',
  'Background color': '배경색',
  'White threshold': '화이트 임계값',
  'Blur radius': '블러 강도',
  'OCR language': 'OCR 언어',
  FPS: 'FPS',
  'CRF (lower = better quality)': 'CRF (낮을수록 고화질)',
  'Rows per file': '파일당 행 수',
  'QR content': 'QR 내용',
  'Size (px)': '크기 (px)',
  'Target URL': '대상 URL',
  'Canvas width': '캔버스 너비',
  'Capture full page scroll': '전체 페이지 스크롤 포함',
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
  format: '출력 포맷',
  outputFormat: '출력 포맷',
  bitrate: '비트레이트',
  sampleRate: '샘플레이트',
  channels: '채널',
  trimMode: '선택 처리',
  x: 'X',
  y: 'Y',
  text: '텍스트',
  color: '색상',
  size: '크기',
  rows: '행',
  cols: '열',
  columns: '열',
  direction: '배치 방향',
  gap: '간격',
  background: '배경색',
  threshold: '화이트 임계값',
  radius: '블러 강도',
  lang: 'OCR 언어',
  fps: 'FPS',
  crf: 'CRF',
  rowsPerFile: '파일당 행 수',
  content: 'QR 내용',
  url: '대상 URL',
  captureFullPage: '전체 페이지 스크롤 포함',
};

const koChoiceLabels: Record<string, string> = {
  '90 degrees': '90도',
  '180 degrees': '180도',
  '270 degrees': '270도',
  Horizontal: '가로',
  Vertical: '세로',
  'English (eng)': '영어 (eng)',
  'Korean + English (kor+eng)': '한국어 + 영어 (kor+eng)',
  'Keep original': '원본 유지',
  'Keep selection': '선택 구간만 남기기',
  'Remove selection': '선택 구간 제거하기',
  Mono: '모노',
  Stereo: '스테레오',
};

const koPlaceholders: Record<string, string> = {
  'e.g. 3,1,2': '예: 3,1,2',
  'e.g. 2,5': '예: 2,5',
};

Object.assign(koToolNames, {
  'video-convert': '비디오 변환기',
  'pdf-watermark': 'PDF 워터마크',
  'pdf-redact': 'PDF 영구 가리기',
  'image-upscale': '이미지 업스케일',
  'image-watermark': '이미지 워터마크',
  'image-color-palette-extract': '이미지 색상 팔레트 추출',
  'image-auto-enhance': '이미지 자동 보정',
  'video-speed-change': '비디오 속도 변경',
  'video-crop': '비디오 크롭',
  'video-resize': '비디오 리사이즈',
  'video-watermark': '비디오 워터마크',
  'video-reverse': '비디오 역재생',
  'video-thumbnail-generator': '비디오 썸네일 생성',
  'images-to-gif': '이미지로 GIF 만들기',
  'gif-to-video': 'GIF를 비디오로',
  'gif-speed-change': 'GIF 속도 변경',
  'gif-reverse': 'GIF 역재생',
  'gif-frame-extract': 'GIF 프레임 추출',
  'audio-merge': '오디오 합치기',
  'audio-fade': '오디오 페이드 인/아웃',
  'audio-speed-change': '오디오 속도 변경',
  'audio-pitch-change': '오디오 피치 변경',
  'screen-recorder': '화면 녹화',
  'screen-audio-recorder': '화면 + 시스템 오디오 녹화',
  'screen-mic-recorder': '화면 + 마이크 녹화',
  'screen-camera-recorder': '화면 + 카메라 녹화',
  'webcam-recorder': '웹캠 녹화',
  'audio-recorder': '오디오 녹음',
  'screenshot-capture': '스크린샷 캡처',
});

Object.assign(koToolDescriptions, {
  'video-convert': '비디오와 GIF를 MP4, WEBM, MOV, GIF, 애니메이션 WEBP 중 원하는 포맷으로 한 번에 변환합니다.',
  'pdf-watermark': 'PDF 각 페이지에 텍스트 또는 이미지 워터마크를 넣습니다.',
  'pdf-redact': '선택한 페이지 범위에 지정한 영역을 영구적으로 가립니다.',
  'image-upscale': '이미지를 더 큰 해상도로 확대합니다.',
  'image-watermark': '이미지 위에 텍스트나 보조 이미지를 워터마크로 올립니다.',
  'image-color-palette-extract': '이미지의 대표 색상을 추출해 팔레트로 보여줍니다.',
  'image-auto-enhance': '밝기, 대비, 선명도를 자동으로 보정합니다.',
  'video-speed-change': '비디오 재생 속도를 조절합니다.',
  'video-crop': '비디오 화면에서 필요한 영역만 잘라냅니다.',
  'video-resize': '비디오 해상도를 원하는 크기로 바꿉니다.',
  'video-watermark': '비디오에 텍스트 또는 이미지 워터마크를 추가합니다.',
  'video-reverse': '비디오와 오디오를 가능한 범위에서 역재생합니다.',
  'video-thumbnail-generator': '비디오 특정 시점의 썸네일 이미지를 생성합니다.',
  'images-to-gif': '여러 이미지를 GIF 애니메이션으로 만듭니다.',
  'gif-to-video': 'GIF를 MP4 비디오로 변환합니다.',
  'gif-speed-change': 'GIF 재생 속도를 조절합니다.',
  'gif-reverse': 'GIF를 역방향으로 재생되게 만듭니다.',
  'gif-frame-extract': 'GIF의 각 프레임을 PNG 이미지로 추출합니다.',
  'audio-merge': '여러 오디오 파일을 하나로 합칩니다.',
  'audio-fade': '오디오 시작과 끝에 부드러운 페이드를 적용합니다.',
  'audio-speed-change': '오디오 속도를 바꾸면서 피치는 최대한 유지합니다.',
  'audio-pitch-change': '오디오 음높이를 반음 단위로 조절합니다.',
  'screen-recorder': '브라우저에서 화면, 탭, 창을 바로 녹화합니다.',
  'screen-audio-recorder': '화면과 시스템 오디오를 함께 녹화합니다.',
  'screen-mic-recorder': '화면과 마이크 음성을 함께 녹화합니다.',
  'screen-camera-recorder': '화면 녹화에 웹캠 오버레이를 합성합니다.',
  'webcam-recorder': '웹캠 영상을 브라우저에서 바로 녹화합니다.',
  'audio-recorder': '마이크 음성을 녹음한 뒤 파형을 보고 자르거나 WAV, MP3로 저장합니다.',
  'screenshot-capture': '선택한 화면이나 탭을 정지 이미지로 캡처합니다.',
});

Object.assign(koOptionLabelsByLabel, {
  'Watermark type': '워터마크 유형',
  Opacity: '투명도',
  Scale: '배율',
  'Redact color': '가리기 색상',
  'Start page': '시작 페이지',
  'End page': '끝 페이지',
  Count: '개수',
  Strength: '강도',
  Speed: '속도',
  Timestamp: '시점',
  'Fade in duration': '페이드 인 길이',
  'Fade out duration': '페이드 아웃 길이',
  Semitones: '반음 수',
  'Camera position': '카메라 위치',
  'Camera size': '카메라 크기',
  'Include microphone': '마이크 포함',
});

Object.assign(koOptionLabelsByKey, {
  watermarkType: '워터마크 유형',
  opacity: '투명도',
  scale: '배율',
  pageStart: '시작 페이지',
  pageEnd: '끝 페이지',
  count: '개수',
  strength: '강도',
  speed: '속도',
  timestamp: '시점',
  fadeInDuration: '페이드 인 길이',
  fadeOutDuration: '페이드 아웃 길이',
  semitones: '반음 수',
  cameraPosition: '카메라 위치',
  cameraScale: '카메라 크기',
  includeMicrophone: '마이크 포함',
});

Object.assign(koChoiceLabels, {
  Text: '텍스트',
  Image: '이미지',
  'Top left': '왼쪽 위',
  'Top right': '오른쪽 위',
  'Bottom left': '왼쪽 아래',
  'Bottom right': '오른쪽 아래',
  Enabled: '사용',
});

Object.assign(koToolNames, {
  'pdf-to-word': 'PDF를 Word로',
  'pdf-to-excel': 'PDF를 Excel로',
  'word-to-pdf': 'Word를 PDF로',
  'powerpoint-to-pdf': 'PowerPoint를 PDF로',
  'excel-to-pdf': 'Excel을 PDF로',
  'html-to-pdf': 'HTML을 PDF로',
  'edit-pdf': 'PDF 편집',
  'pdf-sign': 'PDF 서명',
  'pdf-repair': 'PDF 복구',
  'pdf-compare': 'PDF 비교',
  'pdf-to-pdfa': 'PDF를 PDF/A로',
});

Object.assign(koToolDescriptions, {
  'pdf-to-word': 'PDF에서 읽을 수 있는 텍스트를 추출해 DOCX 문서로 변환합니다.',
  'pdf-to-excel': 'PDF에서 읽을 수 있는 텍스트 줄을 시트별 XLSX로 정리합니다.',
  'word-to-pdf': 'DOCX 텍스트 문서를 브라우저에서 PDF 페이지로 변환합니다.',
  'powerpoint-to-pdf': 'PPTX 슬라이드의 텍스트를 읽어 PDF 요약본으로 변환합니다.',
  'excel-to-pdf': 'Excel 시트 내용을 PDF 요약 페이지로 렌더링합니다.',
  'html-to-pdf': 'HTML 파일을 브라우저 안에서 렌더링한 뒤 PDF로 저장합니다.',
  'edit-pdf': '텍스트, 이미지, 메모, 강조 박스를 PDF 페이지 위에 추가합니다.',
  'pdf-sign': '텍스트 또는 이미지 서명을 PDF 페이지에 시각적으로 배치합니다.',
  'pdf-repair': '브라우저에서 열 수 있는 PDF를 다시 저장해 더 깔끔한 사본으로 만듭니다.',
  'pdf-compare': '두 PDF의 추출 텍스트를 비교해 차이 보고서를 만듭니다.',
  'pdf-to-pdfa': '메타데이터를 보강해 보관용 PDF/A 스타일 사본을 만듭니다. 정식 준수 검증은 포함하지 않습니다.',
});

Object.assign(koOptionLabelsByLabel, {
  'Edit type': '편집 유형',
  'Page number': '페이지 번호',
  Color: '색상',
  'Signature type': '서명 유형',
  'Signer name': '서명자 이름',
  'Include date': '날짜 포함',
  'Ignore whitespace': '공백 무시',
  Title: '제목',
  Author: '작성자',
  Subject: '주제',
});

Object.assign(koOptionLabelsByKey, {
  editType: '편집 유형',
  pageNumber: '페이지 번호',
  signatureType: '서명 유형',
  signerName: '서명자 이름',
  includeDate: '날짜 포함',
  ignoreWhitespace: '공백 무시',
  title: '제목',
  author: '작성자',
  subject: '주제',
});

Object.assign(koChoiceLabels, {
  Rectangle: '사각형',
  Highlight: '강조',
  Comment: '메모',
});

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

  return `${name} 작업을 브라우저 안에서 바로 실행합니다.`;
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
