import { createFixtureAdminApi } from "./create.ts";
import { ApiError } from "./httpClient.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

const ALL = { zones: "all" as const, market: "SE-STO" as const };
const Z001 = { zones: ["Z001"], market: "SE-STO" as const };

async function expectStatus(work: Promise<unknown>, status: number, message: string) {
  await work.then(
    () => {
      throw new Error(`${message}: expected rejection`);
    },
    (error: unknown) => {
      assert(error instanceof ApiError && error.status === status, `${message}: expected ${status}`);
    },
  );
}

const api = createFixtureAdminApi(0);

await api.reset();
const uiRev = await api.revision();
const uiResult = await api.command({
  action: "admin.auth.pickAgent",
  targetId: "lena",
  reason: "No person affected",
  actorId: "signed-out",
  actorRole: "super",
  actorScope: ALL,
  idempotencyKey: "pick-agent-ui",
  expectedRev: uiRev,
  before: "",
  after: "Pick demo agent",
});
assert(uiResult.status === "committed" && uiResult.rev === uiRev, "pure UI command does not change business revision");
assert((await api.audit()).length === 0, "pure UI command does not create business audit rows");

await api.reset();
const firstRev = await api.revision();
const smallInput = {
  action: "admin.payment.refund",
  targetId: "PAY0002",
  reason: "Charged twice",
  actorId: "astrid",
  actorRole: "finance" as const,
  actorScope: ALL,
  idempotencyKey: "generic-small-refund",
  expectedRev: firstRev,
  collection: "payments",
  patch: { status: "refunded" },
  before: "captured",
  after: "refunded",
  amountOre: 5_000,
};
const small = await api.command(smallInput);
assert(small.status === "committed", "small refund commits");
const retry = await api.command(smallInput);
assert(retry.operationId === small.operationId, "same idempotency key replays the same operation");
const refundAudits = (await api.audit()).filter((row) => row.operationId === small.operationId && row.result === "committed");
assert(refundAudits.length === 1, "double click creates one committed audit effect");

await expectStatus(
  api.command({
    action: "admin.rider.block",
    targetId: "R0001",
    reason: "Safety review",
    actorId: "lena",
    actorRole: "ops",
    actorScope: ALL,
    idempotencyKey: "stale-revision",
    expectedRev: firstRev,
    collection: "riders",
    patch: { status: "blocked" },
    before: "active",
    after: "blocked",
  }),
  409,
  "stale revision",
);

const currentAfterRefund = await api.revision();
await expectStatus(
  api.command({
    action: "admin.payment.refund",
    targetId: "PAY0003",
    reason: "Support request",
    actorId: "maja",
    actorRole: "support",
    actorScope: ALL,
    idempotencyKey: "permission-denied",
    expectedRev: currentAfterRefund,
    collection: "payments",
    patch: { status: "refunded" },
    before: "captured",
    after: "refunded",
    amountOre: 5_000,
  }),
  403,
  "permission denial",
);

const currentAfterPermission = await api.revision();
await expectStatus(
  api.command({
    action: "admin.rider.block",
    targetId: "R0002",
    reason: "Safety review",
    actorId: "lena",
    actorRole: "ops",
    actorScope: Z001,
    idempotencyKey: "scope-denied",
    expectedRev: currentAfterPermission,
    collection: "riders",
    patch: { status: "blocked" },
    before: "active",
    after: "blocked",
  }),
  403,
  "record outside actor scope",
);

const trips = await api.list("trips", null);
const completed = trips.find((trip) => trip.status === "completed");
assert(completed, "seed contains a completed trip");
const currentAfterScope = await api.revision();
await expectStatus(
  api.command({
    action: "admin.trip.cancel",
    targetId: completed!.id,
    reason: "Safety review",
    actorId: "lena",
    actorRole: "ops",
    actorScope: ALL,
    idempotencyKey: "wrong-state",
    expectedRev: currentAfterScope,
    collection: "trips",
    patch: { status: "cancelled_by_admin" },
    before: "completed",
    after: "cancelled_by_admin",
  }),
  422,
  "state guard",
);

const currentAfterState = await api.revision();
await expectStatus(
  api.command({
    action: "admin.rider.block",
    targetId: "R0001",
    reason: "",
    actorId: "lena",
    actorRole: "ops",
    actorScope: ALL,
    idempotencyKey: "missing-reason",
    expectedRev: currentAfterState,
    collection: "riders",
    patch: { status: "blocked" },
    before: "active",
    after: "blocked",
  }),
  422,
  "reason requirement",
);

await api.reset();
const approvalRev = await api.revision();
const large = await api.command({
  action: "admin.payment.refund",
  targetId: "PAY0002",
  reason: "Large correction",
  actorId: "astrid",
  actorRole: "finance",
  actorScope: ALL,
  idempotencyKey: "large-refund",
  expectedRev: approvalRev,
  collection: "payments",
  patch: { status: "refunded" },
  before: "captured",
  after: "refunded",
  amountOre: 25_000,
});
assert(large.status === "pending_approval", "large refund waits for approval");
assert((await api.approvals()).filter((row) => row.targetId === "PAY0002" && row.status === "pending").length === 1, "one approval row created");
const paymentAfterApprovalRequest = (await api.list("payments", null)).find((row) => row.id === "PAY0002");
assert(paymentAfterApprovalRequest?.status === "captured", "pending approval does not mutate the payment");
const pendingApproval = (await api.approvals()).find((row) => row.targetId === "PAY0002" && row.status === "pending");
assert(pendingApproval, "pending approval can be decided");

