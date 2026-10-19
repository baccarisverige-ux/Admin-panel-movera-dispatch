import { AGENTS } from "../auth/permissions.ts";
import { writeSession } from "../auth/sessionStore.ts";
import { createFixtureAdminApi, type CommandInput } from "./create.ts";
import { signedInFixture } from "./fixtureSession.ts";
import { ApiError } from "./httpClient.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

const lena = AGENTS.find((agent) => agent.id === "lena")!;
const astrid = AGENTS.find((agent) => agent.id === "astrid")!;
// Team members with a narrower scope than the seeded ones.
const EXTRA = [
  { ...lena, id: "lena-z1", email: "lena-z1@movera.se", scope: { zones: ["Z001"], market: "SE-STO" as const } },
  { ...astrid, id: "astrid-fr", email: "astrid-fr@movera.se", scope: { zones: "all" as const, market: "SE-STO" as const, countries: ["FR" as const] } },
];

async function expectStatus(work: Promise<unknown>, status: number, message: string, code?: string): Promise<ApiError> {
  let caught: ApiError | null = null;
  await work.then(
    () => {
      throw new Error(`${message}: expected rejection`);
    },
    (error: unknown) => {
      assert(error instanceof ApiError && error.status === status, `${message}: expected ${status}, got ${error instanceof ApiError ? error.status : String(error)}`);
      if (code) assert((error as ApiError).code === code, `${message}: expected code ${code}, got ${(error as ApiError).code}`);
      caught = error as ApiError;
    },
  );
  return caught!;
}

const raw = createFixtureAdminApi(0);
const api = signedInFixture(raw, EXTRA);

await api.reset();
const uiRev = await api.revision();
const uiResult = await api.command({
  action: "admin.auth.pickAgent",
  targetId: "lena",
  reason: "No person affected",
  actorId: "signed-out",
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
    idempotencyKey: "stale-revision",
    expectedRev: firstRev,
    collection: "riders",
    patch: { status: "blocked" },
    before: "active",
    after: "blocked",
  }),
  409,
  "stale revision",
  "version_mismatch",
).then((error) => {
  // X8: the contract's stale-version error carries the current record so the screen can rebase.
  assert((error.projection as { id?: string } | undefined)?.id === "R0001", "version_mismatch carries the current record as projection");
});

const currentAfterRefund = await api.revision();
await expectStatus(
  api.command({
    action: "admin.payment.refund",
    targetId: "PAY0003",
    reason: "Support request",
    actorId: "maja",
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
    actorId: "lena-z1",
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
    idempotencyKey: "wrong-state",
    expectedRev: currentAfterScope,
    collection: "trips",
    patch: { status: "cancelled_by_admin" },
    before: "completed",
    after: "cancelled_by_admin",
  }),
  409,
  "state guard",
  "invalid_transition",
).then((error) => {
  // X8: a command the trip's status does not allow is 409 invalid_transition with the trip, not 422 invalid_request.
  assert((error.projection as { id?: string; status?: string } | undefined)?.status === "completed", "invalid_transition carries the trip as projection");
});

const currentAfterState = await api.revision();
await expectStatus(
  api.command({
    action: "admin.rider.block",
    targetId: "R0001",
    reason: "",
    actorId: "lena",
    idempotencyKey: "missing-reason",
    expectedRev: currentAfterState,
    collection: "riders",
    patch: { status: "blocked" },
    before: "active",
    after: "blocked",
  }),
  422,
  "reason requirement",
  "invalid_request",
);

await api.reset();
const approvalRev = await api.revision();
// C-03: the amount comes from the stored payment (250 kr), not from the request, which says 50 kr.
const large = await api.command({
  action: "admin.payment.refund",
  targetId: "PAY0200",
  reason: "Large correction",
  actorId: "astrid",
  idempotencyKey: "large-refund",
  expectedRev: approvalRev,
  collection: "payments",
  patch: { status: "refunded" },
  before: "captured",
  after: "refunded",
  amountOre: 5_000,
});
assert(large.status === "pending_approval", "large refund waits for approval");
assert((await api.approvals()).filter((row) => row.targetId === "PAY0200" && row.status === "pending").length === 1, "one approval row created");
const paymentAfterApprovalRequest = (await api.list("payments", null)).find((row) => row.id === "PAY0200");
assert(paymentAfterApprovalRequest?.status === "captured", "pending approval does not mutate the payment");
const pendingApproval = (await api.approvals()).find((row) => row.targetId === "PAY0200" && row.status === "pending");
assert(pendingApproval?.amountOre === 25_000 && pendingApproval.currency === "SEK", "the approval holds the stored amount and its currency");
assert(pendingApproval, "pending approval can be decided");

