import {
  PAYMENT_METHODS,
  type PaymentMethod,
} from "./book.ts";
import { accountOk, bicOk, clearingBank, ibanOk } from "./ledger.ts";

export const WALLET_TOP_UPS_ORE = [10_000, 20_000, 50_000] as const;

export type PaymentPolicyContext = {
  zoneId: string;
  category: string;
  platform: "ios" | "android";
};

export type BankReview = {
  driverId: string;
  clearing: string;
  account: string;
  iban: string;
  bic: string;
  status: "in_review" | "approved" | "rejected";
  reviewedBy: string;
  reviewedAt: string;
  note: string;
};

export type PayoutState = {
  payoutId: string;
  driverId: string;
  status: "scheduled" | "pending" | "paid";
  paidAt?: string;
  paidBy?: string;
  operationKey?: string;
};

export type WalletVoucher = {
  id: string;
  riderId: string;
  amountOre: number;
  createdAt: string;
  actorId: string;
  reason: string;
  status: "posted" | "void";
};

export type ReconciliationRun = {
  id: string;
  at: string;
  actorId: string;
  capturedOre: number;
  refundedOre: number;
  payoutOre: number;
  walletOre: number;
  failedCount: number;
  differenceOre: number;
  note: string;
};

export type FinanceBook = {
  draftRev: number;
  policies: Record<string, Record<PaymentMethod, boolean>>;
  banks: Record<string, BankReview>;
  payouts: Record<string, PayoutState>;
  vouchers: WalletVoucher[];
  reconciliations: ReconciliationRun[];
};

export function paymentPolicyKey(context: PaymentPolicyContext): string {
  return `${context.zoneId}|${context.category}|${context.platform}`;
}

export function defaultMethodPolicy(): Record<PaymentMethod, boolean> {
  return Object.fromEntries(PAYMENT_METHODS.map((method) => [method, true])) as Record<PaymentMethod, boolean>;
}

export function defaultFinanceBook(): FinanceBook {
  return {
    draftRev: 1,
    policies: {},
    banks: {},
    payouts: {},
    vouchers: [],
    reconciliations: [],
  };
}

export function normalizeFinanceBook(value: unknown): FinanceBook {
  if (!value || typeof value !== "object") return defaultFinanceBook();
  const raw = value as Partial<FinanceBook>;
  return {
    draftRev: typeof raw.draftRev === "number" && raw.draftRev > 0 ? raw.draftRev : 1,
    policies: raw.policies && typeof raw.policies === "object" ? structuredClone(raw.policies) : {},
    banks: raw.banks && typeof raw.banks === "object" ? structuredClone(raw.banks) : {},
    payouts: raw.payouts && typeof raw.payouts === "object" ? structuredClone(raw.payouts) : {},
    vouchers: Array.isArray(raw.vouchers) ? raw.vouchers.map((item) => ({ ...item })) : [],
    reconciliations: Array.isArray(raw.reconciliations) ? raw.reconciliations.map((item) => ({ ...item })) : [],
  };
}

export function paymentPolicy(book: FinanceBook, context: PaymentPolicyContext): Record<PaymentMethod, boolean> {
  const saved = (book.policies[paymentPolicyKey(context)] ?? {}) as Partial<Record<string, boolean>>;
  // Only today's methods: an older save's swish, klarna or paypal (Q7 FINAL) is dropped.
  return Object.fromEntries(PAYMENT_METHODS.map((method) => [method, typeof saved[method] === "boolean" ? saved[method] : true])) as Record<PaymentMethod, boolean>;
}

export function savePaymentPolicy(
  book: FinanceBook,
  context: PaymentPolicyContext,
  enabled: Record<PaymentMethod, boolean>,
): FinanceBook {
  return {
    ...book,
    draftRev: book.draftRev + 1,
    policies: {
      ...book.policies,
      [paymentPolicyKey(context)]: { ...enabled },
    },
  };
}

export function defaultBankReview(driverId: string): BankReview {
  return {
    driverId,
    clearing: "5000",
    account: "1234567",
    iban: "SE4550000000058398257466",
    bic: "ESSESESS",
    status: "in_review",
    reviewedBy: "",
    reviewedAt: "",
    note: "",
  };
}

export function bankReview(book: FinanceBook, driverId: string): BankReview {
  return book.banks[driverId] ?? defaultBankReview(driverId);
}

export function bankValidation(review: BankReview): string | null {
  if (!clearingBank(review.clearing)) return "Clearing number does not match a supported bank.";
  if (!accountOk(review.account)) return "Account must be 6 to 10 digits.";
  if (!ibanOk(review.iban)) return "IBAN failed the mod 97 check.";
  if (!bicOk(review.bic)) return "BIC must be 8 or 11 characters.";
  return null;
}

