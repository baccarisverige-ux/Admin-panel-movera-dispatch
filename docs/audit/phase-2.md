# Phase 2 — CI hardening (Admin panel)

Branch `audit/phase-2`. Plan: `movera-contracts` `docs/audit/AUDIT_PLAN.md` Phase 2. Baseline: `docs/audit/baseline-2026-10.md` (branch audit/phase-1).

## Status

| # | Item | Status |
|---|---|---|
| 1 | webapp-ci as the required gate; Pages deploy after the gate | in progress |
| 2 | Advisories: zod, maplibre-gl | not started |
| 3 | 2 reproducible e2e failures + 4 flaky map tests | not started |
| 4 | Contract copy synced to movera-contracts main (v0.5.5) | not started |

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