const requesterDecisionRev = await api.revision();
await expectStatus(
  api.command({
    action: "admin.approval.approve",
    targetId: pendingApproval!.id,
    reason: "Second-person review",
    actorId: "astrid",
    idempotencyKey: "self-approval-denied",
    expectedRev: requesterDecisionRev,
    before: "pending",
    after: "approved",
  }),
  403,
  "requester cannot self-approve",
);

// C-02: the decider needs the refund permission itself (ops has approval.decide but not payments.refund) ...
const approve = async (actorId: string, key: string) =>
  api.command({ action: "admin.approval.approve", targetId: pendingApproval!.id, reason: "Verified duplicate charge evidence", actorId, idempotencyKey: key, expectedRev: await api.revision(), before: "pending", after: "approved" });
await expectStatus(approve("lena", "ops-approval-denied"), 403, "a role without payments.refund cannot approve a refund");
// ... and the payment's zone in scope: a France-only finance admin cannot approve a Stockholm refund.
await expectStatus(approve("astrid-fr", "fr-approval-denied"), 403, "an approver outside the payment's country is refused");
assert((await api.list("payments", null)).find((row) => row.id === "PAY0200")?.status === "captured", "refused approvals do not refund");
const decision = await approve("nora", "second-agent-approval");
assert(decision.status === "committed", "second authorised agent can approve");
const approvedPayment = (await api.list("payments", null)).find((row) => row.id === "PAY0200");
assert(approvedPayment?.status === "refunded", "approved refund mutates the payment once");
const approvedRow = (await api.approvals()).find((row) => row.id === pendingApproval!.id);
assert(approvedRow?.status === "approved" && approvedRow.decidedBy === "nora", "approval records the decision agent");

await api.reset();
const rejectRequestRev = await api.revision();
const rejectRequest = await api.command({
  action: "admin.payment.refund",
  targetId: "PAY0200",
  reason: "Large refund under review",
  actorId: "astrid",
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
  actorId: "nora",
  idempotencyKey: "second-agent-rejection",
  expectedRev: rejectDecisionRev,
  before: "pending",
  after: "rejected",
});
const rejectedPayment = (await api.list("payments", null)).find((row) => row.id === "PAY0200");
assert(rejectedPayment?.status === "captured", "rejected refund leaves the captured payment untouched");
assert((await api.approvals()).find((row) => row.id === rejectApproval!.id)?.status === "rejected", "approval row records rejection");

// C-09: after a rejection, asking again is a new request with a new key, and it creates a new approval.
const requestAgain = async (key: string) =>
  api.command({ action: "admin.payment.refund", targetId: "PAY0200", reason: "New evidence", actorId: "astrid", idempotencyKey: key, expectedRev: await api.revision(), collection: "payments", patch: { status: "refunded" }, before: "captured", after: "refunded" });
const again = await requestAgain("large-refund-second-request");
assert(again.status === "pending_approval", "a new request after a rejection waits for approval again");
assert((await api.approvals()).filter((row) => row.targetId === "PAY0200" && row.status === "pending").length === 1, "the new request created a pending approval");
await expectStatus(requestAgain("large-refund-third-request"), 409, "a second request while one is pending is refused");

// C-03: a refund without an amount is the full stored amount, so it still needs the second admin.
await api.reset();
const noAmount = await requestAgain("refund-without-amount");
assert(noAmount.status === "pending_approval", "a refund with no amount is not a 0 kr refund");

// C-08: the threshold follows the payment's currency: 58,10 € needs a second admin (over 20 €) ...
const refundOf = async (targetId: string, key: string) =>
  api.command({ action: "admin.payment.refund", targetId, reason: "Charged twice", actorId: "nora", idempotencyKey: key, expectedRev: await api.revision(), collection: "payments", patch: { status: "refunded" }, before: "captured", after: "refunded" });
