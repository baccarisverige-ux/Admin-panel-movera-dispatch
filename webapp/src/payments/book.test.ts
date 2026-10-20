import { canStartCheckout, existingAuthContinues, markPaid, setMethod, type PaymentMethod } from "./book.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

const allOn = Object.fromEntries(["card", "apple", "google", "cash", "wallet"].map((id) => [id, true])) as Record<PaymentMethod, boolean>;
const cashOff = setMethod(allOn, "cash", false);
assert(canStartCheckout(cashOff, "cash") === false, "new cash checkout refused");
assert(existingAuthContinues({ id: "C1", method: "cash", state: "authorized" }, cashOff), "existing authorisation continues");
assert(existingAuthContinues({ id: "C2", method: "cash", state: "new" }, cashOff) === false, "new checkout follows the switch");
const bank = { driverId: "D1", status: "in_review" as const };
assert(markPaid({ id: "P1", driverId: "D1", amountOre: 1000, status: "pending" }, bank).error?.includes("in review"), "unreviewed bank");
assert(markPaid({ id: "P1", driverId: "D1", amountOre: 1000, status: "pending" }, { ...bank, status: "approved" }).payout.status === "paid", "approved bank can be paid");

console.log("payments ok");
