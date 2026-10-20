import { createFixtureAdminApi, type CommandInput } from "./create.ts";
import { signedInFixture } from "./fixtureSession.ts";
import { ApiError } from "./httpClient.ts";

/**
 * The refund rules of the old commands/run.ts test (C-21), run against the live fixture server:
 * one effect per key, a second admin above 500 kr, no self-approval, stale versions refused, no second payment.
 */
const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

async function refused(work: Promise<unknown>, status: number, code: string, message: string) {
  try {
    await work;
  } catch (error) {
    assert(error instanceof ApiError && error.status === status && error.code === code, `${message}: expected ${status} ${code}, got ${error instanceof ApiError ? `${error.status} ${error.code}` : String(error)}`);
    return;
  }
  throw new Error(`${message}: expected a rejection`);
}

const api = signedInFixture(createFixtureAdminApi(0));
await api.reset();

const refund = async (over: Partial<CommandInput>): Promise<CommandInput> => ({
  action: "admin.payment.refund",
  targetId: "PAY0200",
  reason: "Charged twice",
  actorId: "astrid",
  idempotencyKey: "k1",
  expectedRev: await api.revision(),
  collection: "payments",
  patch: { status: "refunded" },
  before: "captured",
  after: "refunded",
  ...over,
});
const payment = async (id: string) => (await api.list("payments", null)).find((row) => row.id === id);
const audits = async (operationId: string) => (await api.audit()).filter((row) => row.operationId === operationId);

// 600 kr waits for a second admin (the default limit is above 500 kr, Q25).
const first = await api.command(await refund({}));
assert(first.status === "pending_approval", "large refund waits");
const rev = await api.revision();
const retry = await api.command({ ...(await refund({})), expectedRev: first.rev });
assert(retry.operationId === first.operationId && (await api.revision()) === rev, "same key does not write again");
assert((await audits(first.operationId)).length === 1, "one audit for the double click");
assert((await api.approvals()).filter((row) => row.targetId === "PAY0200" && row.status === "pending").length === 1, "one approval waits");

const approval = (await api.approvals()).find((row) => row.targetId === "PAY0200" && row.status === "pending")!;
const decide = async (actorId: string, key: string, expectedRev?: number) =>
  api.command({ action: "admin.approval.approve", targetId: approval.id, reason: "Checked the evidence", actorId, idempotencyKey: key, expectedRev: expectedRev ?? (await api.revision()), before: "pending", after: "approved" });
await refused(decide("astrid", "k2"), 403, "forbidden", "requester cannot approve");
await refused(decide("nora", "k3", 1), 409, "version_mismatch", "stale version conflicts");

const second = await decide("nora", "k4");
assert(second.status === "committed", "second agent commits");
assert((await payment("PAY0200"))?.status === "refunded", "refunded once");

// A later refund of the same payment is refused: no second payment, the store does not move.
const before = await api.revision();
await refused(api.command(await refund({ idempotencyKey: "k5", actorId: "nora" })), 409, "invalid_transition", "retry does not pay twice");
assert((await api.revision()) === before, "rev unchanged when already refunded");

// Under the limit commits at once.
const small = await api.command(await refund({ idempotencyKey: "s", targetId: "PAY0002" }));
assert(small.status === "committed" && (await payment("PAY0002"))?.status === "refunded", "under 500 kr commits immediately");

// Q25 / C-22: the one rule is the Settings value per country, and the server reads it from there.
const savePolicy = async (aboveMajor: Record<string, number>, key: string) =>
  api.command({ action: "admin.refundPolicy.save", targetId: "refund limits", reason: "Planned change", actorId: "nora", idempotencyKey: key, expectedRev: await api.revision(), sliceKey: "refundPolicy", value: { draftRev: 2, aboveMajor }, before: "", after: "" });
await refused(savePolicy({ SE: -1, FR: 50, TN: 150 }, "p-bad"), 422, "invalid_request", "a negative limit is refused");
await refused(api.command({ action: "admin.refundPolicy.save", targetId: "refund limits", reason: "Planned change", actorId: "astrid", idempotencyKey: "p-role", expectedRev: await api.revision(), sliceKey: "refundPolicy", value: { aboveMajor: { SE: 1, FR: 1, TN: 1 } }, before: "", after: "" }), 403, "forbidden", "finance cannot change the Settings limit");
await savePolicy({ SE: 50, FR: 50, TN: 150 }, "p-low");
const lowered = await api.command(await refund({ idempotencyKey: "after-policy", targetId: "PAY0005" }));
assert(lowered.status === "pending_approval", "with the Settings limit at 50 kr, a 100 kr refund waits for a second admin");
// Exactly at the limit is not above it.
await savePolicy({ SE: 101.2, FR: 50, TN: 150 }, "p-edge");
const atLimit = await api.command(await refund({ idempotencyKey: "at-limit", targetId: "PAY0013" }));
assert(atLimit.status === "committed", `a refund at or under the limit commits (got ${atLimit.status})`);

console.log("refund flow ok");
