# Privacy & Network Boundaries

JHToolbox is **browser-first**: the overwhelming majority of tools process files
entirely on-device and never upload them. However, a small set of tools **must**
contact an external service, so a blanket “100% local / no upload” claim is
inaccurate and is being corrected (tracked as **AF-010**). This document is the
authoritative list of what leaves the device.

## Summary

| Processing class | Count | Meaning |
| --- | --- | --- |
| **Local only** | 97 / 100 | All input bytes stay in the browser. No file or URL is sent off-device. |
| **Network-required** | 3 / 100 | The tool sends the user-supplied **URL** (never an uploaded file) to an external provider. |
| File upload to a backend | 0 | No tool uploads user files to any server. |

The capability matrix (`docs/tool-capability-matrix.md`) carries the per-tool
classification, generated from the registry.

## Network-required tools

| Tool | What is sent | Providers (in order) | Notes |
| --- | --- | --- | --- |
| `url-image` (Webpage to Image) | The target **URL** | Microlink API → thum.io (direct, CORS permitting) → images.weserv.nl (CORS proxy) | The page at the URL is rendered server-side by the provider; the provider sees the URL and the user’s IP. |
| `url-pdf` (URL Full Page to PDF) | The target **URL** | same as above, then `pdf-lib` locally wraps the returned image | Output is a rasterized snapshot — selectable text/links are lost (disclose in UI, AF-016). |
| `detect-cms` (Detect CMS) | The target **URL** | direct `fetch` → `r.jina.ai` CORS mirror fallback | Fetches page HTML to fingerprint a CMS. |

No other tool performs a cross-origin request with user data. (Engine assets such
as ffmpeg.wasm / Tesseract / pdf.js workers may be fetched from the app’s own
origin; that is app-asset loading, not user-data transmission. Pinning/self-host
is tracked under AF-027.)

## SSRF protection (implemented — AF-002)

All three network tools now validate the URL with `lib/url-safety.ts`
(`validateExternalUrl`) **before any request**:

- only `http` / `https`;
- rejects embedded credentials (`user:pass@`);
- rejects `localhost`, `*.local`, single-label internal hosts;
- rejects private / loopback / link-local / CGNAT / multicast / unspecified
  **IPv4** (including decimal/hex notations the URL parser normalizes) and
  **IPv6** (`::1`, `fe80::/10`, `fc00::/7`, `ff00::/8`, IPv4-mapped);
- rejects cloud-metadata hosts (`169.254.169.254`, `metadata.google.internal`);
- length-capped.

### Honest limitation

A browser client cannot resolve DNS synchronously and cannot inspect what the
external provider does, so this **does not defend against DNS rebinding** (a
public hostname that resolves to a private address) — the provider’s own SSRF
posture is outside our control. We therefore block obviously-internal targets and
do **not** advertise private-network access as a feature. This limitation is
stated here rather than papered over.

## Consent (planned — AF-010)

Target end-state for network-required tools, before any request:

1. A visible **Network required** badge (vs **Local only**).
2. A pre-run disclosure: exactly what is sent (the URL), to which provider, and
   the IP/log exposure risk.
3. An explicit consent/confirmation; no request until the user agrees.
4. No silent fallback to a different provider without surfacing it.

Until the consent UI ships, the safe interim state is: SSRF validation is
enforced, the boundaries are documented here, and the provider order is explicit
in code and in the matrix.
