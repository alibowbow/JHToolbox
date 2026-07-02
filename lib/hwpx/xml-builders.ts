/**
 * OWPML/HWPX XML builders for the raster (fidelity) package.
 *
 * Every part is ported from two ground-truth sources, not written from memory:
 *  - byte-untouched HWPX packages saved by real Hancom Office (Hangul 12 Mac +
 *    Windows fixtures found in public repos), and
 *  - hwpxlib's BlankFileMaker + writer classes (neolord0/hwpxlib), the de-facto
 *    reference implementation whose output Hancom opens.
 *
 * Notable format facts preserved deliberately (do not "fix" them):
 *  - Hancom's own spelling quirks: attribute `tagetApplication`, element
 *    `hh:trackchageConfig`, manifest attribute `isEmbeded`, `hh:supscript`.
 *  - Every major root (hs:sec, hh:head, opf:package) declares the same 15
 *    namespaces in the same order; files missing them are refused by Hangul.
 *  - The image reference inside hp:pic is `hc:img` (core namespace), and the
 *    ShapeObject block (sz/pos/outMargin) comes AFTER the image elements.
 *  - `hp:pagePr landscape="WIDELY"` means a PORTRAIT page in real files.
 *  - Each XML part is a single line with a space before `?>` in the prolog.
 */

export const HWPX_MIME = 'application/hwp+zip';

const XML_PROLOG = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>';

/** The 15 xmlns declarations Hancom writes on hs:sec / hh:head / opf:package, in order. */
const HWPML_NS =
  'xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" ' +
  'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" ' +
  'xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" ' +
  'xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" ' +
  'xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" ' +
  'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" ' +
  'xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" ' +
  'xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" ' +
  'xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" ' +
  'xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
  'xmlns:opf="http://www.idpf.org/2007/opf/" ' +
  'xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart" ' +
  'xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" ' +
  'xmlns:epub="http://www.idpf.org/2007/ops" ' +
  'xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"';

export interface BinItem {
  /** Manifest item id, referenced from the section via binaryItemIDRef. */
  id: string;
  /** Path inside the package, e.g. "BinData/image1.png". */
  href: string;
  mediaType: string;
}

export function escapeXml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Collapse a readable template into the single-line form Hancom writes. */
function oneline(xml: string): string {
  return xml.replace(/\n\s*/g, '');
}

export function buildVersionXml(): string {
  // Numeric attributes match real Hangul saves (5.1.1.0, xmlVersion 1.5);
  // application/appVersion identify this producer honestly, like hwpxlib does.
  return `${XML_PROLOG}<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="1" buildNumber="0" os="1" xmlVersion="1.5" application="JH Toolbox" appVersion="1.0"/>`;
}

export function buildSettingsXml(): string {
  return `${XML_PROLOG}<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"><ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/></ha:HWPApplicationSetting>`;
}

export function buildContainerXml(): string {
  // Real packages list exactly these three rootfiles, in this order.
  return oneline(`${XML_PROLOG}<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"><ocf:rootfiles>
    <ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>
    <ocf:rootfile full-path="Preview/PrvText.txt" media-type="text/plain"/>
    <ocf:rootfile full-path="META-INF/container.rdf" media-type="application/rdf+xml"/>
  </ocf:rootfiles></ocf:container>`);
}

export function buildManifestXml(): string {
  // Real META-INF/manifest.xml is a single empty element — nothing else.
  return `${XML_PROLOG}<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>`;
}

