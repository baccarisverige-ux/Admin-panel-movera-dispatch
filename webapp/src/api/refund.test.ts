import { createFixtureAdminApi, type CommandInput } from "./create.ts";
import { signedInFixture } from "./fixtureSession.ts";
import { ApiError } from "./httpClient.ts";

/**
 * The refund rules of the old commands/run.ts test (C-21), run against the live fixture server:
 * one effect per key, one admin always (owner 2026-11-02, build-spec Q1), stale versions refused, no second payment.
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

// Owner 2026-11-02 (build-spec Q1 "One admin always"): 600 kr runs at once, once.
await refused(api.command({ ...(await refund({ idempotencyKey: "stale" })), expectedRev: (await api.revision()) + 5 }), 409, "version_mismatch", "stale version conflicts");
const first = await api.command(await refund({}));
assert(first.status === "committed", "a large refund runs at once");
const rev = await api.revision();
const retry = await api.command({ ...(await refund({})), expectedRev: first.rev });
assert(retry.operationId === first.operationId && (await api.revision()) === rev, "same key does not write again");
assert((await audits(first.operationId)).length === 1, "one audit for the double click");
assert((await payment("PAY0200"))?.status === "refunded", "refunded once");
assert((await api.approvals()).filter((row) => row.status === "pending").length === 0, "nothing waits for a second admin");

// A later refund of the same payment is refused: no second payment, the store does not move.
const before = await api.revision();
await refused(api.command(await refund({ idempotencyKey: "k5", actorId: "nora" })), 409, "invalid_transition", "retry does not pay twice");
assert((await api.revision()) === before, "rev unchanged when already refunded");

const small = await api.command(await refund({ idempotencyKey: "s", targetId: "PAY0002" }));
assert(small.status === "committed" && (await payment("PAY0002"))?.status === "refunded", "a small refund commits too");

console.log("refund flow ok");
