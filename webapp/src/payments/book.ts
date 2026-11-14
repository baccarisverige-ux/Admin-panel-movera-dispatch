/** Owner Q7 FINAL: Card, Apple Pay and Cash in every country (no Swish, Klarna or PayPal; owner G8 driver-g8.md:4: no Google Pay); the wallet is one balance per currency. */
export const PAYMENT_METHODS = ["card", "apple", "cash", "wallet"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type Checkout = { id: string; method: PaymentMethod; state: "new" | "authorized" };
export type BankAccount = { driverId: string; status: "in_review" | "approved" };
export type Payout = { id: string; driverId: string; amountOre: number; status: "pending" | "paid" };

export function setMethod(enabled: Record<PaymentMethod, boolean>, method: PaymentMethod, on: boolean): Record<PaymentMethod, boolean> {
  return { ...enabled, [method]: on };
}

export function canStartCheckout(enabled: Record<PaymentMethod, boolean>, method: PaymentMethod): boolean {
  return enabled[method];
}

export function existingAuthContinues(checkout: Checkout, enabled: Record<PaymentMethod, boolean>): boolean {
  if (checkout.state === "authorized") return true;
  return enabled[checkout.method];
}

export function markPaid(payout: Payout, bank: BankAccount): { payout: Payout; error?: string } {
  if (bank.driverId !== payout.driverId) return { payout, error: "Bank account does not match the driver." };
  if (bank.status !== "approved") return { payout, error: "Bank details are still in review." };
  if (payout.status === "paid") return { payout, error: "Already paid." };
  return { payout: { ...payout, status: "paid" } };
}
