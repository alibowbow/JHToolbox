import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, cp, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';

const require = createRequire(import.meta.url);
const source = dirname(require.resolve('@rhwp/core'));
const destination = fileURLToPath(new URL('../public/rhwp/', import.meta.url));

await mkdir(destination, { recursive: true });
await Promise.all([
  copyFile(join(source, 'rhwp.js'), join(destination, 'rhwp.js')),
  copyFile(join(source, 'LICENSE'), join(destination, 'LICENSE.txt')),
  cp(join(source, 'notices'), join(destination, 'notices'), { recursive: true }),
  // Keep the WASM asset within static-host file size limits.
  pipeline(createReadStream(join(source, 'rhwp_bg.wasm')), createGzip(), createWriteStream(join(destination, 'rhwp_bg.wasm.gz'))),
]);
