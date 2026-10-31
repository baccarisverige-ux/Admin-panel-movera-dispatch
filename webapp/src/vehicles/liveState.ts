import { tr, type MessageKey } from "../i18n/index.ts";

/**
 * v0.18.5 (owner G2-D5.4 "Fix the page (Recommended)"): the Vehicles page on live shows each car's true state, read
 * from the server's Vehicle (status, documents, requiredDocuments), in sv / fr / en:
 * waiting for papers (a required car document is missing, rejected or expired: the owner must act), waiting for
 * admin (every required paper is sent and the car or a paper waits for a review), approved, blocked, rejected.
 *
 * Owner G2-D5.3 ("The owner never decide !! Admin who gave him the allowed cathegories after approve !",
 * vehicleRules.categoriesByAdmin): the admin gives the categories when approving, only among Vehicle.fitCategories,
 * and at least one ride category (the extras, contract vehicleRules.extraCategories, never alone).
 */
export type LiveCarState = "waiting_papers" | "waiting_admin" | "approved" | "blocked" | "rejected";

export const LIVE_CAR_STATES: readonly LiveCarState[] = ["waiting_papers", "waiting_admin", "approved", "blocked", "rejected"];

const LABEL: Record<LiveCarState, MessageKey> = {
  waiting_papers: "Waiting for papers",
  waiting_admin: "Waiting for admin",
  approved: "Approved",
  blocked: "Blocked",
  rejected: "Rejected",
};

/** contract.json#driverOnboarding.vehicleRules.extraCategories: an extra is given only with a ride category. */
export const EXTRA_CATEGORIES: readonly string[] = ["child_seat"];

type CarFacts = { status: string; documents?: readonly { type: string; status: string; renewalOf?: string }[]; requiredDocuments?: readonly string[] };

export function liveCarState(car: CarFacts): LiveCarState {
  if (car.status === "approved") return "approved";
  if (car.status === "blocked") return "blocked";
  if (car.status === "rejected") return "rejected";
  const documents = (car.documents ?? []).filter((doc) => !doc.renewalOf);
  const stuck = (car.requiredDocuments ?? []).some((type) => {
    const doc = documents.find((item) => item.type === type);
    return !doc || doc.status === "missing" || doc.status === "rejected" || doc.status === "expired";
  });
  return stuck ? "waiting_papers" : "waiting_admin";
}

export function liveCarStateLabel(state: LiveCarState): string {
  return tr(LABEL[state]);
}

/** The categories offered at approval: the car's fitCategories, ride categories first, then the extras. */
export function approvalChoices(fitCategories: readonly string[] | undefined): { rides: string[]; extras: string[] } {
  const fit = [...new Set(fitCategories ?? [])];
  return { rides: fit.filter((id) => !EXTRA_CATEGORIES.includes(id)), extras: fit.filter((id) => EXTRA_CATEGORIES.includes(id)) };
}

/** The first choice: the car's own categories that it still fits (none for a new car). */
export function initialApprovalPick(categoryIds: readonly string[] | undefined, fitCategories: readonly string[] | undefined): string[] {
  const fit = new Set(fitCategories ?? []);
  return [...new Set(categoryIds ?? [])].filter((id) => fit.has(id));
}

/** Why Approve is off, or null: at least one ride category (G2-D5.3, the server's 400 categories_required). */
export function approvalBlock(picked: readonly string[]): string | null {
  return picked.some((id) => !EXTRA_CATEGORIES.includes(id)) ? null : tr("Give the car at least one ride category.");
}
