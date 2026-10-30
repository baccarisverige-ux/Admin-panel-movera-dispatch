import assert from "node:assert/strict";
import test from "node:test";
import { DASH, liveDriverMonth, liveJoinedAt, liveJoinedDays, liveLastOnline, orDash } from "./driverFacts.ts";
import { registerDictionary, setLanguage } from "../i18n/core.ts";
import { sv } from "../i18n/sv.ts";
import { fr } from "../i18n/fr.ts";
import { checks, carDocs, liveCarDocs, emptyVehicleRules, photosOf } from "../vehicles/rules.ts";
import { accessLabel } from "./../drivers/scheduledAccess.ts";
import { docHealth } from "../fleet/documents.ts";

/** Owner G2c (2026-10-30, "Fix now (Recommended)"): live drivers show only the server's numbers, "—" for the rest. */
const facts = { onlineStatus: "offline", rating: 4.62, location: null, lastFixAt: "2026-10-29T08:00:00Z", stale: null, activeTripId: null };

test("live month: the server's rating, nothing invented for trips, rates, hours or earnings", () => {
  assert.deepEqual(liveDriverMonth(facts), { rating: 4.62, trips: null, cancellationPct: null, acceptancePct: null, onlineHours: null, netMinor: null });
  assert.equal(liveDriverMonth({ ...facts, rating: null }).rating, null);
  assert.equal(liveDriverMonth(null).rating, null);
  // Two drivers with different ids get the same (empty) numbers: nothing comes from the id any more.
  assert.deepEqual(liveDriverMonth({ ...facts, rating: null }), liveDriverMonth(undefined));
  assert.equal(orDash(null), DASH);
  assert.equal(orDash(4.62, (value) => value.toFixed(2)), "4.62");
  assert.equal(orDash(0), "0", "a real zero from the server stays 0");
});

test("joined and last online come from the server or are —", () => {
  assert.equal(liveJoinedAt({ accountStatus: "active", documents: [], createdAt: "2026-10-01T10:00:00Z", termsAcceptedAt: "2026-10-02T10:00:00Z" }), "2026-10-01T10:00:00Z");
  assert.equal(liveJoinedAt({ accountStatus: "active", documents: [], termsAcceptedAt: "2026-10-02T10:00:00Z" }), "2026-10-02T10:00:00Z");
  assert.equal(liveJoinedAt({ accountStatus: "active", documents: [] }), null);
  assert.equal(liveJoinedDays({ accountStatus: "active", documents: [], termsAcceptedAt: "2026-10-20T00:00:00Z" }, Date.parse("2026-10-30T12:00:00Z")), 10);
  assert.equal(liveJoinedDays(undefined, Date.now()), null);
  assert.equal(liveLastOnline(facts, true), "now");
  assert.equal(liveLastOnline(facts, false), "2026-10-29T08:00:00Z");
  assert.equal(liveLastOnline({ ...facts, lastFixAt: null }, false), null);
});

test("G2c: the car checks, papers and scheduled rides read Swedish and French, not English", () => {
  registerDictionary("sv", sv);
  registerDictionary("fr", fr);
  const rules = emptyVehicleRules().countries.SE;
  const car = { year: 2012, seats: 4, fuel: "hybrid" as const, category: "economy" as const };
  const now = Date.parse("2026-10-30T10:00:00Z");
  const lateRule = { lateCancels: 2, latePeriodDays: 7, pauseDays: 7 };
  try {
    setLanguage("sv");
    const docs = carDocs({ insuranceExpiresAt: "2027-01-01", inspectionExpiresAt: "2026-11-05", registrationStatus: "approved" }, {}, now);
    const list = checks(car, docs, photosOf({ ...emptyVehicleRules(), photos: { V1: { front: { status: "approved", by: "", at: "", note: "" }, back: { status: "approved", by: "", at: "", note: "" }, side: { status: "approved", by: "", at: "", note: "" }, inside: { status: "approved", by: "", at: "", note: "" } } } }, "V1"), { ...rules, photosNeeded: true }, "economy");
    const text = list.flatMap((item) => [item.label, item.detail]).join(" | ");
    for (const english of ["Fits", "Built", "needs", "Registration and permit", "Insurance", "Photos", "approved", "Expires in"]) assert.ok(!text.includes(english), `"${english}" in: ${text}`);
    assert.ok(text.includes("Byggd 2012, måste vara 2015 eller nyare."), text);
    assert.deepEqual(liveCarDocs([], now).map((doc) => doc.label), ["Registrering och tillstånd", "Försäkring"]);
    assert.equal(docHealth({ status: "approved", expiresAt: "2026-11-05" }, now, 30).label, "Går ut om 6 dagar");
    assert.equal(accessLabel({ allowed: true, source: "none", until: null, pausedByRule: false, lateInPeriod: [] } as unknown as Parameters<typeof accessLabel>[0], undefined, lateRule as unknown as Parameters<typeof accessLabel>[2]), "Bokade resor på");
    setLanguage("fr");
    assert.equal(accessLabel({ allowed: true, source: "none", until: null, pausedByRule: false, lateInPeriod: [] } as unknown as Parameters<typeof accessLabel>[0], undefined, lateRule as unknown as Parameters<typeof accessLabel>[2]), "Courses réservées activées");
  } finally {
    setLanguage("en");
  }
});
