import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { en } from "./en.ts";
import { needsTranslation, scanSource, scanTree } from "./untranslated.ts";

/**
 * Owner rule: every text of the panel is in sv, fr and en; a text in one language only is a bug. This scans every
 * file under src and fails on a text an admin reads that does not go through tr()/trx()/trn().
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const KNOWN = new Set(Object.keys(en));

test("no English-only text in the panel: JSX text, labels, notices and CSV headers go through tr()", () => {
  const findings = scanTree(ROOT, KNOWN);
  assert.deepEqual(findings.map((finding) => `${finding.file}:${finding.line} ${finding.where} "${finding.text}"`), []);
});

test("the scan finds what it should and leaves brands, ids and symbols alone", () => {
  const code = `
    export function Page({ on }: { on: boolean }) {
      notify("Saved.");
      useCsv(onCsv, { name: "x", head: ["Zone", "Something nobody wrote"], rows: [] });
      return (
        <section aria-label="Zone list" title={tr("Done")}>
          <h2>Zones
            in this country</h2>
          <p>{on ? "Turned on" : tr("Off")} · {"SE-STO"}</p>
          <input placeholder={\`Search \${on}\`} />
          <b>{tr("Done")}</b> <i>Movera</i> <i>km</i> <i>→</i> <code>rider_support</code>
        </section>
      );
    }`;
  const found = scanSource("x.tsx", code, KNOWN).map((finding) => `${finding.where} ${finding.text}`);
  assert.deepEqual(found, [
    "notify() Saved.",
    "CSV header Something nobody wrote",
    "aria-label= Zone list",
    "JSX text Zones in this country",
    "JSX value Turned on",
    "placeholder= Search",
  ]);
  for (const text of ["Movera", "SMS", "D0042", "admin.zone.update", "child_seat", "12 km", "→", "https://movera.se"]) assert.equal(needsTranslation(text), false, text);
  for (const text of ["Email", "Save", "economy", "days"]) assert.equal(needsTranslation(text), true, text);
});
