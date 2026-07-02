import JSZip from 'jszip';
import type { RasterDocument } from '../document-model/types';
import type { BinItem } from './xml-builders';
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

/**
 * Assemble a fidelity HWPX package from a raster document (one full-page image
 * per page, one section per page so every page keeps its own size/orientation).
 * Input is plain bytes + sizes (no browser APIs), so this is fully unit testable.
 */
export async function writeRasterHwpx(doc: RasterDocument): Promise<Uint8Array> {
  if (!doc.pages.length) {
    throw new Error('Cannot build an HWPX document with no pages.');
  }

  const title = doc.metadata?.title?.trim() || 'Converted document';
  const sectionCount = doc.pages.length;

  const binItems: BinItem[] = doc.pages.map((page, index) => {
    const isJpeg = page.image.format === 'jpeg';
    return {
      id: `image${index + 1}`,
      href: `BinData/image${index + 1}.${isJpeg ? 'jpg' : 'png'}`,
      mediaType: isJpeg ? 'image/jpeg' : 'image/png',
    };
  });

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
  contents?.file('content.hpf', buildContentHpf(title, sectionCount, binItems, doc.metadata?.createdAtIso));
  contents?.file('header.xml', buildHeaderXml(sectionCount));

  const previewLines: string[] = [];
  doc.pages.forEach((page, index) => {
    const size = pdfPageToHwpPageSize(page.widthPt, page.heightPt);
    contents?.file(
      `section${index}.xml`,
      buildRasterSectionXml({
        widthHwp: size.widthHwp,
        heightHwp: size.heightHwp,
        landscape: size.landscape,
        binItemId: binItems[index].id,
        instId: index + 1,
      }),
    );
    zip.file(binItems[index].href, page.image.bytes);
    previewLines.push(`Page ${page.pageNumber}`);
  });

  zip.folder('Preview')?.file('PrvText.txt', previewLines.join('\n'));

  return await zip.generateAsync({ type: 'uint8array', mimeType: HWPX_MIME, compression: 'DEFLATE' });
}
