import type { Locale } from '@/lib/i18n';
import type { ToolDefinition } from '@/types/tool';

/**
 * Tool search that understands how people actually type in Korean:
 * "사진 용량 줄이기", "pdf합치기", "큐알", "엑셀을 pdf로". Queries are split into
 * words (also between Hangul and Latin), particles are dropped, and common
 * words are expanded with synonyms. Every meaningful word must match; words
 * that match no tool at all ("무료", "빨리") are ignored instead of
 * emptying the results.
 */

export type SearchableToolCopy = {
  tool: ToolDefinition;
  names: string[];
  descriptions: string[];
  categoryLabels: string[];
};

/** Everyday words for each tool, in addition to its tags. */
const TOOL_ALIASES: Record<string, string[]> = {
  'pdf-merge': ['합치기', '합본', '병합', '묶기'],
  'pdf-split': ['나누기', '쪼개기', '분리', '분할'],
  'pdf-rearrange': ['순서', '순서 바꾸기', '정렬', '페이지 이동'],
  'pdf-rotate': ['회전', '돌리기', '가로', '세로'],
  'pdf-delete-page': ['페이지 빼기', '페이지 지우기', '삭제', '제거'],
  'pdf-add-page-numbers': ['쪽번호', '페이지 번호', '번호 매기기'],
  'pdf-watermark': ['워터마크', '도장', '로고', '직인', '대외비'],
  'pdf-redact': ['가리기', '마스킹', '개인정보', '검게', '지우기'],
  'pdf-extract-images': ['이미지로', '그림으로', '사진으로', 'png', 'jpg', '페이지 이미지'],
  'pdf-compress': ['용량', '줄이기', '최적화', '경량화'],
  'pdf-reduce-size': ['용량', '줄이기', '압축', '경량화', '작게'],
  'pdf-to-image': ['이미지로', '그림으로', '사진으로', 'jpg', 'jpeg', 'png', 'webp', '페이지 이미지'],
  'image-convert': ['변환', '형식', '확장자', '포맷', 'jpeg', '바꾸기'],
  'pdf-to-png': ['이미지로', '그림으로', '사진으로'],
  'pdf-to-jpg': ['이미지로', '그림으로', '사진으로', 'jpeg'],
  'pdf-to-webp': ['이미지로', '그림으로'],
  'image-to-pdf': ['사진', '그림', 'jpg', 'png', '스캔', '문서로'],
  'pdf-to-word': ['워드', '문서', 'doc'],
  'pdf-to-excel': ['엑셀', '표', 'xls'],
  'word-to-pdf': ['워드', '문서', 'doc'],
  'powerpoint-to-pdf': ['파워포인트', '피피티', 'ppt', '슬라이드', '발표'],
  'excel-to-pdf': ['엑셀', '표', 'xls'],
  'html-to-pdf': ['웹', '코드'],
  'edit-pdf': ['수정', '글자 넣기', '텍스트 추가', '메모', '주석', '형광펜', '편집'],
  'pdf-sign': ['서명', '사인', '싸인', '도장', '전자서명', '날인'],
  'pdf-repair': ['복구', '깨진', '손상', '고치기', '열리지'],
  'pdf-compare': ['비교', '차이', '다른 점', '대조'],
  'pdf-to-pdfa': ['보존', '아카이브', '장기 보관'],
  'pdf-to-hwpx': ['한글', '한컴', '아래아', '한글 문서', 'hwp'],
  'image-resize': ['크기', '사이즈', '리사이즈', '해상도', '픽셀', '늘리기', '줄이기'],
  'image-compress': ['용량', '줄이기', '압축', '경량화', '최적화', '작게'],
  'image-crop': ['자르기', '크롭', '잘라내기', '트리밍'],
  'image-flip': ['뒤집기', '좌우 반전', '상하 반전', '미러', '반전'],
  'image-rotate': ['회전', '돌리기', '90도'],
  'image-pixelate': ['모자이크', '픽셀', '가리기'],
  'image-add-text': ['글씨', '문구', '텍스트', '캡션', '글자 넣기'],
  'image-add-border': ['테두리', '액자', '프레임', '여백'],
  'image-split': ['나누기', '분할', '쪼개기', '인스타 분할', '그리드'],
  'image-combine': ['합치기', '이어 붙이기', '붙이기', '결합', '병합'],
  'image-collage': ['콜라주', '모음', '격자', '합치기'],
  'image-background-transparent': ['배경 제거', '배경 지우기', '누끼', '투명'],
  'image-blur-background': ['블러', '흐리게', '뿌옇게'],
  'image-upscale': ['확대', '고화질', '업스케일', '해상도 높이기', '키우기', '선명'],
  'image-watermark': ['워터마크', '로고', '도장'],
  'image-color-palette-extract': ['색상', '팔레트', '컬러', '색 추출', '색 코드'],
  'image-auto-enhance': ['보정', '밝기', '선명', '화질 개선', '자동 보정'],
  'ocr-image-to-text': ['글자 인식', '텍스트 추출', '문자 인식', '글자 추출', '사진 글자'],
  'ocr-pdf-to-text': ['텍스트 추출', '글자 추출', '문자 추출'],
  'mute-video': ['음소거', '소리 제거', '무음', '소리 끄기'],
  'extract-audio': ['소리 추출', '음원 추출', 'mp3', '배경음'],
  'video-compress': ['용량', '줄이기', '압축', '작게'],
  'video-speed-change': ['배속', '속도', '빠르게', '느리게', '슬로우'],
  'video-trim': ['자르기', '컷', '구간', '잘라내기', '편집'],
  'video-crop': ['크롭', '화면 자르기', '영역', '자르기'],
  'video-resize': ['크기', '해상도', '리사이즈'],
  'video-watermark': ['워터마크', '로고'],
  'video-reverse': ['역재생', '거꾸로', '되감기'],
  'video-thumbnail-generator': ['썸네일', '장면 캡처', '스틸컷', '화면 캡처', '캡처'],
  'video-convert': ['변환', '움짤', 'gif 만들기', 'avi', 'mkv'],
  'images-to-gif': ['움짤', 'gif 만들기', '애니메이션'],
  'gif-speed-change': ['움짤', '속도'],
  'gif-reverse': ['움짤', '거꾸로'],
  'gif-frame-extract': ['움짤', '프레임', '분해'],
  'audio-convert': ['변환', '음원', 'mp3', 'wav', 'm4a'],
  'audio-cut': ['자르기', '편집', '컷', '벨소리', '구간'],
  'audio-merge': ['합치기', '이어 붙이기', '병합'],
  'audio-fade': ['페이드', '서서히', '볼륨'],
  'audio-speed-change': ['배속', '속도'],
  'audio-pitch-change': ['음정', '키', '피치', '톤'],
  'screen-recorder': ['화면 녹화', '녹화'],
  'screen-audio-recorder': ['화면 녹화', '소리 녹화', '시스템 소리'],
  'screen-mic-recorder': ['화면 녹화', '마이크', '강의', '내레이션'],
  'screen-camera-recorder': ['화면 녹화', '카메라', '얼굴', '캠'],
  'webcam-recorder': ['웹캠', '카메라', '셀카', '녹화'],
  'audio-recorder': ['녹음', '마이크', '음성'],
  'screenshot-capture': ['스크린샷', '캡처', '화면 캡처'],
  'csv-json': ['변환'],
  'json-csv': ['변환'],
  'excel-csv': ['엑셀', '변환', 'xls'],
  'csv-excel': ['엑셀', '변환', 'xls'],
  'xml-json': ['변환'],
  'json-xml': ['변환'],
  'xml-csv': ['변환'],
  'split-csv': ['나누기', '분할', '쪼개기'],
  'create-zip': ['압축', '압축하기', '묶기', '파일 묶기'],
  'extract-zip': ['압축 풀기', '압축 해제', '풀기', 'unzip'],
  'qr-generator': ['큐알', '큐알코드', 'qr코드', '바코드'],
  'url-image': ['웹페이지 캡처', '사이트 캡처', '홈페이지 캡처', '스크린샷', '전체 캡처', '사이트'],
  'url-pdf': ['웹페이지', '사이트', '홈페이지 저장', '전체 스크롤', '스크롤 캡처'],
  'detect-cms': ['워드프레스', '사이트 분석', '홈페이지 분석'],
  'image-metadata': ['exif', '촬영 정보', '메타데이터', '위치 정보', '카메라 정보'],
};