export function reviewBank(
  book: FinanceBook,
  review: BankReview,
  status: "approved" | "rejected",
  actorId: string,
  note: string,
  nowIso: string,
): { book: FinanceBook; error?: string } {
  const validation = bankValidation(review);
  if (status === "approved" && validation) return { book, error: validation };
  if (!note.trim()) return { book, error: "A bank review note is required." };
  const next: BankReview = {
    ...review,
    status,
    reviewedBy: actorId,
    reviewedAt: nowIso,
    note: note.trim(),
  };
  return {
    book: {
      ...book,
      draftRev: book.draftRev + 1,
      banks: { ...book.banks, [review.driverId]: next },
    },
  };
}

export function payoutState(book: FinanceBook, input: { id: string; driverId?: string | null; status: string }): PayoutState {
  const driverId = input.driverId ?? "";
  return book.payouts[input.id] ?? {
    payoutId: input.id,
    driverId,
    status: input.status === "paid" ? "paid" : input.status === "pending" ? "pending" : "scheduled",
  };
}

export function markPayoutPaid(
  book: FinanceBook,
  payout: { id: string; driverId?: string | null; status: string },
  actorId: string,
  operationKey: string,
  nowIso: string,
): { book: FinanceBook; error?: string; replay?: boolean } {
  const current = payoutState(book, payout);
  const bank = bankReview(book, current.driverId);
  if (bank.status !== "approved") return { book, error: "Bank details are still in review." };
  if (current.status === "paid") {
    if (current.operationKey === operationKey) return { book, replay: true };
    return { book, error: "Already paid." };
  }
  const next: PayoutState = {
    ...current,
    status: "paid",
    paidAt: nowIso,
    paidBy: actorId,
    operationKey,
  };
  return {
    book: {
      ...book,
      draftRev: book.draftRev + 1,
      payouts: { ...book.payouts, [payout.id]: next },
    },
  };
}

export function issueWalletVoucher(
  book: FinanceBook,
  riderId: string,
  amountOre: number,
  actorId: string,
  reason: string,
  nowIso: string,
): { book: FinanceBook; error?: string } {
  if (!riderId.trim()) return { book, error: "Rider id is required." };
  if (!(WALLET_TOP_UPS_ORE as readonly number[]).includes(amountOre)) {
    return { book, error: "Wallet voucher must be 100, 200 or 500 kr." };
  }
  if (!reason.trim()) return { book, error: "A voucher reason is required." };
  const voucher: WalletVoucher = {
    id: `WV-${book.vouchers.length + 1}`,
    riderId: riderId.trim(),
    amountOre,
    createdAt: nowIso,
    actorId,
    reason: reason.trim(),
    status: "posted",
  };
  return {
    book: {
      ...book,
      draftRev: book.draftRev + 1,
      vouchers: [voucher, ...book.vouchers],
    },
  };
}

export function voidWalletVoucher(
  book: FinanceBook,
  voucherId: string,
  actorId: string,
  reason: string,
): { book: FinanceBook; error?: string } {
  const voucher = book.vouchers.find((item) => item.id === voucherId);
  if (!voucher) return { book, error: "Voucher was not found." };
  if (voucher.status === "void") return { book, error: "Voucher is already void." };
  if (!reason.trim()) return { book, error: "A void reason is required." };
  return {
    book: {
      ...book,
      draftRev: book.draftRev + 1,
      vouchers: book.vouchers.map((item) =>
        item.id === voucherId
          ? { ...item, status: "void" as const, reason: `${item.reason} · voided by ${actorId}: ${reason.trim()}` }
          : item,
      ),
    },
  };
}

export type ReconciliationInput = {
  capturedOre: number;
  refundedOre: number;
  payoutOre: number;
  walletOre: number;
  failedCount: number;
};

export function runReconciliation(
  book: FinanceBook,
  totals: ReconciliationInput,
  actorId: string,
  note: string,
  nowIso: string,
): { book: FinanceBook; run: ReconciliationRun } {
  const differenceOre = totals.capturedOre - totals.refundedOre - totals.payoutOre;
  const run: ReconciliationRun = {
    id: `REC-${book.reconciliations.length + 1}`,
    at: nowIso,
    actorId,
    ...totals,
    differenceOre,
    note: note.trim() || "Manual reconciliation",
  };
  return {
    book: {
      ...book,
      draftRev: book.draftRev + 1,
      reconciliations: [run, ...book.reconciliations].slice(0, 30),
    },
    run,
  };
}