export function buildContainerRdf(sectionCount: number): string {
  const PKG = 'http://www.hancom.co.kr/hwpml/2016/meta/pkg#';
  const parts: string[] = [];
  parts.push(
    `<rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="${PKG}" rdf:resource="Contents/header.xml"/></rdf:Description>`,
    `<rdf:Description rdf:about="Contents/header.xml"><rdf:type rdf:resource="${PKG}HeaderFile"/></rdf:Description>`,
  );
  for (let index = 0; index < sectionCount; index += 1) {
    parts.push(
      `<rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="${PKG}" rdf:resource="Contents/section${index}.xml"/></rdf:Description>`,
      `<rdf:Description rdf:about="Contents/section${index}.xml"><rdf:type rdf:resource="${PKG}SectionFile"/></rdf:Description>`,
    );
  }
  parts.push(`<rdf:Description rdf:about=""><rdf:type rdf:resource="${PKG}Document"/></rdf:Description>`);
  return `${XML_PROLOG}<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">${parts.join('')}</rdf:RDF>`;
}

export function buildContentHpf(
  title: string,
  sectionCount: number,
  binItems: BinItem[],
  createdAtIso?: string,
): string {
  const sectionItems = Array.from(
    { length: sectionCount },
    (_, index) => `<opf:item id="section${index}" href="Contents/section${index}.xml" media-type="application/xml"/>`,
  );
  const binItemsXml = binItems.map(
    (item) =>
      `<opf:item id="${escapeXml(item.id)}" href="${escapeXml(item.href)}" media-type="${escapeXml(item.mediaType)}" isEmbeded="1"/>`,
  );
  const spine = ['<opf:itemref idref="header" linear="yes"/>'].concat(
    Array.from({ length: sectionCount }, (_, index) => `<opf:itemref idref="section${index}" linear="yes"/>`),
  );
  // Every real fixture carries CreatedDate/ModifiedDate plus a free-text
  // "date" meta between ModifiedDate and keyword.
  const dates = createdAtIso
    ? `<opf:meta name="CreatedDate" content="text">${escapeXml(createdAtIso)}</opf:meta><opf:meta name="ModifiedDate" content="text">${escapeXml(createdAtIso)}</opf:meta><opf:meta name="date" content="text">${escapeXml(createdAtIso)}</opf:meta>`
    : '';
  return (
    `${XML_PROLOG}<opf:package ${HWPML_NS} version="" unique-identifier="" id="">` +
    `<opf:metadata><opf:title>${escapeXml(title)}</opf:title><opf:language>ko</opf:language>` +
    `<opf:meta name="creator" content="text">JH Toolbox</opf:meta>` +
    `<opf:meta name="subject" content="text"/><opf:meta name="description" content="text"/>` +
    `<opf:meta name="lastsaveby" content="text">JH Toolbox</opf:meta>${dates}` +
    `<opf:meta name="keyword" content="text"/></opf:metadata>` +
    `<opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>` +
    `${sectionItems.join('')}<opf:item id="settings" href="settings.xml" media-type="application/xml"/>` +
    `${binItemsXml.join('')}</opf:manifest>` +
    `<opf:spine>${spine.join('')}</opf:spine></opf:package>`
  );
}

// ---------------------------------------------------------------------------
// header.xml — full refList tables ported from hwpxlib BlankFileMaker
// ---------------------------------------------------------------------------

const FONT_LANGS = ['HANGUL', 'LATIN', 'HANJA', 'JAPANESE', 'OTHER', 'SYMBOL', 'USER'] as const;

function buildFontfaces(): string {
  const typeInfo =
    '<hh:typeInfo familyType="FCAT_GOTHIC" weight="8" proportion="4" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/>';
  const fonts =
    `<hh:font id="0" face="함초롬돋움" type="TTF" isEmbedded="0">${typeInfo}</hh:font>` +
    `<hh:font id="1" face="함초롬바탕" type="TTF" isEmbedded="0">${typeInfo}</hh:font>`;
  const faces = FONT_LANGS.map((lang) => `<hh:fontface lang="${lang}" fontCnt="2">${fonts}</hh:fontface>`).join('');
  return `<hh:fontfaces itemCnt="7">${faces}</hh:fontfaces>`;
}