const requesterDecisionRev = await api.revision();
await expectStatus(
  api.command({
    action: "admin.approval.approve",
    targetId: pendingApproval!.id,
    reason: "Second-person review",
    actorId: "astrid",
    actorRole: "finance",
    actorScope: ALL,
    idempotencyKey: "self-approval-denied",
    expectedRev: requesterDecisionRev,
    before: "pending",
    after: "approved",
  }),
  403,
  "requester cannot self-approve",
);

const decisionRev = await api.revision();
const decision = await api.command({
  action: "admin.approval.approve",
  targetId: pendingApproval!.id,
  reason: "Verified duplicate charge evidence",
  actorId: "lena",
  actorRole: "ops",
  actorScope: ALL,
  idempotencyKey: "second-agent-approval",
  expectedRev: decisionRev,
  before: "pending",
  after: "approved",
});
assert(decision.status === "committed", "second authorised agent can approve");
const approvedPayment = (await api.list("payments", null)).find((row) => row.id === "PAY0002");
assert(approvedPayment?.status === "refunded", "approved refund mutates the payment once");
const approvedRow = (await api.approvals()).find((row) => row.id === pendingApproval!.id);
assert(approvedRow?.status === "approved" && approvedRow.decidedBy === "lena", "approval records the decision agent");

await api.reset();
const rejectRequestRev = await api.revision();
const rejectRequest = await api.command({
  action: "admin.payment.refund",
  targetId: "PAY0200",
  reason: "Large refund under review",
  actorId: "astrid",
  actorRole: "finance",
  actorScope: ALL,
  idempotencyKey: "large-refund-reject-case",
  expectedRev: rejectRequestRev,
  collection: "payments",
  patch: { status: "refunded" },
  before: "captured",
  after: "refunded",
  amountOre: 25_000,
});
assert(rejectRequest.status === "pending_approval", "second large refund also waits for approval");
const rejectApproval = (await api.approvals()).find((row) => row.targetId === "PAY0200" && row.status === "pending");
assert(rejectApproval, "rejection case has a pending approval");
const rejectDecisionRev = await api.revision();
await api.command({
  action: "admin.approval.reject",
  targetId: rejectApproval!.id,
  reason: "Evidence did not support the refund",
  actorId: "lena",
  actorRole: "ops",
  actorScope: ALL,
  idempotencyKey: "second-agent-rejection",
  expectedRev: rejectDecisionRev,
  before: "pending",
  after: "rejected",
});
const rejectedPayment = (await api.list("payments", null)).find((row) => row.id === "PAY0200");
assert(rejectedPayment?.status === "captured", "rejected refund leaves the captured payment untouched");
assert((await api.approvals()).find((row) => row.id === rejectApproval!.id)?.status === "rejected", "approval row records rejection");

await api.reset();
const transientRev = await api.revision();
await api.setFault("503");
const transientInput = {
  action: "admin.rider.block",
  targetId: "R0001",
  reason: "Safety review",
  actorId: "lena",
  actorRole: "ops" as const,
  actorScope: ALL,
  idempotencyKey: "transient-retry",
  expectedRev: transientRev,
  collection: "riders",
  patch: { status: "blocked" },
  before: "active",
  after: "blocked",
};
await expectStatus(api.command(transientInput), 503, "transient failure");
await api.setFault("none");
const recovered = await api.command(transientInput);
assert(recovered.status === "committed", "same idempotency key can safely retry after pre-commit transient failure");

// Trip lifecycle commands follow the shared transition table on the server side, not the client's patch or claimed state.
const lifeTrips = await api.list("trips", null);
const accepted = lifeTrips.find((trip) => trip.status === "accepted")!;
const finished = lifeTrips.find((trip) => trip.status === "completed")!;
const onTrip = lifeTrips.find((trip) => trip.status === "in_trip")!;
const tripCommand = (action: string, targetId: string, key: string, patch: Record<string, string | null>, entityState?: string) =>
  api.revision().then((rev) => api.command({ action, targetId, reason: "Ops check", actorId: "lena", actorRole: "ops", actorScope: ALL, idempotencyKey: key, expectedRev: rev, collection: "trips", patch, entityState, before: "", after: "" }));
await tripCommand("admin.trip.reassign", accepted.id, "reassign-1", { driverId: null, status: "accepted" });
assert((await api.list("trips", null)).find((trip) => trip.id === accepted.id)!.status === "searching", "reassign lands in searching whatever the client patch says");
await tripCommand("admin.trip.offer", accepted.id, "assign-1", { driverId: "D0003" });
assert((await api.list("trips", null)).find((trip) => trip.id === accepted.id)!.status === "offered", "assign lands in offered; the driver still accepts");
await expectStatus(tripCommand("admin.trip.cancel", finished.id, "cancel-lie", { status: "cancelled_by_admin" }, "searching"), 422, "a client-claimed state cannot unlock a terminal trip");
await expectStatus(tripCommand("admin.trip.adjust", onTrip.id, "status-sneak", { status: "completed" }), 422, "a non-lifecycle command cannot change the status");
assert((await api.list("trips", null)).find((trip) => trip.id === onTrip.id)!.status === "in_trip", "status unchanged after the refused sneak");

console.log("generic command engine ok");
