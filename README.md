# Movera Admin

The admin panel for Movera dispatch. The app is in [`webapp/`](webapp/README.md) (React +
TypeScript + Vite); `contracts/` is the byte-for-byte copy of the shared contract
(v0.18.65, synced with `tools/sync_contract.sh v<version>`, never edited by hand);
`docs/` holds decisions and audits. The live admin is published from `webapp/` to
`https://baccarisverige-ux.github.io/Admin-panel-movera-dispatch/live/`.

The three files at the root (`index.html`, `app.js`, `styles.css`) are the old static
spec; they are no longer published.
