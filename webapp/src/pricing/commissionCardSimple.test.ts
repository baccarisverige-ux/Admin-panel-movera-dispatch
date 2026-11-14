/**
 * J5b simplification (owner 2026-11-14 ~02:49 UTC on the J5b admin screenshots: "What the fuck is fleet owner keep !???
 * And why its complicate ?!"; contract v0.18.88 commissionSteps.adminCalculator + fleetPayoutWhole): the commission
 * card keeps the steps list and the warning line and has ONE simple calculator — type a trip price, see the step used,
 * the commission and what the driver gets. No rows at / just above each limit, no "Movera keeps" row, no "Fleet owner"
 * line. Fail-before: every test below fails on bcac6b56.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { en } from "../i18n/en.ts";
import { calculate, stepWarnings, type CommissionStep } from "./commissionSteps.ts";

const source = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
const TN: CommissionStep[] = [{ upToMinor: 5000, amountMinor: 1000 }, { upToMinor: 15000, pct: 18 }, { upToMinor: null, pct: 20 }];

test("the calculator gives only the step used, the commission and what the driver gets (owner's TN steps, 6.025 DT)", () => {
  const calc = calculate({ pct: 20, steps: TN }, 6025);
  assert.ok(calc.ok);
  assert.deepEqual(Object.keys(calc).sort(), ["driverGets", "ok", "split"], "no limit rows, no Movera keeps");
  assert.deepEqual([calc.split.step, calc.split.commission, calc.driverGets], [1, 1084, 4941]);
  // The warning stays (the steps list shows it next to the 15 DT step).
  assert.deepEqual(stepWarnings(TN), [{ step: 1, upToMinor: 15000, atLimit: 12300, justAbove: 12001 }]);
});

test("the card has no limit-rows table, no Movera keeps row and no Fleet owner line", () => {
  const steps = source("./CommissionSteps.tsx");
  assert.doesNotMatch(steps, /cs-limits|calc-limits|Prices around each limit|At \{limit\}|Just above \{limit\}|Movera keeps \(from the ride part\)/);
  assert.match(steps, /data-testid="step-warning"/, "the warning line is kept");
  // Owner 2026-11-14 (amounts only): the calculator's lines are Driver gets and Movera gets (commissionCardAmounts.test.ts).
  assert.match(steps, /tr\("Driver gets"\)/);
  assert.match(steps, /tr\("Movera gets"\)/);
  const panel = source("./CommissionPanel.tsx");
  assert.doesNotMatch(panel, /Fleet owner|fleetCommissionPct|fleet-share|onFleet/, "no fleet-owner line or field in the commission panel");
  assert.doesNotMatch(source("../styles/pricing.css"), /\.cs-limits/);
  for (const gone of ["Prices around each limit", "At {limit}", "Just above {limit}", "Movera keeps (from the ride part)"]) assert.ok(!(gone in en), `no "${gone}" text`);
});

test("no cap note in the card (owner 2026-11-14 \"This exp never happen cause there is already minimum trip price\"); the silent cap stays", () => {
  assert.doesNotMatch(source("./CommissionSteps.tsx"), /A fixed commission is never more than the trip price/);
  assert.ok(!("A fixed commission is never more than the trip price; the driver never gets less than 0." in en));
  // The guard in the shared function: a 1 DT fixed commission on a 0.800 DT base takes 0.800 DT, the driver gets 0.
  const calc = calculate({ pct: 20, steps: TN }, 800);
  assert.ok(calc.ok);
  assert.deepEqual([calc.split.commission, calc.driverGets], [800, 0]);
});
