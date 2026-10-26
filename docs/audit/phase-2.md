# Phase 2 — CI hardening (Admin panel)

Branch `audit/phase-2`. Plan: `movera-contracts` `docs/audit/AUDIT_PLAN.md` Phase 2. Baseline: `docs/audit/baseline-2026-10.md` (branch audit/phase-1).

## Status

| # | Item | Status |
|---|---|---|
| 1 | webapp-ci as the required gate; Pages deploy after the gate | Done (CI evidence: see PR) |
| 2 | Advisories: zod 4.6.7, maplibre-gl 6.16.0 | Done, no allowlist needed |
| 3 | 2 reproducible e2e failures + 4 flaky map tests | Root causes found and fixed in the app (3 bugs); see limits below |
| 4 | Contract copy = movera-contracts main | Done: main (#145) already synced v0.5.6; verified identical to contracts main 1e650f5 |

## 1. CI gate

`.github/workflows/webapp-ci.yml` ("Webapp checks"), on pull_request, push to main and manual; `concurrency` per ref with
cancel-in-progress; `timeout-minutes` on every job; npm cache on setup-node. Jobs (check names as GitHub shows them):

| Job id | Check name | What |
|---|---|---|
| checks | `typecheck, lint, unit tests, build` | `npm ci`, `tsc -b`, `npm run lint:ci`, `npm test`, `vite build` |
| audit | `npm audit (production dependencies, high and above)` | `npm audit --omit=dev --audit-level=high` |
| secrets | `secret scan` | gitleaks v8.21.2 (docker image), full git history, redacted output |
| e2e | `Playwright e2e` | `npx playwright install --with-deps chromium` (the build matching the pinned @playwright/test), `npm run e2e` |
| e2e-live | `Playwright e2e (live, faked server)` | same install, `npm run e2e:live` |

**Required checks to set on `main` (owner decision D1; not changed by this phase):** the five check names above.

`pages.yml` now runs on `workflow_run` of "Webapp checks" (completed, branch main) and deploys only when that run's
conclusion is `success` and it was a push (not a PR); it checks out and stamps the gated commit (`workflow_run.head_sha`).
Manual `workflow_dispatch` is kept for emergencies. `admin-browser-matrix.yml` got a timeout and concurrency.

### Lint: 39 warnings
All 39 are `react-hooks/exhaustive-deps` (list below). Most are deliberate dependency choices (e.g. `ids.join(",")`
keys to keep memo identity stable; map effects that must not re-run on every render). Changing them changes when map
layers and memos re-run, which is behaviour work with its own tests, not a CI change. Decision: the gate
(`lint:ci` = `eslint src --max-warnings 39`) fails on any error and on any new warning (ratchet); no rule is disabled
or suppressed. Reduce the number as the files are touched in Phase 4/5 and lower the limit with it.

Files: alerts/useAlerts.ts (2), dashboard/DriversMap.tsx (4), dispatch/TestView.tsx (4), dispatch/maps.tsx (2),
messages/AreaMap.tsx (1), pages/DispatchPage.tsx (2), pages/HandoverPage.tsx (1), pages/ReportsPage.tsx (3),
pages/SafetyPage.tsx (1), pages/VehicleDetailPage.tsx (1), pages/ZoneCanvas.tsx (4), pages/ZoneWizard.tsx (2),
reports/ExtraTabs.tsx (8), reports/Tabs.tsx (3), reports/WorkTab.tsx (1).

Evidence: local `npm run lint:ci` → `0 errors, 39 warnings`, exit 0.

## 2. Advisories

- `zod` ^4.6.5 → ^4.6.7 (GHSA-mrhx-c7xc-m3w5, high). `maplibre-gl` ^5.15.0 → ^6.16.0 (GHSA-jrc7-96c5-q579, critical).
- maplibre 6 adaptation: no default export any more → `import * as maplibregl` (6 files); its worker is loaded from
  `new URL("./maplibre-gl-worker.mjs", import.meta.url)`, which does not exist after Vite bundles it, so every map
  failed with "Worker failed to load" (reproduced in a probe: `window.__moveraMap` never set). Fix:
  `src/ui/maplibreWorker.ts` (`setWorkerUrl` with Vite's `?url` asset), imported by every module that creates a map.
  The build now emits `assets/maplibre-gl-worker-*.mjs`. terra-draw-maplibre-gl-adapter peer range `maplibre-gl >=4`.
- Evidence: local `npm audit --omit=dev --audit-level=high` → `found 0 vulnerabilities`; CI job "npm audit" green.
  No advisory allowlisted.

## 3. E2E failures and flakes: root causes

Measured in this sandbox with Chromium 1194 (`PW_CHROMIUM`, new env hook in `playwright.config.ts`, the same one the
live config already had), against the production build. CI installs the Chromium matching @playwright/test 1.63.

1. **Busy main thread on map pages (dispatch.spec.ts:136 "Send radar" click never completing; also the Full screen /
   Escape steps).** `src/pricing/surgeLayers.ts` ran its "pulse" animation ~12×/s for ever and called
   `setPaintProperty` even while the surge layers were hidden; every call repaints the whole map, which without a GPU
   costs 100–250 ms. Long-task probe on `/dispatch?view=live`: before ≈2.1 s of long tasks per 2 s (main thread
   saturated); after: mostly 0, bursts only when the simulation moves cars. Fix: animate only a visible layer.
   Evidence: `--repeat-each=6 --workers=3` on dispatch.spec.ts:136: main 3/6 failed, this branch 6/6 passed.
2. **Maps waited on the tile server.** Five maps added their zones/pins on `"load"`, which also waits for the
   OpenFreeMap TileJSON; the ZoneCanvas test hook `window.__moveraMap` was published on `"idle"`, which waits for every
   tile. A slow tile server therefore left zones off the map and made the e2e that waits for the hook time out
   (touch-draw.spec.ts:76, bonus.spec.ts:91 flakes). `src/ui/mapStyle.ts` already promised "pins and zones never wait
   for tiles" and DriversMap already used `"style.load"`. Fix: `"style.load"` in RouteMap, TestMap, AreaMap, SurgeMap,
   ZoneCanvas; the hook is also published on `"moveend"` (camera settled), not only on `"idle"`. (A first version
   replaced `"idle"` by `"moveend"`; CI then failed zones.spec.ts:261, which waits for a new generation after a
   step that repaints without moving the camera, so both events publish now.) Probe with the tile host answering
   503 / never answering: before, hook never set (15 s); after, set in about 1 s in both cases.
3. **maplibre 6 worker** (item 2), which made every map test fail after the upgrade.

Full local run after the fixes (`--retries=0`, 4 workers): **243 passed, 2 failed** (touch-draw.spec.ts:39 and
zones.spec.ts:261), both ZoneCanvas drawing tests. Their traces show no hang: each step is just slow (a 350 ms
`waitForTimeout` took 1.3 s) while this shared machine ran at load average 10–15 on 4 cores; 4 parallel copies of
touch-draw:39 failed 8/8, 2 parallel copies (CI's worker count) passed 4/4. Not changed: the fixed
`waitForTimeout` calls in touch-draw/zones specs predate this phase; replacing them with condition waits is listed
under Not done.

## 4. Contract

`main` received the v0.5.6 sync (#145) while this branch was open; the branch merged main and takes main's copy.
`tools/sync_contract.sh 1e650f5` (movera-contracts main, v0.5.6) leaves `contracts/` unchanged → identical.
Unit tests 257/257, tsc clean.

Product mismatches for Phase 3/5 (not changed here):
- The admin shows nothing for v0.5.5 `POST /trips/{id}/raise-price` (no `rider_raise` fare line in trip money, no
  "raised by rider" in the trip timeline) or v0.5.4 `rider_on_the_way` (event kind is known, not displayed).
- `contract.json#dispatch.raisePrice.note`: "The raise_price waiting step stays skipped", but Dispatch › waiting steps
  (`src/dispatch/rules.ts`) still offers a `raise_price` step, on by default.

## Not done
- Lint warnings not fixed (ratchet instead, reasons above).
- Fixed sleeps in `e2e/touch-draw.spec.ts`, `e2e/zones.spec.ts`, `e2e/bonus.spec.ts` (pre-existing) not replaced.
- No coverage report / format check (plan table); no Prettier in this repo.
- Branch protection not changed (owner decision D1).
