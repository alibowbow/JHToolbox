import { assembleHwpxPackage } from './package-writer';
import { analyzePageLayout } from './layout-analysis';
import type { PositionedTextLine, RuleSegment } from './layout-analysis';
import { pdfPageToHwpPageSize, ptToHwpUnit } from './units';
import {
  FULL_BLEED_MARGINS,
  HWPML_NS,
  SOLID_BORDER_FILL_ID,
  XML_PROLOG,
  buildSecPr,
  escapeXml,
} from './xml-builders';
import { createCharPrRegistry } from './text-writer';

/**
 * Layout-preserving PDF→HWPX ("keep layout + editable text"): every extracted
 * text line becomes an invisible text box (hp:rect + hp:drawText) at its
 * original coordinates, ruling segments become hp:line shapes, and clean ruled
 * grids become real editable Hancom tables (hp:tbl).
 *
 * All element/attribute names, orders, and value shapes are ported from
 * byte-untouched Hancom saves + hwpxlib writers (see the layout ground-truth
 * collection): floats live one-per-run followed by an empty <hp:t/>, rect/line
 * put the ShapeObject block (sz/pos/outMargin) LAST while hp:tbl puts it
 * FIRST, invisible boxes use lineShape style="NONE" with no fillBrush, and
 * positioning uses the fixture-verified PARA/PARA anchor on the first
 * paragraph of a full-bleed section, so offsets equal absolute page
 * coordinates.
 */

export interface LayoutPage {
  pageNumber: number;
  widthPt: number;
  heightPt: number;
  textLines: PositionedTextLine[];
  segments: RuleSegment[];
}

export interface LayoutDocument {
  pages: LayoutPage[];
  metadata?: {
    title?: string;
    createdAtIso?: string;
  };
}

export interface LayoutStats {
  tables: number;
  textBoxes: number;
  rules: number;
}

const IDENTITY_MATRICES =
  '<hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>';

const NO_BORDER_LINESHAPE =
  '<hp:lineShape color="#000000" width="33" style="NONE" endCap="FLAT" headStyle="NORMAL" tailStyle="NORMAL" headfill="1" tailfill="1" headSz="MEDIUM_MEDIUM" tailSz="MEDIUM_MEDIUM" outlineStyle="NORMAL" alpha="0"/>';

const SOLID_LINESHAPE =
  '<hp:lineShape color="#000000" width="33" style="SOLID" endCap="FLAT" headStyle="NORMAL" tailStyle="NORMAL" headfill="1" tailfill="1" headSz="MEDIUM_MEDIUM" tailSz="MEDIUM_MEDIUM" outlineStyle="NORMAL" alpha="0"/>';

const NO_SHADOW = '<hp:shadow type="NONE" color="#B2B2B2" offsetX="0" offsetY="0" alpha="0"/>';

/** Fixture combo for absolutely-placed overlapping graphics (mac drawing group). */
function boxPos(xHwp: number, yHwp: number): string {
  return `<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="0" allowOverlap="1" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="${yHwp}" horzOffset="${xHwp}"/>`;
}

/** Fixture combo for a floating table (jbnu treatAsChar=0 table). */
function tablePos(xHwp: number, yHwp: number): string {
  return `<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="0" allowOverlap="1" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="${yHwp}" horzOffset="${xHwp}"/>`;
}

function shapeSz(widthHwp: number, heightHwp: number): string {
  return `<hp:sz width="${widthHwp}" widthRelTo="ABSOLUTE" height="${heightHwp}" heightRelTo="ABSOLUTE" protect="0"/>`;
}

function subListParagraph(
  text: string,
  charPrId: number,
  fontSizePt: number,
  innerWidthHwp: number,
): string {
  const vertSize = Math.max(100, Math.round(fontSizePt * 100));
  const run = text ? `<hp:run charPrIDRef="${charPrId}"><hp:t>${escapeXml(text)}</hp:t></hp:run>` : `<hp:run charPrIDRef="${charPrId}"/>`;
  return (
    '<hp:p id="2147483648" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">' +
    run +
    `<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="${vertSize}" textheight="${vertSize}" baseline="${Math.round(vertSize * 0.85)}" spacing="${Math.round(vertSize * 0.6)}" horzpos="0" horzsize="${Math.max(100, innerWidthHwp)}" flags="393216"/></hp:linesegarray>` +
    '</hp:p>'
  );
}

function subList(paragraphsXml: string): string {
  return (
    '<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">' +
    paragraphsXml +
    '</hp:subList>'
  );
}

