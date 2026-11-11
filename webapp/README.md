# Movera Admin (A1–A3)

React + TypeScript + Vite on Node 22. Layout shell, URL routing, design tokens, and all
admin screens; the live admin talks to movera-server (`VITE_ADMIN_API`). Typed mocks for
the unit tests live in `src/data/catalog.ts`. The contract copy is `../contracts/`
(version **0.18.64**, also `CONTRACT_VERSION` in `src/domain/contract.ts`).

The live GitHub Pages site is this app, built by `.github/workflows/pages.yml` after
"Webapp checks" succeeded on a push to `main`, at
`https://baccarisverige-ux.github.io/Admin-panel-movera-dispatch/live/` (the site root,
`/app/` and `/legacy/` redirect there). The three static files at the repo root
(`index.html`, `app.js`, `styles.css`) are the old spec and are no longer published
(owner 2026-11-04/05; archived in the Rules repo).

```bash
npm install
npm test            # unit tests (node --test, the list in package.json)
npm run dev
npx tsc -b          # typecheck
npm run lint:ci     # eslint, warning budget as CI
npx vite build && node scripts/check-bundle.mjs dist
npm run e2e         # Playwright, e2e/*.spec.ts except live-*
npm run e2e:live    # = npx playwright test --config playwright.live.config.ts: e2e/live-*.spec.ts against a faked server
```

`npm run e2e:live` builds and serves the production build on port 4174 (`PW_LIVE_PORT`
changes it; `PW_LIVE_DEV=1` uses the dev server). Playwright needs `npx playwright install
chromium` once.

Build-time variables (never commit values): `VITE_ADMIN_API` (the server, `https://…`),
`VITE_GOOGLE_MAPS_KEY`, `VITE_ADMIN_LANGUAGE`, `VITE_BUILD_SHA`. Pages reads the
`MOVERA_LIVE_API_URL` repository variable and the `VITE_GOOGLE_MAPS_KEY` secret.

## CI

`.github/workflows/webapp-ci.yml` ("Webapp checks", on every PR and push to `main`): jobs
`changes` (docs-only detection), `checks` (typecheck, lint, unit tests, build, bundle check),
`audit`, `secrets`, `e2e-shard` ×2 + `e2e`, `e2e-live`, and `gate`, the one job a branch
rule requires: green only when every job passed or was skipped on purpose (docs-only PR or
draft). `admin-browser-matrix.yml` records browser evidence. `contract-copy.yml` runs
`../tools/check_contract_copy.sh` on every PR and push and once a day opens or closes the
issue "Contract copy behind movera-contracts main".

## Contract copy

Never edit `../contracts/` by hand (Rule 43(4)). After a contract merge run
`tools/sync_contract.sh v<version>` from the repo root, bump `CONTRACT_VERSION` in
`src/domain/contract.ts`, add the `src/contract/sync0_18_NN.test.ts` check, and commit
`contracts/` exactly as it comes out.

## Working rules

- The owner's memory for the project is the Rules repository (`Movera-team/Rules`:
  `RULES.md`, `decisions/`, `plan/`). Read it first.
- Rule 25: a hand-written file over 1,500 lines is split before it is changed (i18n area
  files included; generated outputs and snapshots are exempt). Rule 21: never delete
  anything without asking the owner.
- Pull requests use `../.github/pull_request_template.md`; security problems go through
  `../SECURITY.md` (private reporting), never a public issue.
