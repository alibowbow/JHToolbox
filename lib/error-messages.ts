import type { Locale } from '@/lib/i18n';

/**
 * Processors throw plain English messages (they also run in workers and the
 * pipeline, where there is no locale). This module turns those messages, the
 * progress stages and the result metadata into copy for the current locale.
 */

const EXACT_ERRORS_KO: Record<string, string> = {
  // Missing or wrong input
  'Unsupported tool.': '지원하지 않는 도구입니다.',
  'Select at least one file to process.': '처리할 파일을 하나 이상 추가하세요.',
  'Select at least one image file.': '이미지 파일을 하나 이상 추가하세요.',
  'Select at least one video file.': '동영상 파일을 하나 이상 추가하세요.',
  'Select at least one media file.': '동영상 또는 오디오 파일을 하나 이상 추가하세요.',
  'Select at least one image or PDF file.': '이미지 또는 PDF 파일을 하나 이상 추가하세요.',
  'Select at least one PDF file.': 'PDF 파일을 하나 이상 추가하세요.',
  'Select an HWPX file to convert.': '변환할 HWPX 파일을 추가하세요.',
  'Select a ZIP file to extract.': '압축을 풀 ZIP 파일을 추가하세요.',
  'Select a PDF or HWPX file to convert.': '변환할 PDF 또는 HWPX 파일을 추가하세요.',
  'Add two PDF files to compare.': '비교할 PDF 파일 두 개를 추가하세요.',
  'Add one base image and one watermark image.': '바탕 이미지와 워터마크 이미지를 하나씩 추가하세요.',
  'Add at least one PDF file to watermark.': '워터마크를 넣을 PDF 파일을 추가하세요.',
  'Add an image file along with the PDF to place an image overlay.': '이미지를 올리려면 PDF와 함께 이미지 파일도 추가하세요.',
  'Add a watermark image along with the PDF file.': 'PDF와 함께 워터마크 이미지도 추가하세요.',
  'Add a signature image together with the PDF file.': 'PDF와 함께 서명 이미지도 추가하세요.',
  'Add a PNG or JPG watermark image.': 'PNG 또는 JPG 워터마크 이미지를 추가하세요.',
  'Add a PDF file to sign.': '서명할 PDF 파일을 추가하세요.',
  'Add a PDF file to edit.': '편집할 PDF 파일을 추가하세요.',
  'At least one page must remain — you cannot delete every page.': '모든 페이지를 지울 수는 없습니다. 최소 한 페이지는 남겨 두세요.',
  'Choose the pages to delete.': '지울 페이지를 고르세요. (예: 2, 5-7)',
  'Draw at least one box over what you want to hide.': '가릴 부분에 상자를 하나 이상 그려 주세요.',
  'Add at least one step before running the pipeline.': '실행하기 전에 단계를 하나 이상 추가하세요.',
  'Pipeline cancelled.': '작업을 취소했습니다.',
  'This step failed.': '이 단계에서 오류가 났습니다.',
  'This step produced no output files.': '이 단계에서 결과 파일이 나오지 않았습니다.',

  // Files that cannot be read
  'This PDF could not be parsed. The repair tool can only rebuild PDFs that still open in the browser.':
    '이 PDF를 읽을 수 없습니다. 복구 도구는 브라우저에서 열리는 PDF만 다시 만들 수 있습니다.',
  'This PPTX file does not contain readable slide XML.': '이 PPTX 파일에서 읽을 수 있는 슬라이드를 찾지 못했습니다.',
  'This DOCX file does not contain a readable document.xml payload.': '이 DOCX 파일에서 읽을 수 있는 본문을 찾지 못했습니다.',
  'This HWPX file does not contain readable section XML.': '이 HWPX 파일에서 읽을 수 있는 본문을 찾지 못했습니다.',
  'This HWPX file looks like a decompression bomb and was rejected.': '압축을 풀면 비정상적으로 커지는 HWPX 파일이라 열지 않았습니다.',
  'This HWPX file has too many internal entries and was rejected.': 'HWPX 파일 안의 항목이 너무 많아 열지 않았습니다.',
  'Cannot build an HWPX document with no pages.': '페이지가 없어 HWPX 문서를 만들 수 없습니다.',
  'This archive looks like a decompression bomb and was not extracted.': '압축을 풀면 비정상적으로 커지는 파일(압축 폭탄)이라 풀지 않았습니다.',
  'This archive expands to more data than is allowed and was not fully extracted.': '압축을 풀면 허용 용량을 넘어서 풀지 않았습니다.',
  'Failed to load video metadata.': '동영상 정보를 읽지 못했습니다. 지원하지 않는 형식이거나 손상된 파일일 수 있습니다.',
  'Failed to seek video.': '동영상의 해당 시점으로 이동하지 못했습니다.',
  'The HTML file could not be rendered in the preview frame.': 'HTML 파일을 화면에 그리지 못했습니다.',
  'The image could not be decoded.': '이미지를 열 수 없습니다. 손상되었거나 브라우저가 지원하지 않는 형식입니다.',

  // Browser capabilities
  'Canvas unavailable.': '이 브라우저에서 이미지를 그릴 수 없습니다(캔버스 사용 불가).',
  'Canvas unavailable for watermark generation.': '이 브라우저에서 워터마크를 그릴 수 없습니다(캔버스 사용 불가).',
  'Canvas unavailable while preparing GIF frames.': 'GIF 프레임을 준비하지 못했습니다(캔버스 사용 불가).',
  'Canvas rendering is not available in this browser.': '이 브라우저에서 이미지를 그릴 수 없습니다(캔버스 사용 불가).',
  'Palette canvas unavailable.': '색상을 추출하지 못했습니다(캔버스 사용 불가).',
  'The browser could not create a canvas to render the PDF.': '브라우저가 PDF를 그릴 캔버스를 만들지 못했습니다.',
  'Failed to create a canvas blob.': '결과 이미지를 만들지 못했습니다. 이미지가 너무 크면 크기를 줄여 보세요.',
  'AudioContext is unavailable in this browser.': '이 브라우저는 오디오 처리를 지원하지 않습니다.',
  'AudioContext is unavailable in this environment.': '이 브라우저는 오디오 처리를 지원하지 않습니다.',
  'The browser did not expose the rendered HTML document.': '브라우저가 렌더링한 문서를 읽지 못했습니다.',
  'Media processing failed.': '미디어를 처리하지 못했습니다. 지원하지 않는 코덱이거나 손상된 파일일 수 있습니다.',
  'The file could not be converted.': '파일을 변환하지 못했습니다. 파일 형식이 올바른지 확인하세요.',
  'The background worker stopped unexpectedly.': '백그라운드 작업이 예기치 않게 멈췄습니다. 다시 시도하세요.',

  // Web capture (lib/capture-failure CAPTURE_FAILURE_MESSAGES)
  'Unable to fetch HTML for this URL. The target may block CORS or remote access.':
    '이 주소의 HTML을 가져오지 못했습니다. 사이트가 외부 접근을 막고 있을 수 있습니다.',
  'The screenshot servers could not get into this site. It may block overseas or automated visitors.':
    '캡처 서버가 이 사이트에 접속하지 못했습니다. 해외 접속이나 자동 접속을 막는 사이트일 수 있습니다.',
  'The screenshot server could not find this address. Check the URL.': '캡처 서버가 이 주소를 찾지 못했습니다. 주소를 확인하세요.',
  'The free screenshot services have reached their usage limit. Try again later.':
    '무료 캡처 서비스의 사용 한도에 걸렸습니다. 잠시 후 다시 시도하세요.',
  'The page took too long to load on the screenshot server. Shorten the wait or capture only the first screen.':
    '캡처 서버에서 페이지를 여는 데 시간이 너무 오래 걸렸습니다. 대기 시간을 줄이거나 첫 화면만 캡처해 보세요.',
  'The capture came back blank. The site may block the screenshot servers or need longer to load.':
    '빈 화면만 캡처되었습니다. 사이트가 캡처 서버를 막았거나 로딩에 시간이 더 필요할 수 있습니다.',
  'Could not reach the screenshot services. Check your connection or ad blocker.':
    '캡처 서비스에 연결하지 못했습니다. 인터넷 연결이나 광고 차단 확장 프로그램을 확인하세요.',
  'The shared tab did not send a picture.': '공유한 탭에서 화면을 받지 못했습니다. 다시 시도하세요.',

  // URL validation (lib/url-safety describeUrlRejection)
  'Enter a URL to continue.': '웹 주소(URL)를 입력하세요.',
  'This URL is too long to process safely.': '주소가 너무 길어 처리할 수 없습니다.',
  'Only http and https URLs are supported.': 'http:// 또는 https://로 시작하는 주소만 쓸 수 있습니다.',
  'URLs that embed a username or password are not allowed.': '아이디나 비밀번호가 들어간 주소는 쓸 수 없습니다.',
  'Local or internal addresses cannot be used with this tool.': '내 컴퓨터나 내부망 주소는 쓸 수 없습니다.',
  'Cloud metadata and internal service addresses are blocked for security.': '보안을 위해 클라우드 내부 서비스 주소는 막혀 있습니다.',
  'Private, loopback, and reserved IP addresses are not allowed.': '사설·예약 IP 주소는 쓸 수 없습니다.',
  'Enter a valid public http or https URL.': '올바른 웹 주소를 입력하세요. (예: https://naver.com)',
};

