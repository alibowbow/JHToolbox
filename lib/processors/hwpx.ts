import JSZip from 'jszip';
import { ProcessContext, ProcessedFile } from '@/types/processor';
import { baseName } from '@/lib/utils';
import {
  type PdfTextPage,
  type TextBlock,
  escapeXml,
  extractPdfTextPages,
  renderBlocksToPdfBlob,
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

function buildHeaderXml() {
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
  <hh:charProperties itemCnt="1">
    <hh:charPr id="0" height="1000" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1">
      <hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
      <hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
      <hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
      <hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
      <hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
    </hh:charPr>
  </hh:charProperties>
  <hh:tabProperties itemCnt="1">
    <hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/>
  </hh:tabProperties>
  <hh:numberings itemCnt="1">
    <hh:numbering id="1" start="0">
      <hh:paraHead start="1" level="1" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="DIGIT" charPrIDRef="4294967295" checkable="0">^1.</hh:paraHead>
    </hh:numbering>
  </hh:numberings>
  <hh:paraProperties itemCnt="1">
    <hh:paraPr id="0" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">
      <hh:align horizontal="JUSTIFY" vertical="BASELINE"/>
      <hh:heading type="NONE" idRef="0" level="0"/>
      <hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="BREAK_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>
      <hh:autoSpacing eAsianEng="0" eAsianNum="0"/>
      <hp:switch>
        <hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar">
          <hh:margin>
            <hc:intent value="0" unit="HWPUNIT"/>
            <hc:left value="0" unit="HWPUNIT"/>
            <hc:right value="0" unit="HWPUNIT"/>
            <hc:prev value="0" unit="HWPUNIT"/>
            <hc:next value="0" unit="HWPUNIT"/>
          </hh:margin>
          <hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/>
        </hp:case>
        <hp:default>
          <hh:margin>
            <hc:intent value="0" unit="HWPUNIT"/>
            <hc:left value="0" unit="HWPUNIT"/>
            <hc:right value="0" unit="HWPUNIT"/>
            <hc:prev value="0" unit="HWPUNIT"/>
            <hc:next value="0" unit="HWPUNIT"/>
          </hh:margin>
          <hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/>
        </hp:default>
      </hp:switch>
      <hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>
    </hh:paraPr>
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

function buildParagraphXml(text: string, options: { id: number; first?: boolean; pageBreak?: boolean }) {
  const secPr = options.first ? buildSectionProperties() : '';
  const safeText = escapeXml(text);

  return `  <hp:p id="${options.id}" paraPrIDRef="0" styleIDRef="0" pageBreak="${options.pageBreak ? '1' : '0'}" columnBreak="0" merged="0">
    <hp:run charPrIDRef="0">${secPr}<hp:t>${safeText}</hp:t></hp:run>
  </hp:p>`;
}

function buildSectionXml(pages: PdfTextPage[]) {
  const paragraphs: string[] = [];
  let paragraphId = 1;

  pages.forEach((page, pageIndex) => {
    const lines = page.lines.length > 0 ? page.lines : page.text ? [page.text] : [''];

    lines.forEach((line, lineIndex) => {
      paragraphs.push(
        buildParagraphXml(line, {
          id: paragraphId,
          first: paragraphId === 1,
          pageBreak: pageIndex > 0 && lineIndex === 0,
        }),
      );
      paragraphId += 1;
    });
  });

  if (paragraphs.length === 0) {
    paragraphs.push(buildParagraphXml('', { id: 1, first: true }));
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="${HP_NS}" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">
${paragraphs.join('\n')}
</hs:sec>`;
}

function buildPreviewText(pages: PdfTextPage[]) {
  const text = pages
    .map((page) => page.lines.join('\n') || page.text)
    .join('\n')
    .trim();

  return text.slice(0, 2048);
}

async function buildHwpxBlob(pages: PdfTextPage[], title: string): Promise<Blob> {
  const zip = new JSZip();

  // The OCF container expects the mimetype entry first and uncompressed.
  zip.file('mimetype', HWPX_MIME, { compression: 'STORE' });
  zip.file('version.xml', buildVersionXml());
  zip.file('settings.xml', buildSettingsXml());
  zip.folder('META-INF')?.file('container.xml', buildContainerXml());
  zip.folder('META-INF')?.file('manifest.xml', buildManifestXml());
  zip.folder('Contents')?.file('content.hpf', buildContentHpf(title));
  zip.folder('Contents')?.file('header.xml', buildHeaderXml());
  zip.folder('Contents')?.file('section0.xml', buildSectionXml(pages));
  zip.folder('Preview')?.file('PrvText.txt', buildPreviewText(pages));

  return await zip.generateAsync({ type: 'blob', mimeType: HWPX_MIME, compression: 'DEFLATE' });
}

function collectParagraphTexts(sectionXml: string): string[] {
  const parsed = new DOMParser().parseFromString(sectionXml, 'application/xml');
  if (parsed.getElementsByTagName('parsererror').length > 0) {
    return [];
  }

  // Group every text node by its nearest paragraph ancestor so nested
  // structures (tables, captions) don't duplicate or lose content.
  const textNodes = Array.from(parsed.getElementsByTagNameNS(HP_NS, 't'));
  const paragraphTexts = new Map<Element, string[]>();
  const paragraphOrder: Element[] = [];

  for (const textNode of textNodes) {
    let ancestor: Element | null = textNode.parentElement;
    while (ancestor && !(ancestor.namespaceURI === HP_NS && ancestor.localName === 'p')) {
      ancestor = ancestor.parentElement;
    }

    if (!ancestor) {
      continue;
    }

    const bucket = paragraphTexts.get(ancestor);
    if (bucket) {
      bucket.push(textNode.textContent ?? '');
    } else {
      paragraphTexts.set(ancestor, [textNode.textContent ?? '']);
      paragraphOrder.push(ancestor);
    }
  }

  return paragraphOrder
    .map((paragraph) => (paragraphTexts.get(paragraph) ?? []).join('').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

async function extractHwpxBlocks(file: File): Promise<TextBlock[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const sectionNames = Object.keys(zip.files)
    .filter((name) => /^Contents\/section\d+\.xml$/i.test(name))
    .sort((left, right) => {
      const leftNumber = Number(left.match(/section(\d+)\.xml$/i)?.[1] ?? 0);
      const rightNumber = Number(right.match(/section(\d+)\.xml$/i)?.[1] ?? 0);
      return leftNumber - rightNumber;
    });

  if (sectionNames.length === 0) {
    throw new Error('This HWPX file does not contain readable section XML.');
  }

  const blocks: TextBlock[] = [{ kind: 'title', text: baseName(file.name) }];
  let extractedAny = false;

  for (let index = 0; index < sectionNames.length; index += 1) {
    const xml = await zip.file(sectionNames[index])?.async('string');
    if (!xml) {
      continue;
    }

    const paragraphs = collectParagraphTexts(xml);
    if (paragraphs.length > 0) {
      extractedAny = true;
      paragraphs.forEach((paragraph) => blocks.push({ kind: 'body', text: paragraph }));
    }

    if (index < sectionNames.length - 1) {
      blocks.push({ kind: 'page-break' });
    }
  }

  if (!extractedAny) {
    blocks.push({ kind: 'body', text: 'No extractable text was found in this HWPX document.' });
  }

  return blocks;
}

export async function processHwpxTool(ctx: ProcessContext): Promise<ProcessedFile[]> {
  const { toolId, files, options, onProgress } = ctx;
  void options;

  if (toolId === 'pdf-to-hwpx') {
    if (!files.length) {
      throw new Error('Select a PDF file to convert.');
    }

    const source = files[0];
    const pages = await extractPdfTextPages(source, (value) =>
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
          note: 'Text-focused conversion. Layout, images, and tables are not preserved.',
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
    const blocks = await extractHwpxBlocks(source);

    onProgress({ percent: 60, stage: 'Rendering PDF pages' });
    const blob = await renderBlocksToPdfBlob(blocks);

    return [
      {
        name: `${baseName(source.name)}.pdf`,
        blob,
        mimeType: 'application/pdf',
        metadata: {
          note: 'Text-focused conversion rendered with browser fonts.',
        },
      },
    ];
  }

  return [];
}
