/**
 * Executable check for lib/watermark-tiling.ts: tiled copies cover the page
 * and never overlap, whatever the rotation.
 *   node --experimental-strip-types scripts/checks/watermark-tiling.check.mjs
 */
import { tiledWatermarkCenters } from '../../lib/watermark-tiling.ts';

let pass = 0;
let fail = 0;
const check = (name, cond, detail = '') => {
  if (cond === true) pass += 1;
  else {
    fail += 1;
    console.log('  FAIL', name, detail);
  }
};

// Two copies turned by the same angle are apart when they are separated along
// the stamp's direction or across it.
function overlapping(centers, stampWidth, stampHeight, degrees) {
  const r = (degrees * Math.PI) / 180;
  const u = [Math.cos(r), Math.sin(r)];
  const v = [-Math.sin(r), Math.cos(r)];
  for (let i = 0; i < centers.length; i += 1) {
    for (let j = i + 1; j < centers.length; j += 1) {
      const dx = centers[j].x - centers[i].x;
      const dy = centers[j].y - centers[i].y;
      const along = Math.abs(dx * u[0] + dy * u[1]);
      const across = Math.abs(dx * v[0] + dy * v[1]);
      if (along < stampWidth - 1e-6 && across < stampHeight - 1e-6) return true;
    }
  }
  return false;
}

// Every point of the page is near some copy (within one step each way).
function covers(centers, width, height, stampWidth, stampHeight) {
  const reach = Math.hypot(Math.max(stampWidth * 1.4, 120), Math.max(stampHeight * 3, 120));
  for (let x = 0; x <= width; x += width / 12) {
    for (let y = 0; y <= height; y += height / 12) {
      if (!centers.some((c) => Math.hypot(c.x - x, c.y - y) <= reach)) return false;
    }
  }
  return true;
}

const pages = [
  ['A4 portrait', 595, 842],
  ['A4 landscape', 842, 595],
  ['photo page', 1600, 1010],
  ['phone screenshot', 1080, 2340],
];
const stamps = [
  ['long Korean text', 520, 60],
  ['short text', 140, 48],
  ['logo', 120, 60],
];
for (const [pageName, width, height] of pages) {
  for (const [stampName, stampWidth, stampHeight] of stamps) {
    for (const degrees of [0, -24, 30, -45, 90]) {
      const label = `${pageName}, ${stampName}, ${degrees}°`;
      const centers = tiledWatermarkCenters(width, height, stampWidth, stampHeight, degrees);
      check(`${label}: some copies`, centers.length > 0);
      check(`${label}: not too many`, centers.length < 400, String(centers.length));
      check(`${label}: no overlap`, !overlapping(centers, stampWidth, stampHeight, degrees));
      check(`${label}: covers the page`, covers(centers, width, height, stampWidth, stampHeight));
    }
  }
}

// Unrotated: straight rows, 1.4 widths apart on a row.
const flat = tiledWatermarkCenters(1000, 1000, 200, 40, 0);
const row = flat.filter((c) => Math.abs(c.y - 500) < 1e-9).map((c) => c.x).sort((a, b) => a - b);
check('flat: a row through the centre', row.length >= 3);
check('flat: 280 apart on a row', row.slice(1).every((x, i) => Math.abs(x - row[i] - 280) < 1e-9));

check('empty page -> none', tiledWatermarkCenters(0, 842, 100, 40, -24).length === 0);
check('NaN page -> none', tiledWatermarkCenters(NaN, 842, 100, 40, -24).length === 0);
check('bad stamp still tiles', tiledWatermarkCenters(595, 842, NaN, 0, -24).length > 0);
check('min step respected', (() => {
  const c = tiledWatermarkCenters(595, 842, 10, 5, 0, 120);
  const r = c.filter((p) => Math.abs(p.y - 421) < 1e-9).map((p) => p.x).sort((a, b) => a - b);
  return r.length >= 2 && Math.abs(r[1] - r[0] - 120) < 1e-9;
})());

console.log(`\nwatermark-tiling: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
