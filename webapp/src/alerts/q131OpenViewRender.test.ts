import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Q131 follow-up SF-A (Rules audits/impact/s7-q131-admin-supervisor.md, mutants X3 and X4): the Open alert list is
 * really drawn in pages. OpenView is bundled with esbuild and rendered with react-dom/server (as confirmDetails.test.ts
 * does). The alert data and the session are stubbed; useState of OpenView can be given a start value, in the order the
 * component asks for them (quick, group, zone, state, selected, notice, paging), so "a filter changed after Show more"
 * can be drawn without a browser.
 *   X3 (OpenView ignores pagesFor: `const pages = paging.pages`) fails "a new filter starts on page 1".
 *   X4 (OpenView asks for the whole list) fails "50 rows, then Show more".
 */
const here = fileURLToPath(new URL(".", import.meta.url));

type Render = (open: unknown[], seeds?: unknown[]) => string;

async function bundle(): Promise<{ render: Render; done: () => void }> {
  const dir = mkdtempSync(join(tmpdir(), "q131-openview-"));
  const out = join(dir, "openview.mjs");
  const { build } = await import("esbuild");
  const reactShim = `import * as R from "react-real"; export * from "react-real"; export default R;
export function useState(init) { const seed = globalThis.__q131Seeds?.shift(); return R.useState(seed === undefined ? init : seed); }`;
  await build({
    stdin: {
      contents: `import { createElement } from "react-real"; import { renderToStaticMarkup } from "react-dom/server"; import { OpenView } from "./OpenView.tsx";
export const render = (open, seeds = []) => { globalThis.__q131Data = { open, old: [], counts: { critical: 0, important: 0, info: 0, mine: 0, notTaken: 0 }, book: { mutes: {}, records: {}, draftRev: 0 }, zones: [], now: ${Date.parse("2026-11-16T12:00:00Z")} }; globalThis.__q131Seeds = [...seeds]; return renderToStaticMarkup(createElement(OpenView)); };`,
      resolveDir: here, loader: "tsx",
    },
    bundle: true, format: "esm", platform: "node", outfile: out, jsx: "automatic", logLevel: "silent", define: { "import.meta.env": "{}" },
    banner: { js: `import { createRequire } from "node:module"; const require = createRequire(import.meta.url);` },
    plugins: [{
      name: "q131-stubs",
      setup(b) {
        b.onResolve({ filter: /^react-real$/ }, () => ({ path: fileURLToPath(import.meta.resolve("react")) }));
        // Only OpenView's own useState is seeded; react-dom and the rest get the real React.
        b.onResolve({ filter: /^react$/ }, (args) => (args.importer.endsWith("OpenView.tsx") ? { path: "react-shim", namespace: "q131" } : undefined));
        b.onResolve({ filter: /AlertsContext$|SessionContext$|AlertActions$|CommandButton$/ }, (args) => (args.importer.endsWith("OpenView.tsx") ? { path: args.path, namespace: "q131" } : undefined));
        b.onLoad({ filter: /.*/, namespace: "q131" }, (args) => {
          if (args.path === "react-shim") return { contents: reactShim, loader: "js", resolveDir: here };
          if (args.path.endsWith("AlertsContext")) return { contents: "export const useAlertsData = () => globalThis.__q131Data;", loader: "js" };
          if (args.path.endsWith("SessionContext")) return { contents: `export const useSession = () => ({ agent: { id: "A1" } });`, loader: "js" };
          if (args.path.endsWith("AlertActions")) return { contents: "export const AlertActions = () => null; export const StatusLine = () => null; export const agentName = (id) => id;", loader: "js" };
          return { contents: "export const CommandButton = () => null;", loader: "js" };
        });
      },
    }],
  });
  const { render } = (await import(pathToFileURL(out).href)) as { render: Render };
  return { render, done: () => rmSync(dir, { recursive: true, force: true }) };
}

const now = Date.parse("2026-11-16T12:00:00Z");
/** n open critical alerts and m open important ones, newest first (the list OpenView gets is already ordered). */
function alerts(critical: number, important: number) {
  const make = (level: "critical" | "important", i: number) => ({ id: `${level}-${i}`, kind: level === "critical" ? "no_driver" : "long_wait", group: "dispatch", level, title: `${level} ${i}`, detail: "", zoneId: "Z001", since: now - (i + 1) * 60_000, path: "/", status: "new", owner: null, record: null, muted: false });
  return [...Array.from({ length: critical }, (_, i) => make("critical", i)), ...Array.from({ length: important }, (_, i) => make("important", i))];
}
const rows = (html: string) => (html.match(/class="al-row /g) ?? []).length;
const more = (html: string) => /class="al-more".*?Show more \((\d+) left\)/.exec(html)?.[1];
const key = (quick: string) => JSON.stringify([false, quick, "all", "all", "open"]);

test("SF-A: OpenView draws 50 rows, then \"Show more (N left)\"; never the whole list (kills X4)", async () => {
  const { render, done } = await bundle();
  try {
    const html = render(alerts(40, 22));
    assert.equal(rows(html), 50);
    assert.equal(more(html), "12");
    // After "Show more" for this filter: all 62, no more row.
    const all = render(alerts(40, 22), [undefined, undefined, undefined, undefined, undefined, undefined, { key: key("all"), pages: 2 }]);
    assert.equal(rows(all), 62);
    assert.equal(more(all), undefined);
  } finally {
    done();
  }
});

test("SF-A: a new filter starts again on page 1, even after \"Show more\" (kills X3)", async () => {
  const { render, done } = await bundle();
  try {
    // Two pages were opened on "all"; then the Critical counter was chosen: 120 critical alerts, page 1 only.
    const html = render(alerts(120, 5), ["critical", undefined, undefined, undefined, undefined, undefined, { key: key("all"), pages: 2 }]);
    assert.equal(rows(html), 50);
    assert.equal(more(html), "70");
    // The same filter keeps its pages.
    const same = render(alerts(120, 5), ["critical", undefined, undefined, undefined, undefined, undefined, { key: key("critical"), pages: 2 }]);
    assert.equal(rows(same), 100);
    assert.equal(more(same), "20");
  } finally {
    done();
  }
});
