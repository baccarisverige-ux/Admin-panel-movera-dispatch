import assert from "node:assert/strict";
import test from "node:test";
import { commandById } from "../commands/registry.ts";
import { ApiError } from "./httpClient.ts";
import { outcomeOf, queryRetry, queryTouched, readAt, readTracked, touchedBy } from "./commandFlow.ts";
import type { OperationRow } from "./seed.ts";

test("C-18: 401/403/422 are not retried; offline and 503 are retried twice at most", () => {
  assert.equal(queryRetry(0, new ApiError(403, "no")), false);
  assert.equal(queryRetry(0, new ApiError(401, "no")), false);
  assert.equal(queryRetry(0, new ApiError(422, "no")), false);
  assert.equal(queryRetry(0, new Error("boom")), false);
  assert.equal(queryRetry(0, new ApiError(503, "busy")), true);
  assert.equal(queryRetry(1, new ApiError(0, "offline")), true);
  assert.equal(queryRetry(2, new ApiError(0, "offline")), false);
});

test("C-18: a command reads again only what it can have changed", () => {
  const note = touchedBy(commandById("admin.trip.cancel"), { collection: "trips", sliceKey: "tripOps" });
  assert.equal(queryTouched(["records", "trips", "null", "nora"], note), true);
  assert.equal(queryTouched(["slice", "tripOps", "nora", "{}"], note), true);
  assert.equal(queryTouched(["records", "drivers", "null", "nora"], note), false);
  assert.equal(queryTouched(["slice", "zonePricing", "nora", "{}"], note), false);
  assert.equal(queryTouched(["audit"], note), true);
  assert.equal(queryTouched(["revision"], note), true);
  assert.equal(queryTouched(["admin-page", "trips"], note), false);
  // An approval carries out a refund on the server, so everything is read again.
  const approve = touchedBy(commandById("admin.approval.approve"), {});
  assert.equal(queryTouched(["records", "payments", "null", "nora"], approve), true);
  assert.equal(queryTouched(["slice", "finance", "nora", "{}"], approve), true);
});

const op = (status: OperationRow["status"], message: string): OperationRow => ({ operationId: "op-1", idempotencyKey: "k", action: "admin.payment.refund", targetId: "PAY0002", status, httpStatus: 200, message, rev: 2, at: "2026-10-20T10:00:00.000Z" });

test("C-14: a slow command ends as Done or Failed from the server's record, never Unknown", () => {
  const done = outcomeOf(op("committed", "Saved in demo."), "");
  assert.equal(done.phase, "committed");
  assert.match(done.message, /^Done\./);
  assert.equal(done.retrySameKey, false);
  const failed = outcomeOf(op("rejected", "Your role cannot do that."), "");
  assert.equal(failed.phase, "rejected");
  assert.match(failed.message, /^Failed\. Your role/);
  const lost = outcomeOf(null, "Offline. Nothing was saved.");
  assert.equal(lost.phase, "rejected");
  assert.match(lost.message, /^Failed\./);
  assert.equal(lost.retrySameKey, true);
  for (const outcome of [done, failed, lost]) assert.doesNotMatch(outcome.message, /Unknown/);
  assert.equal(outcomeOf(op("pending_approval", "Pending approval."), "").phase, "pending_approval");
});

test("C-10: a read that overlaps a commit records the revision of the data it ends with, not the one before", async () => {
  // The screen's own command commits (rev 5 → 6) while a timed refresh is out: the refresh must not pin the
  // screen to 5, or the next command gets "Someone else changed this" for a change the admin made.
  let rev = 5;
  let reads = 0;
  const api = { revision: async () => rev };
  const read = async () => {
    reads += 1;
    if (reads === 1) rev = 6; // the commit lands during the first read
    return `data@${rev}`;
  };
  const data = await readTracked(api, ["records", "riders"], read);
  assert.equal(data, "data@6");
  assert.equal(reads, 2, "read again once the revision moved");
  assert.equal(readAt.get(JSON.stringify(["records", "riders"])), 6);

  // A quiet read is recorded once, at its revision.
  reads = 0;
  await readTracked(api, ["slice", "care"], read);
  assert.equal(reads, 1);
  assert.equal(readAt.get(JSON.stringify(["slice", "care"])), 6);

  // A revision the server cannot give leaves the data usable and the record untouched.
  readAt.delete(JSON.stringify(["records", "trips"]));
  const noRev = { revision: async () => { throw new Error("offline"); } };
  assert.equal(await readTracked(noRev, ["records", "trips"], async () => "x"), "x");
  assert.equal(readAt.has(JSON.stringify(["records", "trips"])), false);
});
