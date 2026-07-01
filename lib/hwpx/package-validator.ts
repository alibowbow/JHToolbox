import JSZip from 'jszip';
import { XMLValidator } from 'fast-xml-parser';

export interface HwpxValidationResult {
  ok: boolean;
  errors: string[];
  info: {
    sectionCount: number;
    binDataCount: number;
    pageSizes: Array<{ widthHwp: number; heightHwp: number }>;
  };
}

function matchAll(text: string, re: RegExp): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  while ((m = r.exec(text)) !== null) {
    out.push(m[1]);
  }
  return out;
}

/** 0xFFFFFFFF — the OWPML sentinel meaning "no reference". */
const NONE_REF = '4294967295';

/** Extract `name="value"` attributes from a tag's attribute string. */
function attrsOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  let a: RegExpExecArray | null;
  const re = /([\w:.-]+)="([^"]*)"/g;
  while ((a = re.exec(tag)) !== null) {
    out[a[1]] = a[2];
  }
  return out;
}

/**
 * Validate that every id-reference in header.xml (and each section's paragraph/
 * run/style refs) resolves to a defined element. These are exactly the refs
 * Hancom's OWPML loader dereferences on open; a dangling one aborts the load.
 */
async function validateHeaderRefs(
  headerText: string,
  zip: JSZip,
  sectionItems: string[],
  itemHrefs: Record<string, string>,
  errors: string[],
): Promise<void> {
  // fontface language -> set of font ids it defines.
  const fontsByLang: Record<string, Set<string>> = {};
  let fm: RegExpExecArray | null;
  const faceRe = /<hh:fontface\b([^>]*)>([\s\S]*?)<\/hh:fontface>/g;
  while ((fm = faceRe.exec(headerText)) !== null) {
    const lang = attrsOf(fm[1]).lang;
    if (!lang) continue;
    const ids = (fontsByLang[lang] ||= new Set<string>());
    for (const id of matchAll(fm[2], /<hh:font\b[^>]*\bid="([^"]+)"/)) ids.add(id);
  }

  const borderFillIds = new Set(matchAll(headerText, /<hh:borderFill\b[^>]*\bid="([^"]+)"/));
  const tabPrIds = new Set(matchAll(headerText, /<hh:tabPr\b[^>]*\bid="([^"]+)"/));
  const charPrIds = new Set(matchAll(headerText, /<hh:charPr\b[^>]*\bid="([^"]+)"/));
  const paraPrIds = new Set(matchAll(headerText, /<hh:paraPr\b[^>]*\bid="([^"]+)"/));
  const styleIds = new Set(matchAll(headerText, /<hh:style\b[^>]*\bid="([^"]+)"/));

  const FONTREF_LANG: Record<string, string> = {
    hangul: 'HANGUL', latin: 'LATIN', hanja: 'HANJA', japanese: 'JAPANESE',
    other: 'OTHER', symbol: 'SYMBOL', user: 'USER',
  };
  const resolves = (ref: string | undefined, set: Set<string>): boolean =>
    ref === undefined || ref === NONE_REF || set.has(ref);

  // charPr: font references (one per language) + optional char borderFill.
  let cm: RegExpExecArray | null;
  const charPrRe = /<hh:charPr\b([^>]*)>([\s\S]*?)<\/hh:charPr>/g;
  while ((cm = charPrRe.exec(headerText)) !== null) {
    const head = attrsOf(cm[1]);
    if (!resolves(head.borderFillIDRef, borderFillIds)) {
      errors.push(`header charPr ${head.id}: borderFillIDRef="${head.borderFillIDRef}" is not defined`);
    }
    const fontRef = /<hh:fontRef\b([^>]*)\/>/.exec(cm[2]);
    if (fontRef) {
      const fr = attrsOf(fontRef[1]);
      for (const [attr, lang] of Object.entries(FONTREF_LANG)) {
        const ref = fr[attr];
        if (ref === undefined || ref === NONE_REF) continue;
        if (!fontsByLang[lang]?.has(ref)) {
          errors.push(`header charPr ${head.id}: fontRef ${attr}="${ref}" has no matching ${lang} fontface`);
        }
      }
    }
  }

  // paraPr: tab reference + optional paragraph borderFill.
  let pm: RegExpExecArray | null;
  const paraPrRe = /<hh:paraPr\b([^>]*)>([\s\S]*?)<\/hh:paraPr>/g;
  while ((pm = paraPrRe.exec(headerText)) !== null) {
    const head = attrsOf(pm[1]);
    if (!resolves(head.tabPrIDRef, tabPrIds)) {
      errors.push(`header paraPr ${head.id}: tabPrIDRef="${head.tabPrIDRef}" is not defined`);
    }
    const border = /<hh:border\b([^>]*)\/>/.exec(pm[2]);
    const bf = border ? attrsOf(border[1]).borderFillIDRef : undefined;
    if (!resolves(bf, borderFillIds)) {
      errors.push(`header paraPr ${head.id}: border borderFillIDRef="${bf}" is not defined`);
    }
  }

  // styles: paragraph + character property references.
  let sm: RegExpExecArray | null;
  const styleRe = /<hh:style\b([^>]*?)\/?>/g;
  while ((sm = styleRe.exec(headerText)) !== null) {
    const s = attrsOf(sm[1]);
    if (!resolves(s.paraPrIDRef, paraPrIds)) {
      errors.push(`header style ${s.id}: paraPrIDRef="${s.paraPrIDRef}" is not defined`);
    }
    if (!resolves(s.charPrIDRef, charPrIds)) {
      errors.push(`header style ${s.id}: charPrIDRef="${s.charPrIDRef}" is not defined`);
    }
  }

  // Each section's paragraph/run/style references must resolve to header ids.
  for (const id of sectionItems) {
    const file = zip.file(itemHrefs[id]);
    if (!file) continue;
    const sectionText = await file.async('string');
    const checkRefs = (attr: string, set: Set<string>) => {
      for (const ref of matchAll(sectionText, new RegExp(`\\b${attr}="([^"]+)"`))) {
        if (!resolves(ref, set)) errors.push(`${itemHrefs[id]}: ${attr}="${ref}" is not defined in header`);
      }
    };
    checkRefs('charPrIDRef', charPrIds);
    checkRefs('paraPrIDRef', paraPrIds);
    checkRefs('styleIDRef', styleIds);
  }
}

