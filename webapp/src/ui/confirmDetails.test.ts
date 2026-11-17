import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COMMANDS } from "../commands/registry.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import { enC39ConfirmDetails } from "../i18n/en/c39-confirm-details.ts";
import { CONFIRM_PART_TITLES, confirmParts, fromToFallbackFor, moneyFor, whenFor, whereFallbackFor } from "./confirmDetails.ts";

/**
 * Owner 2026-11-16 ~20:08 UTC "Add info details in i and !": every confirm "!" has five parts: the values
 * before → after, every zone or country touched, who sees it and when, the money effect, the exact undo path.
 * Record: Rules audits/impact/info-details.md.
 */
const MONEY_COMMANDS = /^admin\.(payout|refund|payment)\.|^admin\.trip\.(refund|partRefund|adjust|waiveFee|driverBonus|pay|noShow|reverseNoShow|cancel)$|^admin\.rider\.(walletCredit|feeMarkPaid|refund|refundDecide)$|^admin\.reservation\.(raise|noShow|cancel)$/;

test("every command's confirm \"!\" has all five parts, each filled", () => {
  assert.ok(COMMANDS.length > 100);
  const gaps: string[] = [];
  for (const { id } of COMMANDS) {
    const parts = confirmParts({ command: id });
    if (!parts.fromTo.length || parts.fromTo.some((line) => line.trim().length < 3)) gaps.push(`${id}: before → after`);
    for (const key of ["where", "whoWhen", "money", "undo"] as const) if (parts[key].trim().length < 3) gaps.push(`${id}: ${key}`);
    if (!/at once|next start|next app start|after publish/i.test(parts.whoWhen)) gaps.push(`${id}: when (live or the next app start)`);
  }
  assert.deepEqual(gaps, []);
  console.log(`confirm "!" coverage: ${COMMANDS.length} commands, each with ${CONFIRM_PART_TITLES.length} parts`);
});

test("money: a command that moves money never says no money moves; a setting says nothing moves now", () => {
  const wrong = COMMANDS.filter(({ id }) => MONEY_COMMANDS.test(id) && /^No money moves\.$/.test(moneyFor(id))).map(({ id }) => id);
  assert.deepEqual(wrong, []);
  assert.match(moneyFor("admin.pricing.publish"), /No money moves now/);
  assert.match(moneyFor("admin.trip.driverBonus"), /Movera pays/);
  assert.match(moneyFor("admin.reservation.raise"), /Movera's commission/);
  assert.equal(moneyFor("admin.alerts.settings"), "No money moves.");
});

test("when: settings reach open apps at once and closed apps at the next start; admin desks never reach the apps", () => {
  assert.match(whenFor("admin.pricing.publish"), /re-read it at once; a closed app gets it at its next start/);
  assert.match(whenFor("admin.dispatch.publish"), /next dispatch decision/);
  assert.match(whenFor("admin.alerts.settings"), /Riders and drivers see nothing/);
  assert.match(whenFor("admin.trip.cancel"), /At once \(live\)/);
});

test("values given win over the fallback: From → to lines, where and undo", () => {
  const parts = confirmParts({ command: "admin.pricing.saveCountry", changeOf: { kind: "audit", before: "120 kr", after: "150 kr" }, where: "Stockholm" });
  assert.deepEqual(parts.fromTo, ["120 kr → 150 kr"]);
  assert.equal(parts.where, "Stockholm");
  assert.equal(confirmParts({ command: "admin.trip.cancel" }).where, whereFallbackFor("admin.trip.cancel"));
  assert.equal(confirmParts({ command: "admin.trip.cancel" }).fromTo[0], fromToFallbackFor("admin.trip.cancel"));
});

test("c39: every word of the five parts is in en, sv and fr; sv / fr are translated", () => {
  const keys = Object.keys(enC39ConfirmDetails);
  const used = new Set(COMMANDS.flatMap(({ id }) => [moneyFor(id), whenFor(id), whereFallbackFor(id), fromToFallbackFor(id)]));
  for (const key of [...used, ...keys]) {
    for (const [name, dict] of [["en", en], ["sv", sv], ["fr", fr]] as const) assert.ok(Object.hasOwn(dict, key), `${name}: ${key}`);
    assert.notEqual((sv as Record<string, string>)[key], key, `sv: ${key}`);
    assert.notEqual((fr as Record<string, string>)[key], key, `fr: ${key}`);
  }
});

test("the body shows the five parts, and the texts load with the \"!\", not with the first page", () => {
  const body = readFileSync(new URL("./ConfirmInfoBody.tsx", import.meta.url), "utf8");
  for (const title of CONFIRM_PART_TITLES) assert.ok(body.includes(`tr("${title}")`), title);
  for (const fn of ["fromToFallbackFor", "whereFallbackFor", "whenFor", "moneyFor", "undoFor"]) assert.ok(body.includes(`${fn}(command)`), fn);
  const shell = readFileSync(new URL("./ConfirmInfo.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(shell, /^import .*confirmDetails/m);
  assert.match(shell, /import\("\.\/ConfirmInfoBody"\)/);
});
