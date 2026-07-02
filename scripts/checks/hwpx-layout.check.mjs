/**
 * Executable check for the layout-preserving HWPX writer (text boxes + rules +
 * real tables from detected grids).
 *   npm run check:hwpx-layout
 */
import JSZip from 'jszip';
import { writeLayoutHwpx } from '../../lib/hwpx/layout-writer.ts';
import { validateHwpxStructure } from '../../lib/hwpx/package-validator.ts';

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond === true) pass += 1;
  else {
    fail += 1;
    console.log('  FAIL', name);
  }
};

const line = (text, xPt, yPt, widthPt = 60, fontSizePt = 10, bold = false) => ({ text, xPt, yPt, widthPt, fontSizePt, bold });

const doc = {
  metadata: { title: '레이아웃 & <표> 샘플' },
  pages: [
    {
      pageNumber: 1,
      widthPt: 595.28,
      heightPt: 841.89,
      textLines: [
        line('문서 제목 & 부제', 200, 60, 180, 16),
        // Inside the 2x2 grid below:
        line('항목', 110, 208, 30),
        line('값 A<1>', 310, 208, 40),
        line('합계', 110, 248, 30),
        line('42', 310, 248, 20),
        // Free text below the table:
        line('표 아래 본문입니다.', 100, 400, 120),
      ],
      segments: [
        // 2x2 grid: x 100..300..500, y 200..240..280
        { x1: 100, y1: 200, x2: 500, y2: 200 },
        { x1: 100, y1: 240, x2: 500, y2: 240 },
        { x1: 100, y1: 280, x2: 500, y2: 280 },
        { x1: 100, y1: 200, x2: 100, y2: 280 },
        { x1: 300, y1: 200, x2: 300, y2: 280 },
        { x1: 500, y1: 200, x2: 500, y2: 280 },
        // A lone underline far away (not a grid -> hp:line):
        { x1: 100, y1: 500, x2: 300, y2: 500 },
      ],
    },
  ],
};

const { bytes, stats } = await writeLayoutHwpx(doc);
check('produced non-empty bytes', bytes instanceof Uint8Array && bytes.length > 0);
check('stats: 1 table', stats.tables === 1);
check('stats: 1 leftover rule', stats.rules === 1);
check('stats: 2 free text boxes', stats.textBoxes === 2);

const result = await validateHwpxStructure(bytes);
if (!result.ok) console.log('  validator errors:', result.errors);
check('validator: ok', result.ok === true);

const zip = await JSZip.loadAsync(bytes);
const section = await zip.file('Contents/section0.xml').async('string');
const header = await zip.file('Contents/header.xml').async('string');

// Table structure (real Hancom shape: ShapeObject block FIRST for hp:tbl).
check('table emitted with 2x2 grid', section.includes('rowCnt="2"') && section.includes('colCnt="2"'));
check('tbl: sz/pos/outMargin/inMargin before rows', /<hp:tbl [^>]*><hp:sz [^>]*\/><hp:pos [^>]*\/><hp:outMargin [^>]*\/><hp:inMargin [^>]*\/><hp:tr>/.test(section));
check('cell carries addr/span/size/margin in order', /<\/hp:subList><hp:cellAddr colAddr="0" rowAddr="0"\/><hp:cellSpan colSpan="1" rowSpan="1"\/><hp:cellSz [^>]*\/><hp:cellMargin [^>]*\/>/.test(section));
check('cell text assigned and escaped', section.includes('<hp:t>값 A&lt;1&gt;</hp:t>'));
check('cell paragraphs carry linesegarray', /<hp:t>합계<\/hp:t><\/hp:run><hp:linesegarray>/.test(section));
check('table cells use the solid borderFill', section.includes('borderFillIDRef="3"'));
check('header defines the solid borderFill id=3', /<hh:borderFill id="3"[^>]*>(?:(?!<\/hh:borderFill>).)*type="SOLID"/.test(header));

// Text boxes: invisible rect + drawText, ShapeObject block LAST.
check('text box present with drawText', section.includes('<hp:drawText lastWidth=') && section.includes('<hp:rect '));
check('box border invisible (style NONE, no fillBrush in rect)', /<hp:rect (?:(?!<\/hp:rect>).)*style="NONE"/.test(section));
check('rect: pt0..pt3 then sz/pos/outMargin last', /<hc:pt3 [^>]*\/><hp:sz [^>]*\/><hp:pos [^>]*\/><hp:outMargin [^>]*\/><\/hp:rect>/.test(section));
check('title text box escaped', section.includes('<hp:t>문서 제목 &amp; 부제</hp:t>'));

// Rule line.
check('leftover rule emitted as hp:line with startPt/endPt', /<hp:line (?:(?!<\/hp:line>).)*<hc:startPt x="0" y="0"\/><hc:endPt x="\d+" y="0"\/>/.test(section));
check('rule line is solid', /<hp:line (?:(?!<\/hp:line>).)*style="SOLID"/.test(section));

// Anchoring: one float per run, each followed by an empty t; zOrder increments.
check('one float per run with trailing empty t', (section.match(/<\/hp:tbl><hp:t\/><\/hp:run>/g) ?? []).length === 1 && (section.match(/<\/hp:rect><hp:t\/><\/hp:run>/g) ?? []).length === 2);
check('zOrder increments across floats', section.includes('zOrder="0"') && section.includes('zOrder="1"') && section.includes('zOrder="2"') && section.includes('zOrder="3"'));
check('positions are PARA-relative offsets', /<hp:pos treatAsChar="0"[^>]*vertRelTo="PARA" horzRelTo="PARA"[^>]*vertOffset="\d+" horzOffset="\d+"\/>/.test(section));

// Dynamic charPr for the 16pt title.
check('dynamic charPr for 16pt title', /<hh:charPr id="\d+" height="1600"/.test(header));

// Empty document rejected.
let threw = false;
try {
  await writeLayoutHwpx({ pages: [] });
} catch {
  threw = true;
}
check('empty document throws', threw === true);

console.log(`\nhwpx-layout: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
