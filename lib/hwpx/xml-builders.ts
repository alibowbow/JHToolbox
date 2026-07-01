/**
 * OWPML/HWPX XML builders for the raster (fidelity) package. Element names and
 * namespaces mirror the existing, shipping HWPX skeleton in
 * lib/processors/hwpx.ts; this module adds multi-section support and full-page
 * image (hp:pic / BinData) placement. No runtime dependencies → unit testable.
 *
 * Note: structural validity (well-formed XML, consistent refs, correct package
 * layout) is enforced by the validator and tests. Pixel-exact rendering in
 * Hancom Office still needs verification with a real fixture / engine.
 */

export const HWPX_MIME = 'application/hwp+zip';
const HP_NS = 'http://www.hancom.co.kr/hwpml/2011/paragraph';

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

export function buildVersionXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="1" buildNumber="0" os="10" xmlVersion="1.5" application="JH Toolbox" appVersion="1.0"/>`;
}

export function buildSettingsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0">
  <ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/>
</ha:HWPApplicationSetting>`;
}

export function buildContainerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf">
  <ocf:rootfiles>
    <ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>
  </ocf:rootfiles>
</ocf:container>`;
}

export function buildManifestXml(sectionCount: number, binItems: BinItem[]): string {
  const sections = Array.from({ length: sectionCount }, (_, index) =>
    `  <odf:file-entry full-path="Contents/section${index}.xml" media-type="application/xml"/>`,
  );
  const bins = binItems.map(
    (item) => `  <odf:file-entry full-path="${escapeXml(item.href)}" media-type="${escapeXml(item.mediaType)}"/>`,
  );
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">
  <odf:file-entry full-path="/" media-type="${HWPX_MIME}"/>
  <odf:file-entry full-path="Contents/header.xml" media-type="application/xml"/>
${sections.join('\n')}
${bins.join('\n')}
</odf:manifest>`;
}

export function buildContentHpf(title: string, sectionCount: number, binItems: BinItem[]): string {
  const sectionItems = Array.from({ length: sectionCount }, (_, index) =>
    `    <opf:item id="section${index}" href="Contents/section${index}.xml" media-type="application/xml"/>`,
  );
  const binItemsXml = binItems.map(
    (item) => `    <opf:item id="${escapeXml(item.id)}" href="${escapeXml(item.href)}" media-type="${escapeXml(item.mediaType)}" isEmbeded="1"/>`,
  );
  // Hancom lists the header as the first spine item, then every section in order.
  const spine = ['    <opf:itemref idref="header" linear="yes"/>']
    .concat(
      Array.from({ length: sectionCount }, (_, index) => `    <opf:itemref idref="section${index}" linear="yes"/>`),
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<opf:package xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:dc="http://purl.org/dc/elements/1.1/" version="" unique-identifier="" id="">
  <opf:metadata>
    <opf:title>${escapeXml(title)}</opf:title>
    <opf:language>ko</opf:language>
    <opf:meta name="creator" content="JH Toolbox"/>
  </opf:metadata>
  <opf:manifest>
    <opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>
${sectionItems.join('\n')}
${binItemsXml.join('\n')}
    <opf:item id="settings" href="settings.xml" media-type="application/xml"/>
  </opf:manifest>
  <opf:spine>
${spine}
  </opf:spine>
</opf:package>`;
}

// A charPr's <hh:fontRef> resolves a font id per language (hangul/latin/hanja/
// japanese/other/symbol/user). Hancom requires every one of those 7 languages
// to have a fontface list containing the referenced id — emitting only HANGUL
// leaves the other 6 refs dangling and Hancom refuses to open the file.
const FONT_LANGS = ['HANGUL', 'LATIN', 'HANJA', 'JAPANESE', 'OTHER', 'SYMBOL', 'USER'] as const;

function buildFontfaces(): string {
  const faces = FONT_LANGS.map(
    (lang) => `    <hh:fontface lang="${lang}" fontCnt="1">
      <hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"/>
    </hh:fontface>`,
  ).join('\n');
  return `  <hh:fontfaces itemCnt="${FONT_LANGS.length}">
${faces}
  </hh:fontfaces>`;
}

export function buildHeaderXml(sectionCount: number): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="${HP_NS}" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" version="1.4" secCnt="${sectionCount}">
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
        <hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>
        <hh:margin>
          <hc:intent value="0" unit="HWPUNIT"/>
          <hc:left value="0" unit="HWPUNIT"/>
          <hc:right value="0" unit="HWPUNIT"/>
          <hc:prev value="0" unit="HWPUNIT"/>
          <hc:next value="0" unit="HWPUNIT"/>
        </hh:margin>
        <hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/>
        <hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>
      </hh:paraPr>
    </hh:paraProperties>
    <hh:styles itemCnt="1">
      <hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/>
    </hh:styles>
  </hh:refList>
</hh:head>`;
}

function buildSecPr(widthHwp: number, heightHwp: number, landscape: boolean): string {
  const orient = landscape ? 'WIDELY' : 'NARROWLY';
  return `<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">
        <hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0" strictVerticalAlignment="0"/>
        <hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>
        <hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>
        <hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/>
        <hp:pagePr landscape="${orient}" width="${widthHwp}" height="${heightHwp}" gutterType="LEFT_ONLY">
          <hp:margin header="0" footer="0" gutter="0" left="0" right="0" top="0" bottom="0"/>
        </hp:pagePr>
      </hp:secPr>`;
}

function buildPicture(binItemId: string, widthHwp: number, heightHwp: number, instId: number): string {
  // Inline (treatAsChar) full-page image. Coordinates in HWPUNIT.
  return `<hp:pic reverse="0" id="${instId}" zOrder="0" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${instId}">
        <hp:sz width="${widthHwp}" widthRelTo="ABSOLUTE" height="${heightHwp}" heightRelTo="ABSOLUTE" protect="0"/>
        <hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>
        <hp:outMargin left="0" right="0" top="0" bottom="0"/>
        <hp:imgRect>
          <hc:pt0 x="0" y="0"/>
          <hc:pt1 x="${widthHwp}" y="0"/>
          <hc:pt2 x="${widthHwp}" y="${heightHwp}"/>
          <hc:pt3 x="0" y="${heightHwp}"/>
        </hp:imgRect>
        <hp:imgClip left="0" right="${widthHwp}" top="0" bottom="${heightHwp}"/>
        <hp:inMargin left="0" right="0" top="0" bottom="0"/>
        <hp:imgDim dimwidth="${widthHwp}" dimheight="${heightHwp}"/>
        <hp:img binaryItemIDRef="${escapeXml(binItemId)}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/>
        <hp:effects/>
      </hp:pic>`;
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
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="${HP_NS}" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">
  <hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="0">${buildSecPr(widthHwp, heightHwp, landscape)}${buildPicture(binItemId, widthHwp, heightHwp, instId)}</hp:run>
    ${lineSeg}
  </hp:p>
</hs:sec>`;
}