/** Invisible text box carrying one line of editable text at (x, y). */
function buildTextBox(params: {
  id: number;
  zOrder: number;
  xHwp: number;
  yHwp: number;
  widthHwp: number;
  heightHwp: number;
  text: string;
  charPrId: number;
  fontSizePt: number;
}): string {
  const { id, zOrder, xHwp, yHwp, widthHwp, heightHwp, text, charPrId, fontSizePt } = params;
  return (
    `<hp:rect id="${id}" zOrder="${zOrder}" numberingType="NONE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${id}" ratio="0">` +
    '<hp:offset x="0" y="0"/>' +
    `<hp:orgSz width="${widthHwp}" height="${heightHwp}"/>` +
    '<hp:curSz width="0" height="0"/>' +
    '<hp:flip horizontal="0" vertical="0"/>' +
    `<hp:rotationInfo angle="0" centerX="${Math.round(widthHwp / 2)}" centerY="${Math.round(heightHwp / 2)}" rotateimage="1"/>` +
    `<hp:renderingInfo>${IDENTITY_MATRICES}</hp:renderingInfo>` +
    NO_BORDER_LINESHAPE +
    NO_SHADOW +
    `<hp:drawText lastWidth="${widthHwp}" name="" editable="0">` +
    subList(subListParagraph(text, charPrId, fontSizePt, widthHwp)) +
    '<hp:textMargin left="0" right="0" top="0" bottom="0"/>' +
    '</hp:drawText>' +
    `<hc:pt0 x="0" y="0"/><hc:pt1 x="${widthHwp}" y="0"/><hc:pt2 x="${widthHwp}" y="${heightHwp}"/><hc:pt3 x="0" y="${heightHwp}"/>` +
    shapeSz(widthHwp, heightHwp) +
    boxPos(xHwp, yHwp) +
    '<hp:outMargin left="0" right="0" top="0" bottom="0"/>' +
    '</hp:rect>'
  );
}

/** A visible ruling line (leftover segment that was not part of a clean grid). */
function buildRuleLine(params: { id: number; zOrder: number; seg: RuleSegment }): string {
  const { id, zOrder, seg } = params;
  const x = ptToHwpUnit(Math.min(seg.x1, seg.x2));
  const y = ptToHwpUnit(Math.min(seg.y1, seg.y2));
  const dx = ptToHwpUnit(Math.abs(seg.x2 - seg.x1));
  const dy = ptToHwpUnit(Math.abs(seg.y2 - seg.y1));
  return (
    `<hp:line id="${id}" zOrder="${zOrder}" numberingType="NONE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${id}" isReverseHV="0">` +
    '<hp:offset x="0" y="0"/>' +
    `<hp:orgSz width="${dx}" height="${dy}"/>` +
    '<hp:curSz width="0" height="0"/>' +
    '<hp:flip horizontal="0" vertical="0"/>' +
    `<hp:rotationInfo angle="0" centerX="${Math.round(dx / 2)}" centerY="${Math.round(dy / 2)}" rotateimage="1"/>` +
    `<hp:renderingInfo>${IDENTITY_MATRICES}</hp:renderingInfo>` +
    SOLID_LINESHAPE +
    NO_SHADOW +
    `<hc:startPt x="0" y="0"/><hc:endPt x="${dx}" y="${dy}"/>` +
    shapeSz(dx, dy) +
    boxPos(x, y) +
    '<hp:outMargin left="0" right="0" top="0" bottom="0"/>' +
    '</hp:line>'
  );
}

const CELL_MARGIN = 141;

