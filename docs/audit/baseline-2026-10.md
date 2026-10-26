# Admin panel — Phase 1 baseline audit (2026-10)

Branch `audit/phase-1`, base `origin/main` @ 2614394. Documentation only.

## Done / Not done yet
- [x] 1 Structure and architecture
- [x] 2 Dependencies
- [x] 3 CI
- [x] 4 Baseline run
- [x] 5 Coverage
- [x] 6 Page inventory
- [x] 7 Code quality
- [x] 8 Live test week gaps
- [x] 9 Untested features and risks
- [x] 10 Summary

## 1. Structure and architecture

- App: `webapp/` (React 19, Vite 6, react-router 7, TanStack Query/Table). 187 `.tsx` + 173 non-test `.ts` files in `webapp/src`. Legacy static admin still at repo root (`index.html`, `app.js`, `styles.css`), deployed to `/legacy/` by pages.yml.
- **Mode switch** `webapp/src/api/create.ts:901-909` `createAdminApi`: `VITE_ADMIN_API` = `http` or an http(s) URL -> `createHttpAdminApi` (`kind: "http"`); otherwise the in-browser fixture store (`kind: "fixture"`); a production build without `VITE_DATA=demo` throws "Production refuses the simulation adapter." (`create.ts:906-907`).
- **The http adapter implements only `ready()` and `page()`** (`create.ts:866-898`); `list, search, command, revision, audit, approvals, operation, inbox, freshness, readSlice, tripOffers, nearbyDrivers, dispatchEvents` all call `unsupported()` which throws `ApiError(0, "Admin API is not connected.")` (`create.ts:130-132`).
- **LIVE pages** (render against movera-server only in live mode, `App.tsx:73-80` `LiveScreen` + `App.tsx:202-209`): Drivers list, Onboarding (= drivers filtered `on_hold`), Driver detail with documents, Fleets list + detail (code, invitations, remove driver, fleet review), Vehicles list/review, plus Live sign-in and setup-password (`webapp/src/live/*`). Live start page redirects `/` -> `/drivers` (`App.tsx:183`).
- **Everything else is DEMO-only** even in the live build: dashboard, trips, trip detail, reservations, live map, dispatch, offers, alerts, riders, rider detail, payments, payouts, zones, pricing, support, chat, incidents, risk, messages, content, promotions, reviews, team, audit, settings, confirm, system, gates, design. In live mode `Screen` (`App.tsx:82-125`) falls through to the demo page component, whose data hooks call the http adapter and get "Admin API is not connected." The menu is not filtered by mode (no live check in `nav.ts` / `layout/AppShell.tsx`; only the footer says "Live data", `AppShell.tsx:307`). **The owner sees the whole menu on the live site, but only the people area works.** (Rendering of those error states in the live build: NOT VERIFIED in a browser; derived from code.)
- Zones and the zone pricing book are stored in `localStorage` key `movera-admin-zones-v4` (`zones/bookStore.ts:70-118`), no fetch in `zones/` or `pages/Zone*.tsx`: a zone/pricing "publish" never reaches the server in either mode.
- **Session/auth.** Demo: `auth/sessionStore.ts` keeps the signed-in agent and team in `localStorage` (`movera-admin-session`), single demo password `DEMO_PASSWORD = "movera"` (`auth/permissions.ts:42`), role tables in `permissions.ts`. Live: `live/session.ts` bearer + refresh tokens in memory and `sessionStorage` (`session.ts:3,28`), endpoints `/api/v1/admin/auth/{sign-in,refresh,me,sign-out,setup-password,setup-password/check}`; permissions from the server's expanded list (`App.tsx:136`). E2E asserts tokens never reach localStorage (`e2e/live-people.spec.ts:184`).
- **Commands registry** `commands/registry.ts` (734 lines): `ActionSpec` with permission, reason, destructive, idempotent, versioned, audit, allowedStates, secondAdmin, writes; 412 distinct `admin.*` ids (largest groups: zone 44, pricing 40, trip 24, rider 24, dispatch 19). Executed only by the fixture adapter; the live pages post directly to server paths.
- **i18n** `i18n/`: en, fr, sv, 5203 lines each; `i18n/i18n.test.ts` in the unit run. E2E forces English (`VITE_ADMIN_LANGUAGE=en`).
- **Routing** `App.tsx:181-236`, BrowserRouter with base from `BASE_URL`; menu in `nav.ts` (33 menu items); default-deny per route permission (`App.tsx:133-138`); unknown path -> NotFound.

