/**
 * Executable check for lib/tool-search.ts with the real registry and copy:
 * everyday Korean queries find the right tool first.
 *   node --experimental-strip-types --import ./scripts/checks/register-hooks.mjs scripts/checks/tool-search.check.mjs
 */
import { getBrowsableTools, getToolsByBrowseGroup } from '../../lib/tool-registry.ts';
import { getLocalizedToolCopy } from '../../lib/tool-localization.ts';
import { getCategoryCopy } from '../../lib/i18n.ts';
import { buildSearchEntries, searchTools, tokenizeQuery } from '../../lib/tool-search.ts';

let pass = 0;
let fail = 0;
const check = (name, cond, detail = '') => {
  if (cond === true) pass += 1;
  else {
    fail += 1;
    console.log('  FAIL', name, detail);
  }
};

const entries = buildSearchEntries(getBrowsableTools(), getLocalizedToolCopy, (tool) => [
  getCategoryCopy('en', tool.category).nav,
  getCategoryCopy('ko', tool.category).nav,
]);
const popularIds = getToolsByBrowseGroup('popular').map((tool) => tool.id);
const ids = (query) => searchTools(entries, query, { popularIds }).map((tool) => tool.id);

// Tokenizer
check('split hangul/latin', JSON.stringify(tokenizeQuery('pdf합치기')) === '["pdf","합치기"]', JSON.stringify(tokenizeQuery('pdf합치기')));
check('png2jpg', JSON.stringify(tokenizeQuery('png2jpg')) === '["png","jpg"]');
check('particles dropped', JSON.stringify(tokenizeQuery('jpg를 png로')) === '["jpg","png"]', JSON.stringify(tokenizeQuery('jpg를 png로')));
check('stop words dropped', JSON.stringify(tokenizeQuery('무료 온라인 pdf 도구')) === '["pdf"]');

// Queries people type → the tool that should come first.
const expectFirst = [
  ['사진 용량 줄이기', 'image-compress'],
  ['이미지 용량', 'image-compress'],
  ['pdf 합치기', 'pdf-merge'],
  ['pdf합치기', 'pdf-merge'],
  ['PDF 병합', 'pdf-merge'],
  ['pdf 용량 줄이기', 'pdf-reduce-size'],
  ['pdf 나누기', 'pdf-split'],
  ['pdf 쪽번호', 'pdf-add-page-numbers'],
  ['pdf 서명', 'pdf-sign'],
  ['싸인', 'pdf-sign'],
  ['엑셀을 pdf로', 'excel-to-pdf'],
  ['pdf를 엑셀로', 'pdf-to-excel'],
  ['pdf 워드', 'pdf-to-word'],
  ['한글', 'pdf-to-hwpx'],
  ['hwp', 'pdf-to-hwpx'],
  ['큐알', 'qr-generator'],
  ['qr코드', 'qr-generator'],
  ['압축 풀기', 'extract-zip'],
  ['압축풀기', 'extract-zip'],
  ['zip 압축', 'create-zip'],
  ['배경 제거', 'image-background-transparent'],
  ['누끼', 'image-background-transparent'],
  ['동영상 자르기', 'video-trim'],
  ['영상 음소거', 'mute-video'],
  ['동영상 소리 추출', 'extract-audio'],
  ['mp3 추출', 'extract-audio'],
  ['동영상 용량', 'video-compress'],
  ['움짤 만들기', 'images-to-gif'],
  ['화면 녹화', 'screen-recorder'],
  ['캡쳐', 'screenshot-capture'],
  ['스크린샷', 'screenshot-capture'],
  ['사진 글자 추출', 'ocr-image-to-text'],
  ['글자 인식', 'ocr-image-to-text'],
  ['이미지 자르기', 'image-crop'],
  ['사진 회전', 'image-rotate'],
  ['사진 크기', 'image-resize'],
  ['모자이크', 'image-pixelate'],
  ['워터마크', 'pdf-watermark'],
  ['사진 워터마크', 'image-watermark'],
  ['jpg를 png로', 'image-convert'],
  ['png to jpg', 'image-convert'],
  ['사진 확장자 변환', 'image-convert'],
  ['pdf를 jpg로', 'pdf-to-image'],
  ['pdf 이미지로', 'pdf-to-image'],
  ['jpg to pdf', 'image-to-pdf'],
  ['merge pdf', 'pdf-merge'],
  ['compress image', 'image-compress'],
  ['웹페이지 캡처', 'url-image'],
  ['사이트 pdf', 'url-pdf'],
  ['exif', 'image-metadata'],
  ['csv 엑셀', 'csv-excel'],
  ['오디오 합치기', 'audio-merge'],
  ['벨소리', 'audio-cut'],
  ['녹음', 'audio-recorder'],
  ['내부 소리 녹음', 'audio-recorder'],
  ['컴퓨터 소리 녹음', 'audio-recorder'],
  ['웹캠', 'webcam-recorder'],
  ['pdf 순서', 'pdf-rearrange'],
  ['pdf 페이지 삭제', 'pdf-delete-page'],
  ['개인정보 가리기', 'pdf-redact'],
];
for (const [query, expected] of expectFirst) {
  const result = ids(query);
  check(`"${query}" → ${expected}`, result[0] === expected, `got ${result.slice(0, 3).join(', ')}`);
}

// Noise words do not empty the results; nonsense finds nothing.
check('noise word ignored', ids('무료 pdf 합치기 빨리')[0] === 'pdf-merge', ids('무료 pdf 합치기 빨리').slice(0, 3).join());
check('nonsense finds nothing', ids('qwxzv').length === 0);
check('empty query', ids('   ').length === 0);
// Broad queries still return many tools.
check('pdf returns pdf tools', ids('pdf').length >= 20);
check('"변환" returns converters', ids('변환').length >= 10);

console.log(`\ntool-search: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
