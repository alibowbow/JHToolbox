/**
 * Executable check for lib/url-safety.ts (SSRF guard for the web tools).
 *
 * Run with the project's Node (>=22):
 *   node --experimental-strip-types scripts/checks/url-safety.check.mjs
 *
 * This runs without a browser, so it is usable in this environment where the
 * Playwright browser build is unavailable. CI should run it via `npm run verify`.
 */
import { validateExternalUrl } from '../../lib/url-safety.ts';

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

const allow = (input, name) => check(name ?? `allow ${input}`, validateExternalUrl(input).ok === true);
const block = (input, reason, name) => {
  const r = validateExternalUrl(input);
  check(name ?? `block ${input}`, r.ok === false && (!reason || r.reason === reason));
};

// --- allowed public URLs ---
allow('https://example.com');
allow('example.com', 'bare host gets https:// and is allowed');
allow('https://sub.example.co.kr/path?q=1&x=2#frag');
allow('http://example.com');
allow('https://1.1.1.1', 'public IP literal allowed');
allow('https://[2606:4700:4700::1111]', 'public IPv6 allowed');

// normalization preserves the href used downstream
check('href normalized', validateExternalUrl('example.com/path?q=1&x=2').url === 'https://example.com/path?q=1&x=2');

// --- scheme / shape ---
block('javascript:alert(1)', 'unsupported-scheme');
block('file:///etc/passwd', 'unsupported-scheme');
block('ftp://example.com', 'unsupported-scheme');
block('data:text/html,<script>', 'unsupported-scheme');
block('', 'empty');
block('   ', 'empty');
block(`https://example.com/${'a'.repeat(3000)}`, 'too-long');
block('https://', 'invalid', 'empty host is invalid');

// --- credentials ---
block('https://user:pass@example.com', 'credentials');
block('https://admin@example.com', 'credentials');

// --- loopback / internal hosts ---
block('http://localhost', 'loopback');
block('http://localhost:8080/admin', 'loopback');
block('http://api.localhost', 'loopback');
block('http://printer.local', 'loopback');
block('http://intranet', 'private-host', 'single-label host blocked');
block('http://router', 'private-host');

// --- private / reserved IPv4 (incl. variant notations the URL parser normalizes) ---
block('http://127.0.0.1', 'non-public-ip');
block('http://10.0.0.5', 'non-public-ip');
block('http://192.168.1.1', 'non-public-ip');
block('http://172.16.10.10', 'non-public-ip');
block('http://172.31.255.255', 'non-public-ip');
block('http://100.64.0.1', 'non-public-ip', 'CGNAT blocked');
block('http://0.0.0.0', 'non-public-ip');
block('http://224.0.0.1', 'non-public-ip', 'multicast blocked');
block('http://2130706433', undefined, '127.0.0.1 in decimal notation blocked');
block('http://0x7f000001', undefined, '127.0.0.1 in hex notation blocked');

// --- cloud metadata ---
block('http://169.254.169.254/latest/meta-data/', 'metadata');
block('http://metadata.google.internal/computeMetadata/v1/', 'metadata');

// --- IPv6 loopback / link-local / ULA ---
block('http://[::1]', 'non-public-ip');
block('http://[::]', 'non-public-ip');
block('http://[fe80::1]', 'non-public-ip');
block('http://[fc00::1]', 'non-public-ip');
block('http://[fd12:3456::1]', 'non-public-ip');
block('http://[::ffff:127.0.0.1]', 'non-public-ip', 'IPv4-mapped loopback blocked');

// 172.32 is public (just outside the private block) — must be allowed
allow('http://172.32.0.1', '172.32.0.1 is public');

console.log(`\nurl-safety: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
