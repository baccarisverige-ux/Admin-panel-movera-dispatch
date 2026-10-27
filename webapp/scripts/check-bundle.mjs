// Audit Phase 7: size budget for what the admin's first page load downloads (the entry script and stylesheet
// index.html names; every page and the map library are loaded later, on demand).
// Usage: node scripts/check-bundle.mjs [dist]
// Baseline 2026-10-27 (vite build): entry script 877,908 B (gzip 271 KB), stylesheet 353,586 B (gzip 60 KB), first load
// 4 requests and about 1.2 MB in Chromium. Budgets are the baseline plus about 10 %; raise them on purpose in the
// change that needs the bytes, never to turn a red build green.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const BUDGET = { script: { raw: 970_000, gzip: 300_000 }, style: { raw: 390_000, gzip: 66_000 } };
const dist = path.resolve(process.argv[2] ?? "dist");
const html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
const entries = [...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+\.(js|css))"/g)].map((m) => ({ file: m[1].replace(/^.*\/assets\//, "assets/"), kind: m[2] === "js" ? "script" : "style" }));
let failed = entries.length === 0;
for (const { file, kind } of entries) {
  const data = fs.readFileSync(path.join(dist, file));
  const gz = zlib.gzipSync(data, { level: 9 }).length;
  const b = BUDGET[kind];
  const over = data.length > b.raw || gz > b.gzip;
  console.log(`${over ? "OVER" : "ok  "} ${kind} ${file}: ${data.length} B (budget ${b.raw}), gzip ${gz} B (budget ${b.gzip})`);
  failed ||= over;
}
if (failed) {
  console.error("::error::the admin's first load is over its size budget (scripts/check-bundle.mjs)");
  process.exit(1);
}