function buildBorderFills(): string {
  const borders =
    '<hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>' +
    '<hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/><hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/>' +
    '<hh:topBorder type="NONE" width="0.1 mm" color="#000000"/><hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/>' +
    '<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>';
  return (
    '<hh:borderFills itemCnt="2">' +
    `<hh:borderFill id="1" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">${borders}</hh:borderFill>` +
    // borderFill 2 is what charPr/paraPr reference: no borders + a "none" fill.
    `<hh:borderFill id="2" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">${borders}<hc:fillBrush><hc:winBrush faceColor="none" hatchColor="#FF000000" alpha="0"/></hc:fillBrush></hh:borderFill>` +
    '</hh:borderFills>'
  );
}

type CharPrRow = { id: number; height: number; textColor: string; fontRef: number; spacing: number };

const CHAR_PRS: CharPrRow[] = [
  { id: 0, height: 1000, textColor: '#000000', fontRef: 1, spacing: 0 },
  { id: 1, height: 1000, textColor: '#000000', fontRef: 0, spacing: 0 },
  { id: 2, height: 900, textColor: '#000000', fontRef: 0, spacing: 0 },
  { id: 3, height: 900, textColor: '#000000', fontRef: 1, spacing: 0 },
  { id: 4, height: 900, textColor: '#000000', fontRef: 0, spacing: -5 },
  { id: 5, height: 1600, textColor: '#2E74B5', fontRef: 0, spacing: 0 },
  { id: 6, height: 1100, textColor: '#000000', fontRef: 0, spacing: 0 },
];

function langAttrs(value: number): string {
  return `hangul="${value}" latin="${value}" hanja="${value}" japanese="${value}" other="${value}" symbol="${value}" user="${value}"`;
}

/** A dynamic character style appended after the 7 base entries (ids 7+). */
export interface HeaderCharPrExtra {
  id: number;
  /** Font height in HWPUNIT-ish char units (pt × 100). */
  height: number;
  bold: boolean;
}

/** A dynamic paragraph style appended after the 16 base entries (ids 16+). */
export interface HeaderParaPrExtra {
  id: number;
  align: 'LEFT' | 'CENTER' | 'JUSTIFY' | 'RIGHT';
}

export interface HeaderExtras {
  charPrs?: HeaderCharPrExtra[];
  paraPrs?: HeaderParaPrExtra[];
}

function charPrXml(id: number, height: number, textColor: string, fontRef: number, spacing: number, bold: boolean): string {
  // Child order per the OWPML writer: fontRef, ratio, spacing, relSz, offset,
  // bold?, italic?, underline, strikeout, outline, shadow.
  return (
    `<hh:charPr id="${id}" height="${height}" textColor="${textColor}" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2">` +
    `<hh:fontRef ${langAttrs(fontRef)}/><hh:ratio ${langAttrs(100)}/><hh:spacing ${langAttrs(spacing)}/>` +
    `<hh:relSz ${langAttrs(100)}/><hh:offset ${langAttrs(0)}/>${bold ? '<hh:bold/>' : ''}` +
    '<hh:underline type="NONE" shape="SOLID" color="#000000"/><hh:strikeout shape="NONE" color="#000000"/>' +
    '<hh:outline type="NONE"/><hh:shadow type="NONE" color="#B2B2B2" offsetX="10" offsetY="10"/>' +
    '</hh:charPr>'
  );
}

function buildCharProperties(extras: HeaderCharPrExtra[] = []): string {
  const items = CHAR_PRS.map((row) => charPrXml(row.id, row.height, row.textColor, row.fontRef, row.spacing, false)).concat(
    extras.map((row) => charPrXml(row.id, row.height, '#000000', 1, 0, row.bold)),
  );
  return `<hh:charProperties itemCnt="${CHAR_PRS.length + extras.length}">${items.join('')}</hh:charProperties>`;
}

function buildTabProperties(): string {
  return (
    '<hh:tabProperties itemCnt="2">' +
    '<hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/>' +
    '<hh:tabPr id="1" autoTabLeft="1" autoTabRight="0"/>' +
    '</hh:tabProperties>'
  );
}