type PatternRule = {
  pattern: RegExp;
  en: (match: RegExpMatchArray) => string | null;
  ko: (match: RegExpMatchArray) => string;
};

/**
 * Raw errors from libraries and templated processor errors. `en: () => null`
 * keeps the original message; otherwise both locales get friendlier copy.
 */
const PATTERN_RULES: PatternRule[] = [
  {
    pattern: /AbortError|operation was aborted|signal is aborted/i,
    en: () => 'Cancelled.',
    ko: () => '작업을 취소했습니다.',
  },
  {
    pattern: /NotAllowedError|Permission denied|not allowed by the user agent|Permission dismissed/i,
    en: () => 'Permission was denied. Allow access in the site settings next to the address bar, then try again.',
    ko: () => '권한이 거부되었습니다. 주소창 옆 사이트 설정에서 권한을 허용한 뒤 다시 시도하세요.',
  },
  {
    pattern: /NotFoundError|Requested device not found/i,
    en: () => 'No usable camera or microphone was found.',
    ko: () => '사용할 수 있는 카메라나 마이크를 찾지 못했습니다.',
  },
  {
    pattern: /NotReadableError|Could not start (?:video|audio) source|Device in use/i,
    en: () => 'Another app is using the camera or microphone. Close it and try again.',
    ko: () => '다른 앱이 카메라나 마이크를 쓰고 있습니다. 그 앱을 닫고 다시 시도하세요.',
  },
  {
    pattern: /is encrypted|PasswordException|No password given|Incorrect Password/i,
    en: () => 'This PDF is password-protected. Remove the password first, then try again.',
    ko: () => '암호가 걸린 PDF입니다. 암호를 먼저 해제한 뒤 다시 시도하세요.',
  },
  {
    pattern: /No PDF header found|Invalid PDF structure|Failed to parse PDF|InvalidPDFException|Invalid object ref/i,
    en: () => 'This file could not be read as a PDF. It may be damaged or not a PDF.',
    ko: () => 'PDF를 읽을 수 없습니다. 손상되었거나 PDF 형식이 아닌 파일입니다.',
  },
  {
    pattern: /WinAnsi cannot encode/i,
    en: () => 'The built-in PDF font cannot draw some of these characters (such as Korean).',
    ko: () => '기본 PDF 글꼴로는 일부 문자(한글 등)를 그릴 수 없습니다.',
  },
  {
    pattern: /central directory|Corrupted zip|is this a zip file|End of data reached/i,
    en: () => 'This ZIP file is damaged or is not a ZIP archive.',
    ko: () => 'ZIP 파일이 손상되었거나 ZIP 형식이 아닙니다.',
  },
  {
    pattern: /could not be decoded|source image cannot be decoded|Failed to load image|image.*decod/i,
    en: () => 'The image could not be opened. It may be damaged or in a format this browser cannot read.',
    ko: () => '이미지를 열 수 없습니다. 손상되었거나 브라우저가 지원하지 않는 형식입니다.',
  },
  {
    pattern: /(?:Unexpected token|Unexpected end of JSON|is not valid JSON|JSON\.parse|Expected property name|Unterminated string|Bad control character)(?:.*?(?:at position (\d+)|line (\d+) column (\d+)))?/i,
    en: () => null,
    ko: (match) => {
      const where = match[1] ? ` (${match[1]}번째 글자 근처)` : match[2] ? ` (${match[2]}행 ${match[3]}열 근처)` : '';
      return `JSON 형식이 올바르지 않습니다${where}. 쉼표, 따옴표, 괄호를 확인하세요.`;
    },
  },
  {
    pattern: /out of memory|Array buffer allocation failed|allocation failed|Invalid array length|Invalid typed array length/i,
    en: () => 'The browser ran out of memory. Try fewer or smaller files.',
    ko: () => '메모리가 부족합니다. 파일 수나 크기를 줄여 다시 시도하세요.',
  },
  {
    pattern: /ffmpeg-core|failed to import ffmpeg/i,
    en: () => 'The media engine could not be downloaded. Check your connection and try again.',
    ko: () => '미디어 엔진을 내려받지 못했습니다. 인터넷 연결을 확인하고 다시 시도하세요.',
  },
  {
    pattern: /FS error|ErrnoError|RuntimeError: (?:unreachable|memory access out of bounds)|^Aborted\(/i,
    en: () => 'The media file could not be processed. The codec may be unsupported or the file too large.',
    ko: () => '미디어를 처리하지 못했습니다. 지원하지 않는 코덱이거나 파일이 너무 클 수 있습니다.',
  },
  {
    pattern: /Failed to fetch|NetworkError|Load failed|network error|ERR_INTERNET_DISCONNECTED/i,
    en: () => 'A network request failed. Check your connection and try again.',
    ko: () => '네트워크 요청에 실패했습니다. 인터넷 연결을 확인하고 다시 시도하세요.',
  },
  {
    pattern: /^Screenshot service responded with status (\d+)/,
    en: () => null,
    ko: (match) => `캡처 서비스가 오류를 반환했습니다(상태 ${match[1]}). 잠시 후 다시 시도하세요.`,
  },
  {
    pattern: /^(?:CaptureError: )?Unable to capture a screenshot for this URL/,
    en: () => null,
    ko: () => '이 주소의 화면을 캡처하지 못했습니다. 캡처 서비스가 바쁘거나 요청을 막고 있을 수 있으니 잠시 후 다시 시도하세요.',
  },
  {
    pattern: /^Page order has entries that are not pages of this (\d+)-page PDF: (.+?)\.?$/,
    en: () => null,
    ko: (match) => `이 PDF(총 ${match[1]}쪽)에 없는 페이지가 순서에 들어 있습니다: ${match[2]}`,
  },
  {
    pattern: /^Page list has entries that are not pages of this (\d+)-page PDF: (.+?)\.?$/,
    en: () => null,
    ko: (match) => `이 PDF(총 ${match[1]}쪽)에 없는 페이지 번호가 있습니다: ${match[2]}`,
  },
  {
    pattern: /^This archive has too many entries \((\d+)\)/,
    en: () => null,
    ko: (match) => `압축 파일 안의 항목이 너무 많아(${match[1]}개) 풀지 않았습니다.`,
  },
  {
    pattern: /^Refusing to extract an unsafe path from the archive: "(.*)"/,
    en: () => null,
    ko: (match) => `안전하지 않은 경로가 들어 있어 압축을 풀지 않았습니다: ${match[1]}`,
  },
  {
    pattern: /^This HWPX file contains an unsafe internal path and was rejected: "(.*)"/,
    en: () => null,
    ko: (match) => `HWPX 파일에 안전하지 않은 내부 경로가 있어 열지 않았습니다: ${match[1]}`,
  },
  {
    pattern: /^The browser failed to encode page (\d+) as an image/,
    en: () => null,
    ko: (match) => `${match[1]}쪽을 이미지로 바꾸지 못했습니다.`,
  },
  {
    pattern: /^The previous step's output may not match this tool's accepted input \((.+)\)\.$/,
    en: () => null,
    ko: (match) => `앞 단계 결과가 이 도구가 받는 형식(${match[1]})과 맞지 않을 수 있습니다.`,
  },
  {
    pattern: /^A pipeline can have at most (\d+) steps/,
    en: () => null,
    ko: (match) => `단계는 최대 ${match[1]}개까지 만들 수 있습니다.`,
  },
  {
    pattern: /^Could not open "(.+)"\.?$/,
    en: () => null,
    ko: (match) => `"${match[1]}" 파일을 열 수 없습니다. 손상되었거나 지원하지 않는 형식입니다.`,
  },
];

function rawMessage(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message || (cause.name !== 'Error' ? cause.name : '');
  }
  if (typeof cause === 'string') {
    return cause;
  }
  return '';
}

