import assert from "node:assert/strict";
import test from "node:test";
import { compare, extraError, setExtra, slotExtra, emptyContentOps } from "./content/extra.ts";
import { emptyPromoOps, referralError, results, returnPer, saveVoucher, statusWithBudget, voucherError } from "./growth/hub.ts";
import { emptyReviewOps, hasBadWord, people, reviewsOf, rulesError as reviewRulesError, visibility } from "./growth/reviews.ts";
import { autoError, campaignResults, emptyMessageOps, inQuietHours, normalizeMessageOps, rulesError } from "./messages/extra.ts";

test("messages: quiet hours past midnight, limits and automatic messages", () => {
  const rules = emptyMessageOps().rules.SE;
  assert.equal(inQuietHours("23:30", rules), true);
  assert.equal(inQuietHours("07:59", rules), true);
  assert.equal(inQuietHours("12:00", rules), false);
  assert.equal(inQuietHours("23:30", { ...rules, quiet: { ...rules.quiet, on: false } }), false);
  assert.match(rulesError({ ...rules, weeklyCap: { on: true, max: 0 } }) ?? "", /1 to 50/);
  assert.match(rulesError({ ...rules, quiet: { on: true, from: "08:00", to: "08:00" } }) ?? "", /different end/);
  const auto = emptyMessageOps().autos[0];
  assert.equal(autoError(auto), null);
  assert.match(autoError({ ...auto, days: 0 }) ?? "", /1 to 365/);
  assert.deepEqual(campaignResults("x", 10, "draft"), { sent: 0, opened: 0, openPct: 0, rides: 0 });
  const sent = campaignResults("x", 10, "published");
  assert.ok(sent.sent >= 10 && sent.opened <= sent.sent && sent.rides <= sent.opened);
  assert.equal(normalizeMessageOps(null).autos.length, 3);
});

test("content: places, image size and what changed", () => {
  const extra = slotExtra(emptyContentOps(), "help");
  assert.deepEqual(extra.countries, ["SE", "FR", "TN"]);
  assert.match(extraError({ ...extra, countries: [] }) ?? "", /at least one country/);
  assert.match(extraError({ ...extra, image: { name: "a", dataUrl: "x".repeat(1_600_000), fit: "fill" } }) ?? "", /too big/);
  const next = setExtra(emptyContentOps(), "help", { ...extra, zones: ["Z001"] });
  assert.equal(next.draftRev, 2);
  assert.deepEqual(slotExtra(next, "help").zones, ["Z001"]);
  const base = { title: "Movera", sv: "Hej", fr: "Salut", en: "Hi", image: "", expiresAt: "", riderMin: "", riderRecommended: "", driverMin: "", driverRecommended: "", reaccept: false };
  assert.deepEqual(compare(base, { ...base, en: "Hello" }), [{ label: "English", before: "Hi", after: "Hello" }]);
  assert.deepEqual(compare(base, base), []);
});

test("promotions: vouchers, referral, budget stop and return", () => {
  const ops = emptyPromoOps();
  const voucher = { ...ops.vouchers[0], id: "V-2", code: "AUTUMN15" };
  assert.match(voucherError(voucher, ops.vouchers) ?? "", /already used/);
  assert.match(voucherError({ ...voucher, code: "ab" }, ops.vouchers) ?? "", /capital letters/);
  assert.match(voucherError({ ...voucher, code: "NEW10", kind: "percent", value: 120 }, ops.vouchers) ?? "", /1 to 100/);
  assert.match(voucherError({ ...voucher, code: "NEW10", from: "2026-11-01", to: "2026-10-01" }, ops.vouchers) ?? "", /after the start/);
  const saved = saveVoucher(ops, { ...voucher, code: "NEW10" });
  assert.equal(saved.error, undefined);
  assert.equal(saved.ops.vouchers.length, 2);
  assert.equal(saved.ops.draftRev, ops.draftRev + 1);
  assert.equal(saveVoucher(ops, voucher).ops, ops);
  assert.match(referralError({ ...ops.referral.SE, budget: 0 }) ?? "", /budget/);
  assert.equal(referralError({ ...ops.referral.SE, on: false, budget: 0 }), null);
  const result = results("P-1", 1000, 250);
  assert.ok(result.cost <= 1000);
  assert.equal(statusWithBudget("active", 1000, 1000, true), "budget");
  assert.equal(statusWithBudget("active", 1000, 1000, false), "active");
  assert.equal(statusWithBudget("paused", 1000, 1000, true), "paused");
  assert.equal(returnPer({ cost: 100, revenue: 450 }), 4.5);
  assert.equal(returnPer({ cost: 0, revenue: 450 }), 0);
});

test("reviews: ids, word list, admin decision wins and actions per person", () => {
  const ops = emptyReviewOps();
  const trips = [
    { id: "T1", status: "completed", zoneId: "Z001", name: "Rider One", driverId: "D1" },
    { id: "T2", status: "cancelled", zoneId: "Z001", name: "Rider Two", driverId: "D1" },
  ] as never;
  const list = reviewsOf(trips, [{ id: "D1", name: "Driver One" }] as never, ops, Date.parse("2026-10-12T10:00:00Z"));
  assert.deepEqual(list.map((row) => row.id), ["T1-rider", "T1-driver"]);
  assert.equal(list[0].aboutName, "Driver One");
  const rules = ops.rules.SE;
  assert.equal(hasBadWord("What an IDIOT", rules), true);
  assert.equal(hasBadWord("What an IDIOT", { ...rules, badWords: { ...rules.badWords, on: false } }), false);
  const bad = { ...list[0], text: "a scam" };
  assert.deepEqual(visibility(bad, {}, rules), { hidden: true, auto: true, last: null });
  const restored = { hidden: false, reason: "ok", actor: "nora", at: "x" };
  assert.equal(visibility(bad, { [bad.id]: [restored] }, rules).hidden, false);
  const many = [1, 2, 3].map((n) => ({ ...list[0], id: `x${n}`, stars: 3 }));
  assert.equal(people(many, () => rules)[0].action, "review");
  assert.equal(people(many.slice(0, 2), () => rules)[0].action, null);
  assert.equal(people(many, () => ({ ...rules, block: { on: true, below: 3.6 } }))[0].action, "block");
  assert.match(reviewRulesError({ ...rules, review: { on: true, below: 4.8 } }) ?? "", /below the warning/);
  assert.match(reviewRulesError({ ...rules, warn: { on: true, below: 6 } }) ?? "", /1 to 5/);
});
