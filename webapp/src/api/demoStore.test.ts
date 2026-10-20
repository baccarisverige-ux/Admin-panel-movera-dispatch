import assert from "node:assert/strict";
import test from "node:test";
import { createSeed } from "./seed.ts";
import { validateDb } from "./demoStore.ts";

test("C-26: stored data is checked, not cast", () => {
  const seed = createSeed();
  const broken = {
    ...seed,
    rev: "seven",
    trips: [{ id: "T0001", name: "Ok", zoneId: "Z001", status: "completed" }, null, 7, { name: "no id" }],
    payments: "not a list",
    slices: [],
    audits: [{ id: "aud-1", at: "x", actorId: "nora", action: "admin.trip.cancel", targetId: "T1", result: "committed" }, { id: "aud-2" }],
    approvals: [{ id: "a1" }],
  };
  const db = validateDb(broken);
  assert.deepEqual(db.trips.map((row) => row.id), ["T0001"], "rows without an id are dropped");
  assert.equal(db.payments.length, seed.payments.length, "a broken list comes back from the seed");
  assert.equal(typeof db.rev, "number");
  assert.deepEqual(db.slices, {});
  assert.deepEqual(db.audits.map((row) => row.id), ["aud-1"]);
  assert.deepEqual(db.approvals, []);
  assert.equal(validateDb("garbage").drivers.length, seed.drivers.length, "unreadable data starts from the seed");
});
