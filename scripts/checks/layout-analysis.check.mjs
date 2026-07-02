/**
 * Executable check for the layout analysis (table detection) used by the
 * layout-preserving PDF→HWPX mode.
 *   npm run check:layout-analysis
 */
import { analyzePageLayout, mergeCollinear, normalizeSegments } from '../../lib/hwpx/layout-analysis.ts';

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond === true) pass += 1;
  else {
    fail += 1;
    console.log('  FAIL', name);
  }
};

const line = (text, xPt, yPt, widthPt = 40, fontSizePt = 10, bold = false) => ({ text, xPt, yPt, widthPt, fontSizePt, bold });

// --- 1. Clean 2x3 grid (3 h-lines, 4 v-lines) with text in cells ------------
{
  const segs = [
    // horizontal edges at y=100,120,140 spanning x=50..350
    { x1: 50, y1: 100, x2: 350, y2: 100 },
    { x1: 50, y1: 120, x2: 350, y2: 120 },
    { x1: 50, y1: 140, x2: 350, y2: 140 },
    // vertical edges at x=50,150,250,350 spanning y=100..140
    { x1: 50, y1: 100, x2: 50, y2: 140 },
    { x1: 150, y1: 100, x2: 150, y2: 140 },
    { x1: 250, y1: 100, x2: 250, y2: 140 },
    { x1: 350, y1: 100, x2: 350, y2: 140 },
  ];
  const text = [
    line('이름', 60, 105),
    line('나이', 160, 105),
    line('주소', 260, 105),
    line('홍길동', 60, 125),
    line('34', 160, 125),
    line('서울', 260, 125),
    line('표 밖 텍스트', 60, 300),
  ];
  const plan = analyzePageLayout(text, segs);
  check('clean grid: one table detected', plan.tables.length === 1);
  check('clean grid: 2 rows x 3 cols', plan.tables[0]?.cells.length === 2 && plan.tables[0]?.cells[0]?.length === 3);
  check('clean grid: header cell text assigned', plan.tables[0]?.cells[0][0][0]?.text === '이름');
  check('clean grid: body cell text assigned', plan.tables[0]?.cells[1][2][0]?.text === '서울');
  check('clean grid: outside text stays free', plan.freeText.length === 1 && plan.freeText[0].text === '표 밖 텍스트');
  check('clean grid: no leftover rules', plan.rules.length === 0);
}

// --- 2. Partial lines (underline, not a grid) fall back to rules -------------
{
  const segs = [
    { x1: 50, y1: 100, x2: 350, y2: 100 },
    { x1: 50, y1: 120, x2: 200, y2: 120 }, // half-width line -> not a clean grid
    { x1: 50, y1: 100, x2: 50, y2: 120 },
    { x1: 350, y1: 100, x2: 350, y2: 120 },
  ];
  const plan = analyzePageLayout([line('본문', 60, 105)], segs);
  check('partial grid: no table detected', plan.tables.length === 0);
  check('partial grid: segments preserved as rules', plan.rules.length === 4);
  check('partial grid: text stays free', plan.freeText.length === 1);
}

// --- 3. Broken borders drawn as many short strokes get merged ---------------
{
  const dashes = [];
  for (let x = 50; x < 350; x += 30) {
    dashes.push({ x1: x, y1: 100, x2: x + 28, y2: 100 }); // 2pt gaps
  }
  const merged = mergeCollinear(normalizeSegments(dashes));
  check('collinear merge: one long line', merged.length === 1 && merged[0].to - merged[0].from > 290);
}

// --- 4. Diagonal decorations are ignored -------------------------------------
{
  const plan = analyzePageLayout([], [{ x1: 0, y1: 0, x2: 100, y2: 100 }]);
  check('diagonals ignored', plan.rules.length === 0 && plan.tables.length === 0);
}

// --- 5. Two separate tables on one page --------------------------------------
{
  const grid = (ox, oy) => [
    { x1: ox, y1: oy, x2: ox + 100, y2: oy },
    { x1: ox, y1: oy + 20, x2: ox + 100, y2: oy + 20 },
    { x1: ox, y1: oy, x2: ox, y2: oy + 20 },
    { x1: ox + 100, y1: oy, x2: ox + 100, y2: oy + 20 },
  ];
  const plan = analyzePageLayout([], [...grid(50, 100), ...grid(50, 400)]);
  check('two clusters: two 1x1 tables', plan.tables.length === 2);
}

console.log(`\nlayout-analysis: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
