/**
 * Owner 2026-11-14: "simply write only how much in amount driver get and how much movera get in amount dont write any
 * percentage". Every money RESULT line on the commission card (the card's example split and the calculator) is exactly
 * two lines with amounts only: "Driver gets <amount>" and "Movera gets <amount>" (commission + app fee as one amount).
 * The % stays only in the setting fields (commission %, App fee %, a step's % / fixed amount). Fail-before: these
 * tests fail on 07532719.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import * as CS from "./commissionSteps.ts";
import * as Z from "./zonePricing.ts";

const source = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
const TN: CS.CommissionStep[] = [{ upToMinor: 5000, amountMinor: 1000 }, { upToMinor: 15000, pct: 18 }, { upToMinor: null, pct: 20 }];

/** The <dl> result blocks of a component's source: every <dt> text key inside them. */
function resultKeys(file: string, testid: string): string[] {
  const src = source(file);
  const start = src.indexOf(`data-testid="${testid}"`);
  assert.ok(start > 0, `${file} has ${testid}`);
  const block = src.slice(start, src.indexOf("</dl>", start));
  return [...block.matchAll(/<dt>\{(?:tr|trn)\("([^"]+)"/g)].map((m) => m[1]!);
}

test("two result lines, amounts only: the card's example split and the calculator", () => {
  assert.deepEqual(resultKeys("./CommissionPanel.tsx", "card-split"), ["Driver gets", "Movera gets"]);
  assert.deepEqual(resultKeys("./CommissionSteps.tsx", "calc-result"), ["Driver gets", "Movera gets"]);
  for (const file of ["./CommissionPanel.tsx", "./CommissionSteps.tsx"]) {
    const src = source(file);
    const start = src.indexOf(file.endsWith("Panel.tsx") ? 'data-testid="card-split"' : 'data-testid="calc-result"');
    const block = src.slice(start, src.indexOf("</dl>", start));
    assert.doesNotMatch(block, /%|Pct|pct/, `${file}: no % in a result line`);
  }
  for (const d of [en, fr, sv] as Record<string, string>[]) {
    assert.ok(d["Driver gets"] && d["Movera gets"], "sv/fr/en");
    assert.doesNotMatch(d["Driver gets"]! + d["Movera gets"]!, /%/);
  }
});

test("Movera gets = commission + app fee, one amount (owner's TN steps, 6.025 DT, app fee 10 %)", () => {
  const lines = (CS as unknown as Record<string, unknown>)["resultLines"] as (rule: CS.CommissionRule, baseMinor: number, appFeePct: number) => { ok: true; driverGets: number; moveraGets: number } | { ok: false };
  assert.equal(typeof lines, "function");
  assert.deepEqual(lines({ pct: 20, steps: TN }, 6025, 10), { ok: true, driverGets: 4941, moveraGets: 1084 + 603 });
  assert.deepEqual(lines({ pct: 20, steps: [] }, 60000, 10), { ok: true, driverGets: 48000, moveraGets: 12000 + 6000 });
});

test("the app fee is exact decimal half_up, not float (contract pricing.halfUp): 55.00 kr at 0.7 % = 38.5 ore -> 39", () => {
  // Supervisor must-fix 2 (Rules audits/impact/fleet-and-card-supervisor.md): float floor(x + 0.5) gave 38.
  assert.equal(Z.appFeeOfMinor(5500, 0.7), 39);
  assert.equal(Z.appFeeOfMinor(6025, 10), 603);
  assert.equal(Z.appFeeOfMinor(20000, 12), 2400);
  assert.equal(Z.appFeeOfMinor(5500, 0), 0);
  assert.deepEqual(CS.resultLines({ pct: 0, steps: [] }, 5500, 0.7), { ok: true, driverGets: 5500, moveraGets: 39 });
  // Brute force over the card's 0.1 steps: the same as exact half_up of base * pct / 100 for every case.
  for (let tenths = 0; tenths <= 500; tenths += 1) {
    for (let base = 1; base <= 3000; base += 7) {
      const exact = Math.floor((2 * base * tenths + 1000) / 2000);
      assert.equal(Z.appFeeOfMinor(base, tenths / 10), exact, `${base} at ${tenths / 10} %`);
    }
  }
});

test("Dispatch previews show Movera's commission as an amount only, never a derived % (owner 2026-11-14 05:17)", () => {
  // Supervisor must-fix 4: "trip money, offer" lines carry no % that is not a setting value.
  const settings = source("../dispatch/ReservationSettings.tsx");
  const detail = source("../pages/ReservationDetailPage.tsx");
  assert.match(settings, /trn\("Sample booked ride \{0\}\. Movera's commission here is \{1\} \(set in Pricing\)\.", money\(sampleFare\), money\(split\.commission\)\)/);
  assert.match(detail, /trn\("Fare \{0\}\{1\} · Movera's commission \{2\} · highest raise \{3\}\.", show\(fareMajor\), fare\.estimated \? tr\(" \(estimate\)"\) : "", show\(split\.commission\), show\(raiseMax\)\)/);
  for (const src of [settings, detail]) assert.doesNotMatch(src, /shownPct|commissionPct/);
  assert.ok(!("shownPct" in CS), "shownPct has no caller and is gone");
  for (const d of [en, fr, sv] as Record<string, string>[]) {
    assert.ok(!Object.keys(d).some((key) => /Movera's commission (here is \{1\}|\{2\})%/.test(key)), "old % texts gone");
    assert.doesNotMatch(d["Sample booked ride {0}. Movera's commission here is {1} (set in Pricing)."] ?? "", /%/);
    assert.doesNotMatch(d["Fare {0}{1} · Movera's commission {2} · highest raise {3}."] ?? "", /%/);
  }
});