/** Words that mean the same thing when searching. */
const SYNONYM_GROUPS: string[][] = [
  ['합치', '합쳐', '병합', '합본', '결합', '붙이', 'merge', 'combine', 'join'],
  ['나누', '나눠', '분할', '쪼개', '분리', 'split'],
  ['줄이', '줄여', '용량', '압축', '경량', '작게', 'compress', 'reduce', 'shrink', 'smaller', 'optimize'],
  ['변환', '바꾸', '바꿔', '전환', 'convert', 'converter'],
  ['자르', '잘라', '크롭', '트리밍', 'crop', 'cut', 'trim'],
  ['회전', '돌리', '돌려', 'rotate'],
  ['크기', '사이즈', '리사이즈', '해상도', 'resize', 'scale'],
  ['이미지', '사진', '그림', 'image', 'photo', 'picture', 'img'],
  ['동영상', '영상', '비디오', 'video', 'movie', 'clip'],
  ['오디오', '음악', '소리', '음성', '음원', 'audio', 'sound', 'music'],
  ['엑셀', 'excel', 'xlsx', 'xls', 'spreadsheet'],
  ['워드', 'word', 'docx'],
  ['파워포인트', '피피티', 'ppt', 'pptx', 'powerpoint'],
  ['한글', '한컴', 'hwp', 'hwpx', 'hangul'],
  ['큐알', 'qr'],
  ['움짤', 'gif'],
  ['글자', '텍스트', '문자', '글씨', 'text', 'ocr'],
  ['캡처', '캡쳐', '스크린샷', 'screenshot', 'capture'],
  ['녹화', '녹음', 'record', 'recorder', 'recording'],
  ['워터마크', 'watermark', 'stamp'],
  ['서명', '사인', '싸인', 'sign', 'signature'],
  ['삭제', '지우', '지워', '없애', '제거', 'delete', 'remove'],
  ['배경', 'background'],
  ['모자이크', '블러', '흐리', 'blur', 'pixelate', 'mosaic'],
  ['가리', '가림', '마스킹', 'redact', 'mask'],
  ['음소거', '무음', 'mute'],
  ['속도', '배속', 'speed'],
  ['거꾸로', '역재생', 'reverse'],
  ['썸네일', 'thumbnail'],
  ['색상', '팔레트', '컬러', 'color', 'palette'],
  ['화질', '선명', '업스케일', 'upscale', 'enhance'],
  ['복구', '수리', '고치', 'repair', 'fix'],
  ['비교', '차이', 'compare', 'diff'],
  ['메타데이터', 'exif', 'metadata'],
  ['웹', '사이트', '홈페이지', '웹페이지', 'url', 'web', 'website', 'webpage'],
  ['뒤집', '반전', 'flip', 'mirror'],
  ['테두리', '액자', 'border'],
  ['압축풀', '압축해제', 'unzip', 'extract'],
  ['jpg', 'jpeg'],
];