/** A user-facing message for anything a tool run can throw. */
export function localizeErrorMessage(cause: unknown, locale: Locale): string {
  const message = rawMessage(cause).trim();
  const isAbort = cause instanceof DOMException && cause.name === 'AbortError';

  if (!message && !isAbort) {
    return locale === 'ko' ? '처리하지 못했습니다. 다시 시도하세요.' : 'Processing failed. Please try again.';
  }

  if (!isAbort) {
    const exact = EXACT_ERRORS_KO[message];
    if (exact) {
      return locale === 'ko' ? exact : message;
    }
  }

  const name = cause instanceof Error ? cause.name : cause instanceof DOMException ? cause.name : '';
  const probe = isAbort ? 'AbortError' : name && name !== 'Error' ? `${name}: ${message}` : message;
  for (const rule of PATTERN_RULES) {
    const match = probe.match(rule.pattern);
    if (match) {
      return locale === 'ko' ? rule.ko(match) : rule.en(match) ?? message;
    }
  }

  return message;
}

export function isAbortError(cause: unknown): boolean {
  return (
    (cause instanceof DOMException && cause.name === 'AbortError') ||
    (cause instanceof Error && (cause.name === 'AbortError' || /operation was aborted/i.test(cause.message)))
  );
}

const STAGES_KO: Record<string, string> = {
  Starting: '시작하는 중',
  Done: '완료',
  'Loading ffmpeg.wasm': '미디어 엔진 불러오는 중 (처음 한 번, 약 30MB)',
  'Processing media': '미디어 처리 중',
  'Processing video': '동영상 처리 중',
  'Processing audio': '오디오 처리 중',
  'Converting video': '동영상 변환 중',
  'Capturing thumbnail': '장면 캡처 중',
  'Building GIF': 'GIF 만드는 중',
  'Extracting GIF frames': 'GIF 프레임 추출 중',
  'Finished file': '파일 처리 완료',
  'Finished audio': '오디오 처리 완료',
  'Merging PDF files': 'PDF 합치는 중',
  'Splitting PDF pages': 'PDF 나누는 중',
  'Rendering PDF pages': 'PDF 페이지 그리는 중',
  'Extracting PDF text': 'PDF 텍스트 추출 중',
  'Extracting PDF text for Word': 'Word로 옮길 텍스트 추출 중',
  'Extracting PDF text for Excel': 'Excel로 옮길 표 추출 중',
  'Extracting text from the first PDF': '첫 번째 PDF 읽는 중',
  'Extracting text from the second PDF': '두 번째 PDF 읽는 중',
  'Adding images to PDF': 'PDF에 이미지 넣는 중',
  'Applying watermark': '워터마크 넣는 중',
  'Saving optimized PDF': 'PDF 저장 중',
  'Saving reduced PDF': 'PDF 저장 중',
  'Redacting pages': '페이지 가리는 중',
  'Analyzing PDF layout': 'PDF 레이아웃 분석 중',
  'Reading HWPX content': 'HWPX 읽는 중',
  'Building HWPX document': 'HWPX 문서 만드는 중',
  'Building HWPX package': 'HWPX 파일 만드는 중',
  'Preparing OCR worker': '글자 인식 엔진 준비 중',
  'Running image OCR': '글자 인식 중',
  'Upscaling image': '이미지 확대 중',
  'Enhancing image': '이미지 보정 중',
  'Extracting palette': '색상 추출 중',
  'Reading metadata': '메타데이터 읽는 중',
  'Generating QR code': 'QR 코드 만드는 중',
  'Inspecting page HTML': '페이지 분석 중',
  'Capturing webpage screenshot': '웹페이지 캡처 중',
  'Creating PDF capture': 'PDF로 만드는 중',
  'Preparing image download': '이미지 준비 중',
};