/** A detected clean grid as a real editable Hancom table. */
function buildTable(params: {
  id: number;
  zOrder: number;
  xsHwp: number[];
  ysHwp: number[];
  cells: PositionedTextLine[][][];
  charPrIdFor: (fontSizePt: number, bold: boolean) => number;
}): string {
  const { id, zOrder, xsHwp, ysHwp, cells, charPrIdFor } = params;
  const width = xsHwp[xsHwp.length - 1] - xsHwp[0];
  const height = ysHwp[ysHwp.length - 1] - ysHwp[0];
  const rowCnt = ysHwp.length - 1;
  const colCnt = xsHwp.length - 1;

  const rows = cells
    .map((row, rowIndex) => {
      const tcs = row
        .map((cellLines, colIndex) => {
          const cellW = xsHwp[colIndex + 1] - xsHwp[colIndex];
          const cellH = ysHwp[rowIndex + 1] - ysHwp[rowIndex];
          const innerW = Math.max(100, cellW - CELL_MARGIN * 2);
          const paragraphs = cellLines.length
            ? cellLines
                .map((line) => subListParagraph(line.text, charPrIdFor(line.fontSizePt, line.bold), line.fontSizePt, innerW))
                .join('')
            : subListParagraph('', 0, 1, innerW);
          return (
            `<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${SOLID_BORDER_FILL_ID}">` +
            subList(paragraphs) +
            `<hp:cellAddr colAddr="${colIndex}" rowAddr="${rowIndex}"/>` +
            '<hp:cellSpan colSpan="1" rowSpan="1"/>' +
            `<hp:cellSz width="${cellW}" height="${cellH}"/>` +
            `<hp:cellMargin left="${CELL_MARGIN}" right="${CELL_MARGIN}" top="${CELL_MARGIN}" bottom="${CELL_MARGIN}"/>` +
            '</hp:tc>'
          );
        })
        .join('');
      return `<hp:tr>${tcs}</hp:tr>`;
    })
    .join('');

  // hp:tbl puts the ShapeObject block FIRST (unlike rect/line where it is last).
  return (
    `<hp:tbl id="${id}" zOrder="${zOrder}" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${rowCnt}" colCnt="${colCnt}" cellSpacing="0" borderFillIDRef="${SOLID_BORDER_FILL_ID}" noAdjust="0">` +
    shapeSz(width, height) +
    tablePos(xsHwp[0], ysHwp[0]) +
    '<hp:outMargin left="0" right="0" top="0" bottom="0"/>' +
    `<hp:inMargin left="${CELL_MARGIN}" right="${CELL_MARGIN}" top="${CELL_MARGIN}" bottom="${CELL_MARGIN}"/>` +
    rows +
    '</hp:tbl>'
  );
}

export async function writeLayoutHwpx(doc: LayoutDocument): Promise<{ bytes: Uint8Array; stats: LayoutStats }> {
  if (!doc.pages.length) {
    throw new Error('Cannot build an HWPX document with no pages.');
  }

  const registry = createCharPrRegistry();
  const stats: LayoutStats = { tables: 0, textBoxes: 0, rules: 0 };
  let nextId = 1;

  const sectionXmls = doc.pages.map((page) => {
    const size = pdfPageToHwpPageSize(page.widthPt, page.heightPt);
    const plan = analyzePageLayout(page.textLines, page.segments);
    let zOrder = 0;
    const floats: string[] = [];

    for (const table of plan.tables) {
      floats.push(
        buildTable({
          id: nextId,
          zOrder,
          xsHwp: table.xs.map(ptToHwpUnit),
          ysHwp: table.ys.map(ptToHwpUnit),
          cells: table.cells,
          charPrIdFor: registry.idFor,
        }),
      );
      nextId += 1;
      zOrder += 1;
      stats.tables += 1;
    }

    for (const seg of plan.rules) {
      floats.push(buildRuleLine({ id: nextId, zOrder, seg }));
      nextId += 1;
      zOrder += 1;
      stats.rules += 1;
    }

    for (const line of plan.freeText) {
      // Slack keeps single-line text from wrapping inside its box.
      const widthHwp = ptToHwpUnit(line.widthPt) + 800;
      const heightHwp = Math.max(400, Math.round(line.fontSizePt * 100 * 1.5));
      floats.push(
        buildTextBox({
          id: nextId,
          zOrder,
          xHwp: ptToHwpUnit(line.xPt),
          yHwp: ptToHwpUnit(line.yPt),
          widthHwp,
          heightHwp,
          text: line.text,
          charPrId: registry.idFor(line.fontSizePt, line.bold),
          fontSizePt: line.fontSizePt,
        }),
      );
      nextId += 1;
      zOrder += 1;
      stats.textBoxes += 1;
    }

    // One float per run, each followed by an empty <hp:t/>; the anchoring
    // paragraph keeps its linesegarray (horzsize 0, like the real fixtures).
    const floatRuns = floats.map((xml) => `<hp:run charPrIDRef="0">${xml}<hp:t/></hp:run>`).join('');
    const anchorSeg =
      '<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="0" flags="393216"/></hp:linesegarray>';
    return (
      `${XML_PROLOG}<hs:sec ${HWPML_NS}>` +
      '<hp:p id="1" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">' +
      `<hp:run charPrIDRef="0">${buildSecPr(size.widthHwp, size.heightHwp, size.landscape, FULL_BLEED_MARGINS)}<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl></hp:run>` +
      floatRuns +
      anchorSeg +
      '</hp:p>' +
      '</hs:sec>'
    );
  });

  const bytes = await assembleHwpxPackage({
    title: doc.metadata?.title?.trim() || 'Converted document',
    createdAtIso: doc.metadata?.createdAtIso,
    sectionXmls,
    binItems: [],
    binData: [],
    headerExtras: { charPrs: registry.extras },
    previewText:
      doc.pages
        .flatMap((page) => page.textLines.map((line) => line.text))
        .join('\n')
        .slice(0, 1000) || 'Converted document',
  });

  return { bytes, stats };
}
