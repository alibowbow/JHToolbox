/**
 * Executable check for lib/media-dimensions.ts (even video dimensions/offsets).
 *   node --experimental-strip-types scripts/checks/media-dimensions.check.mjs
 */
import { pngDimensions, toEvenDimension, toEvenOffset } from '../../lib/media-dimensions.ts';

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond === true) pass += 1;
  else {
    fail += 1;
    console.log('  FAIL', name);
  }
};

// dimensions: floor to even, enforce min
check('even stays even', toEvenDimension(1280) === 1280);
check('odd -> even (down)', toEvenDimension(1281) === 1280);
check('odd 721 -> 720', toEvenDimension(721) === 720);
check('17 -> 16', toEvenDimension(17) === 16);
check('1 -> min 2', toEvenDimension(1) === 2);
check('0 -> min 2', toEvenDimension(0) === 2);
check('NaN -> min 2', toEvenDimension(NaN) === 2);
check('custom min applied', toEvenDimension(121, 120) === 120);

// offsets: floor to even, clamp >= 0
check('offset 0', toEvenOffset(0) === 0);
check('offset even', toEvenOffset(24) === 24);
check('offset odd -> even', toEvenOffset(23) === 22);
check('offset 5 -> 4', toEvenOffset(5) === 4);
check('offset negative -> 0', toEvenOffset(-3) === 0);
check('offset NaN -> 0', toEvenOffset(NaN) === 0);

// the core guarantee: results are always even
let allEven = true;
for (let n = -5; n <= 2000; n += 1) {
  if (toEvenDimension(n) % 2 !== 0) allEven = false;
  if (toEvenOffset(n) % 2 !== 0) allEven = false;
}
check('all results are even', allEven);


// pngDimensions: IHDR parsing used by the full-page capture height guard.
{
  // 1x1 PNG (valid) — width/height must read 1x1.
  const onePx = Uint8Array.from(Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  ));
  const dims = pngDimensions(onePx);
  check('png 1x1 parsed', dims?.width === 1 && dims?.height === 1);

  // Synthetic IHDR with a tall scroll shape (800x12000).
  const tall = Uint8Array.from(onePx);
  const dv = new DataView(tall.buffer);
  dv.setUint32(16, 800);
  dv.setUint32(20, 12000);
  const tallDims = pngDimensions(tall);
  check('png tall capture parsed', tallDims?.width === 800 && tallDims?.height === 12000);

  check('non-png returns null', pngDimensions(new TextEncoder().encode('<html>not an image</html>')) === null);
  check('too-short buffer returns null', pngDimensions(Uint8Array.from([0x89, 0x50, 0x4e])) === null);
  const badIhdr = Uint8Array.from(onePx);
  badIhdr[12] = 0x58; // corrupt the IHDR tag
  check('missing IHDR returns null', pngDimensions(badIhdr) === null);
}

console.log(`\nmedia-dimensions: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