## 2. Dependencies

`webapp/package.json`: deps @tanstack/react-query ^5.104.1, @tanstack/react-table ^8.21.3, @turf/* ^7.2.0 (8 packages), @vis.gl/react-google-maps ^1.10.1, lucide-react ^1.52.0, maplibre-gl ^5.15.0, qrcode-generator ^2.0.4, react/react-dom ^19.0.0, react-router ^7.18.4, terra-draw ^1.36.0 (+ google/maplibre adapters), zod ^4.6.5. Dev: eslint ^10.12, typescript ^5.7.3, typescript-eslint ^8.71, vite ^6.0.7, @vitejs/plugin-react ^4.3.4, @playwright/test ^1.63.0, @types/node ^26.6.4.

- Unused: none found; every runtime dependency is imported in `src` (grep count per package 1–193). Both Google Maps and MapLibre stacks are shipped.
- `npm audit --omit=dev`: **2 vulnerabilities (1 high, 1 critical)**: maplibre-gl <=6.4.0 critical (GHSA-jrc7-96c5-q579, XSS sanitizer bypass; fix = maplibre-gl 6.16.0, breaking); zod <4.6.6 high (GHSA-mrhx-c7xc-m3w5; `npm audit fix`).
- `npm audit` (full): **4 (3 high, 1 critical)**: + vite <=6.4.3 high (GHSA-9jrq-w75r-8gcw, GHSA-rq7h-c2jc-7f22, launch-editor advisories), source-map-js 1.0.0–1.2.1 high (GHSA-68fv-2mgg-jv7q); both fixable with `npm audit fix`.
- Build warns about chunks >500 kB: `mapStyle-*.js` 1,022 kB (277 kB gz), `index-*.js` 875 kB (271 kB gz).

## 3. CI

- `webapp-ci.yml` (PR + push main, Node 22, npm cache): `npm ci`, `tsc -b`, `npm run lint --if-present`, `npm test`, `playwright install --with-deps chromium`, `npm run e2e`, `npm run e2e:live`, `vite build`. No timeout-minutes, no concurrency.
- `pages.yml` (push main): `npm ci`, `npm test`, `tsc -b`, demo build with `VITE_DATA=demo`; live build only if repo var `MOVERA_LIVE_API_URL` set (must be https); assembles demo at `/`, live at `/live/`, legacy at `/legacy/`. Deploy does not wait for webapp-ci (no lint/e2e gate before deploy).
- `admin-browser-matrix.yml`: only on PRs to branches `admin/r17-dashboard-reports`, `admin/r18-quality` or manual; chromium/firefox/webkit matrix config. Effectively dormant on main.
- Gaps vs plan Phase 2 table: no format check (no Prettier; ESLint has 39 warnings, not failing); no coverage report; no `npm audit`; no secret scan; no job timeouts; branch protection status NOT VERIFIED (no admin API access used). Lockfile install, tsc, ESLint, node tests, vite build, Playwright: present.

## 5. Coverage

Node's built-in coverage (`node --experimental-test-coverage` over the package.json test list, 257 pass): all loaded files 97.55% lines, 83.10% branches, 91.08% functions. **Caveat:** it only counts files imported by the unit tests (241 files); no `.tsx` page/component is measured, and these non-test `.ts` modules are never loaded: activityLog, assignContext, zones/bookStore, demo, history, hooks (api/hooks.ts), insights, locateLayer, mapIcons, ownerOps, performance, dispatch/prefill, api/read, rows, surgeLayers, useAlertSignals, useAlerts, useCategoryPrices, useCountrySettings, useMarketScope, useRefundPolicy, useRidersData, useSurgePref (+ small UI hooks).
Critical modules: `live/session.ts` 92.5% lines / 77.2% br; `api/create.ts` 96.5/88.8; `api/httpClient.ts` 94.1/89.6; `commands/registry.ts` 100/95.5; `auth/permissions.ts` 93.7/70.6; `pricing/quote.ts` 85.5/77.1 (66-89 uncovered); `pricing/zonePricing.ts` 95.9/73.3; `payments/finance.ts` 98.7/**47.7 br**; `payments/ledger.ts` 92.7/80; `payments/refundPolicy.ts` 100/91.7; `dispatch/cancelFees.ts` 99/89.7; `contract/money.ts` 97.3/84. `live/format.ts` and `live/session.ts` are the only live modules with unit tests; the live page components are covered only by `e2e/live-people.spec.ts` (6 tests, faked server).

## 6. Page inventory

Mode: L = live against server in live build, D = demo fixtures only. e2e = number of spec files that `goto` the path.

| Page | Path | Perm | Mode | e2e files |
|---|---|---|---|---|
| Dashboard | / | overview.read | D (live redirects to /drivers) | 52 |
| Reports | /reports | overview.read | D | 4 |
| Handover | /handover | overview.read | D | 1 |
| Alerts | /alerts | overview.read | D | 3 |
| Trips (+/trips/:id) | /trips | trips.read | D | 10 |
| Reservations (+:id) | /reservations | trips.read | D | 5 |
| Live map | /live | trips.read | D | 4 |
| Dispatch | /dispatch | trips.read | D | 11 |
| Offers | /offers | trips.read | D | 2 |
| Incidents (+:id) | /incidents | incidents.read | D | 6 |
| Risk | /risk | safety.edit | D | 3 |
| Riders (+:id) | /riders | riders.read | D | 3 |
| Drivers (+:id) | /drivers | drivers.read | **L** | 12 (+live-people) |
| Fleets (+:id) | /fleets | drivers.read | **L** | 2 (+live-people) |
| Vehicles (+:id) | /vehicles | drivers.read | **L** | 3 (+live-people) |
| Onboarding | /onboarding | drivers.read | **L** (drivers on_hold) | 4 |
| Payments (+:id) | /payments | finance.read | D | 7 |
| Payouts (+:id) | /payouts | finance.read | D | 4 |
| Zones (+:id) | /zones | zones.read | D (localStorage) | 2 |
| Pricing | /pricing | settings.read | D | 3 |
| Support (+/tickets/:id) | /support | support.reply | D | 1 |
| Chat | /chat | support.reply | D | 1 |
| Messages | /messages | settings.read | D | 3 |
| Content | /content | settings.read | D | 4 |
| Promotions | /promotions | settings.read | D | 1 |
| Reviews | /reviews | settings.read | D | 2 |
| Team (+:adminId) | /team | team.read | D | 3 |
| Audit | /audit | audit.read | D | 3 |
| Settings | /settings | settings.read | D | 5 |
| Confirm (approvals) | /confirm | settings.read | D | 2 |
| System | /system | system.read | D | 4 |
| Gates | /gates | system.read | D | **0** |
| Design | /design | system.read | D | **0** |
| Live sign-in / setup-password | (live only) | — | **L** | live-people |

Actions: demo pages run the 412 registry commands (counts per entity in section 1). Live actions (from `webapp/src/live/*`): driver status change, document review + file open, fleet review, fleet code regenerate, fleet invitation accept/cancel, remove driver from fleet, vehicle review, sign-out. Per-button inventory for every demo page: not done in Phase 1 (registry is the source).

## 7. Code quality

- Very large files: `i18n/{en,fr,sv}.ts` 5203 lines each; `dispatch/rules.ts` 1647; `zones/releases.ts` 1348; `api/create.ts` 910; `pricing/zonePricing.ts` 851; `pages/ZoneCanvas.tsx` 851; `data/catalog.ts` 742; `pages/DashboardPage.tsx` 736; `commands/registry.ts` 734.
- Duplicated logic: business rules (fares/quotes `pricing/quote.ts`, cancel fees `dispatch/cancelFees.ts`, refund policy `payments/refundPolicy.ts`, ledger/finance, trip transitions `trips/rules.ts`, dispatch `dispatch/rules.ts`) are reimplemented client-side for the fixture server; they duplicate what movera-server owns and can drift. Whether they match the server: NOT VERIFIED.
- Demo code reachable in live mode: yes — all demo page components are routed in the live build (`App.tsx:82-125`); fixture modules are bundled into the live build (single bundle; tree-shaking not checked). Zones/pricing localStorage book is active in live mode.
- Client-side money: see above; in live mode the live pages do no money math (they show server values) — NOT VERIFIED in depth.
- Permission checks: demo enforces in the fixture server + UI; live uses server permissions for route gating (`App.tsx:136`), and the server enforces per route (e.g. `movera-server/src/admin/tripRoutes.ts:98-117` `trips.intervene`, `payments.refund`).
- Tokens: live tokens in `sessionStorage` + memory only (good, e2e-asserted). Demo session, sign-in log, zone book, activity log in `localStorage` (demo data only).
- Secrets: no key found by grep (`AIza`, api_key/secret/password literals) other than the demo password; no `.env` committed. Maps key comes from GitHub secret `VITE_GOOGLE_MAPS_KEY` and ends up in the public bundle by design (must be referrer-restricted: NOT VERIFIED).
- Console logging: no `console.log/info/debug/warn/error` in non-test src.
- ESLint: 0 errors, **39 warnings** (react-hooks/exhaustive-deps etc.).
- Error handling: live pages map server errors (stale version reload e2e-tested `live-people.spec.ts:240`); demo pages in live mode get a generic "Admin API is not connected."

## 4. Baseline run (webapp/, 2026-10-26, Node v22.22.0, sandbox container)

| Step | Result | Wall time |
|---|---|---|
| `npm ci` | ok (warns: run npm audit) | 25 s |
| `npx tsc -b` | exit 0 | 42 s |
| `npm run lint` | exit 0, **0 errors / 39 warnings** | 29 s |
| `npm test` (node --test, 93 files) | **257 pass / 0 fail** | 33 s |
| `npm run build` | exit 0, chunk-size warning | 179–194 s |
| `npx playwright test` (CI=1: prod build + preview, retries 1) | **239 passed, 4 flaky, 2 failed** of 245 | 28.8 min (1735 s) |
| `npm run e2e:live` (CI=1) | **6 / 6 passed** | 57 s |

Browser note: the repo pins @playwright/test 1.63.0 (wants chromium build 1243); the container has build 1194, so both e2e runs launched `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` via `executablePath` (main config through a temporary wrapper config, not committed; live config via its `PW_CHROMIUM` env). A browser-version effect on the failures cannot be excluded.

Failures (both failed again on a single rerun with `--retries=0`, so reproducible here, not flaky):
1. `e2e/dispatch.spec.ts:136` "live: alerts, pause a zone needs approval, send a rider to a radar" — `locator.click: Test timeout of 30000ms exceeded.` waiting for `getByTestId('assign-panel').getByTestId('assign-radar').getByRole('button', { name: /^Send radar/ })`; the button resolved, visible, enabled and stable, title "No free driver inside right now. The radar still goes out and reaches drivers who come in.", click never completed (line 149).
2. `e2e/touch-draw.spec.ts:39` "bonus areas: rectangle, circle, shape and free hand with a finger" — `touchscreen.tap: Test timeout of 60000ms exceeded.` at line 22 (first run, retry: `locator.tap` timeout waiting for toolbar "Bonus drawing tools" button "Free hand", line 70).

Flaky (failed first, passed on retry): `fleet.spec.ts:113` (driver on a trip map), `map-money-back-supply.spec.ts:14` (Dispatch supply vs demand), `operations.spec.ts:49` (trip page who gets what), `touch-draw.spec.ts:76` (new zone drawn with a finger: `page.waitForFunction` 60 s timeout waiting for `window.__moveraMap`). All are map-heavy.

## 8. Live test week: what the live panel can and cannot do

Server admin routes (read-only grep of `/home/user/movera-server/src`, all under `/api/v1`): auth (sign-in, refresh, me, sign-out, setup-password[/check]), `POST admin/agents/:adminId/setup-link`, approvals list + decision, audit, config `GET/PUT :doc` + `POST :doc/publish`, documents file + review, drivers list/detail/status, fleets list/detail/code/review/invitations/remove driver, `GET admin/live/drivers` (`drivers/routes.ts:153`), payments list, refunds payouts list + `POST refunds/:refundId/paid` (`admin/tripRoutes.ts:92`), riders list + status, trips list/detail/nearby-drivers/offers/trace, trip commands cancel/reassign/assign/radar-group/no-show/complete/driver-bonus/adjust/refund (`admin/tripRoutes.ts:109-117`), vehicles list + review, zone dispatch-control GET/PUT.

Panel live calls (`webapp/src/live/*`): auth, drivers, driver status, documents file/review, fleets (detail, code, review, invitations accept/cancel, remove driver), vehicles list/review. That is all.

**Can do live:** sign in / set password, see drivers and onboarding queue, review documents (incl. invitations, fleets, vehicles), activate/suspend drivers, fleet codes and memberships.

**Cannot do live although the server has the route:** trips list and trip detail/trace; any trip intervention (cancel, reassign, manual assign, radar group, no-show, complete, adjust, driver bonus); **refunds** and marking refund payouts paid; payments list; riders list and rider suspend; live driver map (`admin/live/drivers`); dispatch control per zone; config draft/publish (pricing/settings publish to server); approvals (second-admin) and audit log; admin team setup links.
**Cannot do live and the server has no admin route (grep found none):** manual booking for a rider, reservations, zones geometry publish (zone book is browser-local), support tickets/chat, incidents/safety, messages/content/promotions/reviews, payouts to drivers, reports/dashboard.
Owner risk: the live menu shows all these pages (section 1); they show "Admin API is not connected" style errors or demo-only behaviour.

## 9. Untested features and risks

| Sev | Risk | Evidence |
|---|---|---|
| S1 | Operators cannot intervene in live trips (cancel/reassign/refund) from the panel during the test week; would need DB or API by hand | section 8 |
| S2 | Live build exposes ~29 demo-only pages without a "not live" marker; owner/operators may believe actions took effect | `App.tsx:82-125`, `create.ts:880-897` |
| S2 | Zone and pricing edits saved in browser localStorage in live mode, never reach the server | `zones/bookStore.ts:70-118` |
| S2 | maplibre-gl critical XSS advisory in prod deps; zod high | section 2 |
| S2 | 2 e2e tests fail reproducibly (dispatch radar, touch-draw bonus areas) + 4 flaky map tests; CI has retries=1 | section 4 |
| S2 | pages.yml deploys main without waiting for webapp-ci (no e2e/lint gate before deploy) | `.github/workflows/pages.yml` |
| S3 | Client-side copies of fare/cancel-fee/refund/ledger rules may drift from server (demo shows numbers the server would not) | section 7 |
| S3 | Live pages covered only by 6 e2e tests on a faked server; no test against a real movera-server | `playwright.live.config.ts` |
| S3 | No coverage for any `.tsx`; `payments/finance.ts` 47.7% branches; `pricing/quote.ts` lines 66-89 untested | section 5 |
| S3 | Gates and Design pages have no e2e | section 6 |
| S4 | 39 ESLint warnings, chunks 0.9–1.0 MB, vite/source-map-js dev advisories, browser matrix workflow dormant | sections 2–4 |

## 10. Summary — top 10 findings

| # | Sev | Finding | Action | Phase |
|---|---|---|---|---|
| 1 | S1 | Live panel has no trips list/detail or trip interventions though server routes exist | Build live Trips + trip commands on `admin/trips*` | 5 (before test week) |
| 2 | S1 | No live refunds / refund payouts / payments | Wire `trips/:id/refund`, `refunds/payouts`, `refunds/:id/paid`, `payments` | 5 |
| 3 | S2 | Live build shows ~29 demo-only pages as if live | Hide or badge non-live menu items in live mode | 2/5 (quick) |
| 4 | S2 | Zones/pricing edits stored in localStorage even in live mode; config publish not wired | Wire `admin/config/:doc` + publish; block local book in live | 5 |
| 5 | S2 | No live riders list/suspend, live driver map, dispatch control, approvals, audit | Wire existing server routes | 5 |
| 6 | S2 | maplibre-gl critical + zod high in prod deps | Upgrade zod (audit fix) and maplibre-gl 6.x | 2 |
| 7 | S2 | 2 reproducible e2e failures + 4 flaky map tests | Triage in CI's real browser; fix or quarantine | 2 |
| 8 | S2 | Deploy (pages.yml) not gated on webapp-ci | Require checks / branch protection (D1) | 2 |
| 9 | S3 | CI lacks npm audit, secret scan, coverage, timeouts, format check | Add per Phase 2 table | 2 |
| 10 | S3 | Live pages tested only on a faked server; client business rules duplicated | Add live e2e against real server in Phase 3 harness | 3 |

## NOT VERIFIED
- Live build behaviour of demo pages in a browser (derived from code only).
- Branch protection settings on GitHub (not queried).
- Whether e2e failures also happen with chromium 1243 / in GitHub CI (sandbox has 1194 only).
- Google Maps key referrer restriction.
- Agreement of client-side money rules with the server.
