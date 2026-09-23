/**
 * Executable check for lib/pdf-page-math.ts (PDF rotate + delete page logic).
 *   node --experimental-strip-types scripts/checks/pdf-page-math.check.mjs
 */
import {
  normalizePdfRotation,
  resolveDeletablePages,
  resolvePageSelection,
  resolveRearrangeOrder,
  resolveSplitPlan,
  formatPageSelection,
} from '../../lib/pdf-page-math.ts';
import { groupRegionsByPage, parseRegions, serializeRegions } from '../../lib/pdf-regions.ts';

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond === true) pass += 1;
  else {
    fail += 1;
    console.log('  FAIL', name);
  }
};
const eqArr = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// --- rotation accumulates and stays a multiple of 90 in [0,360) ---
check('0 + 90 = 90', normalizePdfRotation(0, 90) === 90);
check('90 + 90 = 180', normalizePdfRotation(90, 90) === 180);
check('270 + 90 = 0 (wrap)', normalizePdfRotation(270, 90) === 0);
check('90 - 90 = 0', normalizePdfRotation(90, -90) === 0);
check('0 - 90 = 270', normalizePdfRotation(0, -90) === 270);
check('0 + 180 = 180', normalizePdfRotation(0, 180) === 180);
check('0 + 360 = 0', normalizePdfRotation(0, 360) === 0);
check('270 + 180 = 90', normalizePdfRotation(270, 180) === 90);
check('NaN existing -> treated 0', normalizePdfRotation(NaN, 90) === 90);
check('NaN delta -> treated 0', normalizePdfRotation(0, NaN) === 0);

// --- delete pages: dedupe, range, descending, refuse delete-all ---
{
  const r = resolveDeletablePages([0, 2, 2, 5], 4);
  check('dedupe + in-range + desc', eqArr(r.indices, [2, 0]) && r.deletesAll === false);
}
{
  const r = resolveDeletablePages([0, 1, 2], 3);
  check('delete all flagged', r.deletesAll === true && eqArr(r.indices, [2, 1, 0]));
}
{
  const r = resolveDeletablePages([0, 1, 2, 2, 1], 3);
  check('delete all via dupes flagged', r.deletesAll === true);
}
{
  const r = resolveDeletablePages([], 3);
  check('empty request', eqArr(r.indices, []) && r.deletesAll === false);
}
{
  const r = resolveDeletablePages([5, 6], 3);
  check('all out of range', eqArr(r.indices, []) && r.deletesAll === false);
}
{
  const r = resolveDeletablePages([1], 3);
  check('single mid page', eqArr(r.indices, [1]) && r.deletesAll === false);
}

// --- rearrange: listed pages are kept in order, the rest are reported removed ---
{
  const partial = resolveRearrangeOrder('3,1', 5);
  check('rearrange 3,1 of 5 -> order [2,0]', eqArr(partial.order, [2, 0]));
  check('rearrange 3,1 of 5 -> removed [2,4,5]', eqArr(partial.removedPages, [2, 4, 5]));
  check('rearrange 3,1 of 5 -> no invalid entries', partial.invalidEntries.length === 0);

  const full = resolveRearrangeOrder('2,1,3', 3);
  check('full permutation keeps every page', eqArr(full.order, [1, 0, 2]) && full.removedPages.length === 0);

  const empty = resolveRearrangeOrder('  ', 4);
  check('empty order keeps all pages in order', eqArr(empty.order, [0, 1, 2, 3]) && empty.removedPages.length === 0);

  const spaced = resolveRearrangeOrder(' 2 , 1 ', 2);
  check('whitespace tolerated', eqArr(spaced.order, [1, 0]) && spaced.invalidEntries.length === 0);

  const dupes = resolveRearrangeOrder('1,1,2', 3);
  check('duplicates collapse to first occurrence', eqArr(dupes.order, [0, 1]) && eqArr(dupes.removedPages, [3]));

  const ranges = resolveRearrangeOrder('4-6,1', 6);
  check('ascending range expands', eqArr(ranges.order, [3, 4, 5, 0]) && eqArr(ranges.removedPages, [2, 3]));

  const tilde = resolveRearrangeOrder('2~4, 1', 5);
  check('"~" range and spaced range accepted', eqArr(tilde.order, [1, 2, 3, 0]) && tilde.invalidEntries.length === 0);
  check('spaced dash range accepted', eqArr(resolveRearrangeOrder('1 - 2', 3).order, [0, 1]));

  const reversed = resolveRearrangeOrder('3-1', 3);
  check('descending range reverses pages', eqArr(reversed.order, [2, 1, 0]));

  const outOfRange = resolveRearrangeOrder('1,7,0', 5);
  check('out-of-range pages reported, not ignored', eqArr(outOfRange.invalidEntries, ['7', '0']));
  check('valid entries still resolved alongside invalid ones', eqArr(outOfRange.order, [0]));

  const junk = resolveRearrangeOrder('abc,2-9,1.5', 5);
  check('non-numeric / bad range / decimal all reported', eqArr(junk.invalidEntries, ['abc', '2-9', '1.5']));
  check('all-invalid order keeps nothing (caller must refuse)', junk.order.length === 0);
}

