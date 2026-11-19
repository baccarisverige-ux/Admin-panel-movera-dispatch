import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bookFromServer, type AlertBookState } from "../live/liveAlerts.ts";
import { normalizeAlertBook } from "./engine.ts";

/**
 * MF3 (contract v0.18.131, contract.json#alertDesk.serverDetection.liveList.more / adminLine): the server sends
 * AlertBookState.alertsMore only when it left alerts out (open non-safety past 1000, solved past 1000). The Alerts page
 * keeps it through bookFromServer and normalizeAlertBook and shows one line under the Open list.
 * Fails before: `more` is dropped, the line and its texts do not exist.
 */
const base: AlertBookState = { rev: 1, settings: {}, rules: [], records: [], mutes: {}, quiet: { on: false, from: "22:00", to: "07:00" }, people: [], alerts: [] };

test("alertsMore from the server reaches the page's book", () => {
  const book = normalizeAlertBook(bookFromServer({ ...base, alertsMore: { open: true, solved: false } }, null));
  assert.deepEqual(book.more, { open: true, solved: false });
});

test("no alertsMore (or both false): no more marker", () => {
  assert.equal(normalizeAlertBook(bookFromServer(base, null)).more, undefined);
  assert.equal(normalizeAlertBook(bookFromServer({ ...base, alertsMore: { open: false, solved: false } }, null)).more, undefined);
});

test("the Open list draws the line only when the book has more", () => {
  const src = readFileSync(new URL("./OpenView.tsx", import.meta.url), "utf8");
  assert.match(src, /\{data\.book\.more \? <p className="al-more-note" role="note">\{tr\("More alerts than shown\. The oldest are left out; every safety alert is shown\."\)\}<\/p> : null\}/);
});

test("the line in en / sv / fr (Swedish neutral)", () => {
  const key = "More alerts than shown. The oldest are left out; every safety alert is shown.";
  const want: Record<string, string> = {
    en: key,
    sv: "Det finns fler larm än som visas. De äldsta visas inte; alla säkerhetslarm visas.",
    fr: "Il y a plus d'alertes que celles affichées. Les plus anciennes ne sont pas affichées ; toutes les alertes de sécurité sont affichées.",
  };
  for (const lang of ["en", "sv", "fr"]) {
    const file = readFileSync(new URL(`../i18n/${lang}/a5-m-n.ts`, import.meta.url), "utf8");
    assert.ok(file.includes(`${JSON.stringify(key)}: ${JSON.stringify(want[lang])}`), lang);
  }
});
