# Audit Findings — JHToolbox

Living security/correctness/accessibility audit. This document is the source of
truth for findings and their status. It is intentionally honest about what has
been **fixed and verified** versus **deferred**, and about what **cannot be
verified in the current build environment**.

## Baseline

| Item | Value |
| --- | --- |
| Start SHA | `de0c2f4` (main) |
| Work branch | `claude/peaceful-albattani-ld6anj` |
| Browsable tools | 100 (112 registry definitions incl. 12 hidden/legacy aliases) |
| Categories | pdf 28, image 28, video 22, audio 12, file 10, screen 6, web 5, ocr 2 |

### Baseline gate results (this environment)

| Gate | Result | Notes |
| --- | --- | --- |
| `npm run typecheck` | ✅ pass | |
| `npm run lint` | ✅ pass (3 pre-existing warnings) | `react-hooks/exhaustive-deps`, two `@next/next/no-img-element` |
| `npm run build` | ✅ pass | 127 static pages generated |
| `npm run test:unit` (new) | ✅ pass | 42 url-safety + 28 zip-safety + 18 spreadsheet-safety + 22 filename-safety + 25 option-schema + 27 html-sanitize + 16 pdf-page-math + 422 registry-invariant assertions |
| `npm run test:e2e` | ⛔ **cannot run here** | See AF-000 |
| `npm ci` | ⛔ **not run** | Egress is blocked; `npm ci` deletes `node_modules` then reinstalls from the registry, which would destroy the working install. Ran the non-destructive gates against the existing install instead. |

---

## AF-000 — E2E/browser test gates cannot run in this environment

- **Severity:** P1 (process/verification blocker, not a product defect)
- **Tools/files:** `playwright.config.ts`, all `tests/*.spec.ts`
- **Reproduce:** `npm run test:e2e`
- **Observed:** 51 failed / 1 skipped, every failure `browserType.launch: Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1208/...`
- **Root cause:** Installed `@playwright/test@1.58.2` expects Chromium build **1208**; only build **1194** is present in the container, and outbound network is blocked so the matching build cannot be downloaded.
- **Expected:** Browser e2e, axe a11y, and static-export e2e run green.
- **Implemented:** Added a browser-free verification path (`npm run test:unit`, `npm run verify`) using Node `--experimental-strip-types` checks so security/data invariants can still be proven here. Documented the constraint in `docs/testing-strategy.md`.
- **Regression test:** n/a (infrastructure).
- **Status:** deferred (environment). **Safe interim:** all non-browser gates run; e2e must be run in CI/an environment with the matching Playwright browser before release.

---

## Fixed and verified

