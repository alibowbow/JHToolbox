/**
 * Why a webpage capture failed. The screenshot services open the page from
 * their own servers abroad, so a site that turns away foreign or automated
 * visitors fails there even though it opens fine in the user's browser. The
 * services say so in their error bodies; this module reads them.
 */

export type CaptureFailureKind = 'blocked' | 'not-found' | 'quota' | 'timeout' | 'blank' | 'network' | 'unknown';

export const CAPTURE_FAILURE_MESSAGES: Record<CaptureFailureKind, string> = {
  blocked: 'The screenshot servers could not get into this site. It may block overseas or automated visitors.',
  'not-found': 'The screenshot server could not find this address. Check the URL.',
  quota: 'The free screenshot services have reached their usage limit. Try again later.',
  timeout: 'The page took too long to load on the screenshot server. Shorten the wait or capture only the first screen.',
  blank: 'The capture came back blank. The site may block the screenshot servers or need longer to load.',
  network: 'Could not reach the screenshot services. Check your connection or ad blocker.',
  unknown: 'Unable to capture a screenshot for this URL. The screenshot service may be busy or blocking the request.',
};

/** Thrown when every screenshot service failed; `kind` says why. */
export class CaptureError extends Error {
  readonly kind: CaptureFailureKind;

  constructor(kind: CaptureFailureKind, detail?: string) {
    super(kind === 'unknown' && detail ? CAPTURE_FAILURE_MESSAGES.unknown.replace(/\.$/, ` (${detail}).`) : CAPTURE_FAILURE_MESSAGES[kind]);
    this.name = 'CaptureError';
    this.kind = kind;
  }
}

export function isCaptureError(cause: unknown): cause is CaptureError {
  return cause instanceof Error && cause.name === 'CaptureError';
}

// Microlink error codes (https://microlink.io/docs/api/basics/error-codes).
const SERVICE_CODES: Record<string, CaptureFailureKind> = {
  EPROXYNEEDED: 'blocked',
  ETIMEOUT: 'timeout',
  EBRWSRTIMEOUT: 'timeout',
  ERATE: 'quota',
  EINVALURL: 'not-found',
};

// What the service's browser reported while opening the page.
const MESSAGE_RULES: Array<[RegExp, CaptureFailureKind]> = [
  [/ERR_NAME_NOT_RESOLVED|ENOTFOUND|EAI_AGAIN|getaddrinfo|could not resolve/i, 'not-found'],
  [
    /ERR_CONNECTION_(?:REFUSED|RESET|CLOSED|TIMED_OUT)|ERR_EMPTY_RESPONSE|ERR_ADDRESS_UNREACHABLE|ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|socket hang up|captcha|cloudflare|access denied|forbidden|anti-?bot|bot protection/i,
    'blocked',
  ],
  [/timed? ?out/i, 'timeout'],
  [/rate.?limit|too many requests|quota/i, 'quota'],
];

/** Reads a failed service response (status + body) into a failure kind. */
export function classifyServiceFailure(status: number, body: string): { kind: CaptureFailureKind; detail: string } {
  let code = '';
  let message = '';
  try {
    const payload = JSON.parse(body) as { code?: unknown; message?: unknown };
    code = typeof payload?.code === 'string' ? payload.code.toUpperCase() : '';
    message = typeof payload?.message === 'string' ? payload.message : '';
  } catch {
    message = body.slice(0, 500);
  }

  const detail = [status ? `status ${status}` : '', code].filter(Boolean).join(', ');
  const byCode = SERVICE_CODES[code];
  if (byCode) {
    return { kind: byCode, detail };
  }
  const byMessage = MESSAGE_RULES.find(([pattern]) => pattern.test(message))?.[1];
  if (byMessage) {
    return { kind: byMessage, detail };
  }
  if (status === 429) {
    return { kind: 'quota', detail };
  }
  if (status === 408 || status === 504 || status === 524) {
    return { kind: 'timeout', detail };
  }
  return { kind: 'unknown', detail };
}

// The most telling reason wins: a site that turns the servers away explains
// the other services' failures too. "network" alone means the browser could
// not reach any service (offline, ad blocker); a bare thum.io request is
// always CORS-blocked, so it never outweighs what another service said.
const PRIORITY: CaptureFailureKind[] = ['blocked', 'not-found', 'quota', 'timeout', 'blank', 'unknown'];

export function summarizeCaptureFailures(kinds: CaptureFailureKind[]): CaptureFailureKind {
  if (kinds.length > 0 && kinds.every((kind) => kind === 'network')) {
    return 'network';
  }
  return PRIORITY.find((kind) => kinds.includes(kind)) ?? 'unknown';
}
