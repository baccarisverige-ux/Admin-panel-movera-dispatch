import { cancelReasonsDefault } from "../dispatch/offers.ts";

/**
 * Reasons offered in the confirm dialog of a command. Each command family gets its own list, so the audit
 * says why something happened ("Charged twice", "Planned price change") instead of one document-review list
 * for everything. "Other" asks for a short text. Cancel and refund dialogs start with no reason chosen
 * (mustChooseReason); every other dialog preselects the first reason.
 */
export const OTHER_REASON = "Other";

/** Document reviews: the reasons the onboarding desk already used. */
export const DOCUMENT_REASONS = ["Checked and correct", "Wrong document", "Name does not match", "Blurry", "Expired", "Cut off", "Safety review", OTHER_REASON] as const;

export const REFUND_REASONS = ["Charged twice", "Rider was overcharged", "Trip did not happen", "Driver or service problem", "Goodwill gesture", OTHER_REASON] as const;

/** Admin cancel reasons as named in Dispatch › Cancel reasons (contract codes admin_*). */
export const PAID_REASONS = ["Bank transfer confirmed", "Paid outside the app", "Cash received", "Fix a mistake", OTHER_REASON] as const;

export const CANCEL_REASONS = [...cancelReasonsDefault().groups.admin.map((item) => item.title.en ?? item.code).filter((text) => text !== "Other reason"), OTHER_REASON];

export const SUSPEND_REASONS = ["Safety concern", "Complaint under review", "Suspected fraud", "Document problem", "Breach of the rules", "Asked by the person", OTHER_REASON] as const;

export const REINSTATE_REASONS = ["Issue resolved", "Documents approved", "Appeal accepted", "Placed on hold by mistake", OTHER_REASON] as const;

export const CHANGE_REASONS = ["Planned change", "Fix a mistake", "Demand or market change", "New market or zone launch", "Legal or policy requirement", "Asked by management", OTHER_REASON] as const;

export const ROLLBACK_REASONS = ["Fix a mistake", "Change caused problems", "Published too early", "Asked by management", OTHER_REASON] as const;

export const TRIP_MONEY_REASONS = ["Wrong route or distance", "Waiting time was wrong", "Rider complaint", "Driver complaint", "Payment problem", OTHER_REASON] as const;

export const DISPATCH_REASONS = ["Rider asked support", "Driver asked support", "Driver not moving", "Better driver nearby", "Operational problem", OTHER_REASON] as const;

export const CASE_REASONS = ["Rider contacted support", "Driver contacted support", "Safety follow-up", "Quality check", OTHER_REASON] as const;

export const PEOPLE_REASONS = ["New team member", "Role change", "Left the team", "Security concern", OTHER_REASON] as const;

export const APPROVAL_REASONS = ["Checked the evidence", "Amount and details are correct", "Not enough evidence", "Amount or details are wrong", OTHER_REASON] as const;

export const MESSAGE_REASONS = ["Service update", "Campaign", "Safety notice", "Answering a question", OTHER_REASON] as const;

export const SENSITIVE_REASONS = ["Contacting the person about a trip", "Safety case", "Support ticket", "Legal request", OTHER_REASON] as const;

/** Used only when no family matches. */
export const GENERIC_REASONS = ["Rider request", "Driver request", "Operational need", "Fix a mistake", "Safety review", OTHER_REASON] as const;

export type ReasonFamily =
  | "document"
  | "refund"
  | "paid"
  | "cancel"
  | "suspend"
  | "reinstate"
  | "rollback"
  | "tripMoney"
  | "dispatch"
  | "case"
  | "people"
  | "approval"
  | "message"
  | "sensitive"
  | "change"
  | "generic";

