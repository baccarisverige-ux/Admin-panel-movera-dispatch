import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { payoutPartLines, runCardOf, runPartLines, serverRunsOf } from "./payoutParts.ts";
import { approveRunValue } from "./payoutRunGuard.ts";
import { payoutSettingsOf } from "./payoutSettings.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";

/**
 * S5 J14 (contract v0.18.133 contract.json#payoutLines; owner 2026-11-19 "driver payout 3 lines", "carry line only when
 * needed", B2.7 "the card stops counting the first 100"). Rule 36: fails on main (no payoutParts.ts, no runs route).
 */
const SEK = (amountMinor: number) => ({ amountMinor, currency: "SEK" });

test("a payout with parts: Earned · Owed to Movera · Paid out, and 'Moves to next week' only when above 0 (server amounts)", () => {
  const week1 = payoutPartLines({ earned: SEK(0), owedToMovera: SEK(2473), paidOut: SEK(0), carriedIn: SEK(0), carriedOut: SEK(2473) });
  assert.deepEqual(week1?.map((l) => l.key), ["earned", "owedToMovera", "paidOut", "carriedOut"]);
  assert.equal(week1?.[3]?.amount.amountMinor, 2473);
  const week2 = payoutPartLines({ earned: SEK(10_000), owedToMovera: SEK(2473), paidOut: SEK(7527), carriedIn: SEK(2473), carriedOut: SEK(0) });
  assert.deepEqual(week2?.map((l) => l.key), ["earned", "owedToMovera", "paidOut"]);
  assert.equal(week2?.[2]?.amount.amountMinor, 7527);
  // A payout without parts (before the switch, an older server): null, the card keeps the 2 summary lines.
  assert.equal(payoutPartLines({}), null);
});

test("runs route: the server's count and total (150, not the first 100) is what Approve run sends", () => {
  const runs = serverRunsOf({ items: [{ country: "SE", periodStart: "2026-10-26T07:00:00.000Z", periodEnd: "2026-11-02T07:00:00.000Z", count: 150, total: [SEK(75_000)], earned: [SEK(75_000)], owedToMovera: [SEK(185_475)], paidOut: [SEK(75_000)], carriedOut: [SEK(185_475)] }] });
  assert.ok(runs);
  const card = runCardOf(runs![0]!);
  const page = Array.from({ length: 100 }, () => ({ amount: SEK(500) }));
  assert.deepEqual(approveRunValue({ country: "SE", periodEnd: card.periodEnd }, page, card), { country: "SE", periodEnd: card.periodEnd, expectedCount: 150, expectedTotal: [SEK(75_000)] });
  assert.deepEqual(runPartLines(runs![0]!).map((l) => l.key), ["earned", "owedToMovera", "paidOut", "carriedOut"]);
  assert.equal(serverRunsOf(null), null, "older server: no runs route");
  assert.equal(serverRunsOf({ items: [{ country: "SE" }] }), null);
});

test("the switch: CountryRules.payoutLinesOn, default off; saved with the payout settings", () => {
  assert.equal(payoutSettingsOf({}).linesOn, false);
  assert.equal(payoutSettingsOf({ payoutLinesOn: true }).linesOn, true);
  const api = readFileSync(new URL("./liveAdminApi.ts", import.meta.url), "utf8");
  assert.match(api, /payoutLinesOn: linesOn/);
  const c = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8")) as { configDefaults: { payoutLinesOn: boolean }; version: string };
  assert.equal(c.configDefaults.payoutLinesOn, false);
});

test("sv / fr / en texts for every new line", () => {
  for (const key of ["Earned", "Owed to Movera", "Paid out", "Moves to next week", "Payout lines and move a minus to next week", "Showing {0} of {1} drivers; the count and total are the server's."] as const) {
    assert.ok(en[key] && sv[key] && fr[key], key);
    assert.notEqual(sv[key], en[key], key);
  }
});

test("review S2: every contract payout line code (carried_in / carried_out included) has a label in sv / fr / en", async () => {
  const contract = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8")) as { payouts: { lines: string[] } };
  const { PAYOUT_LINE_LABEL } = await import("./payoutLines.ts");
  assert.deepEqual(contract.payouts.lines.filter((code) => !PAYOUT_LINE_LABEL[code]), []);
  assert.equal(PAYOUT_LINE_LABEL["carried_in"], "Moved from last week");
  assert.equal(PAYOUT_LINE_LABEL["carried_out"], "Moves to next week");
  for (const [lang, dict] of [["sv", sv], ["fr", fr], ["en", en]] as const) assert.ok((dict as Record<string, string>)["Moved from last week"], `${lang}: Moved from last week`);
});
