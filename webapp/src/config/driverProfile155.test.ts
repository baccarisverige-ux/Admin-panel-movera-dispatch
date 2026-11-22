import assert from "node:assert/strict";
import test from "node:test";
import contract from "../../../contracts/contract.json" with { type: "json" };
import { appConfigState, driverAppConfig, riderAppConfig } from "./appConfigs.ts";
import { CONFIG_DEFAULTS } from "./zoneDefaults.ts";
import { OWNED, dispatchDocumentOf, patchChanged, rulesOfDispatch, type Doc } from "../live/configDocs.ts";
import { zoneDefault } from "../dispatch/rules.ts";
import { changeLines } from "../dispatch/rules/changes.ts";
import { driverReviewsPath, reviewLine } from "../live/driverReviews.ts";

/**
 * Driver profile v3 (contract v0.18.155, contract.json#driverProfile; owner 2026-11-20 "Now build all"): admin turns the
 * driver profile and written reviews on/off per zone (Dispatch › Safety) and approves or hides each review (Reviews ›
 * Driver reviews). Fails on main: no driverProfile in the rules, the rider document or the read-back, no moderation list.
 */
const NOW = "2026-11-20T08:00:00Z";
type RiderDoc = { driverProfile?: { on: boolean; reviews: boolean } };
const rider = (zoneId: string, driverProfile?: { on: boolean; reviews: boolean }) => {
  const zone = zoneDefault(zoneId);
  const state = driverProfile === undefined ? appConfigState({ now: NOW }) : appConfigState({ now: NOW, dispatch: { live: { [zoneId]: { ...zone, driverProfile } } } } as never);
  return riderAppConfig(zoneId, state) as unknown as RiderDoc & Doc;
};

test("defaults from the contract: profile on, written reviews off, in every country", () => {
  const d = contract.configDefaults as unknown as { driverProfileOn?: boolean; driverReviewsOn?: boolean };
  assert.equal(d.driverProfileOn, true, "contract copy is v0.18.155 or later");
  assert.equal(CONFIG_DEFAULTS.driverProfileOn, true);
  assert.equal(CONFIG_DEFAULTS.driverReviewsOn, false);
  for (const zoneId of ["Z001", "FR-PC", "TN-TC"]) {
    assert.deepEqual(zoneDefault(zoneId).driverProfile, { on: true, reviews: false }, zoneId);
    assert.deepEqual(rider(zoneId).driverProfile, { on: true, reviews: false }, zoneId);
  }
  assert.equal((driverAppConfig("Z001", appConfigState({ now: NOW })) as unknown as Doc)["driverProfile"], undefined, "the server serves the driver copy");
});

test("save: the zone's switches go out as the rider document's driverProfile", () => {
  assert.ok(OWNED.dispatch.rider.includes("driverProfile"));
  const before = rider("Z001", { on: true, reviews: false });
  const after = rider("Z001", { on: true, reviews: true });
  const sent = patchChanged({ zoneId: "Z001", tips: ["server"], driverProfile: { on: true, reviews: false } }, before, after, OWNED.dispatch.rider);
  assert.deepEqual(sent["driverProfile"], { on: true, reviews: true });
  assert.deepEqual(sent["tips"], ["server"], "the rest of the server document is kept");
  const lines = changeLines({ ...zoneDefault("Z001"), driverProfile: { on: true, reviews: false } }, { ...zoneDefault("Z001"), driverProfile: { on: true, reviews: true } });
  assert.equal(lines.length, 1, lines.join(" | "));
  assert.ok(lines[0]!.startsWith("Written reviews on the driver profile: "), lines[0]);
});

test("read back from the rider document as the server serves it", () => {
  const zone = zoneDefault("Z001");
  const doc = dispatchDocumentOf(zone, "Z001", null);
  const read = (riderDoc: Doc | null) => rulesOfDispatch(doc, null, zone, riderDoc).driverProfile;
  assert.deepEqual(read({ driverProfile: { on: false, reviews: true } }), { on: false, reviews: true });
  assert.deepEqual(read({}), { on: true, reviews: false }, "never saved: the contract defaults");
});

test("moderation list: pending first, only the review's own fields, no rider data", () => {
  assert.equal(driverReviewsPath("pending", null), "/admin/driver-reviews?status=pending&limit=50");
  assert.equal(driverReviewsPath("approved", "abc"), "/admin/driver-reviews?status=approved&limit=50&cursor=abc");
  const line = reviewLine({ reviewId: "rvw_1", driverId: "drv_1", driverFirstName: "Ali", zoneId: "Z001", text: "Punktlig.", name: null, month: "2026-11", stars: 5, status: "pending", createdAt: NOW });
  assert.deepEqual(line, { id: "rvw_1", driver: "Ali", stars: 5, text: "Punktlig.", by: null, month: "2026-11", status: "pending" });
});