assert((await refundOf("PAY1002", "fr-refund")).status === "pending_approval", "a 58,10 € refund needs a second admin");
// ... and 29,050 DT does not (under 60 DT); with the flat 20 000 minor-unit rule it did (20 DT).
assert((await refundOf("PAY2002", "tn-refund")).status === "committed", "a 29,050 DT refund commits");
assert((await api.approvals()).find((row) => row.targetId === "PAY1002")?.currency === "EUR", "the approval stores the currency");

// C-03: a full trip refund over the threshold waits for a second admin too, and approving it refunds the trip.
const tripRefund = await api.command({ action: "admin.trip.refund", targetId: "T1013", reason: "Charged twice", actorId: "nora", idempotencyKey: "trip-refund", expectedRev: await api.revision(), collection: "trips", patch: { kind: "refunded" }, before: "", after: "refunded" });
assert(tripRefund.status === "pending_approval", "a 45,50 € trip refund needs a second admin");
assert((await api.list("trips", null)).find((row) => row.id === "T1013")?.kind !== "refunded", "the trip is not refunded before approval");
const tripApproval = (await api.approvals()).find((row) => row.targetId === "T1013" && row.status === "pending")!;
await api.command({ action: "admin.approval.approve", targetId: tripApproval.id, reason: "Checked", actorId: "astrid", idempotencyKey: "trip-refund-approve", expectedRev: await api.revision(), before: "pending", after: "approved" });
assert((await api.list("trips", null)).find((row) => row.id === "T1013")?.kind === "refunded", "the approved trip refund is applied");
const smallTrip = await api.command({ action: "admin.trip.refund", targetId: "T0012", reason: "Charged twice", actorId: "nora", idempotencyKey: "trip-refund-small", expectedRev: await api.revision(), collection: "trips", patch: { kind: "refunded" }, before: "", after: "refunded" });
assert(smallTrip.status === "committed", "a 60 kr trip refund commits");

// C-04: a command writes only what it declares.
await api.reset();
const send = async (input: Omit<CommandInput, "idempotencyKey" | "expectedRev" | "before" | "after">, key: string) =>
  api.command({ ...input, idempotencyKey: key, expectedRev: await api.revision(), before: "", after: "" });
await expectStatus(send({ action: "admin.trip.note", targetId: "T0012", reason: "Note", actorId: "maja", sliceKey: "finance", value: { hacked: true } }, "note-into-finance"), 403, "a trip note cannot replace the finance slice");
assert(JSON.stringify(await api.readSlice("finance", null)) !== JSON.stringify({ hacked: true }), "finance is untouched");
await expectStatus(send({ action: "admin.driver.note", targetId: "D0001", reason: "Note", actorId: "ida", sliceKey: "driverOps", value: {}, collection: "drivers", patch: { status: "active" } }, "note-activates"), 403, "a driver note cannot activate a driver");
assert((await api.list("drivers", null)).find((row) => row.id === "D0001")?.status === "pending", "the driver stays pending");
await expectStatus(send({ action: "admin.rider.block", targetId: "R0001", reason: "Safety review", actorId: "lena", collection: "riders", patch: { status: "blocked", fareOre: 1 } }, "block-and-credit"), 403, "a block cannot also change the wallet");
await expectStatus(send({ action: "admin.rider.block", targetId: "R0001", reason: "Safety review", actorId: "lena", collection: "drivers", patch: { status: "blocked" } }, "block-wrong-collection"), 403, "a rider command cannot patch drivers");

// C-05: identity is the session's, not the request's.
await expectStatus(send({ action: "admin.shell.reset", targetId: "demo", reason: "Reset", actorId: "anna" }, "viewer-reset"), 403, "a viewer cannot reset the demo");
writeSession("anna");
await expectStatus(
  raw.command({ action: "admin.rider.block", targetId: "R0001", reason: "Safety review", actorId: "nora", idempotencyKey: "claims-nora", expectedRev: await api.revision(), collection: "riders", patch: { status: "blocked" }, before: "", after: "" }),
  403,
  "a request sent for another agent than the signed-in one is refused",
);
writeSession(null);
await expectStatus(
  raw.command({ action: "admin.rider.block", targetId: "R0001", reason: "Safety review", idempotencyKey: "nobody", expectedRev: await api.revision(), collection: "riders", patch: { status: "blocked" }, before: "", after: "" }),
  401,
  "no session, no business command",
);

