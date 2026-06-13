import JSZip from 'jszip';
import { ProcessContext, ProcessedFile } from '@/types/processor';
import { baseName } from '@/lib/utils';
import {
  type PdfStyledLine,
  type PdfStyledPage,
  escapeXml,
  extractPdfStyledPages,
  renderHtmlStringToPdfBlob,
} from '@/lib/processors/pdf';

const HWPX_MIME = 'application/hwp+zip';
const HP_NS = 'http://www.hancom.co.kr/hwpml/2011/paragraph';

// A4 page geometry in HWPUNIT (1/7200 inch).
const HWPX_PAGE = {
  width: 59528,
  height: 84188,
  marginLeft: 8504,
  marginRight: 8504,
  marginTop: 5668,
  marginBottom: 4252,
  header: 4252,
  footer: 4252,
};

// Printable text width in HWPUNIT: page width minus the left/right margins.
const TEXT_AREA_WIDTH = HWPX_PAGE.width - HWPX_PAGE.marginLeft - HWPX_PAGE.marginRight;

// A4 width in CSS px at 96 dpi, used for the HWPX -> HTML -> PDF render width.
const A4_PX_WIDTH = 794;

type CharStyle = { id: number; sizePt: number; bold: boolean };
type ParaStyle = { id: number; align: 'left' | 'center' };

// ---------------------------------------------------------------------------
// PDF -> HWPX (style-aware generation)
// ---------------------------------------------------------------------------

function buildVersionXml() {
  // Note: "tagetApplication" is the attribute name used by the OWPML spec.
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="1" buildNumber="0" os="10" xmlVersion="1.5" application="JH Toolbox" appVersion="1.0"/>`;
}

function buildContainerXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf">
  <ocf:rootfiles>
    <ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>
  </ocf:rootfiles>
</ocf:container>`;
}

function buildManifestXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">
  <odf:file-entry full-path="/" media-type="${HWPX_MIME}"/>
  <odf:file-entry full-path="Contents/header.xml" media-type="application/xml"/>
  <odf:file-entry full-path="Contents/section0.xml" media-type="application/xml"/>
</odf:manifest>`;
}

function buildContentHpf(title: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<opf:package xmlns:opf="http://www.idpf.org/2007/opf/" version="" unique-identifier="" id="">
  <opf:metadata>
    <opf:title>${escapeXml(title)}</opf:title>
    <opf:language>ko</opf:language>
    <opf:meta name="creator" content="JH Toolbox"/>
  </opf:metadata>
  <opf:manifest>
    <opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>
    <opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>
    <opf:item id="settings" href="settings.xml" media-type="application/xml"/>
  </opf:manifest>
  <opf:spine>
    <opf:itemref idref="header" linear="yes"/>
    <opf:itemref idref="section0" linear="yes"/>
  </opf:spine>
</opf:package>`;
}

function buildSettingsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0">
  <ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/>
</ha:HWPApplicationSetting>`;
}

function buildFontfaces() {
  const langs = ['HANGUL', 'LATIN', 'HANJA', 'JAPANESE', 'OTHER', 'SYMBOL', 'USER'];
  const faces = langs
    .map(
      (lang) => `    <hh:fontface lang="${lang}" fontCnt="1">
      <hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"/>
    </hh:fontface>`,
    )
    .join('\n');

  return `  <hh:fontfaces itemCnt="${langs.length}">