const LISTS: Record<ReasonFamily, readonly string[]> = {
  document: DOCUMENT_REASONS,
  refund: REFUND_REASONS,
  paid: PAID_REASONS,
  cancel: CANCEL_REASONS,
  suspend: SUSPEND_REASONS,
  reinstate: REINSTATE_REASONS,
  rollback: ROLLBACK_REASONS,
  tripMoney: TRIP_MONEY_REASONS,
  dispatch: DISPATCH_REASONS,
  case: CASE_REASONS,
  people: PEOPLE_REASONS,
  approval: APPROVAL_REASONS,
  message: MESSAGE_REASONS,
  sensitive: SENSITIVE_REASONS,
  change: CHANGE_REASONS,
  generic: GENERIC_REASONS,
};

/** First match wins, so the specific families come before the broad "change" one. */
const RULES: [ReasonFamily, RegExp][] = [
  ["sensitive", /revealSensitive$/],
  ["people", /^admin\.team\./],
  ["document", /^admin\.(driver|fleetOwner|vehicle|payment|rider)\.(review|approveAll|requestInfo|reviewRegistration|bankReview|approveBank|rejectBank|identity|update)$/],
  ["approval", /^admin\.approval\.|^admin\.(dispatch|config)\.(approve|decline)$|^admin\.payout\.approveRun$/],
  // Saving the refund limits in Settings is a settings change, not a refund.
  ["change", /^admin\.refundPolicy\./],
  ["refund", /[rR]efund|\.credit$|walletCredit|issueVoucher/],
  ["paid", /\.markPaid$/],
  ["cancel", /^admin\.(trip|reservation)\.(cancel|noShow)$/],
  ["suspend", /\.(suspend|onHold|hold|block|ban|deactivate|signOut|stopLive)$/],
  ["reinstate", /\.(activate|reactivate|unblock)$/],
  ["rollback", /\.(rollback|undo|restore|restoreVersion|restoreCategory|voidVoucher)$|^admin\.campaign\.cancel$/],
  ["tripMoney", /^admin\.trip\.(adjust|waiting|pay|decide|complete)$|^admin\.reservation\.raise$|^admin\.(payout|payment)\.(retry|dispute)$/],
  ["dispatch", /^admin\.(trip\.(offer|reassign)|reservation\.(assign|offer|unassign|answer|return)|dispatch\.send)$/],
  ["case", /^admin\.(safety|support|ticket|incident)\.|^admin\.trip\.(flag|openCase)$|^admin\.reservation\.contact$|^admin\.risk\.review$/],
  ["message", /^admin\.(thread\.send|driverNotices\.send|riders\.(bulkMessage|promoSend))$|^admin\.campaign\.(test|publish)$/],
  ["change", /^admin\.(pricing|config|zone|dispatch|studio|content|campaigns?|promo|riders|drivers|growthOps|tax|alerts|vehicle|onboarding|review|payment|payout|reservation|rideCheck|shift|safetyOps|supportOps|driverOps|driverNotices|risk|incident|trip)\./],
];

export function reasonFamily(commandId: string): ReasonFamily {
  return RULES.find(([, pattern]) => pattern.test(commandId))?.[0] ?? "generic";
}

/**
 * Cancel and refund dialogs (and other cancels, such as a campaign or a category) start with no reason
 * selected, and Confirm stays disabled until the admin picks one (A-O1, owner decision). The audit then never
 * keeps a reason nobody chose.
 */
export function mustChooseReason(commandId: string): boolean {
  const family = reasonFamily(commandId);
  return family === "cancel" || family === "refund" || (/[cC]ancel/.test(commandId) && commandId !== "admin.confirm.cancel");
}

/** The reason a dialog opens with: none for cancel and refund dialogs, else the first of the list. */
export function initialReason(commandId: string): string {
  return mustChooseReason(commandId) ? "" : reasonsFor(commandId)[0] ?? "";
}

export function reasonsFor(commandId: string): readonly string[] {
  return LISTS[reasonFamily(commandId)];
}

/** What is written to the audit: the chosen reason, or "Other: <text>". Empty when "Other" has no text yet. */
export function auditReason(chosen: string, otherText: string): string {
  if (!chosen.trim()) return "";
  if (chosen !== OTHER_REASON) return chosen;
  const text = otherText.trim();
  return text ? `${OTHER_REASON}: ${text}` : "";
}