const STOP_WORDS = new Set([
  'to', 'the', 'a', 'an', 'and', 'or', 'of', 'for', 'in', 'on', 'into', 'with', 'my', 'online', 'free', 'tool', 'tools', 'file', 'files',
  '무료', '온라인', '도구', '툴', '방법', '어떻게', '좀', '해줘', '해주세요', '싶어', '싶다', '하는법',
]);

/** One-syllable particles that are words of their own after splitting ("jpg를" → "jpg", "를"). */
const PARTICLES = new Set(['을', '를', '이', '가', '은', '는', '로', '에', '의', '도', '와', '과', '랑', '만', '서']);
const LONG_ENDINGS = ['으로', '에서', '에게', '하기', '해줘', '하는', '해서', '하고', '이랑', '까지', '부터'];

function normalize(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function compact(text: string): string {
  return text.replace(/\s+/g, '');
}

/** "pdf합치기 png2jpg" → ["pdf", "합치기", "png", "jpg"]. */
export function tokenizeQuery(query: string): string[] {
  const normalized = normalize(query);
  const tokens: string[] = [];
  for (const [part] of normalized.matchAll(/[a-z0-9]+|[\p{Script=Hangul}]+|[\p{L}\p{N}]+/gu)) {
    const formatPair = part.match(/^([a-z]{2,})2([a-z]{2,})$/);
    if (formatPair) {
      tokens.push(formatPair[1], formatPair[2]);
    } else {
      tokens.push(part);
    }
  }
  return tokens.filter((token) => !STOP_WORDS.has(token) && !PARTICLES.has(token));
}

/** "사진을" → ["사진을", "사진"]; short words stay whole ("추가" keeps its 가). */
function tokenVariants(token: string): string[] {
  const variants = [token];
  if (!/^[\p{Script=Hangul}]+$/u.test(token)) {
    return variants;
  }
  for (const ending of LONG_ENDINGS) {
    if (token.length > ending.length + 1 && token.endsWith(ending)) {
      variants.push(token.slice(0, -ending.length));
    }
  }
  if (token.length >= 3 && PARTICLES.has(token.slice(-1))) {
    variants.push(token.slice(0, -1));
  }
  return [...new Set(variants)];
}

const isLatin = (term: string) => /^[a-z0-9]+$/.test(term);

function synonymsFor(word: string): string[] {
  // `inWord`: the word contains the term ("줄여줘" ⊃ "줄여"); otherwise the
  // word is the start of a term, as while typing ("압축" → "압축풀").
  const hits: Array<{ group: string[]; term: string; inWord: boolean }> = [];
  for (const group of SYNONYM_GROUPS) {
    for (const candidate of group) {
      const inWord = isLatin(candidate) ? word === candidate || (word.length >= 4 && word.startsWith(candidate)) : word.includes(candidate);
      const typing = isLatin(candidate) ? word.length >= 3 && candidate.startsWith(word) : word.length >= 2 && candidate.startsWith(word);
      if (inWord || typing) {
        hits.push({ group, term: candidate, inWord });
        break;
      }
    }
  }
  // "압축풀기" means unzip, not compress: a longer term found in the word wins
  // over a shorter one it contains.
  const specific = hits.filter(
    (hit) =>
      !hit.inWord ||
      !hits.some((other) => other !== hit && other.inWord && other.term.length > hit.term.length && other.term.includes(hit.term)),
  );
  const found = new Set(specific.flatMap((hit) => hit.group));
  found.delete(word);
  return [...found];
}

type SearchDocument = {
  tool: ToolDefinition;
  order: number;
  names: string[];
  namesCompact: string[];
  nameWords: Set<string>;
  keywords: string[];
  categories: string[];
  descriptions: string[];
  direction: string;
};

/**
 * Tools that only make sense when the query names this subject: "jpg png"
 * is about converting pictures, not about PDFs.
 */
const SUBJECT_WORDS: Record<string, string[]> = {
  'pdf-to-image': ['pdf'],
  'image-to-pdf': ['pdf'],
};

/** Source formats a converter accepts, so "jpg to pdf" can tell direction. */
const DIRECTION_HINTS: Record<string, string> = {
  'image-to-pdf': 'jpg png webp image to pdf',
  'pdf-to-image': 'pdf to image jpg png webp',
};

function buildDocument(entry: SearchableToolCopy, order: number): SearchDocument {
  const names = entry.names.map(normalize);
  const keywords = [...entry.tool.tags, ...entry.tool.id.split('-'), ...(TOOL_ALIASES[entry.tool.id] ?? [])].map(normalize);
  return {
    tool: entry.tool,
    order,
    names,
    namesCompact: names.map(compact),
    nameWords: new Set(names.flatMap((name) => name.split(' '))),
    keywords,
    categories: entry.categoryLabels.map(normalize),
    descriptions: entry.descriptions.map(normalize),
    direction: DIRECTION_HINTS[entry.tool.id] ?? entry.tool.id.replace(/-/g, ' '),
  };
}

function startsWord(text: string, term: string): boolean {
  return text.startsWith(term) || text.includes(` ${term}`);
}

/**
 * Best field score for one search term in a document (0 = no match). Latin
 * synonyms must match whole words, so "web" does not find "webp".
 */
function termScore(doc: SearchDocument, term: string, wholeWordOnly: boolean): number {
  const termCompact = compact(term);
  if (wholeWordOnly) {
    if (doc.nameWords.has(term)) return 10;
    if (doc.keywords.includes(term)) return 9;
    if (doc.categories.includes(term)) return 4;
    return doc.descriptions.some((description) => ` ${description} `.includes(` ${term} `)) ? 2 : 0;
  }

  let best = 0;
  for (let index = 0; index < doc.names.length; index += 1) {
    if (startsWord(doc.names[index], term)) best = Math.max(best, 10);
    else if (doc.names[index].includes(term) || doc.namesCompact[index].includes(termCompact)) best = Math.max(best, 8);
  }
  for (const keyword of doc.keywords) {
    if (keyword === term || compact(keyword) === termCompact) best = Math.max(best, 9);
    else if (keyword.startsWith(term) || compact(keyword).includes(termCompact)) best = Math.max(best, 5);
  }
  if (best > 0) return best;
  if (doc.categories.some((label) => label === term || startsWord(label, term))) return 4;
  return term.length >= 2 && doc.descriptions.some((description) => description.includes(term)) ? 2 : 0;
}

type QueryWord = { word: string; terms: Array<{ term: string; synonym: boolean }> };

function expandQuery(query: string): QueryWord[] {
  return tokenizeQuery(query).map((token) => {
    const variants = tokenVariants(token);
    const terms = new Map<string, boolean>();
    variants.forEach((variant) => terms.set(variant, false));
    variants.flatMap(synonymsFor).forEach((synonym) => {
      if (!terms.has(synonym)) terms.set(synonym, true);
    });
    return { word: token, terms: [...terms].map(([term, synonym]) => ({ term, synonym })) };
  });
}

const SYNONYM_WEIGHT = 0.7;

function wordScore(doc: SearchDocument, word: QueryWord): number {
  let best = 0;
  for (const { term, synonym } of word.terms) {
    const score = termScore(doc, term, synonym && isLatin(term));
    best = Math.max(best, synonym ? score * SYNONYM_WEIGHT : score);
  }
  return best;
}

/** Where a query word first appears in a tool's "from … to …" string (-1 if absent). */
function directionPosition(doc: SearchDocument, word: QueryWord): number {
  const positions = word.terms
    .filter(({ term }) => isLatin(term))
    .map(({ term }) => ` ${doc.direction} `.indexOf(` ${term} `))
    .filter((position) => position >= 0);
  return positions.length > 0 ? Math.min(...positions) : -1;
}

export type SearchOptions = {
  /** Tools the user opened recently get a small boost. */
  recentIds?: string[];
  /** Commonly used tools win ties. */
  popularIds?: string[];
};

export function searchTools(entries: SearchableToolCopy[], query: string, options: SearchOptions = {}): ToolDefinition[] {
  const words = expandQuery(query);
  if (words.length === 0) {
    return [];
  }

  const docs = entries.map(buildDocument);
  const scores = docs.map((doc) => words.map((word) => wordScore(doc, word)));

  // A word no tool matches ("무료", a typo) should not empty the results.
  const meaningful = words.map((_, wordIndex) => scores.some((row) => row[wordIndex] > 0));
  if (!meaningful.some(Boolean)) {
    return [];
  }

  const phrase = compact(normalize(query));
  const recent = new Set(options.recentIds ?? []);
  const popular = new Set(options.popularIds ?? []);

  const rank = (requireAll: boolean) =>
    docs
      .map((doc, docIndex) => {
        const row = scores[docIndex];
        const matched = row.filter((score, wordIndex) => meaningful[wordIndex] && score > 0).length;
        const needed = meaningful.filter(Boolean).length;
        if (matched === 0 || (requireAll && matched < needed)) {
          return null;
        }
        let score = row.reduce((sum, value) => sum + value, 0) + matched * 5;
        if (phrase.length >= 2 && doc.namesCompact.some((name) => name.includes(phrase))) score += 12;
        if (doc.namesCompact.includes(phrase)) score += 6;
        // "jpg png" / "엑셀을 pdf로" prefer the converter going that way.
        const positions = words.map((word) => directionPosition(doc, word)).filter((position) => position >= 0);
        if (positions.length >= 2) {
          const ascending = positions.every((position, index) => index === 0 || position > positions[index - 1]);
          const descending = positions.every((position, index) => index === 0 || position < positions[index - 1]);
          if (ascending) score += 5;
          else if (descending) score -= 5;
        }
        const subject = SUBJECT_WORDS[doc.tool.id];
        if (subject && !words.some((word) => word.terms.some(({ term }) => subject.includes(term)))) score -= 8;
        if (recent.has(doc.tool.id)) score += 1.5;
        if (popular.has(doc.tool.id)) score += 1;
        return { doc, score };
      })
      .filter((entry): entry is { doc: SearchDocument; score: number } => entry !== null)
      .sort((left, right) => right.score - left.score || left.doc.order - right.doc.order)
      .map((entry) => entry.doc.tool);

  const strict = rank(true);
  return strict.length > 0 ? strict : rank(false);
}

/** Search copy for both locales, so English queries work in the Korean UI and vice versa. */
export function buildSearchEntries(
  tools: ToolDefinition[],
  copyFor: (tool: ToolDefinition, locale: Locale) => { name: string; description: string },
  categoryLabelsFor: (tool: ToolDefinition) => string[],
): SearchableToolCopy[] {
  return tools.map((tool) => {
    const en = copyFor(tool, 'en');
    const ko = copyFor(tool, 'ko');
    return {
      tool,
      names: [en.name, ko.name],
      descriptions: [en.description, ko.description],
      categoryLabels: categoryLabelsFor(tool),
    };
  });
}
