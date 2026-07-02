import JSZip from 'jszip';
import type { RasterDocument } from '../document-model/types';
import type { BinItem, HeaderExtras } from './xml-builders';
import { pdfPageToHwpPageSize } from './units';
import {
  HWPX_MIME,
  buildContainerRdf,
  buildContainerXml,
  buildContentHpf,
  buildHeaderXml,
  buildManifestXml,
  buildRasterSectionXml,
  buildSettingsXml,
  buildVersionXml,
} from './xml-builders';

interface PackageInput {
  title: string;
  createdAtIso?: string;
  sectionXmls: string[];
  binItems: BinItem[];
  binData: Uint8Array[];
  headerExtras?: HeaderExtras;
  previewText: string;
}

/**
 * Assemble an HWPX ZIP with the exact part set real Hancom containers carry:
 * mimetype first + stored, version/settings, META-INF (container.xml, empty
 * manifest.xml, container.rdf), content.hpf, header, sections, BinData,
 * Preview/PrvText.txt.
 */
export async function assembleHwpxPackage(input: PackageInput): Promise<Uint8Array> {
  const sectionCount = input.sectionXmls.length;
  const zip = new JSZip();
  // mimetype MUST be the first entry and stored uncompressed.
  zip.file('mimetype', HWPX_MIME, { compression: 'STORE' });
  zip.file('version.xml', buildVersionXml());
  zip.file('settings.xml', buildSettingsXml());

  const metaInf = zip.folder('META-INF');
  metaInf?.file('container.xml', buildContainerXml());
  metaInf?.file('manifest.xml', buildManifestXml());
  metaInf?.file('container.rdf', buildContainerRdf(sectionCount));

  const contents = zip.folder('Contents');
  contents?.file('content.hpf', buildContentHpf(input.title, sectionCount, input.binItems, input.createdAtIso));
  contents?.file('header.xml', buildHeaderXml(sectionCount, input.headerExtras));
  input.sectionXmls.forEach((xml, index) => contents?.file(`section${index}.xml`, xml));

  input.binItems.forEach((item, index) => zip.file(item.href, input.binData[index]));
  zip.folder('Preview')?.file('PrvText.txt', input.previewText);

  return await zip.generateAsync({ type: 'uint8array', mimeType: HWPX_MIME, compression: 'DEFLATE' });
}

/**
 * Assemble a fidelity HWPX package from a raster document (one full-page image
 * per page, one section per page so every page keeps its own size/orientation).
 * Input is plain bytes + sizes (no browser APIs), so this is fully unit testable.
 */
export async function writeRasterHwpx(doc: RasterDocument): Promise<Uint8Array> {
  if (!doc.pages.length) {
    throw new Error('Cannot build an HWPX document with no pages.');
  }

  const binItems: BinItem[] = doc.pages.map((page, index) => {
    const isJpeg = page.image.format === 'jpeg';
    return {
      id: `image${index + 1}`,
      href: `BinData/image${index + 1}.${isJpeg ? 'jpg' : 'png'}`,
      mediaType: isJpeg ? 'image/jpeg' : 'image/png',
    };
  });

  const sectionXmls = doc.pages.map((page, index) => {
    const size = pdfPageToHwpPageSize(page.widthPt, page.heightPt);
    return buildRasterSectionXml({
      widthHwp: size.widthHwp,
      heightHwp: size.heightHwp,
      landscape: size.landscape,
      binItemId: binItems[index].id,
      instId: index + 1,
    });
  });

  return await assembleHwpxPackage({
    title: doc.metadata?.title?.trim() || 'Converted document',
    createdAtIso: doc.metadata?.createdAtIso,
    sectionXmls,
    binItems,
    binData: doc.pages.map((page) => page.image.bytes),
    previewText: doc.pages.map((page) => `Page ${page.pageNumber}`).join('\n'),
  });
}