// C-09: a conflict is not replayed forever: after it clears, the same key goes through.
await api.setFault("409");
const conflictInput = { action: "admin.rider.block", targetId: "R0001", reason: "Safety review", actorId: "lena", idempotencyKey: "conflict-then-ok", collection: "riders", patch: { status: "blocked" }, before: "active", after: "blocked" };
await expectStatus(api.command({ ...conflictInput, expectedRev: await api.revision() }), 409, "injected conflict", "version_mismatch");
await api.setFault("none");
assert((await api.command({ ...conflictInput, expectedRev: await api.revision() })).status === "committed", "the retry after a conflict is checked again, not replayed");

await api.reset();
const transientRev = await api.revision();
await api.setFault("503");
const transientInput = {
  action: "admin.rider.block",
  targetId: "R0001",
  reason: "Safety review",
  actorId: "lena",
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
  api.revision().then((rev) => api.command({ action, targetId, reason: "Ops check", actorId: "lena", idempotencyKey: key, expectedRev: rev, collection: "trips", patch, entityState, before: "", after: "" }));
await tripCommand("admin.trip.reassign", accepted.id, "reassign-1", { driverId: null, status: "accepted" });
assert((await api.list("trips", null)).find((trip) => trip.id === accepted.id)!.status === "searching", "reassign lands in searching whatever the client patch says");
await tripCommand("admin.trip.offer", accepted.id, "assign-1", { driverId: "D0003" });
assert((await api.list("trips", null)).find((trip) => trip.id === accepted.id)!.status === "offered", "assign lands in offered; the driver still accepts");
await expectStatus(tripCommand("admin.trip.cancel", finished.id, "cancel-lie", { status: "cancelled_by_admin", cancelReasonCode: "admin_safety" }, "searching"), 409, "a client-claimed state cannot unlock a terminal trip", "invalid_transition");
// X8: invalid transitions are 409 invalid_transition for every lifecycle command (the transition table runs before
// the action's own state list), and an admin cancel accepts only admin_* reason codes.
await expectStatus(tripCommand("admin.trip.reassign", finished.id, "reassign-done", { driverId: null }), 409, "reassign a completed trip", "invalid_transition");
const searchingTrip = (await api.list("trips", null)).find((trip) => trip.status === "searching");
if (searchingTrip) await expectStatus(tripCommand("admin.trip.noShow", searchingTrip.id, "noshow-searching", { status: "no_show", cancelReasonCode: "rider_no_show" }), 409, "no-show while searching", "invalid_transition");
await expectStatus(tripCommand("admin.trip.noShow", onTrip.id, "noshow-in-trip", { status: "no_show", cancelReasonCode: "rider_no_show" }), 409, "no-show while in_trip", "invalid_transition");
const cancellable = (await api.list("trips", null)).find((trip) => trip.status === "searching" || trip.status === "accepted" || trip.status === "arrived")!;
await expectStatus(tripCommand("admin.trip.cancel", cancellable.id, "cancel-rider-code", { status: "cancelled_by_admin", cancelReasonCode: "plans_changed" }), 422, "a rider reason code is refused on an admin cancel", "invalid_request");
await expectStatus(tripCommand("admin.trip.cancel", cancellable.id, "cancel-no-code", { status: "cancelled_by_admin" }), 422, "an admin cancel needs a reason code", "invalid_request");
assert((await api.list("trips", null)).find((trip) => trip.id === cancellable.id)!.status === cancellable.status, "refused cancels change nothing");
await tripCommand("admin.trip.cancel", cancellable.id, "cancel-admin-code", { status: "cancelled_by_admin", cancelReasonCode: "admin_safety" });
assert((await api.list("trips", null)).find((trip) => trip.id === cancellable.id)!.status === "cancelled_by_admin", "an admin_* reason code cancels");
const staleRev = (await api.revision()) - 1;
await expectStatus(api.command({ action: "admin.trip.cancel", targetId: accepted.id, reason: "Ops check", actorId: "lena", idempotencyKey: "cancel-stale", expectedRev: staleRev, collection: "trips", patch: { status: "cancelled_by_admin", cancelReasonCode: "admin_safety" }, before: "", after: "" }), 409, "cancel with a stale version", "version_mismatch");
await expectStatus(tripCommand("admin.trip.adjust", onTrip.id, "status-sneak", { status: "completed" }), 403, "a non-lifecycle command cannot change the status");
assert((await api.list("trips", null)).find((trip) => trip.id === onTrip.id)!.status === "in_trip", "status unchanged after the refused sneak");

console.log("generic command engine ok");
