/**
 * Executable invariant checks for the tool registry and i18n dictionary.
 *
 *   node --experimental-strip-types scripts/checks/registry-invariants.check.mjs
 *
 * Runs without a browser. Loads the TS sources by stripping their type-only
 * '@/...' imports into a temp file (the registry and dictionary have no runtime
 * dependencies), so it reflects the real shipped data.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function loadStripped(relPath) {
  let src = fs.readFileSync(relPath, 'utf8');
  src = src.replace(/^import\s+(?:type\s+)?\{[^}]*\}\s+from\s+'@\/[^']+';\s*$/gm, '// (stripped type import)');
  const tmp = path.join(os.tmpdir(), `chk-${path.basename(relPath, '.ts')}-${Date.now()}.ts`);
  fs.writeFileSync(tmp, src);
  return import(tmp);
}

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) {
    pass += 1;
  } else {
    fail += 1;
    console.log('  FAIL', name);
  }
};

const reg = await loadStripped('lib/tool-registry.ts');
const tools = reg.tools || [];
const browsable = reg.getBrowsableTools ? reg.getBrowsableTools() : tools;

// 1. unique tool ids
const ids = tools.map((t) => t.id);
check('all tool ids unique', new Set(ids).size === ids.length);

// 2. categories reference real, unique tool ids
const cats = reg.categories || [];
for (const c of cats) {
  for (const id of c.tools || []) {
    check(`category ${c.id} -> tool ${id} exists`, ids.includes(id));
  }
}

// 3. option default validity (the exact bugs the prompt calls out)
for (const t of tools) {
  for (const o of t.options || []) {
    if (o.type === 'select') {
      const choices = (o.options || []).map((c) => c.value);
      check(`select default in choices: ${t.id}.${o.key}`, choices.includes(o.defaultValue));
    } else if (o.type === 'number' || o.type === 'range') {
      const d = o.defaultValue;
      check(`number default finite: ${t.id}.${o.key}`, typeof d === 'number' && Number.isFinite(d));
      if (typeof o.min === 'number') check(`>= min: ${t.id}.${o.key}`, d >= o.min);
      if (typeof o.max === 'number') check(`<= max: ${t.id}.${o.key}`, d <= o.max);
    } else if (o.type === 'checkbox') {
      check(`checkbox default boolean: ${t.id}.${o.key}`, typeof o.defaultValue === 'boolean');
    }
  }
}

// 4. i18n en/ko key parity
const i18n = await loadStripped('lib/i18n.ts');
const dict = i18n.dictionaries;
const keyPaths = (obj, prefix = '') => {
  const out = [];
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...keyPaths(v, p));
    else out.push(p);
  }
  return out;
};
const enKeys = new Set(keyPaths(dict.en));
const koKeys = new Set(keyPaths(dict.ko));
const missingInKo = [...enKeys].filter((k) => !koKeys.has(k));
const missingInEn = [...koKeys].filter((k) => !enKeys.has(k));
check('i18n en/ko key parity', missingInKo.length === 0 && missingInEn.length === 0);
if (missingInKo.length) console.log('   missing in ko:', missingInKo.slice(0, 15));
if (missingInEn.length) console.log('   missing in en:', missingInEn.slice(0, 15));

// 5. category sections: ids exist, match the category, are not duplicated, and
//    cover every browsable tool in the category (no tool left unsectioned).
const sectionsMod = await loadStripped('lib/tool-sections.ts');
const sections = sectionsMod.categorySections || {};
// The category page renders category.tools (a curated list that can cross-list a
// tool whose own .category differs, e.g. url-pdf), so validate against that list.
const categoryToolIds = Object.fromEntries(cats.map((c) => [c.id, c.tools || []]));
const hiddenIds = new Set(tools.filter((t) => t.hiddenFromBrowse).map((t) => t.id));
for (const [catId, secs] of Object.entries(sections)) {
  const listed = new Set(categoryToolIds[catId] || []);
  const seen = new Set();
  for (const sec of secs) {
    for (const id of sec.toolIds) {
      check(`section ${catId}/${sec.id}: tool "${id}" exists`, ids.includes(id));
      check(`section ${catId}/${sec.id}: tool "${id}" is shown on the ${catId} page`, listed.has(id));
      check(`section ${catId}/${sec.id}: tool "${id}" not duplicated`, !seen.has(id));
      seen.add(id);
    }
  }
  const shown = (categoryToolIds[catId] || []).filter((id) => ids.includes(id) && !hiddenIds.has(id));
  const missing = shown.filter((id) => !seen.has(id));
  check(`section ${catId}: covers every tool shown on the page (missing: ${missing.join(', ') || 'none'})`, missing.length === 0);
}

console.log(
  `\nregistry-invariants: ${pass} passed, ${fail} failed (tools=${tools.length}, browsable=${browsable.length})`,
);
process.exit(fail === 0 ? 0 : 1);
