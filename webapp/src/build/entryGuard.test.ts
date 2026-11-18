import assert from "node:assert/strict";
import test from "node:test";
import { entryProblems, HEAVY_OUT_OF_ENTRY, SAFETY_IN_ENTRY, webappPath } from "./entryGuard.ts";

const root = "/work/Admin-panel-movera-dispatch/webapp/";
const safety = SAFETY_IN_ENTRY.map((path) => root + path);

test("bundler ids become webapp paths (sources and libraries, query strings dropped)", () => {
  assert.equal(webappPath(`${root}src/live/liveAdminApi.ts`), "src/live/liveAdminApi.ts");
  assert.equal(webappPath("/home/x/other/webapp/node_modules/@turf/union/dist/esm/index.js"), "node_modules/@turf/union/dist/esm/index.js");
  assert.equal(webappPath(`${root}src/styles/alerts.css?used`), "src/styles/alerts.css");
});

test("an entry with the safety code and no heavy module passes", () => {
  assert.deepEqual(entryProblems([...safety, `${root}src/main.tsx`, `${root}src/live/listNames.ts`]), []);
});

test("every listed heavy module fails the build when it comes back into the entry", () => {
  for (const rule of HEAVY_OUT_OF_ENTRY) {
    const id = rule.endsWith("/") ? `${root}${rule}x/index.js` : root + rule;
    const problems = entryProblems([...safety, id]);
    assert.equal(problems.length, 1, rule);
    assert.match(problems[0], /heavy module back in the first load/);
  }
});

test("the alert bar, the SOS / alert sound and the live safety reads must stay in the entry", () => {
  for (const rule of SAFETY_IN_ENTRY) {
    const problems = entryProblems(safety.filter((id) => !id.endsWith(rule)));
    assert.deepEqual(problems, [`safety module not in the first load: ${rule} — it must stay eager (src/build/entryGuard.ts)`]);
  }
});