${faces}
  </hh:fontfaces>`;
}

function buildCharPr(style: CharStyle) {
  const height = Math.round(style.sizePt * 100);
  const bold = style.bold ? '<hh:bold/>' : '';

  return `    <hh:charPr id="${style.id}" height="${height}" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1">
      <hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
      <hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
      <hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
      <hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
      <hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>${bold}
    </hh:charPr>`;
}

function buildParaPr(style: ParaStyle) {
  const horizontal = style.align === 'center' ? 'CENTER' : 'JUSTIFY';

  return `    <hh:paraPr id="${style.id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">
      <hh:align horizontal="${horizontal}" vertical="BASELINE"/>
      <hh:heading type="NONE" idRef="0" level="0"/>
      <hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="BREAK_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>
      <hh:margin>
        <hc:intent value="0" unit="HWPUNIT"/>
        <hc:left value="0" unit="HWPUNIT"/>
        <hc:right value="0" unit="HWPUNIT"/>
        <hc:prev value="0" unit="HWPUNIT"/>
        <hc:next value="0" unit="HWPUNIT"/>
      </hh:margin>
      <hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/>
      <hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>
    </hh:paraPr>`;
}

function buildHeaderXml(charStyles: CharStyle[], paraStyles: ParaStyle[]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="${HP_NS}" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" version="1.4" secCnt="1">
  <hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>
  <hh:refList>
${buildFontfaces()}
  <hh:borderFills itemCnt="1">
    <hh:borderFill id="1" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">
      <hh:slash type="NONE" Crooked="0" isCounter="0"/>
      <hh:backSlash type="NONE" Crooked="0" isCounter="0"/>
      <hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/>
      <hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/>
      <hh:topBorder type="NONE" width="0.1 mm" color="#000000"/>
      <hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/>
      <hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>
    </hh:borderFill>
  </hh:borderFills>
  <hh:charProperties itemCnt="${charStyles.length}">
${charStyles.map(buildCharPr).join('\n')}
  </hh:charProperties>
  <hh:tabProperties itemCnt="1">
    <hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/>
  </hh:tabProperties>
  <hh:numberings itemCnt="1">
    <hh:numbering id="1" start="0">
      <hh:paraHead start="1" level="1" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="DIGIT" charPrIDRef="4294967295" checkable="0">^1.</hh:paraHead>
    </hh:numbering>
  </hh:numberings>
  <hh:paraProperties itemCnt="${paraStyles.length}">
${paraStyles.map(buildParaPr).join('\n')}
  </hh:paraProperties>
  <hh:styles itemCnt="1">
    <hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/>
  </hh:styles>
  </hh:refList>
</hh:head>`;
}

function buildSectionProperties() {
  return `<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">
        <hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0" strictVerticalAlignment="0"/>
        <hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>
        <hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>
        <hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/>
        <hp:pagePr landscape="WIDELY" width="${HWPX_PAGE.width}" height="${HWPX_PAGE.height}" gutterType="LEFT_ONLY">
          <hp:margin header="${HWPX_PAGE.header}" footer="${HWPX_PAGE.footer}" gutter="0" left="${HWPX_PAGE.marginLeft}" right="${HWPX_PAGE.marginRight}" top="${HWPX_PAGE.marginTop}" bottom="${HWPX_PAGE.marginBottom}"/>
        </hp:pagePr>
        <hp:footNotePr>
          <hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>
          <hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/>
          <hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/>
          <hp:numbering type="CONTINUOUS" newNum="1"/>
          <hp:placement place="EACH_COLUMN" beneathText="0"/>
        </hp:footNotePr>
        <hp:endNotePr>
          <hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>
          <hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/>
          <hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/>
          <hp:numbering type="CONTINUOUS" newNum="1"/>
          <hp:placement place="END_OF_DOCUMENT" beneathText="0"/>
        </hp:endNotePr>
        <hp:pageBorderFill type="BOTH" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER">
          <hp:offset left="1417" right="1417" top="1417" bottom="1417"/>
        </hp:pageBorderFill>
      </hp:secPr>`;
}

