/**
 * Executable check for the editable (flowing-text) HWPX writer.
 *   npm run check:hwpx-text
 *
 * Builds a 2-page text .hwpx in Node and validates package structure, dynamic
 * header entries, escaping, and section layout against the same rules the
 * fidelity writer follows (ground truth: real Hancom saves + hwpxlib).
 */
import JSZip from 'jszip';
import { writeTextHwpx } from '../../lib/hwpx/text-writer.ts';
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

const doc = {
  metadata: { title: '보고서 & <초안>' },
  pages: [
    {
      pageNumber: 1,
      widthPt: 595.28,
      heightPt: 841.89,
      lines: [
        { text: '2026년 사업 계획', fontSizePt: 16, bold: true, align: 'center' },
        { text: '첫 번째 문단입니다. A&B < C > D.', fontSizePt: 10, bold: false, align: 'left' },
        { text: '두 번째 문단입니다.', fontSizePt: 10, bold: false, align: 'left' },
        { text: '작은 각주 텍스트', fontSizePt: 8, bold: false, align: 'left' },
      ],
    },
    // Landscape page with no text at all (must still emit a valid section).
    { pageNumber: 2, widthPt: 792, heightPt: 612, lines: [] },
  ],
};

const bytes = await writeTextHwpx(doc);
check('produced non-empty bytes', bytes instanceof Uint8Array && bytes.length > 0);

const result = await validateHwpxStructure(bytes);
if (!result.ok) console.log('  validator errors:', result.errors);
check('validator: ok', result.ok === true);
check('validator: 2 sections', result.info.sectionCount === 2);
check('validator: no BinData items', result.info.binDataCount === 0);

const zip = await JSZip.loadAsync(bytes);
const header = await zip.file('Contents/header.xml').async('string');
const section0 = await zip.file('Contents/section0.xml').async('string');
const section1 = await zip.file('Contents/section1.xml').async('string');

// Dynamic header entries: 3 size/bold combos -> charPr ids 7..9 (16pt bold,
// 10pt, 8pt) and one CENTER paraPr id 16.
check('charProperties itemCnt grew to 10', header.includes('<hh:charProperties itemCnt="10">'));
check('dynamic bold charPr for the heading', /<hh:charPr id="7" height="1600"[^>]*>(?:(?!<\/hh:charPr>).)*<hh:bold\/>/.test(header));
check('dynamic charPr for 10pt body', header.includes('<hh:charPr id="8" height="1000"'));
check('dynamic charPr for 8pt small text', header.includes('<hh:charPr id="9" height="800"'));
check('paraProperties itemCnt grew to 17', header.includes('<hh:paraProperties itemCnt="17">'));
check('dynamic CENTER paraPr id 16', /<hh:paraPr id="16"[^>]*>(?:(?!<\/hh:paraPr>).)*horizontal="CENTER"/.test(header));
check('head secCnt = 2', header.includes('secCnt="2"'));

// Section 0: heading uses the dynamic ids; body escaped correctly.
check('heading paragraph uses charPr 7 + CENTER paraPr 16', section0.includes('paraPrIDRef="16"') && section0.includes('charPrIDRef="7"'));
check('body text XML-escaped', section0.includes('A&amp;B &lt; C &gt; D.'));
check('first paragraph carries secPr + colPr run', /<hp:run charPrIDRef="7"><hp:secPr[\s\S]*?<hp:colPr/.test(section0));
check('standard margins applied (not full-bleed)', section0.includes('left="8504" right="8504"'));
check('portrait page uses landscape="WIDELY"', section0.includes('landscape="WIDELY" width="59528"'));

// Section 1: empty landscape page still has one empty paragraph.
check('empty page emits an empty paragraph', section1.includes('<hp:t></hp:t>') || section1.includes('<hp:t/>'));
check('landscape page uses landscape="NARROWLY"', section1.includes('landscape="NARROWLY" width="79200"'));

// Package parts: no BinData, but the manifest still lists header/sections/settings.
const hpf = await zip.file('Contents/content.hpf').async('string');
check('manifest has no image items', !hpf.includes('BinData/'));
check('title XML-escaped in content.hpf', hpf.includes('보고서 &amp; &lt;초안&gt;'));
check('preview text carries document text', (await zip.file('Preview/PrvText.txt').async('string')).includes('사업 계획'));

// Empty document rejected.
let threw = false;
try {
  await writeTextHwpx({ pages: [] });
} catch {
  threw = true;
}
check('empty document throws', threw === true);

console.log(`\nhwpx-text: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