function buildNumberings(): string {
  const HEADS: Array<{ level: number; numFormat: string; checkable: 0 | 1; text: string }> = [
    { level: 1, numFormat: 'DIGIT', checkable: 0, text: '^1.' },
    { level: 2, numFormat: 'HANGUL_SYLLABLE', checkable: 0, text: '^2.' },
    { level: 3, numFormat: 'DIGIT', checkable: 0, text: '^3)' },
    { level: 4, numFormat: 'HANGUL_SYLLABLE', checkable: 0, text: '^4)' },
    { level: 5, numFormat: 'DIGIT', checkable: 0, text: '(^5)' },
    { level: 6, numFormat: 'HANGUL_SYLLABLE', checkable: 0, text: '(^6)' },
    { level: 7, numFormat: 'CIRCLED_DIGIT', checkable: 1, text: '^7' },
  ];
  const heads = HEADS.map(
    (head) =>
      `<hh:paraHead start="1" level="${head.level}" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="${head.numFormat}" charPrIDRef="4294967295" checkable="${head.checkable}">${head.text}</hh:paraHead>`,
  );
  return `<hh:numberings itemCnt="1"><hh:numbering id="1" start="0">${heads.join('')}</hh:numbering></hh:numberings>`;
}

type ParaPrRow = {
  id: number;
  tabPr: 0 | 1;
  condense: number;
  align: 'LEFT' | 'CENTER' | 'JUSTIFY' | 'RIGHT';
  headingLevel: number | null;
  breakNonLatin: 'KEEP_WORD' | 'BREAK_WORD';
  widowOrphan: 0 | 1;
  autoSpacing: 0 | 1;
  margin: { intent?: number; left?: number; prev?: number; next?: number };
  lineSpacing: number;
};