function buildParagraphXml(
  text: string,
  options: { id: number; paraPrId: number; charPrId: number; fontSizePt: number; first?: boolean; pageBreak?: boolean },
) {
  // Hangul keeps the section definition in its own control run, separate from
  // the text run; mixing <hp:secPr> with <hp:t> can leave the body blank.
  const secPrRun = options.first
    ? `<hp:run charPrIDRef="${options.charPrId}">${buildSectionProperties()}</hp:run>\n    `
    : '';

  // A <hp:linesegarray> with at least one segment is required for Hangul to
  // position the text; without it the body renders blank even when the text
  // is present. Hangul recomputes exact metrics on open, so approximate them.
  const vertSize = Math.max(600, Math.round(options.fontSizePt * 100));
  const baseline = Math.round(vertSize * 0.85);
  const spacing = Math.round(vertSize * 0.6);
  const lineSeg = `<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="${vertSize}" textheight="${vertSize}" baseline="${baseline}" spacing="${spacing}" horzpos="0" horzsize="${TEXT_AREA_WIDTH}" flags="393216"/></hp:linesegarray>`;

  return `  <hp:p id="${options.id}" paraPrIDRef="${options.paraPrId}" styleIDRef="0" pageBreak="${options.pageBreak ? '1' : '0'}" columnBreak="0" merged="0">
    ${secPrRun}<hp:run charPrIDRef="${options.charPrId}"><hp:t>${escapeXml(text)}</hp:t></hp:run>
    ${lineSeg}
  </hp:p>`;
}

type StyleTables = {
  charStyles: CharStyle[];
  paraStyles: ParaStyle[];
  charIdFor: (sizePt: number, bold: boolean) => number;
  paraIdFor: (align: 'left' | 'center') => number;
};

function buildStyleTables(pages: PdfStyledPage[]): StyleTables {
  const allSizes = pages.flatMap((page) => page.lines.map((line) => line.fontSize));
  const sizeCounts = new Map<number, number>();
  for (const size of allSizes) {
    sizeCounts.set(size, (sizeCounts.get(size) ?? 0) + 1);
  }

  let bodySize = 10;
  let bestCount = -1;
  for (const [size, count] of sizeCounts) {
    if (count > bestCount) {
      bestCount = count;
      bodySize = size;
    }
  }

  const charStyles: CharStyle[] = [{ id: 0, sizePt: bodySize, bold: false }];
  const charLookup = new Map<string, number>([[`${bodySize}:0`, 0]]);
  const paraStyles: ParaStyle[] = [{ id: 0, align: 'left' }];
  const paraLookup = new Map<'left' | 'center', number>([['left', 0]]);

  const charIdFor = (sizePt: number, bold: boolean) => {
    const key = `${sizePt}:${bold ? 1 : 0}`;
    const existing = charLookup.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const id = charStyles.length;
    charStyles.push({ id, sizePt, bold });
    charLookup.set(key, id);
    return id;
  };

  const paraIdFor = (align: 'left' | 'center') => {
    const existing = paraLookup.get(align);
    if (existing !== undefined) {
      return existing;
    }

    const id = paraStyles.length;
    paraStyles.push({ id, align });
    paraLookup.set(align, id);
    return id;
  };

  return { charStyles, paraStyles, charIdFor, paraIdFor };
}

