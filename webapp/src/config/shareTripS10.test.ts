import assert from "node:assert/strict";
import test from "node:test";
import contract from "../../../contracts/contract.json" with { type: "json" };
import { appConfigState, driverAppConfig, riderAppConfig } from "./appConfigs.ts";
import { emptyConfig, MOVED_TO_SAFETY, setSwitch } from "./book.ts";
import { CONFIG_DEFAULTS } from "./zoneDefaults.ts";
import { OWNED, dispatchDocumentOf, patchChanged, rulesOfDispatch, type Doc } from "../live/configDocs.ts";
import { zoneDefault } from "../dispatch/rules.ts";
import { changeLines } from "../dispatch/rules/changes.ts";

/**
 * BQ-S10 "Share my trip" (contract v0.18.116, contract.json#shareTrip; owner 2026-11-02 Q1 "Build it for real" =>
 * "admin on/off per zone", Rules decisions/driver-g14.md:11, and S10 Q6 "default on"). Rule 36: fails on main — no
 * shareTrip in the Dispatch rules, in the rider document or in the read-back, and the Config switch can still be set.
 */
const NOW = "2026-11-16T08:00:00Z";
type RiderDoc = { shareTrip?: { on: boolean }; features: { shareTrip: boolean } };
const rider = (zoneId: string, on?: boolean) => {
  const zone = zoneDefault(zoneId);
  const state = on === undefined ? appConfigState({ now: NOW }) : appConfigState({ now: NOW, dispatch: { live: { [zoneId]: { ...zone, shareTrip: { on } } } } as never });
  return riderAppConfig(zoneId, state) as unknown as RiderDoc & Doc;
};

test("default on: the Dispatch rules and the rider document of every country carry shareTrip.on true", () => {
  const theirs = (contract.configDefaults as unknown as { shareTripOn?: boolean }).shareTripOn;
  assert.equal(theirs, true, "the contract copy is v0.18.116 or later (configDefaults.shareTripOn)");
  assert.equal(CONFIG_DEFAULTS.shareTripOn, theirs);
  for (const zoneId of ["Z001", "FR-PC", "TN-TC"]) {
    assert.deepEqual(zoneDefault(zoneId).shareTrip, { on: true }, zoneId);
    assert.deepEqual(rider(zoneId).shareTrip, { on: true }, zoneId);
    assert.equal(rider(zoneId).features.shareTrip, true, zoneId);
  }
});

test("the driver document gets no shareTrip (the driver app is not changed, owner Q5)", () => {
  assert.equal((driverAppConfig("Z001", appConfigState({ now: NOW })) as unknown as Doc)["shareTrip"], undefined);
});

test("save: off for one zone is published as the rider document's shareTrip.on, and Dispatch never writes features", () => {
  assert.ok(OWNED.dispatch.rider.includes("shareTrip"), "Dispatch owns the rider document's shareTrip");
  assert.ok(!OWNED.dispatch.rider.includes("features"), "features stay the Config page's");
  assert.ok(!OWNED.settings.rider.includes("shareTrip"));
  const before = rider("Z001", true);
  const after = rider("Z001", false);
  assert.deepEqual(after.shareTrip, { on: false });
  assert.equal(after.features.shareTrip, false, "the older field says the same as the switch");
  const server: Doc = { zoneId: "Z001", shareTrip: { on: true }, features: { shareTrip: true, pin: false }, tips: ["server"] };
  const sent = patchChanged(server, before, after, OWNED.dispatch.rider);
  assert.deepEqual(sent["shareTrip"], { on: false });
  assert.deepEqual(sent["features"], { shareTrip: true, pin: false }, "the Dispatch publish does not touch features");
  assert.deepEqual(sent["tips"], ["server"]);
  // A document saved before v0.18.116 has no shareTrip key: the switch still lands in it.
  assert.deepEqual(patchChanged({ zoneId: "Z001", features: { shareTrip: true } }, before, after, OWNED.dispatch.rider)["shareTrip"], { on: false });
  // Nothing changed = nothing written (the server keeps its own default).
  assert.equal(patchChanged({ zoneId: "Z001" }, before, before, OWNED.dispatch.rider)["shareTrip"], undefined);
  const lines = changeLines({ ...zoneDefault("Z001"), shareTrip: { on: true } }, { ...zoneDefault("Z001"), shareTrip: { on: false } });
  assert.equal(lines.length, 1, lines.join(" | "));
  assert.ok(lines[0]!.startsWith("Riders can share a live trip link: "), lines[0]);
});

test("read back from the rider document, as the server serves it (contract.json#shareTrip.setting)", () => {
  const zone = zoneDefault("Z001");
  const doc = dispatchDocumentOf(zone, "Z001", null);
  const read = (riderDoc: Doc | null, start = zone) => rulesOfDispatch(doc, null, start, riderDoc).shareTrip;
  assert.deepEqual(read({ shareTrip: { on: false }, features: { shareTrip: true } }), { on: false });
  assert.deepEqual(read({ shareTrip: { on: true }, features: { shareTrip: false } }), { on: true });
  assert.deepEqual(read({ features: { shareTrip: false } }), { on: false }, "never saved: the older features.shareTrip");
  assert.deepEqual(read({ features: {} }, { ...zone, shareTrip: { on: false } }), { on: true }, "never saved, no older value: on");
  assert.deepEqual(read(null, { ...zone, shareTrip: { on: false } }), { on: false }, "no rider document read: the rules keep their value");
});

test("read-only in Config › Features: the old book-wide switch cannot be set and no longer decides anything", () => {
  assert.ok(MOVED_TO_SAFETY.has("shareTrip"));
  const book = emptyConfig("nora");
  const tried = setSwitch(book, "shareTrip", false, "nora");
  assert.equal(tried, book, "setSwitch leaves the book as it is");
  assert.equal(setSwitch(book, "pin", false, "nora").draft.switches.find((item) => item.id === "pin")?.on, false, "other switches still work");
  // A book saved with the old switch off: the zone's Dispatch switch decides, not the book.
  const switches = book.draft.switches.map((item) => (item.id === "shareTrip" ? { ...item, on: false } : item));
  const off = { ...book, draft: { ...book.draft, switches }, published: { ...book.published, switches } };
  const doc = riderAppConfig("Z001", appConfigState({ now: NOW, config: off } as never)) as unknown as RiderDoc;
  assert.deepEqual(doc.shareTrip, { on: true });
  assert.equal(doc.features.shareTrip, true);
});