// resolvePageSelection: sets of pages for delete / rotate
{
  const pick = (raw, count) => resolvePageSelection(raw, count);
  check('range 2-3 selects both pages', eqArr(pick('2-3', 5).indices, [1, 2]));
  check('mixed list sorted and unique', eqArr(pick('5, 2-3, 3', 5).indices, [1, 2, 4]));
  check('tilde and reversed range', eqArr(pick('4~2', 5).indices, [1, 2, 3]));
  check('odd pages', eqArr(pick('odd', 5).indices, [0, 2, 4]));
  check('Korean even pages', eqArr(pick('짝수', 5).indices, [1, 3]));
  check('last page', eqArr(pick('마지막', 7).indices, [6]));
  check('all pages', pick('전체', 3).indices.length === 3);
  const bad = pick('2, 9, x', 5);
  check('invalid entries reported', eqArr(bad.invalidEntries, ['9', 'x']) && eqArr(bad.indices, [1]));
  check('empty selects nothing', pick('  ', 5).indices.length === 0);
}

// resolveSplitPlan: one file per page, or per comma-separated group
{
  const each = resolveSplitPlan('', 3);
  check('empty splits every page', each.groups.length === 3 && eqArr(each.groups[2].indices, [2]));
  const ranged = resolveSplitPlan('1-2, 3~5, 6', 6);
  check('ranges become files', ranged.groups.length === 3 && eqArr(ranged.groups[1].indices, [2, 3, 4]));
  check('range labels normalized', ranged.groups[1].label === '3-5');
  const wrong = resolveSplitPlan('1-2, 8', 4);
  check('split reports invalid group', eqArr(wrong.invalidEntries, ['8']) && wrong.groups.length === 1);
}

// formatPageSelection round-trips with resolvePageSelection
{
  check('runs collapse to ranges', formatPageSelection([0, 1, 2, 4, 6, 7]) === '1-3, 5, 7-8');
  check('unsorted and duplicate input', formatPageSelection([3, 1, 3]) === '2, 4');
  check('empty selection', formatPageSelection([]) === '');
  check('round trip', eqArr(resolvePageSelection(formatPageSelection([0, 2, 3, 9]), 10).indices, [0, 2, 3, 9]));
}

// Redaction regions (fractions of the displayed page)
{
  const regions = parseRegions('[{"page":2,"x":0.1,"y":0.2,"w":0.5,"h":0.1},{"page":0,"x":0,"y":0,"w":1,"h":1},{"page":1,"x":0.9,"y":0.9,"w":0.5,"h":0.5},"junk"]');
  check('valid regions kept, junk dropped', regions.length === 2);
  check('region clipped to the page', Math.abs(regions[1].w - 0.1) < 1e-9 && Math.abs(regions[1].h - 0.1) < 1e-9);
  check('bad JSON yields nothing', parseRegions('{oops').length === 0);
  const grouped = groupRegionsByPage([...regions, { page: 9, x: 0, y: 0, w: 0.1, h: 0.1 }], 3);
  check('grouped by page, sorted, out-of-range dropped', eqArr([...grouped.keys()], [1, 2]));
  check('round-trips through JSON', parseRegions(serializeRegions(regions)).length === 2);
}

console.log(`\npdf-page-math: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
