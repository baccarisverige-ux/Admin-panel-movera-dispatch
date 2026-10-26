# Admin panel — Phase 1 baseline audit (2026-10)

Branch `audit/phase-1`, base `origin/main` @ 2614394. Documentation only.

## Done / Not done yet
- [x] 1 Structure and architecture
- [x] 2 Dependencies
- [x] 3 CI
- [ ] 4 Baseline run
- [x] 5 Coverage
- [x] 6 Page inventory
- [x] 7 Code quality
- [ ] 8 Live test week gaps
- [ ] 9 Untested features and risks
- [ ] 10 Summary

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
