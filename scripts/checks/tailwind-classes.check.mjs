/**
 * Static check for Tailwind class patterns that compile to nothing or to the
 * wrong thing (no build needed).
 *   node scripts/checks/tailwind-classes.check.mjs
 *
 * 1. A variant glued to a runtime value (`group-hover:${style.x}`) is never
 *    generated: Tailwind only sees complete class names in source, and for a
 *    multi-class value only the first class would get the prefix anyway.
 * 2. `border-border/40` does not mean "40% of the subtle border": the /NN
 *    modifier replaces the token's alpha (0.08) outright, giving a 40%-opaque
 *    outline. Use `border-border` / `border-border-bright`.
 */
import fs from 'node:fs';
import path from 'node:path';

const roots = ['app', 'components', 'lib'];
const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(tsx?|css)$/.test(entry.name)) files.push(full);
  }
};
roots.forEach(walk);

const rules = [
  {
    name: 'variant prefix glued to an interpolated class',
    pattern:
      /(?<![\w-])(?:hover|focus|focus-visible|focus-within|active|disabled|group-hover|group-focus|peer-hover|peer-focus|dark|sm|md|lg|xl|2xl|first|last|odd|even|placeholder|aria-[\w-]+|data-[\w-]+):\$\{/g,
  },
  { name: 'opacity modifier on the border token', pattern: /\bborder-border(?:-bright)?\/\d+/g },
];

let fail = 0;
for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    for (const rule of rules) {
      for (const match of line.matchAll(rule.pattern)) {
        fail += 1;
        console.log(`  FAIL ${rule.name}: ${file}:${index + 1} → ${match[0]}`);
      }
    }
  });
}

console.log(`\ntailwind-classes: scanned ${files.length} files, ${fail} problem(s)`);
process.exit(fail === 0 ? 0 : 1);