function buildSectionXml(pages: PdfStyledPage[], styles: StyleTables) {
  const paragraphs: string[] = [];
  let paragraphId = 1;
  let isFirst = true;

  pages.forEach((page, pageIndex) => {
    const lines: PdfStyledLine[] =
      page.lines.length > 0 ? page.lines : [{ text: '', fontSize: styles.charStyles[0].sizePt, isHeading: false, align: 'left' }];

    lines.forEach((line, lineIndex) => {
      paragraphs.push(
        buildParagraphXml(line.text, {
          id: paragraphId,
          paraPrId: styles.paraIdFor(line.align),
          charPrId: styles.charIdFor(line.fontSize, line.isHeading),
          fontSizePt: line.fontSize,
          first: isFirst,
          pageBreak: pageIndex > 0 && lineIndex === 0,
        }),
      );
      paragraphId += 1;
      isFirst = false;
    });
  });

  if (paragraphs.length === 0) {
    paragraphs.push(buildParagraphXml('', { id: 1, paraPrId: 0, charPrId: 0, fontSizePt: 10, first: true }));
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="${HP_NS}" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">
${paragraphs.join('\n')}
</hs:sec>`;
}

function buildPreviewText(pages: PdfStyledPage[]) {
  return pages
    .map((page) => page.lines.map((line) => line.text).join('\n'))
    .join('\n')
    .trim()
    .slice(0, 2048);
}

async function buildHwpxBlob(pages: PdfStyledPage[], title: string): Promise<Blob> {
  const styles = buildStyleTables(pages);
  const sectionXml = buildSectionXml(pages, styles);
  const headerXml = buildHeaderXml(styles.charStyles, styles.paraStyles);

  const zip = new JSZip();

  // The OCF container expects the mimetype entry first and uncompressed.
  zip.file('mimetype', HWPX_MIME, { compression: 'STORE' });
  zip.file('version.xml', buildVersionXml());
  zip.file('settings.xml', buildSettingsXml());
  zip.folder('META-INF')?.file('container.xml', buildContainerXml());
  zip.folder('META-INF')?.file('manifest.xml', buildManifestXml());
  zip.folder('Contents')?.file('content.hpf', buildContentHpf(title));
  zip.folder('Contents')?.file('header.xml', headerXml);
  zip.folder('Contents')?.file('section0.xml', sectionXml);
  zip.folder('Preview')?.file('PrvText.txt', buildPreviewText(pages));

  return await zip.generateAsync({ type: 'blob', mimeType: HWPX_MIME, compression: 'DEFLATE' });
}

// ---------------------------------------------------------------------------
// HWPX -> HTML -> PDF (formatting-aware rendering)
// ---------------------------------------------------------------------------

type HwpxCharStyle = { sizePt: number; bold: boolean; italic: boolean; underline: boolean; color: string };
type HwpxParaStyle = { align: 'left' | 'center' | 'right' | 'justify' };

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function localName(node: Element) {
  return node.localName ?? node.nodeName.replace(/^.*:/, '');
}

function directChildrenByName(element: Element, name: string): Element[] {
  return Array.from(element.children).filter((child) => localName(child) === name);
}

function descendantsByName(element: Element, name: string): Element[] {
  return Array.from(element.getElementsByTagNameNS('*', name));
}

function normalizeColor(value: string | null): string | null {
  if (!value || value.toLowerCase() === 'none') {
    return null;
  }

  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : null;
}

function parseHeaderStyles(headerXml: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(headerXml, 'application/xml');
  const charStyles = new Map<string, HwpxCharStyle>();
  const paraStyles = new Map<string, HwpxParaStyle>();

  for (const charPr of descendantsByName(doc.documentElement, 'charPr')) {
    const id = charPr.getAttribute('id');
    if (id == null) {
      continue;
    }

    const height = Number(charPr.getAttribute('height') ?? '1000');
    charStyles.set(id, {
      sizePt: Number.isFinite(height) && height > 0 ? height / 100 : 10,
      bold: directChildrenByName(charPr, 'bold').length > 0,
      italic: directChildrenByName(charPr, 'italic').length > 0,
      underline: directChildrenByName(charPr, 'underline').length > 0,
      color: normalizeColor(charPr.getAttribute('textColor')) ?? '#111111',
    });
  }

  for (const paraPr of descendantsByName(doc.documentElement, 'paraPr')) {
    const id = paraPr.getAttribute('id');
    if (id == null) {
      continue;
    }

    const horizontal = (directChildrenByName(paraPr, 'align')[0]?.getAttribute('horizontal') ?? 'LEFT').toUpperCase();
    const align =
      horizontal === 'CENTER' ? 'center' : horizontal === 'RIGHT' ? 'right' : horizontal === 'JUSTIFY' ? 'justify' : 'left';
    paraStyles.set(id, { align });
  }

  return { charStyles, paraStyles };
}

async function buildBinDataMap(zip: JSZip): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const entries = Object.keys(zip.files).filter((name) => /^BinData\//i.test(name) && !zip.files[name].dir);

  for (const name of entries) {
    const fileName = name.split('/').pop() ?? name;
    const dotIndex = fileName.lastIndexOf('.');
    const stem = (dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName).toLowerCase();
    const ext = (dotIndex >= 0 ? fileName.slice(dotIndex + 1) : '').toLowerCase();
    const mime = IMAGE_MIME_BY_EXT[ext];
    if (!mime) {
      continue;
    }

    const base64 = await zip.file(name)?.async('base64');
    if (!base64) {
      continue;
    }

    const dataUrl = `data:${mime};base64,${base64}`;
    map.set(stem, dataUrl);
    map.set(fileName.toLowerCase(), dataUrl);
  }

  return map;
}

function charStyleToCss(style: HwpxCharStyle | undefined): string {
  if (!style) {
    return '';
  }

  const rules = [`font-size:${style.sizePt}pt`];
  if (style.bold) {
    rules.push('font-weight:700');
  }
  if (style.italic) {
    rules.push('font-style:italic');
  }
  if (style.underline) {
    rules.push('text-decoration:underline');
  }
  if (style.color && style.color !== '#111111') {
    rules.push(`color:${style.color}`);
  }

  return rules.join(';');
}

function renderRunText(run: Element, charStyles: Map<string, HwpxCharStyle>): string {
  const style = charStyles.get(run.getAttribute('charPrIDRef') ?? '');
  const text = descendantsByName(run, 't')
    .map((textNode) => textNode.textContent ?? '')
    .join('');

  if (!text) {
    return '';
  }

  const css = charStyleToCss(style);
  return css ? `<span style="${css}">${escapeHtml(text)}</span>` : escapeHtml(text);
}

function renderCellParagraphs(cell: Element, charStyles: Map<string, HwpxCharStyle>): string {
  const paragraphs = descendantsByName(cell, 'p');
  const lines = paragraphs
    .map((paragraph) =>
      directChildrenByName(paragraph, 'run')
        .map((run) => renderRunText(run, charStyles))
        .join(''),
    )
    .filter((line) => line.length > 0);

  return lines.length > 0 ? lines.join('<br>') : '&nbsp;';
}

function renderTable(table: Element, charStyles: Map<string, HwpxCharStyle>): string {
  const rows = descendantsByName(table, 'tr');
  if (rows.length === 0) {
    return '';
  }

  const renderedRows = rows
    .map((row) => {
      const cells = directChildrenByName(row, 'tc')
        .map((cell) => {
          const span = directChildrenByName(cell, 'cellSpan')[0];
          const colSpan = Number(span?.getAttribute('colSpan') ?? '1');
          const rowSpan = Number(span?.getAttribute('rowSpan') ?? '1');
          const colAttr = colSpan > 1 ? ` colspan="${colSpan}"` : '';
          const rowAttr = rowSpan > 1 ? ` rowspan="${rowSpan}"` : '';
          return `<td${colAttr}${rowAttr}>${renderCellParagraphs(cell, charStyles)}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  return `<table class="hwpx-table"><tbody>${renderedRows}</tbody></table>`;
}

function renderImage(picture: Element, binData: Map<string, string>): string {
  const imageRef = descendantsByName(picture, 'img')[0];
  const refId = imageRef?.getAttribute('binaryItemIDRef');
  if (!refId) {
    return '';
  }

  const dataUrl = binData.get(refId.toLowerCase());
  if (!dataUrl) {
    return '';
  }

  const size = descendantsByName(picture, 'sz')[0];
  const widthHwp = Number(size?.getAttribute('width') ?? '0');
  // HWPUNIT (1/7200in) -> CSS px at 96dpi: value / 75.
  const widthPx = widthHwp > 0 ? Math.round(widthHwp / 75) : 0;
  const widthStyle = widthPx > 0 ? `width:${widthPx}px;` : '';

  return `<div class="hwpx-image"><img style="${widthStyle}max-width:100%" src="${dataUrl}" alt=""/></div>`;
}

function renderParagraph(
  paragraph: Element,
  charStyles: Map<string, HwpxCharStyle>,
  paraStyles: Map<string, HwpxParaStyle>,
  binData: Map<string, string>,
): string {
  const paraStyle = paraStyles.get(paragraph.getAttribute('paraPrIDRef') ?? '');
  const blocks: string[] = [];
  let inlineHtml = '';

  for (const run of directChildrenByName(paragraph, 'run')) {
    for (const node of Array.from(run.children)) {
      const name = localName(node);
      if (name === 't') {
        const style = charStyles.get(run.getAttribute('charPrIDRef') ?? '');
        const text = node.textContent ?? '';
        if (text) {
          const css = charStyleToCss(style);
          inlineHtml += css ? `<span style="${css}">${escapeHtml(text)}</span>` : escapeHtml(text);
        }
      } else if (name === 'tbl') {
        if (inlineHtml) {
          blocks.push(`<p style="${paraStyleToCss(paraStyle)}">${inlineHtml}</p>`);
          inlineHtml = '';
        }
        blocks.push(renderTable(node, charStyles));
      } else if (name === 'pic' || name === 'picture' || name === 'container') {
        const image = renderImage(node, binData);
        if (image) {
          if (inlineHtml) {
            blocks.push(`<p style="${paraStyleToCss(paraStyle)}">${inlineHtml}</p>`);
            inlineHtml = '';
          }
          blocks.push(image);
        }
      }
    }
  }

  if (inlineHtml) {
    blocks.push(`<p style="${paraStyleToCss(paraStyle)}">${inlineHtml}</p>`);
  } else if (blocks.length === 0) {
    blocks.push('<p class="hwpx-empty">&nbsp;</p>');
  }

  return blocks.join('');
}

function paraStyleToCss(style: HwpxParaStyle | undefined): string {
  const align = style?.align ?? 'left';
  return `text-align:${align}`;
}

/**
 * Group every <hp:t> by its nearest <hp:p> ancestor so each paragraph yields
 * one text line regardless of nesting depth. Used as a robustness fallback
 * when the structured walk fails to capture an unfamiliar real-world layout.
 */
function collectParagraphTexts(doc: Document): string[] {
  const textNodes = descendantsByName(doc.documentElement, 't');
  const groups = new Map<Element, string[]>();
  const order: Element[] = [];

  for (const node of textNodes) {
    let paragraph: Element | null = node.parentElement;
    while (paragraph && localName(paragraph) !== 'p') {
      paragraph = paragraph.parentElement;
    }
    if (!paragraph) {
      continue;
    }

    const bucket = groups.get(paragraph);
    if (bucket) {
      bucket.push(node.textContent ?? '');
    } else {
      groups.set(paragraph, [node.textContent ?? '']);
      order.push(paragraph);
    }
  }

  return order.map((paragraph) => (groups.get(paragraph) ?? []).join('')).filter((text) => text.trim().length > 0);
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .trim();
}

function getSectionFileNames(zip: JSZip): string[] {
  return Object.keys(zip.files)
    .filter((name) => /^Contents\/section\d+\.xml$/i.test(name) && !zip.files[name].dir)
    .sort((left, right) => {
      const leftNumber = Number(left.match(/section(\d+)\.xml$/i)?.[1] ?? 0);
      const rightNumber = Number(right.match(/section(\d+)\.xml$/i)?.[1] ?? 0);
      return leftNumber - rightNumber;
    });
}

async function convertHwpxToHtml(zip: JSZip, title: string): Promise<string> {
  const sectionNames = getSectionFileNames(zip);
  if (sectionNames.length === 0) {
    throw new Error('This HWPX file does not contain readable section XML.');
  }

  const headerXml = await zip.file('Contents/header.xml')?.async('string');
  const { charStyles, paraStyles } = headerXml
    ? parseHeaderStyles(headerXml)
    : { charStyles: new Map<string, HwpxCharStyle>(), paraStyles: new Map<string, HwpxParaStyle>() };
  const binData = await buildBinDataMap(zip);

  const parser = new DOMParser();
  const sectionDocs: Document[] = [];
  let bodyParts: string[] = [];

  for (let index = 0; index < sectionNames.length; index += 1) {
    const xml = await zip.file(sectionNames[index])?.async('string');
    if (!xml) {
      continue;
    }

    const doc = parser.parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) {
      continue;
    }

    sectionDocs.push(doc);
    const sectionRoot = doc.documentElement;
    const paragraphs = directChildrenByName(sectionRoot, 'p');

    if (sectionDocs.length > 1) {
      bodyParts.push('<div class="hwpx-section-break"></div>');
    }

    for (const paragraph of paragraphs) {
      const rendered = renderParagraph(paragraph, charStyles, paraStyles, binData);
      if (rendered) {
        bodyParts.push(rendered);
      }
    }
  }

  // Defensive fallback: the structured walk above only follows the standard
  // <hs:sec> > <hp:p> > <hp:run> shape and fills empty paragraphs with
  // placeholders. If a real document nests text differently, the visible
  // result can be blank even though text exists, so re-render every <hp:t>
  // grouped by paragraph whenever the structured pass captured little text.
  const structuredText = stripHtmlToText(bodyParts.join(''));
  const fallbackByDoc = sectionDocs.map((doc) => collectParagraphTexts(doc));
  const fallbackText = fallbackByDoc.flat().join('').trim();

  if (fallbackText.length > 0 && structuredText.length < fallbackText.length * 0.5) {
    bodyParts = [];
    fallbackByDoc.forEach((paragraphTexts, index) => {
      if (index > 0) {
        bodyParts.push('<div class="hwpx-section-break"></div>');
      }
      for (const text of paragraphTexts) {
        bodyParts.push(`<p>${escapeHtml(text)}</p>`);
      }
    });
  }

  if (bodyParts.length === 0 || stripHtmlToText(bodyParts.join('')).length === 0) {
    bodyParts = ['<p>No extractable text was found in this HWPX document.</p>'];
  }

  const styleSheet = `
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 48px 56px;
      font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Nanum Gothic', sans-serif;
      font-size: 10pt;
      line-height: 1.6;
      color: #111111;
      background: #ffffff;
    }
    p { margin: 0 0 0.45em; white-space: pre-wrap; word-break: break-word; }
    p.hwpx-empty { margin: 0 0 0.45em; }
    table.hwpx-table { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
    table.hwpx-table td { border: 1px solid #888; padding: 4px 8px; vertical-align: top; }
    .hwpx-image { margin: 0.5em 0; }
    .hwpx-section-break { break-before: page; height: 24px; }
  `;

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(title)}</title>
<style>${styleSheet}</style>
</head>
<body>${bodyParts.join('\n')}</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Tool entry
// ---------------------------------------------------------------------------

