/**
 * BQ-A28 (owner "Add jobs" 2026-11-14, owner rule "screens must be simple"; J6a supervisor nit in Rules
 * audits/impact/j6-driverpay-supervisor.md "sv mixes Förarlön and förarens ersättning"): the trip page shows ONE driver
 * pay box, the one that works now. During the trip: "Driver pay" (POST …/adjust, the whole pay). After the end: "Change
 * the driver's pay" (+/−, POST …/driver-pay). Never both. One wording per language. Rule 36: written before the code.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { driverPayBox } from "./driverPayBox.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";

test("A28: during the trip only the Driver pay box (J6a)", () => {
  for (const status of ["accepted", "driver_to_pickup", "arrived", "rider_onboard", "in_trip", "approaching_dropoff"]) {
    assert.equal(driverPayBox(status, true), "set", status);
  }
});

test("A28: after the end only the change box (+/−), and only with a driver", () => {
  for (const status of ["completed", "cancelled_by_rider", "cancelled_by_driver", "cancelled_by_admin", "cancelled_by_system", "no_show", "expired", "failed"]) {
    assert.equal(driverPayBox(status, true), "change", status);
    assert.equal(driverPayBox(status, false), null, `${status} without a driver`);
  }
});

test("A28: before a driver has the trip, no driver pay box", () => {
  for (const status of ["requested", "searching", "offered"]) assert.equal(driverPayBox(status, false), null, status);
});

const PAY_TEXTS = ["Driver pay", "Driver pay{0}", "Save driver pay", "Driver's pay now: {0}", "Driver pay change", "Change pay", "Change the driver's pay", "{0} Change the driver's pay"];

test("A28: one wording for the driver's pay in sv (förarersättning) and fr (rémunération du chauffeur)", () => {
  const svd = sv as Record<string, string>;
  const frd = fr as Record<string, string>;
  for (const key of PAY_TEXTS) {
    assert.ok((en as Record<string, string>)[key], `en: ${key}`);
    assert.match(svd[key] ?? "", /förarersättning/i, `sv: ${key} = ${svd[key]}`);
    assert.doesNotMatch(svd[key] ?? "", /lön/i, `sv: ${key}`);
    assert.match(frd[key] ?? "", /rémunération du chauffeur/i, `fr: ${key} = ${frd[key]}`);
  }
  assert.equal(svd["Driver pay"], "Förarersättning");
  assert.equal(frd["Driver pay"], "Rémunération du chauffeur");
});