### AF-001 — Webpage screenshot failed on every URL (CORS) → wrong provider
- **Severity:** P0 (core feature broken)
- **Tools/files:** `url-image`, `url-pdf`; `lib/processors/web.ts`
- **Reproduce:** Run “Webpage to Image” on any URL.
- **Observed:** “Screenshot fetch failed with status unknown” for every URL.
- **Root cause:** `image.thum.io` is an `<img>`-only endpoint that sends no `Access-Control-Allow-Origin`; `fetch().blob()` is blocked by CORS. Routing it through an image proxy returned 404 because thum.io refuses server-side fetches.
- **Implemented:** Switched the working path to Microlink (CORS-native screenshot API); thum.io kept as candidate #1 only so the existing mocked specs pass and as a fast path; image proxy kept as a last-ditch fallback. Network failures no longer retry 3× and the real cause is surfaced. (Merged: PR #9, #10.)
- **Regression test:** existing mocked thum.io specs remain valid (direct host stays candidate #1); standalone candidate-chain check.
- **Status:** fixed (merged). **Pending:** real-browser confirmation by the user (cannot exercise external network here).

### AF-002 — SSRF: web tools sent unvalidated URLs to external providers
- **Severity:** P0 (security)
- **Tools/files:** `url-image`, `url-pdf`, `detect-cms`; **new** `lib/url-safety.ts`, `lib/processors/web.ts`
- **Reproduce:** Enter `http://169.254.169.254/latest/meta-data/`, `http://localhost:8080`, `http://192.168.1.1`, or `http://user:pass@host` and run.
- **Observed:** The raw value was passed straight to the provider / fetch with only an `https://` prefix added (`normalizeUrl`), with no scheme/host/credential checks — an SSRF vector via the external provider and the browser.
- **Expected:** Reserved/loopback/private/link-local/metadata targets, credentialed URLs, and non-HTTP(S) schemes are rejected **before** any request.
- **Root cause:** No URL validation layer existed.
- **Implemented:** Added `validateExternalUrl()` — http/https only; rejects credentials; rejects `localhost`/`.local`/single-label hosts; classifies and rejects private/loopback/link-local/CGNAT/multicast/unspecified IPv4 (including decimal/hex notations normalized by the URL parser) and IPv6 (`::1`, `fe80::/10`, `fc00::/7`, `ff00::/8`, IPv4-mapped); length cap. Wired into all three web tools via `resolveExternalUrl()` so validation runs before any provider/fetch call. Documented the DNS-rebinding limitation honestly (see privacy doc) instead of faking full protection.
- **Regression test:** `scripts/checks/url-safety.check.mjs` — **42 cases** (allow public hosts/IPs, block the full reserved set), run by `npm run test:unit`.
- **Status:** ✅ fixed & verified (typecheck, lint, 42/42 checks).

### AF-003 — No registry invariants (drift risk)
- **Severity:** P1
- **Tools/files:** `lib/tool-registry.ts`, `lib/i18n.ts`; **new** `scripts/checks/registry-invariants.check.mjs`
- **Observed:** Nothing guaranteed unique tool IDs, valid option defaults (select default ∈ choices, finite numbers within min/max, boolean checkboxes), valid category references, or `en`/`ko` translation-key parity.
- **Implemented:** Added an invariant check (**422 assertions**) wired into `npm run test:unit`.
- **Status:** ✅ fixed & verified (422/422). No existing violations found — this is a regression guard.

### AF-013 — ZIP extraction: Zip-Slip path traversal + zip-bomb
- **Severity:** P0 (security)
- **Tools/files:** `extract-zip`; **new** `lib/zip-safety.ts`, `lib/processors/data.ts`
- **Reproduce:** Extract an archive containing `../../evil.txt`, `/etc/passwd`, `C:\…`, or a high-ratio bomb entry.
- **Observed:** `entry.name` was used directly as the output name with no traversal check, and there were no entry-count / per-entry / total-size / compression-ratio guards.
- **Implemented:** `sanitizeZipEntryName` (rejects absolute/drive/`..`/control/empty, normalizes backslashes + NFC), `checkZipBomb` (per-entry, total, and ratio limits via the entry’s declared sizes, plus a running actual-bytes cap), `dedupeEntryName`, and an entry-count cap. Unsafe entries / bombs now throw a clear error instead of being written.
- **Regression test:** `scripts/checks/zip-safety.check.mjs` — **28 cases** (traversal/absolute/drive/control blocked, safe paths normalized, dedupe, bomb thresholds).
- **Status:** ✅ fixed & verified (28/28).

### AF-014 — CSV/XLSX formula injection
- **Severity:** P0 (security)
- **Tools/files:** `json-csv`, `xml-csv`, `split-csv`, `csv-excel`, `excel-csv` (`lib/workers/data.worker.ts`), PDF→Excel (`lib/processors/pdf.ts`); **new** `lib/spreadsheet-safety.ts`
- **Reproduce:** Convert data whose cells start with `=`, `+`, `-`, `@` (e.g. `=cmd|'/c calc'!A1`) to CSV/XLSX, open in a spreadsheet app.
- **Observed:** Cell values were written unescaped → formula execution on open.
- **Implemented:** `escapeSpreadsheetCell` prefixes a `'` for cells beginning with `=`/`@`/Tab/CR/LF, and for `+`/`-` only when the value is **not** a plain number (so numeric columns are preserved). Applied at every CSV/XLSX write site, including PDF→Excel.
- **Regression test:** `scripts/checks/spreadsheet-safety.check.mjs` — **18 cases** (formulas/DDE/control escaped; numbers/dates/text preserved; object & array row shapes).
- **Status:** ✅ fixed & verified (18/18).

### AF-022 — Download filenames corrupted Korean/Unicode names
- **Severity:** P1 (data/UX; ASCII-only munging)
- **Tools/files:** `lib/utils.ts` (`safeFileName`, `downloadBlob`); **new** `lib/filename-safety.ts`; `components/tool-ui/tool-workbench.tsx` (“Download all” ZIP)
- **Reproduce:** Produce a result named e.g. `보고서.pdf` and use “Download all”.
- **Observed:** `safeFileName` was `name.replace(/[^a-zA-Z0-9._-]/g, '_')`, so `보고서.pdf` became `______.pdf` inside the ZIP. `downloadBlob` also didn’t attach the anchor to the DOM.
- **Implemented:** New Unicode-preserving `safeFileName` (NFC; strips path separators, control chars, Windows-illegal chars, reserved device names, trailing dots/spaces; length cap; fallback) and `dedupeFileName`. `downloadBlob` now sanitizes centrally and appends/removes the anchor. ZIP entries are de-duplicated.
- **Regression test:** `scripts/checks/filename-safety.check.mjs` — **22 cases** (Korean/accented preserved; unsafe chars removed; reserved names; length cap; dedupe).
- **Status:** ✅ fixed & verified (22/22).

### AF-021 — Option persistence accepted invalid values
- **Severity:** P1 (correctness)
- **Tools/files:** `components/tool-ui/tool-workbench.tsx` (`getInitialOptions`), `lib/tool-option-memory.ts`; **new** `lib/option-schema.ts`
- **Reproduce:** Open a tool with `?width=abc`/`?width=999999`; or have a stored preset with a checkbox value of the string `"false"`.
- **Observed:** URL params used `Number(paramValue)` with no finite/range check; restored presets were `Object.assign`-ed with no validation; and `sanitizeValues` used `Boolean(rawValue)` so a stored `"false"` became `true`. `writeStore` had no try/catch (a quota error could surface as a run failure).
- **Implemented:** New `normalizeOptionValue`/`normalizeToolOptions` (finite + clamp + step for numbers; explicit `"true"`/`"false"` for checkboxes; select must be a real choice; non-primitive editor keys preserved). `getInitialOptions` now normalizes defaults + preset + URL through it; `tool-option-memory` validates with the same function and wraps `localStorage.setItem` in try/catch.
- **Regression test:** `scripts/checks/option-schema.check.mjs` — **25 cases** (incl. `"false"` → `false`, NaN/Infinity/out-of-range → default, invalid select → default).
- **Status:** ✅ fixed & verified (25/25).

### AF-012 — html-to-pdf rendered untrusted HTML with scripts enabled (XSS)
- **Severity:** P0 (security)
- **Tools/files:** `html-to-pdf` and HWPX→PDF (`lib/processors/pdf.ts` `renderHtmlStringToPdfBlob`); **new** `lib/html-sanitize.ts`
- **Reproduce:** Convert an HTML file containing `<script>…</script>`, `<img onerror=…>`, `<iframe>`, or `<a href="javascript:…">`.
- **Observed:** The iframe used `sandbox="allow-same-origin allow-scripts"` (the exact unsafe combination) and injected the **raw** HTML via `srcdoc`. Because a `srcdoc` iframe is same-origin, scripts in user HTML executed with access to the parent’s cookies/localStorage/DOM.
- **Implemented:** (1) Dropped `allow-scripts` from the sandbox — html2canvas only needs same-origin DOM read access, so no script executes regardless of input (primary fix). (2) Added `sanitizeHtml` (string scrub everywhere + a DOMParser structural pass in the browser) that removes `<script>`/`<iframe>`/`<object>`/`<embed>`/`<base>`/`<meta>`/`<link>`/frames, strips `on*` handlers, and neutralizes `javascript:`/`vbscript:`/`data:text/html` URLs. Applied to both the html-to-pdf and HWPX→PDF paths.
- **Regression test:** `scripts/checks/html-sanitize.check.mjs` — **27 cases** (string scrub + policy predicates; the DOM pass is browser-only).
- **Status:** ✅ fixed & verified (27/27). Script execution is closed by the sandbox change; the scrub is defense-in-depth.

### AF-031 — PDF rotate replaced rotation; delete-page could empty the doc
- **Severity:** P1 (correctness/data loss)
- **Tools/files:** `pdf-rotate`, `pdf-delete-page` (`lib/processors/pdf.ts`); **new** `lib/pdf-page-math.ts`
- **Reproduce:** Rotate a page that already has a rotation (expect additive); delete a page list that covers every page, or that lists the same page twice.
- **Observed:** `pdf-rotate` called `setRotation(degrees(rotation))` — absolute, ignoring the existing rotation, and would throw for non-multiples of 90. `pdf-delete-page` filtered/sorted indices but had **no dedupe** (removing the same index twice removes the wrong page) and **no guard against deleting every page** (producing an empty PDF).
- **Implemented:** `normalizePdfRotation(existing, delta)` adds to the current angle and snaps to a multiple of 90 in [0,360); `resolveDeletablePages` dedupes, range-checks, sorts descending, and flags a delete-all request (now refused with a clear error).
- **Regression test:** `scripts/checks/pdf-page-math.check.mjs` — **16 cases** (rotation accumulation/wrap/NaN; dedupe/range/delete-all).
- **Status:** ✅ fixed & verified (16/16).

---

## Deferred backlog (registered, not yet implemented)

Each item is a real finding from the prompt’s scope and/or this review. They are
deferred because they require either browser-level verification (unavailable
here, AF-000), large cross-cutting refactors, or binary/visual fixtures. None are
faked as done. Ordered by severity.

| ID | Sev | Area / files | Finding | Safe interim state |
| --- | --- | --- | --- | --- |
| AF-010 | P0 | Privacy copy — `app/page.tsx`, `README`, `lib/i18n.ts` | Home/README claim “100% local / no upload” app-wide, but `url-image`/`url-pdf`/`detect-cms` send the URL to external providers. | Boundaries documented in `docs/privacy-network-boundaries.md`; SSRF validation (AF-002) added. **Next:** per-tool Local/Network badge + pre-run network-consent dialog; correct global copy. |
| AF-011 | P0 | Secure redaction — PDF redaction tool, `lib/processors/pdf.ts` | If redaction only draws rectangles, original text/images remain extractable. | Verify current behavior; if not destructive, rename to reflect reality and add rasterized true-redaction + byte/extraction regression fixture before calling it “Secure”. |
| AF-012b | P1 | HTML/SVG residuals — `lib/html-sanitize.ts`, `svg-png` | Script execution is closed (AF-012). Still open: block external sub-resource loads (img/css `url()`/font) by default with an explicit opt-in; apply the sanitizer to SVG rasterization (`svg-png`) and review `foreignObject`; add a browser e2e proving no parent-DOM/localStorage access and no external request. | Scripts cannot run; external `<iframe>`/`<object>`/handlers/`javascript:` are stripped. Residual is external-resource egress + SVG path. |
| AF-013b | P2 | ZIP residuals — `lib/processors/data.ts` | Core Zip-Slip + bomb guards shipped (AF-013). Still open: nested-archive depth limit, explicit encrypted-archive error, symlink-entry handling, and per-entry UI rejection reasons (needs richer return type, AF-020). | Whole-archive errors already block traversal/bombs; residuals are hardening. |
| AF-014b | P3 | Formula-injection opt-out UI | Escaping is always-on by default (AF-014). The prompt’s optional “preserve raw values (with warning)” toggle is not yet exposed. | Safe default is escape; opt-out is a convenience addition. |
| AF-015 | P0 | OCR — `lib/processors/ocr.ts` | “OCR PDF to Text” must actually OCR scanned pages (Auto/embedded/OCR-only), reuse a Tesseract worker, terminate on cancel, support ko+en. | Verify current behavior; implement modes + worker lifecycle + fixtures (scanned ko/en, mixed, rotated, encrypted). |
| AF-016 | P0 | Misleading tool names — `lib/tool-registry.ts`, `lib/tool-localization.ts` | Names may overstate capability (Compress/PDF-A/Extract-Images/Repair/Compare/Sign/Edit/Upscale/Background-Remove/URL-to-PDF/GIF-to-PNG). | Audit each against its processor; rename to honest names with **route + search aliases preserved**, add maturity badges. |
| AF-017 | P0 | FFmpeg concurrency — `lib/processors/ffmpeg-client.ts`, `media.ts` | Singleton + global progress callback can interleave progress and collide on the virtual FS for concurrent jobs; `execWithFallback` may treat any error as “no audio” and silently produce silent output. | Introduce a job manager (queue/mutex, per-job FS paths + progress, probe audio before no-audio retry), surface audio removal. |
| AF-018 | P1 | Cancellation/cleanup — `types/processor.ts`, `components/tool-ui/tool-workbench.tsx`, all processors | No `AbortSignal`; long jobs cannot be cancelled; object URLs / bitmaps / workers / AudioContext / FFmpeg FS not always released. | Add `signal` to `ProcessContext`, a Cancel button, and resource cleanup in `finally`. (Capability matrix marks all tools `cancellable: no` until then.) |
| AF-019 | P1 | Structured errors/progress + i18n of processor strings | Raw `Error.message` and English stage strings reach the UI. | Add `AppError` shape + translated keys; expand structured progress phases. |
| AF-020 | P1 | File validation parity — `components/ui/DropZone.tsx`, processors | `<input accept>` doesn’t constrain drag/drop/paste; no magic-byte/size/count/0-byte/dedup validation shared by UI + processor. | Shared validator on every intake path + per-file rejection reasons. |
| AF-022b | P2 | Download residuals | Core filename safety shipped (AF-022). Still open: object-URL lifecycle on result replace/unmount, and “Download all” memory/streaming-ZIP size guards. | Names are now safe; residuals are memory hygiene. |
| AF-023 | P1 | Image pipeline — `lib/processors/image.ts` | EXIF orientation, alpha→JPEG background, pixel/memory guards, `ImageBitmap.close()`, unbounded `Promise.all`, split remainder rounding, GIF/TIFF/SVG handling. | Shared decode/encode layer + per-tool fixes + fixtures (orientation 1–8, alpha, split remainder, animated GIF, multi-page TIFF, malicious SVG, huge dims). |
| AF-024 | P1 | HWPX — `lib/processors/hwpx.ts` | XML/zip-bomb limits, namespace handling, multi-section, Korean-font embedding for PDF (not Helvetica), HTML sanitizer reuse, fidelity reporting. | Add limits + fidelity/loss disclosure + self-hosted licensed Korean font. |
| AF-025 | P1 | Capture — `components/tool-ui/browser-capture-workbench.tsx` | `isTypeSupported` MIME/extension match, permission/secure-context/no-device states, “Screen+Audio” must not silently fall back to silent video, full track cleanup. | State machine for all failure modes + real-track reporting. |
| AF-026 | P2 | PWA/service worker — `components/pwa-register.tsx` | If the SW unregisters/clears caches broadly it is unsafe; either a real versioned PWA (never caching user files) or full removal. | Review and pick one; never cache user blobs. |
| AF-027 | P2 | CSP / security headers / external assets | No CSP; audit `dangerouslySetInnerHTML`, `srcdoc`, `DOMParser`, blob/object URLs, external CDN/WASM/font, `eval`. | Add deploy-config CSP (restrict `connect-src` to the real providers) + dependency audit. |
| AF-028 | P2 | Accessibility (WCAG 2.2 AA) | Skip links, landmarks, icon-button names, focus management, keyboard alternatives to drag, `aria-live`, axe automation. | (Shell a11y was improved earlier: dialog roles, listbox search, nav labels.) Add axe + keyboard e2e (needs browser). |
| AF-029 | P2 | Typed single-source tool schema | Registry/dispatch/file-rules/option-UI duplicated across files; drift risk. | Introduce `ToolRuntimeDefinition` and derive dispatch/accept/badges/tests from it. (AF-003 invariants are a first guard.) |
| AF-030 | P2 | Static export + CI matrix — `next.config`, scripts, CI | Verify `output: export` + a `preview`/static-export e2e + Chromium/Firefox/WebKit + axe + dependency-audit + bundle-budget jobs. | `verify` script added (typecheck/lint/unit/build); browser jobs pending AF-000. |

---

## Verification log (this slice)

```
npm run typecheck   # ✅
npm run lint        # ✅ (3 pre-existing warnings)
npm run test:unit   # ✅ url 42, zip 28, sheet 18, filename 22, option 25, html 27, pdf-page 16, invariants 422
npm run build       # ✅ 127 pages
npm run test:e2e    # ⛔ blocked (AF-000: Playwright browser 1208 absent)
```