// Values are the plain (non-HwpUnitChar) branch of BlankFileMaker's tables.
const PARA_PRS: ParaPrRow[] = [
  { id: 0, tabPr: 0, condense: 0, align: 'LEFT', headingLevel: null, breakNonLatin: 'BREAK_WORD', widowOrphan: 0, autoSpacing: 0, margin: {}, lineSpacing: 130 },
  { id: 1, tabPr: 0, condense: 0, align: 'JUSTIFY', headingLevel: null, breakNonLatin: 'KEEP_WORD', widowOrphan: 0, autoSpacing: 0, margin: { intent: -2620 }, lineSpacing: 130 },
  { id: 2, tabPr: 0, condense: 0, align: 'JUSTIFY', headingLevel: null, breakNonLatin: 'BREAK_WORD', widowOrphan: 0, autoSpacing: 0, margin: {}, lineSpacing: 150 },
  { id: 3, tabPr: 0, condense: 0, align: 'JUSTIFY', headingLevel: null, breakNonLatin: 'KEEP_WORD', widowOrphan: 0, autoSpacing: 0, margin: {}, lineSpacing: 160 },
  { id: 4, tabPr: 1, condense: 20, align: 'JUSTIFY', headingLevel: 6, breakNonLatin: 'KEEP_WORD', widowOrphan: 0, autoSpacing: 0, margin: { left: 14000 }, lineSpacing: 160 },
  { id: 5, tabPr: 1, condense: 20, align: 'JUSTIFY', headingLevel: 5, breakNonLatin: 'KEEP_WORD', widowOrphan: 0, autoSpacing: 0, margin: { left: 12000 }, lineSpacing: 160 },
  { id: 6, tabPr: 1, condense: 20, align: 'JUSTIFY', headingLevel: 4, breakNonLatin: 'KEEP_WORD', widowOrphan: 0, autoSpacing: 0, margin: { left: 10000 }, lineSpacing: 160 },
  { id: 7, tabPr: 1, condense: 20, align: 'JUSTIFY', headingLevel: 3, breakNonLatin: 'KEEP_WORD', widowOrphan: 0, autoSpacing: 0, margin: { left: 8000 }, lineSpacing: 160 },
  { id: 8, tabPr: 1, condense: 20, align: 'JUSTIFY', headingLevel: 2, breakNonLatin: 'KEEP_WORD', widowOrphan: 0, autoSpacing: 0, margin: { left: 6000 }, lineSpacing: 160 },
  { id: 9, tabPr: 1, condense: 20, align: 'JUSTIFY', headingLevel: 1, breakNonLatin: 'KEEP_WORD', widowOrphan: 0, autoSpacing: 0, margin: { left: 4000 }, lineSpacing: 160 },
  { id: 10, tabPr: 1, condense: 20, align: 'JUSTIFY', headingLevel: 0, breakNonLatin: 'KEEP_WORD', widowOrphan: 0, autoSpacing: 0, margin: { left: 2000 }, lineSpacing: 160 },
  { id: 11, tabPr: 0, condense: 0, align: 'JUSTIFY', headingLevel: null, breakNonLatin: 'KEEP_WORD', widowOrphan: 0, autoSpacing: 0, margin: { left: 3000 }, lineSpacing: 160 },
  { id: 12, tabPr: 1, condense: 20, align: 'LEFT', headingLevel: null, breakNonLatin: 'BREAK_WORD', widowOrphan: 1, autoSpacing: 1, margin: { prev: 2400, next: 600 }, lineSpacing: 160 },
  { id: 13, tabPr: 0, condense: 0, align: 'LEFT', headingLevel: null, breakNonLatin: 'BREAK_WORD', widowOrphan: 1, autoSpacing: 1, margin: { next: 1400 }, lineSpacing: 160 },
  { id: 14, tabPr: 0, condense: 0, align: 'LEFT', headingLevel: null, breakNonLatin: 'BREAK_WORD', widowOrphan: 1, autoSpacing: 1, margin: { left: 2200, next: 1400 }, lineSpacing: 160 },
  { id: 15, tabPr: 0, condense: 0, align: 'LEFT', headingLevel: null, breakNonLatin: 'BREAK_WORD', widowOrphan: 1, autoSpacing: 1, margin: { left: 4400, next: 1400 }, lineSpacing: 160 },
];

function paraPrXml(row: ParaPrRow): string {
  const heading =
    row.headingLevel === null
      ? '<hh:heading type="NONE" idRef="0" level="0"/>'
      : `<hh:heading type="OUTLINE" idRef="0" level="${row.headingLevel}"/>`;
  const m = row.margin;
  const margin =
    '<hh:margin>' +
    `<hc:intent value="${m.intent ?? 0}" unit="HWPUNIT"/>` +
    `<hc:left value="${m.left ?? 0}" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/>` +
    `<hc:prev value="${m.prev ?? 0}" unit="HWPUNIT"/><hc:next value="${m.next ?? 0}" unit="HWPUNIT"/>` +
    '</hh:margin>';
  return (
    `<hh:paraPr id="${row.id}" tabPrIDRef="${row.tabPr}" condense="${row.condense}" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">` +
    `<hh:align horizontal="${row.align}" vertical="BASELINE"/>${heading}` +
    `<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="${row.breakNonLatin}" widowOrphan="${row.widowOrphan}" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>` +
    `<hh:autoSpacing eAsianEng="${row.autoSpacing}" eAsianNum="${row.autoSpacing}"/>` +
    `${margin}<hh:lineSpacing type="PERCENT" value="${row.lineSpacing}" unit="HWPUNIT"/>` +
    '<hh:border borderFillIDRef="2" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>' +
    '</hh:paraPr>'
  );
}

