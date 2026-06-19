/**
 * Generates docs/tool-capability-matrix.md from the real tool registry, so the
 * matrix never drifts from the shipped tools.
 *
 *   node --experimental-strip-types scripts/gen-capability-matrix.mjs
 *
 * Fields that can be derived accurately from source are filled in. Fields that
 * require per-tool runtime verification not yet completed for all 100 tools
 * (exact output MIME, memory grade, per-tool loss/limitations, maturity) are
 * marked "—" and tracked in docs/audit-findings.md rather than guessed.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function loadStripped(relPath) {
  let src = fs.readFileSync(relPath, 'utf8');
  src = src.replace(/^import\s+(?:type\s+)?\{[^}]*\}\s+from\s+'@\/[^']+';\s*$/gm, '// stripped');
  const tmp = path.join(os.tmpdir(), `gen-${path.basename(relPath, '.ts')}-${Date.now()}.ts`);
  fs.writeFileSync(tmp, src);
  return import(tmp);
}

const reg = await loadStripped('lib/tool-registry.ts');
const browsable = reg.getBrowsableTools();

const ENGINE_BY_CATEGORY = {
  pdf: 'pdf-lib / pdf.js',
  image: 'Canvas / browser-image-compression',
  ocr: 'tesseract.js + pdf.js',
  video: 'ffmpeg.wasm',
  audio: 'ffmpeg.wasm / WebAudio',
  file: 'papaparse / jszip',
  web: 'external provider (fetch)',
  screen: 'MediaRecorder / getDisplayMedia',
};

// Network classification is explicit, not category-wide: only these send data off-device.
const PROVIDERS = {
  'url-image': 'Microlink, thum.io, images.weserv.nl',
  'url-pdf': 'Microlink, thum.io, images.weserv.nl',
  'detect-cms': 'r.jina.ai (CORS mirror fallback)',
};
const networkTools = new Set(Object.keys(PROVIDERS));

// Which tools are referenced by an automated (Playwright) spec.
const specText = fs
  .readdirSync('tests')
  .filter((f) => f.endsWith('.spec.ts'))
  .map((f) => fs.readFileSync(path.join('tests', f), 'utf8'))
  .join('\n');
const hasTest = (tool) => specText.includes(`/${tool.category}/${tool.id}`) || specText.includes(`'${tool.id}'`);

const rows = browsable.map((t) => {
  const mode = networkTools.has(t.id) ? 'network-required' : 'local';
  return [
    t.id,
    t.name,
    t.category,
    t.accept === '*' ? 'any' : t.accept,
    t.inputMode || 'file',
    mode,
    ENGINE_BY_CATEGORY[t.category] || '—',
    'no (tracked: P1 cancellation)',
    PROVIDERS[t.id] || 'none',
    hasTest(t) ? 'yes (e2e)' : 'none',
  ];
});

const header = [
  'Tool ID',
  'Name',
  'Category',
  'Input',
  'Input mode',
  'Processing',
  'Engine',
  'Cancellable',
  'External provider',
  'Automated test',
];

const esc = (s) => String(s).replace(/\|/g, '\\|');
const line = (cells) => `| ${cells.map(esc).join(' | ')} |`;

const counts = rows.reduce(
  (acc, r) => {
    acc.total += 1;
    if (r[5] === 'network-required') acc.network += 1;
    if (r[9].startsWith('yes')) acc.tested += 1;
    return acc;
  },
  { total: 0, network: 0, tested: 0 },
);

const out = `# Tool Capability Matrix

Generated from \`lib/tool-registry.ts\` by \`scripts/gen-capability-matrix.mjs\`. Do not edit by hand.

- Browsable tools: **${counts.total}**
- Network-required tools: **${counts.network}** (every other tool processes locally in the browser)
- Tools with an automated (Playwright) spec: **${counts.tested}**

> Columns derived from source are authoritative. \`Cancellable\` is \`no\` for every
> tool today because the processor API does not yet accept an \`AbortSignal\`
> (tracked as a P1 in \`audit-findings.md\`). Exact output MIME, memory grade,
> per-tool maturity, and known-loss notes require per-tool runtime verification
> that is **not yet complete for all 100 tools**; those are tracked in the audit
> rather than guessed here.

${line(header)}
${line(header.map(() => '---'))}
${rows.map(line).join('\n')}
`;

fs.writeFileSync('docs/tool-capability-matrix.md', out);
console.log(`wrote docs/tool-capability-matrix.md (${counts.total} tools, ${counts.network} network, ${counts.tested} tested)`);