/** Some processors report Korean stages; English UI shows them in English. */
const STAGES_EN_FROM_KO: Record<string, string> = {
  '이미지 변환 중': 'Converting image',
  '리사이즈 처리 중': 'Resizing',
  '압축 중': 'Compressing',
  '크롭 처리 중': 'Cropping',
  '반전 처리 중': 'Flipping',
  '회전 처리 중': 'Rotating',
  '픽셀화 처리 중': 'Pixelating',
  '텍스트 추가 중': 'Adding text',
  '테두리 추가 중': 'Adding border',
  '이미지 분할 중': 'Splitting image',
  '이미지 결합 중': 'Combining images',
  '콜라주 생성 중': 'Building collage',
  '배경 투명화 중': 'Removing background',
  '배경 블러 처리 중': 'Blurring background',
  '데이터 변환 준비 중': 'Preparing data conversion',
  'ZIP 해제 중': 'Extracting ZIP',
  'ZIP 압축 중': 'Compressing ZIP',
  'ZIP 생성 중': 'Creating ZIP',
};

const STAGE_PATTERNS: Array<{ pattern: RegExp; ko: (match: RegExpMatchArray) => string }> = [
  { pattern: /^Loading page \(waiting (\d+)s\)$/, ko: (match) => `페이지 로딩 기다리는 중 (${match[1]}초)` },
  { pattern: /^Recompressing image (\d+) of (\d+)$/, ko: (match) => `이미지 다시 압축 중 (${match[1]}/${match[2]})` },
  { pattern: /^Re-rendering page (\d+) of (\d+)$/, ko: (match) => `페이지 다시 그리는 중 (${match[1]}/${match[2]})` },
  { pattern: /^Rendering page (\d+) of (\d+)$/, ko: (match) => `페이지 그리는 중 (${match[1]}/${match[2]})` },
];

