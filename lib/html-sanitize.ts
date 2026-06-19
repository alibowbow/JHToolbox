/**
 * HTML sanitization for the html-to-pdf and HWPX→PDF renderers, which inject
 * user/generated markup into an iframe. The primary defense is the iframe
 * sandbox dropping `allow-scripts` (so no script executes regardless of input);
 * this module is defense-in-depth that removes script/frame/external-resource
 * vectors and event handlers from the markup before it is rendered.
 *
 * The string-level `stripDangerousHtml` runs everywhere (and is unit-tested in
 * Node). When a DOM is available (the browser), `sanitizeHtml` additionally does
 * a structural pass via DOMParser.
 */

export const BLOCKED_TAGS = [
  'script',
  'iframe',
  'object',
  'embed',
  'base',
  'meta',
  'link',
  'frame',
  'frameset',
  'applet',
  'noscript',
  'template',
];

const BLOCKED_TAG_BLOCK = /<\s*(script|iframe|object|embed|frame|frameset|applet|noscript|template)\b[\s\S]*?<\s*\/\s*\1\s*>/gi;
const BLOCKED_TAG_OPEN = /<\s*(base|meta|link|script|iframe|object|embed|frame|frameset|applet)\b[^>]*>/gi;
const EVENT_ATTR_DQ = /\son[a-z]+\s*=\s*"[^"]*"/gi;
const EVENT_ATTR_SQ = /\son[a-z]+\s*=\s*'[^']*'/gi;
const EVENT_ATTR_UQ = /\son[a-z]+\s*=\s*[^\s>]+/gi;
const JS_URL_DQ = /(href|src|xlink:href)\s*=\s*"\s*(?:javascript|vbscript):[^"]*"/gi;
const JS_URL_SQ = /(href|src|xlink:href)\s*=\s*'\s*(?:javascript|vbscript):[^']*'/gi;

export function isEventHandlerAttribute(name: string): boolean {
  return /^on[a-z]+$/i.test(name);
}

export function isUnsafeUrl(value: string): boolean {
  const v = String(value ?? '').trim().toLowerCase();
  if (v.startsWith('javascript:') || v.startsWith('vbscript:')) {
    return true;
  }
  // Allow inline images but block other data: payloads (e.g. data:text/html).
  if (v.startsWith('data:') && !v.startsWith('data:image/')) {
    return true;
  }
  return false;
}

/** String-level scrub that runs in any environment (also the Node-tested path). */
export function stripDangerousHtml(html: string): string {
  let out = String(html ?? '');
  out = out.replace(BLOCKED_TAG_BLOCK, '');
  out = out.replace(BLOCKED_TAG_OPEN, '');
  out = out.replace(EVENT_ATTR_DQ, '');
  out = out.replace(EVENT_ATTR_SQ, '');
  out = out.replace(EVENT_ATTR_UQ, '');
  out = out.replace(JS_URL_DQ, '$1="#"');
  out = out.replace(JS_URL_SQ, "$1='#'");
  return out;
}

/**
 * Sanitize HTML before it is rendered in the (script-disabled) iframe. Applies
 * the string scrub everywhere, then a structural DOMParser pass when available.
 */
export function sanitizeHtml(html: string): string {
  const pre = stripDangerousHtml(html);

  if (typeof DOMParser === 'undefined') {
    return pre;
  }

  try {
    const doc = new DOMParser().parseFromString(pre, 'text/html');
    doc.querySelectorAll(BLOCKED_TAGS.join(',')).forEach((element) => element.remove());
    doc.querySelectorAll('*').forEach((element) => {
      for (const attr of Array.from(element.attributes)) {
        if (isEventHandlerAttribute(attr.name) || isUnsafeUrl(attr.value)) {
          element.removeAttribute(attr.name);
        }
      }
    });
    return `<!doctype html>${doc.documentElement.outerHTML}`;
  } catch {
    return pre;
  }
}
