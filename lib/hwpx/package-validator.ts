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

    if (spineRefs.length !== sectionCount) {
      errors.push(`spine has ${spineRefs.length} section refs but manifest lists ${sectionCount} sections`);
    }
    for (const ref of spineRefs) {
      if (!itemIds.includes(ref)) {
        errors.push(`spine references unknown item "${ref}"`);
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
  }

  return { ok: errors.length === 0, errors, info: { sectionCount, binDataCount, pageSizes } };
}