export function localizeStage(stage: string, locale: Locale): string {
  if (!stage) {
    return '';
  }
  if (locale === 'en') {
    return STAGES_EN_FROM_KO[stage] ?? stage;
  }
  const exact = STAGES_KO[stage];
  if (exact) {
    return exact;
  }
  for (const rule of STAGE_PATTERNS) {
    const match = stage.match(rule.pattern);
    if (match) {
      return rule.ko(match);
    }
  }
  return stage;
}

/**
 * Result metadata worth showing. Byte counts are already on the card as
 * "before → after", and internal mode/profile flags mean nothing to users.
 */
const METADATA_LABELS: Record<string, { en: string; ko: string }> = {
  pages: { en: 'Pages', ko: '페이지' },
  pageCount: { en: 'Pages', ko: '페이지' },
  removedPages: { en: 'Removed pages', ko: '뺀 페이지' },
  redactedPages: { en: 'Redacted pages', ko: '가린 페이지' },
  sheets: { en: 'Sheets', ko: '시트' },
  ocrPages: { en: 'Read with OCR', ko: 'OCR로 읽은 쪽' },
  width: { en: 'Width', ko: '너비' },
  height: { en: 'Height', ko: '높이' },
  duration: { en: 'Duration', ko: '길이' },
  frames: { en: 'Frames', ko: '프레임' },
  imagesRecompressed: { en: 'Images recompressed', ko: '다시 압축한 이미지' },
  dominantColors: { en: 'Main colours', ko: '대표 색상' },
  tables: { en: 'Tables', ko: '표' },
  textBoxes: { en: 'Text boxes', ko: '글상자' },
  lines: { en: 'Lines', ko: '선' },
  leftPages: { en: 'First PDF pages', ko: '첫 PDF 쪽수' },
  rightPages: { en: 'Second PDF pages', ko: '둘째 PDF 쪽수' },
  changedPages: { en: 'Pages with changes', ko: '달라진 쪽' },
  differencesFound: { en: 'Differences found', ko: '차이 있음' },
  candidates: { en: 'Detected', ko: '감지 결과' },
  entries: { en: 'Entries', ko: '항목' },
  rows: { en: 'Rows', ko: '행' },
  reason: { en: 'Note', ko: '안내' },
  note: { en: 'Note', ko: '참고' },
};

