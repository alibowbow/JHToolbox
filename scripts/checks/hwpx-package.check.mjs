/**
 * Executable check for the fidelity HWPX package writer + validator.
 *   node --experimental-strip-types scripts/checks/hwpx-package.check.mjs
 *
 * Builds a real .hwpx (in Node, via JSZip) from a 2-page raster document with
 * different page sizes/orientations, then validates structure and re-opens it.
 */
import JSZip from 'jszip';
import { writeRasterHwpx } from '../../lib/hwpx/package-writer.ts';
import { validateHwpxStructure } from '../../lib/hwpx/package-validator.ts';

const PNG_1x1 = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  ),
);

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
  metadata: { title: 'Test & <doc>' },
  pages: [
    { pageNumber: 1, widthPt: 595.28, heightPt: 841.89, image: { bytes: PNG_1x1, format: 'png', pixelWidth: 1, pixelHeight: 1 } }, // A4 portrait
    { pageNumber: 2, widthPt: 792, heightPt: 612, image: { bytes: PNG_1x1, format: 'png', pixelWidth: 1, pixelHeight: 1 } }, // Letter landscape
  ],
};

const bytes = await writeRasterHwpx(doc);
check('produced non-empty bytes', bytes instanceof Uint8Array && bytes.length > 0);

// Raw ZIP: first local file header must be "mimetype" stored (method 0).
function firstEntry(buf) {
  const sig = buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
  const method = buf[8] | (buf[9] << 8);
  const nameLen = buf[26] | (buf[27] << 8);
  const name = Buffer.from(buf.slice(30, 30 + nameLen)).toString('latin1');
  return { sig, method, name };
}
const first = firstEntry(bytes);
check('first entry signature ok', first.sig === true);
check('first entry is mimetype', first.name === 'mimetype');
check('mimetype stored uncompressed (STORE)', first.method === 0);

// Structural validation.
const result = await validateHwpxStructure(bytes);
if (!result.ok) console.log('  validator errors:', result.errors);
check('validator: ok', result.ok === true);
check('validator: 2 sections', result.info.sectionCount === 2);
check('validator: 2 BinData images', result.info.binDataCount === 2);
check('validator: page1 size = A4 portrait', result.info.pageSizes[0]?.widthHwp === 59528 && result.info.pageSizes[0]?.heightHwp === 84189);
check('validator: page2 size = Letter landscape', result.info.pageSizes[1]?.widthHwp === 79200 && result.info.pageSizes[1]?.heightHwp === 61200);

// Re-open and confirm parts exist + escaping.
const zip = await JSZip.loadAsync(bytes);
check('section0.xml exists', !!zip.file('Contents/section0.xml'));
check('section1.xml exists', !!zip.file('Contents/section1.xml'));
check('image1 exists', !!zip.file('BinData/image1.png'));
check('image2 exists', !!zip.file('BinData/image2.png'));
const hpf = await zip.file('Contents/content.hpf').async('string');
check('title XML-escaped in content.hpf', hpf.includes('Test &amp; &lt;doc&gt;') && !hpf.includes('<doc>'));
const header = await zip.file('Contents/header.xml').async('string');
check('header secCnt = 2', header.includes('secCnt="2"'));

// Empty document rejected (no silent empty PDF/HWPX).
let threw = false;
try {
  await writeRasterHwpx({ pages: [] });
} catch {
  threw = true;
}
check('empty document throws', threw === true);

console.log(`\nhwpx-package: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
