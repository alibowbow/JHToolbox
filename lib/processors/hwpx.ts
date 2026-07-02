import JSZip from 'jszip';
import { ProcessContext, ProcessedFile } from '@/types/processor';
import { baseName } from '@/lib/utils';
import { extractPdfStyledPages, renderHtmlStringToPdfBlob } from '@/lib/processors/pdf';
import { convertPdfToFidelityHwpx, resolveFidelityDpi } from '@/lib/hwpx/pdf-raster-converter';
import { writeTextHwpx } from '@/lib/hwpx/text-writer';
import { resolveReduceQuality } from '@/lib/pdf-reduction';
import { ZIP_LIMITS, checkZipBomb, sanitizeZipEntryName } from '@/lib/zip-safety';

const HWPX_MIME = 'application/hwp+zip';

// A4 width in CSS px at 96 dpi, used for the HWPX -> HTML -> PDF render width.
const A4_PX_WIDTH = 794;


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

/** HWPX is an untrusted ZIP — reject traversal paths, too many entries, and bombs. */
function assertSafeHwpxZip(zip: JSZip): void {
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (entries.length > ZIP_LIMITS.maxEntries) {
    throw new Error('This HWPX file has too many internal entries and was rejected.');
  }
  let totalBytes = 0;
  for (const entry of entries) {
    if (!sanitizeZipEntryName(entry.name)) {
      throw new Error(`This HWPX file contains an unsafe internal path and was rejected: "${entry.name}".`);
    }
    const sizes = (entry as unknown as { _data?: { uncompressedSize?: number; compressedSize?: number } })._data;
    const uncompressed = Number(sizes?.uncompressedSize ?? 0);
    if (checkZipBomb(uncompressed, Number(sizes?.compressedSize ?? 0), totalBytes)) {
      throw new Error('This HWPX file looks like a decompression bomb and was rejected.');
    }
    totalBytes += uncompressed;
  }
}

async function convertHwpxFileToPdf(
  source: File,
  onProgress: ProcessContext['onProgress'],
): Promise<ProcessedFile[]> {
  onProgress({ percent: 15, stage: 'Reading HWPX content' });
  const zip = await JSZip.loadAsync(await source.arrayBuffer());
  assertSafeHwpxZip(zip);
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

export async function processHwpxTool(ctx: ProcessContext): Promise<ProcessedFile[]> {
  const { toolId, files, options, onProgress } = ctx;

  if (toolId === 'pdf-to-hwpx') {
    if (!files.length) {
      throw new Error('Select a PDF or HWPX file to convert.');
    }

    const source = files[0];

    // Unified converter: the direction is picked from the input file, so one
    // menu entry covers PDF→HWPX and HWPX→PDF.
    if (/\.hwpx$/i.test(source.name)) {
      return await convertHwpxFileToPdf(source, onProgress);
    }

    const mode = String(options.mode ?? 'fidelity');

    if (mode === 'fidelity') {
      const imageFormat = options.imageFormat === 'jpeg' ? 'jpeg' : 'png';
      const { blob, pageCount } = await convertPdfToFidelityHwpx(
        source,
        {
          dpi: resolveFidelityDpi(options.dpi),
          imageFormat,
          jpegQuality: resolveReduceQuality(options.jpegQuality),
          maxPages: 300,
        },
        (percent, stage) => onProgress({ percent, stage }),
      );

      return [
        {
          name: `${baseName(source.name)}.hwpx`,
          blob,
          mimeType: HWPX_MIME,
          metadata: {
            mode: 'fidelity',
            pages: pageCount,
            note: 'Each page is placed as a full-page image at its original size. Visual fidelity is high, but text inside the page is not selectable or editable.',
          },
        },
      ];
    }

    // editable: extracted text as real HWPX paragraphs on the same
    // ground-truth package skeleton the fidelity mode uses.
    const pages = await extractPdfStyledPages(source, (value) =>
      onProgress({ percent: 10 + value * 70, stage: 'Extracting PDF text' }),
    );

    onProgress({ percent: 85, stage: 'Building HWPX document' });
    const bytes = await writeTextHwpx({
      pages: pages.map((page) => ({
        pageNumber: page.pageNumber,
        widthPt: page.widthPt,
        heightPt: page.heightPt,
        lines: page.lines.map((line) => ({
          text: line.text,
          fontSizePt: line.fontSize,
          bold: line.isHeading,
          align: line.align,
        })),
      })),
      metadata: {
        title: baseName(source.name),
        createdAtIso: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      },
    });
    const blob = new Blob([Uint8Array.from(bytes).buffer], { type: HWPX_MIME });

    return [
      {
        name: `${baseName(source.name)}.hwpx`,
        blob,
        mimeType: HWPX_MIME,
        metadata: {
          mode: 'editable',
          pages: pages.length,
          note: 'Text is fully selectable and editable, with font sizes, headings, and alignment preserved. Exact layout, columns, tables, and images are approximated — use "Keep original look" when appearance matters most.',
        },
      },
    ];
  }

  // Kept for the legacy /tools/pdf/hwpx-to-pdf URL (hidden from menus).
  if (toolId === 'hwpx-to-pdf') {
    if (!files.length) {
      throw new Error('Select an HWPX file to convert.');
    }

    return await convertHwpxFileToPdf(files[0], onProgress);
  }

  return [];
}