function buildParaProperties(extras: HeaderParaPrExtra[] = []): string {
  const extraRows: ParaPrRow[] = extras.map((extra) => ({
    id: extra.id,
    tabPr: 0,
    condense: 0,
    align: extra.align,
    headingLevel: null,
    breakNonLatin: 'BREAK_WORD',
    widowOrphan: 0,
    autoSpacing: 0,
    margin: {},
    lineSpacing: 160,
  }));
  const items = PARA_PRS.concat(extraRows).map(paraPrXml);
  return `<hh:paraProperties itemCnt="${PARA_PRS.length + extras.length}">${items.join('')}</hh:paraProperties>`;
}

type StyleRow = { id: number; type: 'PARA' | 'CHAR'; name: string; engName: string; paraPr: number; charPr: number; next: number };

const STYLES: StyleRow[] = [
  { id: 0, type: 'PARA', name: '바탕글', engName: 'Normal', paraPr: 3, charPr: 0, next: 0 },
  { id: 1, type: 'PARA', name: '본문', engName: 'Body', paraPr: 11, charPr: 0, next: 1 },
  { id: 2, type: 'PARA', name: '개요 1', engName: 'Outline 1', paraPr: 10, charPr: 0, next: 2 },
  { id: 3, type: 'PARA', name: '개요 2', engName: 'Outline 2', paraPr: 9, charPr: 0, next: 3 },
  { id: 4, type: 'PARA', name: '개요 3', engName: 'Outline 3', paraPr: 8, charPr: 0, next: 4 },
  { id: 5, type: 'PARA', name: '개요 4', engName: 'Outline 4', paraPr: 7, charPr: 0, next: 5 },
  { id: 6, type: 'PARA', name: '개요 5', engName: 'Outline 5', paraPr: 6, charPr: 0, next: 6 },
  { id: 7, type: 'PARA', name: '개요 6', engName: 'Outline 6', paraPr: 5, charPr: 0, next: 7 },
  { id: 8, type: 'PARA', name: '개요 7', engName: 'Outline 7', paraPr: 4, charPr: 0, next: 8 },
  // Real files carry a sentinel paraPrIDRef here; 0 is equally valid and keeps
  // every reference in the file resolvable.
  { id: 9, type: 'CHAR', name: '쪽 번호', engName: 'Page Number', paraPr: 0, charPr: 1, next: 0 },
  { id: 10, type: 'PARA', name: '머리말', engName: 'Header', paraPr: 2, charPr: 2, next: 10 },
  { id: 11, type: 'PARA', name: '각주', engName: 'Footnote', paraPr: 1, charPr: 3, next: 11 },
  { id: 12, type: 'PARA', name: '미주', engName: 'Endnote', paraPr: 1, charPr: 3, next: 12 },
  { id: 13, type: 'PARA', name: '메모', engName: 'Memo', paraPr: 0, charPr: 4, next: 13 },
  { id: 14, type: 'PARA', name: '차례 제목', engName: 'TOC Heading', paraPr: 12, charPr: 5, next: 14 },
  { id: 15, type: 'PARA', name: '차례 1', engName: 'TOC 1', paraPr: 13, charPr: 6, next: 15 },
  { id: 16, type: 'PARA', name: '차례 2', engName: 'TOC 2', paraPr: 14, charPr: 6, next: 16 },
  { id: 17, type: 'PARA', name: '차례 3', engName: 'TOC 3', paraPr: 15, charPr: 6, next: 17 },
];

function buildStyles(): string {
  const items = STYLES.map(
    (s) =>
      `<hh:style id="${s.id}" type="${s.type}" name="${s.name}" engName="${s.engName}" paraPrIDRef="${s.paraPr}" charPrIDRef="${s.charPr}" nextStyleIDRef="${s.next}" langID="1042" lockForm="0"/>`,
  );
  return `<hh:styles itemCnt="${STYLES.length}">${items.join('')}</hh:styles>`;
}

