/**
 * Turns any image file into an ImageBitmap:
 * - EXIF orientation is applied, so phone photos are not saved sideways;
 * - SVG (which Chrome's createImageBitmap rejects) goes through <img>;
 * - TIFF, which only Safari decodes natively, goes through UTIF.
 */
export async function decodeImage(file: Blob): Promise<ImageBitmap> {
  const name = file instanceof File ? file.name : 'image';

  if (file.type === 'image/tiff' || /\.tiff?$/i.test(name)) {
    try {
      return await decodeTiff(file);
    } catch {
      // Fall through: Safari can decode TIFF itself.
    }
  }

  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    try {
      return await decodeWithImageElement(file);
    } catch {
      throw new Error(`Could not open "${name}".`);
    }
  }
}

async function decodeWithImageElement(file: Blob): Promise<ImageBitmap> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    // An SVG without width/height has no intrinsic size.
    const width = image.naturalWidth || 1024;
    const height = image.naturalHeight || Math.round((1024 * (image.height || 1)) / (image.width || 1)) || 1024;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas unavailable.');
    }
    context.drawImage(image, 0, 0, width, height);
    return await createImageBitmap(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function decodeTiff(file: Blob): Promise<ImageBitmap> {
  const utifModule: any = await import('utif');
  const UTIF = utifModule.default ?? utifModule;
  const buffer = await file.arrayBuffer();
  const [first] = UTIF.decode(buffer);
  if (!first) {
    throw new Error('The image could not be decoded.');
  }
  UTIF.decodeImage(buffer, first);
  const rgba: Uint8Array = UTIF.toRGBA8(first);
  const pixels = new Uint8ClampedArray(rgba);
  return await createImageBitmap(new ImageData(pixels, first.width, first.height));
}

/** Output type that keeps the input's format where browsers can encode it. */
export function preferredOutputType(file: Blob): 'image/jpeg' | 'image/webp' | 'image/png' {
  if (file.type === 'image/jpeg' || file.type === 'image/jpg') return 'image/jpeg';
  if (file.type === 'image/webp') return 'image/webp';
  return 'image/png';
}
