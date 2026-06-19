/**
 * Client-side URL safety validation for the network-required web tools
 * (url-image, url-pdf, detect-cms). These tools hand the user's URL to an
 * external provider, so an unvalidated value is an SSRF vector: a user (or a
 * crafted link / preset) could aim the provider at `http://localhost`,
 * `http://169.254.169.254/…` (cloud metadata), private LAN ranges, etc.
 *
 * A browser cannot resolve DNS synchronously and cannot prove what an external
 * provider will do, so this is a best-effort guard: it blocks obviously unsafe
 * targets (reserved IP literals in any notation the WHATWG URL parser
 * normalizes, loopback/`.local`/single-label hosts, credentials, non-HTTP(S)
 * schemes) and otherwise allows public domain names. It deliberately does NOT
 * claim to defend against DNS rebinding — that limitation is surfaced in the UI
 * and docs rather than faked.
 */

export type UrlRejectionReason =
  | 'empty'
  | 'too-long'
  | 'invalid'
  | 'unsupported-scheme'
  | 'credentials'
  | 'loopback'
  | 'metadata'
  | 'non-public-ip'
  | 'private-host';

export interface UrlValidationResult {
  ok: boolean;
  /** Normalized absolute URL (href) when ok. */
  url?: string;
  reason?: UrlRejectionReason;
}

export const MAX_EXTERNAL_URL_LENGTH = 2048;

const METADATA_HOSTNAMES = new Set(['metadata', 'metadata.google.internal']);

function classifyIpv4(host: string): 'block' | 'ok' | null {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) {
    return null;
  }

  const octets = match.slice(1).map((value) => Number(value));
  if (octets.some((value) => value > 255)) {
    return 'block';
  }

  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) return 'block'; // unspecified, private, loopback
  if (a === 172 && b >= 16 && b <= 31) return 'block'; // 172.16.0.0/12
  if (a === 192 && b === 168) return 'block'; // 192.168.0.0/16
  if (a === 169 && b === 254) return 'block'; // link-local + cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return 'block'; // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0 && octets[2] === 0) return 'block'; // 192.0.0.0/24
  if (a >= 224) return 'block'; // multicast + reserved
  return 'ok';
}

function classifyIpv6(host: string): 'block' | 'ok' | null {
  if (!host.startsWith('[') || !host.endsWith(']')) {
    return null;
  }

  const inner = host.slice(1, -1).toLowerCase();
  if (inner === '::1' || inner === '::') return 'block'; // loopback / unspecified
  if (/^fe[89ab]/.test(inner)) return 'block'; // fe80::/10 link-local
  if (/^f[cd]/.test(inner)) return 'block'; // fc00::/7 unique local
  if (inner.startsWith('ff')) return 'block'; // ff00::/8 multicast

  // IPv4-mapped (::ffff:a.b.c.d) — the URL parser may keep the dotted tail or
  // compress it to two hex groups (::ffff:7f00:1); handle both.
  const mappedDotted = inner.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mappedDotted) {
    return classifyIpv4(mappedDotted[1]) === 'ok' ? 'ok' : 'block';
  }
  const mappedHex = inner.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const high = parseInt(mappedHex[1], 16);
    const low = parseInt(mappedHex[2], 16);
    const dotted = `${(high >> 8) & 255}.${high & 255}.${(low >> 8) & 255}.${low & 255}`;
    return classifyIpv4(dotted) === 'ok' ? 'ok' : 'block';
  }

  return 'ok';
}

/**
 * Validate and normalize a user-supplied URL before it is sent to an external
 * provider. Returns the normalized href when safe, or a machine-readable reason.
 */
export function validateExternalUrl(raw: string): UrlValidationResult {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    return { ok: false, reason: 'empty' };
  }
  if (trimmed.length > MAX_EXTERNAL_URL_LENGTH) {
    return { ok: false, reason: 'too-long' };
  }

  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'unsupported-scheme' };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'credentials' };
  }

  const host = parsed.hostname.toLowerCase();
  if (!host) {
    return { ok: false, reason: 'invalid' };
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return { ok: false, reason: 'loopback' };
  }
  if (METADATA_HOSTNAMES.has(host) || host === '169.254.169.254') {
    return { ok: false, reason: 'metadata' };
  }

  const ipv6 = classifyIpv6(host);
  if (ipv6 === 'block') {
    return { ok: false, reason: 'non-public-ip' };
  }
  const ipv4 = classifyIpv4(host);
  if (ipv4 === 'block') {
    return { ok: false, reason: 'non-public-ip' };
  }

  // A non-IP host with no dot (e.g. "intranet", "router") is almost certainly an
  // internal name, never a public site — reject it.
  if (ipv4 === null && ipv6 === null && !host.includes('.')) {
    return { ok: false, reason: 'private-host' };
  }

  return { ok: true, url: parsed.href };
}

/** Stable English message for a rejection reason (UI i18n is tracked separately). */
export function describeUrlRejection(reason: UrlRejectionReason | undefined): string {
  switch (reason) {
    case 'empty':
      return 'Enter a URL to continue.';
    case 'too-long':
      return 'This URL is too long to process safely.';
    case 'unsupported-scheme':
      return 'Only http and https URLs are supported.';
    case 'credentials':
      return 'URLs that embed a username or password are not allowed.';
    case 'loopback':
    case 'private-host':
      return 'Local or internal addresses cannot be used with this tool.';
    case 'metadata':
      return 'Cloud metadata and internal service addresses are blocked for security.';
    case 'non-public-ip':
      return 'Private, loopback, and reserved IP addresses are not allowed.';
    case 'invalid':
    default:
      return 'Enter a valid public http or https URL.';
  }
}