export async function processHwpxTool(ctx: ProcessContext): Promise<ProcessedFile[]> {
  const { toolId, files, options, onProgress } = ctx;
  void options;

  if (toolId === 'pdf-to-hwpx') {
    if (!files.length) {
      throw new Error('Select a PDF file to convert.');
    }

    const source = files[0];
    const pages = await extractPdfStyledPages(source, (value) =>
      onProgress({ percent: 10 + value * 70, stage: 'Extracting PDF text' }),
    );

    onProgress({ percent: 85, stage: 'Building HWPX document' });
    const blob = await buildHwpxBlob(pages, baseName(source.name));

    return [
      {
        name: `${baseName(source.name)}.hwpx`,
        blob,
        mimeType: HWPX_MIME,
        metadata: {
          pages: pages.length,
          note: 'Text and heading sizes are preserved. Exact layout, columns, and images are not.',
        },
      },
    ];
  }

  if (toolId === 'hwpx-to-pdf') {
    if (!files.length) {
      throw new Error('Select an HWPX file to convert.');
    }

    const source = files[0];
    onProgress({ percent: 15, stage: 'Reading HWPX content' });
    const zip = await JSZip.loadAsync(await source.arrayBuffer());
    const html = await convertHwpxToHtml(zip, baseName(source.name));

    onProgress({ percent: 60, stage: 'Rendering PDF pages' });
    const blob = await renderHtmlStringToPdfBlob(html, A4_PX_WIDTH);

    return [
      {
        name: `${baseName(source.name)}.pdf`,
        blob,
        mimeType: 'application/pdf',
        metadata: {
          note: 'Formatting, tables, and images are rendered with browser fonts; pagination may differ.',
        },
      },
    ];
  }

  return [];
}
