/**
 * Tools that make sense after a result of a given type — offered as
 * "continue with…" on result cards. Order is by how often it is the next step.
 */
type Rule = { test: (mimeType: string, fileName: string) => boolean; toolIds: string[] };

const extension = (fileName: string) => fileName.toLowerCase().split('.').pop() ?? '';

const RULES: Rule[] = [
  {
    test: (mime, name) => mime === 'application/pdf' || extension(name) === 'pdf',
    toolIds: ['pdf-reduce-size', 'pdf-merge', 'pdf-to-image', 'pdf-add-page-numbers', 'pdf-watermark', 'pdf-sign', 'pdf-rotate', 'pdf-split', 'pdf-redact', 'ocr-pdf-to-text'],
  },
  {
    test: (mime) => mime.startsWith('image/'),
    toolIds: ['image-compress', 'image-resize', 'image-convert', 'image-crop', 'image-to-pdf', 'image-watermark', 'ocr-image-to-text'],
  },
  {
    test: (mime) => mime.startsWith('video/'),
    toolIds: ['video-compress', 'video-convert', 'video-trim', 'mute-video', 'extract-audio', 'video-thumbnail-generator'],
  },
  { test: (mime, name) => mime.startsWith('text/csv') || extension(name) === 'csv', toolIds: ['csv-excel', 'csv-json', 'split-csv'] },
  { test: (mime, name) => mime.includes('json') || extension(name) === 'json', toolIds: ['json-csv', 'json-xml'] },
  { test: (mime, name) => mime.includes('xml') || extension(name) === 'xml', toolIds: ['xml-csv', 'xml-json'] },
  { test: (_mime, name) => ['xlsx', 'xls'].includes(extension(name)), toolIds: ['excel-to-pdf', 'excel-csv'] },
  { test: (_mime, name) => extension(name) === 'docx', toolIds: ['word-to-pdf'] },
  { test: (_mime, name) => extension(name) === 'hwpx', toolIds: ['pdf-to-hwpx'] },
];

/** Suggested next tools for these files: ones that fit every file, without `excludeToolId`. */
export function nextToolIds(files: Array<{ mimeType: string; name: string }>, excludeToolId: string, limit = 6): string[] {
  if (files.length === 0) {
    return [];
  }
  const perFile = files.map((file) => new Set(RULES.filter((rule) => rule.test(file.mimeType, file.name)).flatMap((rule) => rule.toolIds)));
  const [first, ...rest] = perFile;
  const shared = [...first].filter((toolId) => toolId !== excludeToolId && rest.every((set) => set.has(toolId)));
  // Several results can always be bundled into one ZIP.
  const bundle = files.length > 1 && excludeToolId !== 'create-zip' ? ['create-zip'] : [];
  return [...shared.slice(0, limit - bundle.length), ...bundle];
}