export function buildHeaderXml(sectionCount: number, extras: HeaderExtras = {}): string {
  return (
    `${XML_PROLOG}<hh:head ${HWPML_NS} version="1.5" secCnt="${sectionCount}">` +
    '<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>' +
    '<hh:refList>' +
    buildFontfaces() +
    buildBorderFills() +
    buildCharProperties(extras.charPrs) +
    buildTabProperties() +
    buildNumberings() +
    buildParaProperties(extras.paraPrs) +
    buildStyles() +
    '</hh:refList>' +
    '<hh:compatibleDocument targetProgram="HWP201X"><hh:layoutCompatibility/></hh:compatibleDocument>' +
    '<hh:docOption><hh:linkinfo path="" pageInherit="0" footnoteInherit="0"/></hh:docOption>' +
    // Hancom's real element name (their typo, present in every real save).
    '<hh:trackchageConfig flags="56"/>' +
    '</hh:head>'
  );
}

// ---------------------------------------------------------------------------
// sectionN.xml
// ---------------------------------------------------------------------------

export interface PageMargins {
  header: number;
  footer: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Zero margins so a full-page image can bleed to the page edge. */
export const FULL_BLEED_MARGINS: PageMargins = { header: 0, footer: 0, left: 0, right: 0, top: 0, bottom: 0 };

/** The standard margins Hancom's blank document uses (A4-scale HWPUNIT). */
export const STANDARD_MARGINS: PageMargins = { header: 4252, footer: 4252, left: 8504, right: 8504, top: 5668, bottom: 4252 };

function buildSecPr(widthHwp: number, heightHwp: number, landscape: boolean, margins: PageMargins): string {
  // Ground truth from real Hancom saves: a PORTRAIT page carries
  // landscape="WIDELY"; a landscape page carries "NARROWLY".
  const orient = landscape ? 'NARROWLY' : 'WIDELY';
  const noteCommon =
    '<hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>';
  const pageBorderFills = (['BOTH', 'EVEN', 'ODD'] as const)
    .map(
      (type) =>
        `<hp:pageBorderFill type="${type}" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill>`,
    )
    .join('');
  return (
    '<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">' +
    '<hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/>' +
    '<hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>' +
    '<hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>' +
    '<hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/>' +
    `<hp:pagePr landscape="${orient}" width="${widthHwp}" height="${heightHwp}" gutterType="LEFT_ONLY">` +
    `<hp:margin header="${margins.header}" footer="${margins.footer}" gutter="0" left="${margins.left}" right="${margins.right}" top="${margins.top}" bottom="${margins.bottom}"/>` +
    '</hp:pagePr>' +
    `<hp:footNotePr>${noteCommon}<hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="EACH_COLUMN" beneathText="0"/></hp:footNotePr>` +
    `<hp:endNotePr>${noteCommon}<hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="END_OF_DOCUMENT" beneathText="0"/></hp:endNotePr>` +
    pageBorderFills +
    '</hp:secPr>'
  );
}

function buildPicture(binItemId: string, widthHwp: number, heightHwp: number, instId: number): string {
  // Child order copied from a byte-untouched Hancom save: the ShapeComponent
  // block first, then hc:img (core namespace — NOT hp:img), the image geometry,
  // and the ShapeObject block (sz/pos/outMargin) LAST.
  const identity = '<hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>';
  return (
    `<hp:pic id="${instId}" zOrder="0" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${instId}" reverse="0">` +
    '<hp:offset x="0" y="0"/>' +
    `<hp:orgSz width="${widthHwp}" height="${heightHwp}"/>` +
    '<hp:curSz width="0" height="0"/>' +
    '<hp:flip horizontal="0" vertical="0"/>' +
    `<hp:rotationInfo angle="0" centerX="${Math.round(widthHwp / 2)}" centerY="${Math.round(heightHwp / 2)}" rotateimage="1"/>` +
    `<hp:renderingInfo>${identity}</hp:renderingInfo>` +
    `<hc:img binaryItemIDRef="${escapeXml(binItemId)}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/>` +
    `<hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${widthHwp}" y="0"/><hc:pt2 x="${widthHwp}" y="${heightHwp}"/><hc:pt3 x="0" y="${heightHwp}"/></hp:imgRect>` +
    `<hp:imgClip left="0" right="${widthHwp}" top="0" bottom="${heightHwp}"/>` +
    '<hp:inMargin left="0" right="0" top="0" bottom="0"/>' +
    `<hp:imgDim dimwidth="${widthHwp}" dimheight="${heightHwp}"/>` +
    '<hp:effects/>' +
    `<hp:sz width="${widthHwp}" widthRelTo="ABSOLUTE" height="${heightHwp}" heightRelTo="ABSOLUTE" protect="0"/>` +
    '<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>' +
    '<hp:outMargin left="0" right="0" top="0" bottom="0"/>' +
    '</hp:pic>'
  );
}

export interface TextParagraph {
  text: string;
  charPrId: number;
  paraPrId: number;
  fontSizePt: number;
}

/**
 * A flowing-text section (the "editable" PDF→HWPX mode): one paragraph per
 * extracted line, standard page margins, same run layout as real saves
 * (secPr + column control in their own run on the first paragraph).
 */
export function buildTextSectionXml(params: {
  widthHwp: number;
  heightHwp: number;
  landscape: boolean;
  margins: PageMargins;
  paragraphs: TextParagraph[];
}): string {
  const { widthHwp, heightHwp, landscape, margins, paragraphs } = params;
  const textWidth = Math.max(1000, widthHwp - margins.left - margins.right);
  const list = paragraphs.length > 0 ? paragraphs : [{ text: '', charPrId: 0, paraPrId: 3, fontSizePt: 10 }];

  const body = list
    .map((para, index) => {
      const vertSize = Math.max(600, Math.round(para.fontSizePt * 100));
      const lineSeg = `<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="${vertSize}" textheight="${vertSize}" baseline="${Math.round(vertSize * 0.85)}" spacing="${Math.round(vertSize * 0.6)}" horzpos="0" horzsize="${textWidth}" flags="393216"/></hp:linesegarray>`;
      const secPrRun =
        index === 0
          ? `<hp:run charPrIDRef="${para.charPrId}">${buildSecPr(widthHwp, heightHwp, landscape, margins)}<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl></hp:run>`
          : '';
      return (
        `<hp:p id="${index + 1}" paraPrIDRef="${para.paraPrId}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">` +
        secPrRun +
        `<hp:run charPrIDRef="${para.charPrId}"><hp:t>${escapeXml(para.text)}</hp:t></hp:run>` +
        lineSeg +
        '</hp:p>'
      );
    })
    .join('');

  return `${XML_PROLOG}<hs:sec ${HWPML_NS}>${body}</hs:sec>`;
}

export function buildRasterSectionXml(params: {
  widthHwp: number;
  heightHwp: number;
  landscape: boolean;
  binItemId: string;
  instId: number;
}): string {
  const { widthHwp, heightHwp, landscape, binItemId, instId } = params;
  const lineSeg = `<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="${heightHwp}" textheight="${heightHwp}" baseline="${Math.round(heightHwp * 0.85)}" spacing="0" horzpos="0" horzsize="${widthHwp}" flags="393216"/></hp:linesegarray>`;
  // Real Hancom layout: run 1 holds secPr + the column control, run 2 holds the
  // object followed by an empty hp:t, then the paragraph's linesegarray.
  return (
    `${XML_PROLOG}<hs:sec ${HWPML_NS}>` +
    '<hp:p id="1" paraPrIDRef="3" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">' +
    `<hp:run charPrIDRef="0">${buildSecPr(widthHwp, heightHwp, landscape, FULL_BLEED_MARGINS)}<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl></hp:run>` +
    `<hp:run charPrIDRef="0">${buildPicture(binItemId, widthHwp, heightHwp, instId)}<hp:t/></hp:run>` +
    lineSeg +
    '</hp:p>' +
    '</hs:sec>'
  );
}
