# Testing Strategy

## Layers

| Layer | Runner | Runs in this environment? | What it covers |
| --- | --- | --- | --- |
| Type safety | `tsc` (`npm run typecheck`) | ✅ yes | Whole codebase type-checks. |
| Lint | `next lint` (`npm run lint`) | ✅ yes | ESLint (next/core-web-vitals). |
| Unit / invariants | Node `--experimental-strip-types` (`npm run test:unit`) | ✅ yes | Pure-logic security & data invariants without a browser. |
| Build | `next build` (`npm run build`) | ✅ yes | Static generation of all routes. |
| E2E / a11y | Playwright (`npm run test:e2e`) | ⛔ **blocked here** | Browser flows, route/refresh, downloads, axe. |

### Aggregate command

```
npm run verify   # typecheck → lint → test:unit → build
```

`verify` deliberately covers only the **browser-free** gates so it is green in
this environment. Browser e2e is a separate gate (`test:e2e`) that must be run in
CI / an environment with a matching Playwright browser. `verify` does **not**
disable or skip e2e — it simply does not include a gate that cannot run here.

## Browser-free unit checks (new)

Because there is no unit-test runner installed and one cannot be added (egress is
blocked), executable checks are written as Node ESM scripts that import the TS
sources directly via `node --experimental-strip-types`. These are real,
repeatable, and CI-runnable.

| Check | File | Assertions | Proves |
| --- | --- | --- | --- |
| URL safety (SSRF) | `scripts/checks/url-safety.check.mjs` | 42 | Public hosts allowed; loopback/private/link-local/metadata/credential/scheme targets blocked (IPv4 incl. decimal/hex, IPv6 incl. mapped). |
| Registry invariants | `scripts/checks/registry-invariants.check.mjs` | 422 | Unique tool IDs; valid select/number/checkbox defaults; category refs resolve; `en`/`ko` i18n key parity. |

The capability matrix is generated (not hand-maintained) from the registry by
`scripts/gen-capability-matrix.mjs`, so it cannot drift from the shipped tools.

## E2E environment blocker (AF-000)

`npm run test:e2e` currently fails every test with:

```
browserType.launch: Executable doesn't exist at
/opt/pw-browsers/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell
```

`@playwright/test@1.58.2` expects Chromium build **1208**; the container only has
build **1194**, and the matching build cannot be downloaded because outbound
network is blocked. Resolution requires a CI/dev environment whose Playwright
browser build matches the installed package (`npx playwright install chromium`
with network access), after which the existing 52 specs and the additions below
run.

## Target test matrix (tracked, mostly pending AF-000)

- **Per-tool smoke (all 100):** route opens; correct title/description; valid
  fixture accepted; invalid fixture rejected; non-zero output; MIME/extension
  match; download works; reset frees resources; cancellable tools cancel; local
  tools make **0** network requests; network tools make **0** requests before
  consent.
- **Security fixtures:** Zip-Slip + zip-bomb; malicious HTML/SVG; redaction
  marker absent from extracted text **and** raw bytes; CSV/XLSX formula
  injection; object-URL cleanup; local-tool network interception (expect none).
- **Data correctness:** EXIF orientation 1–8; alpha→JPEG background; image split
  remainder; scanned-PDF OCR (ko/en); mixed embedded/scanned; 44.1k/48k pitch;
  mixed-format audio merge; odd video dimensions; trim/crop out-of-range.
- **Browser matrix:** Chromium / Firefox / WebKit + a mobile viewport.
- **Static export:** serve `out/` and verify direct route entry, refresh,
  asset/worker/WASM paths, 404, legacy-route aliases, downloads.
- **Accessibility:** axe (0 critical/serious) + keyboard-only e2e for key flows.

## CI shape (proposed)

Separate jobs so one slow/flaky area doesn’t mask others: `typecheck+lint` →
`unit` → `build` → `static-export e2e` → `browser-compat` → `a11y` →
`dependency-audit` → `bundle-budget`. External providers and camera/display
permissions are mocked/deterministic in CI; real-provider integration tests are
opt-in behind a flag and secret, never in the default run.