/**
 * Structurally validate an HWPX package: mimetype, required parts, well-formed
 * XML, spine/section/BinData reference integrity, unique ids, and page sizes.
 * This proves the package is internally consistent; it does not guarantee a
 * particular office app renders it pixel-perfectly.
 */
export async function validateHwpxStructure(bytes: Uint8Array): Promise<HwpxValidationResult> {
  const errors: string[] = [];
  const pageSizes: Array<{ widthHwp: number; heightHwp: number }> = [];

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (cause) {
    return {
      ok: false,
      errors: [`Not a valid ZIP: ${cause instanceof Error ? cause.message : 'unknown'}`],
      info: { sectionCount: 0, binDataCount: 0, pageSizes: [] },
    };
  }

  const entryNames = Object.keys(zip.files).filter((name) => !zip.files[name].dir);

  if (entryNames[0] !== 'mimetype') {
    errors.push(`mimetype must be the first entry (found "${entryNames[0]}")`);
  }
  const mimetypeFile = zip.file('mimetype');
  if (!mimetypeFile) {
    errors.push('mimetype entry is missing');
  } else if ((await mimetypeFile.async('string')).trim() !== 'application/hwp+zip') {
    errors.push('mimetype value must be application/hwp+zip');
  }

  for (const required of ['version.xml', 'Contents/content.hpf', 'Contents/header.xml', 'META-INF/container.xml']) {
    if (!zip.file(required)) {
      errors.push(`missing required part: ${required}`);
    }
  }

  // Every XML/HPF part must be well-formed.
  for (const name of entryNames.filter((n) => /\.(xml|hpf)$/i.test(n))) {
    const text = await zip.file(name)!.async('string');
    const result = XMLValidator.validate(text);
    if (result !== true) {
      errors.push(`malformed XML in ${name}: ${result.err.msg}`);
    }
  }

  // content.hpf manifest + spine integrity.
  const hpf = zip.file('Contents/content.hpf');
  let sectionCount = 0;
  let binDataCount = 0;
  if (hpf) {
    const text = await hpf.async('string');
    const itemIds = matchAll(text, /<opf:item\s+id="([^"]+)"/);
    const itemHrefs: Record<string, string> = {};
    let m: RegExpExecArray | null;
    const itemRe = /<opf:item\s+id="([^"]+)"\s+href="([^"]+)"/g;
    while ((m = itemRe.exec(text)) !== null) {
      itemHrefs[m[1]] = m[2];
    }
    const spineRefs = matchAll(text, /<opf:itemref\s+idref="([^"]+)"/);

    if (new Set(itemIds).size !== itemIds.length) {
      errors.push('duplicate manifest item id in content.hpf');
    }

    const sectionItems = itemIds.filter((id) => /^section\d+$/.test(id));
    sectionCount = sectionItems.length;
    const binItems = itemIds.filter((id) => itemHrefs[id]?.startsWith('BinData/'));
    binDataCount = binItems.length;

    // The spine may carry non-section items (Hancom lists "header" first), but
    // every spine ref must resolve and every section must appear in the spine.
    for (const ref of spineRefs) {
      if (!itemIds.includes(ref)) {
        errors.push(`spine references unknown item "${ref}"`);
      }
    }
    for (const sec of sectionItems) {
      if (!spineRefs.includes(sec)) {
        errors.push(`spine is missing section "${sec}"`);
      }
    }
    // Section + BinData files must exist; section binaryItemIDRefs must resolve.
    for (const id of sectionItems) {
      const href = itemHrefs[id];
      const file = zip.file(href);
      if (!file) {
        errors.push(`section file missing: ${href}`);
        continue;
      }
      const sectionText = await file.async('string');
      for (const ref of matchAll(sectionText, /binaryItemIDRef="([^"]+)"/)) {
        if (!itemIds.includes(ref)) {
          errors.push(`${href} references unknown binaryItemIDRef "${ref}"`);
        }
      }
      const sizeMatch = /<hp:pagePr[^>]*\swidth="(\d+)"[^>]*\sheight="(\d+)"/.exec(sectionText);
      if (sizeMatch) {
        pageSizes.push({ widthHwp: Number(sizeMatch[1]), heightHwp: Number(sizeMatch[2]) });
      } else {
        errors.push(`${href} has no hp:pagePr size`);
      }
    }
    for (const id of binItems) {
      if (!zip.file(itemHrefs[id])) {
        errors.push(`BinData file missing for manifest item "${id}": ${itemHrefs[id]}`);
      }
    }

    // Header refList integrity. A dangling font/borderFill/style reference makes
    // Hancom refuse to open the file even though the ZIP and every XML part are
    // well-formed — so structural checks above are necessary but not sufficient.
    const headerFile = zip.file('Contents/header.xml');
    if (headerFile) {
      await validateHeaderRefs(await headerFile.async('string'), zip, sectionItems, itemHrefs, errors);
    }
  }

  return { ok: errors.length === 0, errors, info: { sectionCount, binDataCount, pageSizes } };
}
