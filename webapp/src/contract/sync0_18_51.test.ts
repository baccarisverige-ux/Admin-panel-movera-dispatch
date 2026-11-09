/**
 * Contract 0.18.51 sync (movera-contracts d19a8a8, §73, contract.json#bookedRide0_18_51): the admin carries the new
 * copy, and its state machine follows the split L6 reassign rows — Reassign on a booked ride a driver holds for later
 * (kind scheduled, accepted) goes back to the Scheduled rides list (requested), a live trip to dispatch (searching).
 * The demo store follows the same table (#253 noted the gap: it still said searching).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { nextStatus } from "../domain/contract.ts";
import { createFixtureAdminApi } from "../api/create.ts";
import { loadDb, saveDb } from "../api/demoStore.ts";
import { signedInFixture } from "../testing/fixtureSession.ts";

// The exact pin moved to sync0_18_52.test.ts with the 0.18.52 copy; the 0.18.51 rules below still hold.

test("L6 rows (§73): admin reassign from accepted is split by kind; the other states still go to searching", () => {
  assert.equal(nextStatus("accepted", "reassign", "admin", "scheduled"), "requested");
  assert.equal(nextStatus("accepted", "reassign", "admin", "live"), "searching");
  for (const status of ["offered", "driver_to_pickup", "arrived"]) for (const kind of ["live", "scheduled"] as const) {
    assert.equal(nextStatus(status, "reassign", "admin", kind), "searching", `${status} ${kind}`);
  }
});

test("demo store: Reassign on a held booked ride lands in requested (the list), a live accepted trip in searching", async () => {
  const api = signedInFixture(createFixtureAdminApi(0));
  const db = loadDb();
  const accepted = db.trips.filter((trip) => trip.status === "accepted");
  assert.ok(accepted.length >= 2, "the seed has two accepted trips");
  const [held, live] = accepted as [typeof accepted[number], typeof accepted[number]];
  const kindOf = (kind: "live" | "scheduled") => ({ kind }) as unknown as NonNullable<typeof held.liveTrip>;
  saveDb({ ...db, trips: db.trips.map((trip) => trip.id === held.id ? { ...trip, liveTrip: kindOf("scheduled") } : trip.id === live.id ? { ...trip, liveTrip: kindOf("live") } : trip) });
  const reassign = (targetId: string, key: string) => api.revision().then((rev) => api.command({ action: "admin.trip.reassign", targetId, reason: "Ops check", actorId: "lena", idempotencyKey: key, expectedRev: rev, collection: "trips", patch: { driverId: null }, before: "", after: "" }));
  await reassign(held.id, "l6-held");
  await reassign(live.id, "l6-live");
  const after = await api.list("trips", null);
  assert.equal(after.find((trip) => trip.id === held.id)!.status, "requested");
  assert.equal(after.find((trip) => trip.id === live.id)!.status, "searching");
});