const METADATA_VALUES_KO: Record<string, string> = {
  'No recompressible JPEG images were found (text-only or non-JPEG images), so the original is returned unchanged.':
    '다시 압축할 JPEG 이미지가 없어(텍스트만 있거나 다른 형식의 이미지) 원본을 그대로 돌려드립니다.',
  'Rebuilding the structure did not make the file smaller, so the original is returned unchanged.':
    '구조를 다시 정리해도 용량이 줄지 않아 원본을 그대로 돌려드립니다.',
  'Recompression did not reduce the file size, so the original is returned unchanged.':
    '다시 압축해도 용량이 줄지 않아 원본을 그대로 돌려드립니다.',
  'Text stays selectable; only JPEG-encoded images were recompressed.': '글자는 그대로 선택할 수 있고, JPEG 이미지만 다시 압축했습니다.',
  'Pages were rasterized to JPEG — text and vector graphics are no longer selectable.':
    '페이지를 이미지로 바꿔 줄였기 때문에 글자를 더 이상 선택할 수 없습니다.',
  'Rebuilt from parseable PDF objects only.': '읽을 수 있는 부분만으로 PDF를 다시 만들었습니다.',
  'Pages with boxes were turned into images, so the hidden content is permanently removed. Text on those pages can no longer be selected.':
    '상자를 그린 페이지는 이미지로 바뀌어 가린 내용이 파일에서 완전히 지워졌습니다. 해당 페이지의 글자는 더 이상 선택할 수 없습니다.',
  'Metadata and page objects were rebuilt, but PDF/A compliance is not formally validated.':
    '보존용 형식에 맞춰 다시 만들었지만, PDF/A 인증 검사를 거친 것은 아닙니다.',
  'Formatting, tables, and images are rendered with browser fonts; pagination may differ.':
    '서식·표·이미지를 브라우저 글꼴로 그렸기 때문에 쪽 나눔이 원본과 다를 수 있습니다.',
  'Each page is placed as a full-page image at its original size. Visual fidelity is high, but text inside the page is not selectable or editable.':
    '각 쪽을 원본 크기의 이미지로 넣었습니다. 모양은 똑같지만 글자를 선택하거나 고칠 수 없습니다.',
  'Each text line sits in an editable text box at its original position; clean ruled grids become real Hangul tables. Unruled or merged-cell tables fall back to lines + text boxes.':
    '글줄마다 원래 위치에 편집 가능한 글상자로 넣었고, 선이 반듯한 표는 한글 표로 바꿨습니다. 병합 셀이나 선 없는 표는 선과 글상자로 표현됩니다.',
  'Text is fully selectable and editable, with font sizes, headings, and alignment preserved. Exact layout, columns, tables, and images are approximated — use "Keep original look" when appearance matters most.':
    '글자 크기·제목·정렬을 살려 자유롭게 편집할 수 있습니다. 배치·단·표·이미지는 근사치이니, 모양이 중요하면 "원본 모양 보존"을 쓰세요.',
  'Heuristic fingerprinting. Confidence reflects how many independent signals matched; a single weak signal is reported as low confidence, and no match is "inconclusive". Results may be limited when a site blocks cross-origin fetching or uses a mirror.':
    '페이지 흔적으로 추정한 결과입니다. 일치한 단서가 많을수록 신뢰도가 높고, 단서가 없으면 "판별 불가"입니다. 사이트가 외부 접근을 막으면 결과가 부족할 수 있습니다.',
  Inconclusive: '판별 불가',
};

export type DisplayMetadataEntry = { key: string; label: string; value: string; long: boolean };

export function getDisplayMetadata(
  metadata: Record<string, string | number | boolean | null | undefined> | undefined,
  locale: Locale,
): DisplayMetadataEntry[] {
  if (!metadata) {
    return [];
  }

  const entries: DisplayMetadataEntry[] = [];
  for (const [key, raw] of Object.entries(metadata)) {
    const label = METADATA_LABELS[key];
    if (!label || raw === null || raw === undefined || raw === '') {
      continue;
    }
    let value: string;
    if (typeof raw === 'boolean') {
      value = locale === 'ko' ? (raw ? '예' : '아니요') : raw ? 'Yes' : 'No';
    } else {
      value = String(raw);
      if (locale === 'ko') {
        value = METADATA_VALUES_KO[value] ?? value;
      }
    }
    entries.push({ key, label: label[locale], value, long: key === 'note' || key === 'reason' });
  }
  return entries;
}
