import { COMMANDS } from "./registry.ts";
import { CANCEL_REASONS, CHANGE_REASONS, DOCUMENT_REASONS, GENERIC_REASONS, OTHER_REASON, REFUND_REASONS, SUSPEND_REASONS, auditReason, reasonFamily, reasonsFor } from "./reasons.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

// UI-03: each command family offers its own reasons; the document-review list is no longer used for everything.
const same = (a: readonly string[], b: readonly string[]) => JSON.stringify(a) === JSON.stringify(b);
assert(same(reasonsFor("admin.pricing.publish"), CHANGE_REASONS), "publishing pricing offers change reasons");
assert(!reasonsFor("admin.pricing.publish").includes("Blurry"), "publishing pricing does not offer 'Blurry'");
assert(same(reasonsFor("admin.pricing.undo"), reasonsFor("admin.zone.rollback")) && reasonFamily("admin.pricing.undo") === "rollback", "undo and roll back share the rollback reasons");
assert(same(reasonsFor("admin.payment.refund"), REFUND_REASONS) && same(reasonsFor("admin.trip.partRefund"), REFUND_REASONS) && same(reasonsFor("admin.rider.refund"), REFUND_REASONS), "every refund offers refund reasons");
assert(same(reasonsFor("admin.driver.review"), DOCUMENT_REASONS) && same(reasonsFor("admin.vehicle.reviewRegistration"), DOCUMENT_REASONS), "document reviews keep the document reasons");
assert(!same(reasonsFor("admin.zone.review"), DOCUMENT_REASONS) && !same(reasonsFor("admin.config.review"), DOCUMENT_REASONS), "sending zones or settings for review is not a document review");
assert(same(reasonsFor("admin.trip.cancel"), CANCEL_REASONS) && CANCEL_REASONS.includes("Fraud or misuse") && CANCEL_REASONS.includes("The rider asked support"), "cancel uses the admin cancel reasons from Dispatch");
assert(same(reasonsFor("admin.driver.suspend"), SUSPEND_REASONS) && same(reasonsFor("admin.rider.block"), SUSPEND_REASONS) && same(reasonsFor("admin.driver.onHold"), SUSPEND_REASONS), "suspend, block and hold offer suspend reasons");
assert(reasonFamily("admin.driver.reactivate") === "reinstate" && reasonFamily("admin.rider.unblock") === "reinstate", "reactivating offers reinstate reasons");
assert(reasonFamily("admin.team.deactivate") === "people", "team changes have their own reasons");
assert(reasonFamily("admin.approval.approve") === "approval", "approvals have their own reasons");

const generic = COMMANDS.filter((spec) => spec.reason && reasonFamily(spec.id) === "generic").map((spec) => spec.id);
assert(generic.length <= 25, `the generic list stays a fallback (${generic.length} commands)`);
assert(!generic.some((id) => /publish|refund|cancel|suspend|review|block/.test(id)), `no publish, refund, cancel, suspend, review or block command falls back to the generic list: ${generic.join(", ")}`);
for (const spec of COMMANDS.filter((item) => item.reason)) {
  const list = reasonsFor(spec.id);
  assert(list.length >= 3 && list.at(-1) === OTHER_REASON && new Set(list).size === list.length, `${spec.id} has a clean reason list ending in Other`);
}
assert(GENERIC_REASONS.includes(OTHER_REASON), "the fallback has Other");

// "Other" needs a written reason, which is what the audit keeps.
assert(auditReason(OTHER_REASON, "  ") === "", "Other without text is not a reason");
assert(auditReason(OTHER_REASON, " Rider called twice ") === "Other: Rider called twice", "Other keeps the typed text");
assert(auditReason("Charged twice", "ignored") === "Charged twice", "a listed reason is used as it is");
console.log("command reasons ok");
