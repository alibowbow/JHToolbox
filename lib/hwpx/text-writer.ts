import { assembleHwpxPackage } from './package-writer';
import { pdfPageToHwpPageSize } from './units';
import type { HeaderCharPrExtra, HeaderParaPrExtra, TextParagraph } from './xml-builders';
import { STANDARD_MARGINS, buildTextSectionXml } from './xml-builders';

/**
 * Flowing-text document model for the "editable" PDF→HWPX mode: one entry per
 * extracted text line, with the styling signals the PDF reliably provides
 * (font size, heading/bold guess, left/center alignment).
 */
export interface TextLine {
  text: string;
  fontSizePt: number;
  bold: boolean;
  align: 'left' | 'center';
}

export interface TextPage {
  pageNumber: number;
  /** Physical page size in PDF points (rotation applied). */
  widthPt: number;
  heightPt: number;
  lines: TextLine[];
}

export interface TextDocument {
  pages: TextPage[];
  metadata?: {
    title?: string;
    createdAtIso?: string;
  };
}

/** First dynamic ids after the fixed header tables (7 charPr, 16 paraPr). */
const CHAR_PR_BASE = 7;
const PARA_PR_BASE = 16;
/** Base paraPr id 0 is the LEFT-aligned body entry in the fixed table. */
export const LEFT_PARA_PR = 0;

/** Deduplicate (font size, bold) combos into dynamic header charPr entries. */
export function createCharPrRegistry() {
  const extras: HeaderCharPrExtra[] = [];
  const byKey = new Map<string, number>();
  return {
    extras,
    idFor(fontSizePt: number, bold: boolean): number {
      const height = Math.max(400, Math.round(fontSizePt * 100));
      const key = `${height}:${bold ? 1 : 0}`;
      const existing = byKey.get(key);
      if (existing !== undefined) {
        return existing;
      }
      const id = CHAR_PR_BASE + extras.length;
      extras.push({ id, height, bold });
      byKey.set(key, id);
      return id;
    },
  };
}

/**
 * Build an editable HWPX from extracted text: real page sizes, standard
 * margins, one paragraph per line, one section per page. Text stays fully
 * selectable/editable in Hangul; exact PDF layout is approximated, not
 * reproduced. Pure bytes in/out → unit testable without a browser.
 */
export async function writeTextHwpx(doc: TextDocument): Promise<Uint8Array> {
  if (!doc.pages.length) {
    throw new Error('Cannot build an HWPX document with no pages.');
  }

  const charPrRegistry = createCharPrRegistry();
  const charPrIdFor = charPrRegistry.idFor;

  // Only CENTER needs a dynamic paragraph entry; LEFT maps to the base table.
  const paraPrExtras: HeaderParaPrExtra[] = [];
  let centerParaPrId: number | null = null;
  const paraPrIdFor = (align: 'left' | 'center'): number => {
    if (align === 'left') {
      return LEFT_PARA_PR;
    }
    if (centerParaPrId === null) {
      centerParaPrId = PARA_PR_BASE + paraPrExtras.length;
      paraPrExtras.push({ id: centerParaPrId, align: 'CENTER' });
    }
    return centerParaPrId;
  };

  const sectionXmls = doc.pages.map((page) => {
    const size = pdfPageToHwpPageSize(page.widthPt, page.heightPt);
    // Clamp the standard margins only when a page is unusually small, so at
    // least half of each dimension stays usable as the text column.
    const margins = {
      ...STANDARD_MARGINS,
      left: Math.min(STANDARD_MARGINS.left, Math.floor(size.widthHwp / 4)),
      right: Math.min(STANDARD_MARGINS.right, Math.floor(size.widthHwp / 4)),
      top: Math.min(STANDARD_MARGINS.top, Math.floor(size.heightHwp / 4)),
      bottom: Math.min(STANDARD_MARGINS.bottom, Math.floor(size.heightHwp / 4)),
    };
    const paragraphs: TextParagraph[] = page.lines.map((line) => ({
      text: line.text,
      charPrId: charPrIdFor(line.fontSizePt, line.bold),
      paraPrId: paraPrIdFor(line.align),
      fontSizePt: line.fontSizePt,
    }));
    return buildTextSectionXml({
      widthHwp: size.widthHwp,
      heightHwp: size.heightHwp,
      landscape: size.landscape,
      margins,
      paragraphs,
    });
  });

  const allText = doc.pages.flatMap((page) => page.lines.map((line) => line.text)).join('\n');

  return await assembleHwpxPackage({
    title: doc.metadata?.title?.trim() || 'Converted document',
    createdAtIso: doc.metadata?.createdAtIso,
    sectionXmls,
    binItems: [],
    binData: [],
    headerExtras: { charPrs: charPrRegistry.extras, paraPrs: paraPrExtras },
    previewText: allText.slice(0, 1000) || 'Converted document',
  });
}
