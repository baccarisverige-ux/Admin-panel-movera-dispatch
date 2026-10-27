# Audit Phase 7 (admin): performance, measured

Date: 2026-10-27. Branch `audit/phase-7`. Plan: `movera-contracts/docs/audit/AUDIT_PLAN.md`, Phase 7.

Method: `vite build` of the live panel (`VITE_ADMIN_API` set, sign-in page) and of the demo panel (`VITE_DATA=demo`), served locally without compression, 5 cold loads each in headless Chromium (Playwright 1.56), audit container. "First screen" is the first input or button rendered in `#root`.

## Measured

| Build | load event | first screen | requests | bytes | JS heap after GC |
|---|---:|---:|---:|---:|---:|
| live (sign-in page) | 189–199 ms | 521–537 ms | 4 | 1.2 MB | 3.1 MB |
| demo | 199 ms | 259 ms | 3 | 1.26 MB | 3.2 MB |

What the first load downloads: the entry script `assets/index-*.js` (877,765 bytes, 270,926 gzip) and `assets/index-*.css` (353,586 bytes, 60,074 gzip). Every page is a lazy chunk; the largest, `mapStyle-*.js` (1,091,743 bytes: MapLibre, shared by the map pages), and the MapLibre worker (519,372 bytes) load only with a map page, not at start (checked: not in `index.html`, not among the first load's 4 requests).

No measured problem in the admin; nothing changed in the app.

## Budget added (CI)

- `webapp/scripts/check-bundle.mjs`, step "First-load size budget" after "Build" in `webapp-ci.yml`: the entry script at most 970,000 bytes raw / 300,000 gzip, the entry stylesheet at most 390,000 / 66,000 (baseline plus about 10 %). Only files `index.html` names are counted, so a page that moves into the entry chunk by mistake fails the build.
