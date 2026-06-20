// Node module resolution hook for the browser-free unit checks: resolves the
// project's "@/" alias and extensionless relative imports to .ts files, so the
// same TS source the app builds can be imported under --experimental-strip-types.
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = process.cwd();
const tryFiles = (base) => {
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
    if (existsSync(cand)) return pathToFileURL(cand).href;
  }
  return null;
};

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const url = tryFiles(`${root}/${specifier.slice(2)}`);
    if (url) return { url, shortCircuit: true };
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[a-zA-Z0-9]+$/.test(specifier)) {
    try {
      const dir = fileURLToPath(context.parentURL).replace(/[^/]+$/, '');
      const url = tryFiles(`${dir}${specifier}`);
      if (url) return { url, shortCircuit: true };
    } catch {
      // fall through to default resolution
    }
  }
  return next(specifier, context);
}
