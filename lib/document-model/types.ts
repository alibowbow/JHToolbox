/**
 * Intermediate document model for conversions. The "raster" subset is what the
 * PDF→HWPX fidelity mode produces: one full-page image per page, with the page's
 * physical size preserved. Editable-mode block types will extend this later.
 */

export interface RasterImage {
  /** Encoded image bytes (PNG or JPEG). */
  bytes: Uint8Array;
  format: 'png' | 'jpeg';
  /** Source pixel dimensions (informational). */
  pixelWidth: number;
  pixelHeight: number;
}

export interface RasterPage {
  pageNumber: number;
  /** Physical page size in PDF points (already accounting for rotation). */
  widthPt: number;
  heightPt: number;
  image: RasterImage;
}

export interface RasterDocument {
  pages: RasterPage[];
  metadata?: {
    title?: string;
    producer?: string;
  };
}
