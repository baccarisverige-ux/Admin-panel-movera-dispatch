import {
  bankReview,
  defaultFinanceBook,
  issueWalletVoucher,
  markPayoutPaid,
  paymentPolicy,
  reviewBank,
  runReconciliation,
  savePaymentPolicy,
  voidWalletVoucher,
} from "./finance.ts";
import { PAYMENT_METHODS, type PaymentMethod } from "./book.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

let book = defaultFinanceBook();
const context = { zoneId: "Z001", category: "economy", platform: "ios" as const };
const defaults = paymentPolicy(book, context);
assert(PAYMENT_METHODS.every((method) => defaults[method]), "all payment methods default on");

const cashOff = { ...defaults, cash: false } as Record<PaymentMethod, boolean>;
book = savePaymentPolicy(book, context, cashOff);
assert(paymentPolicy(book, context).cash === false, "payment policy persists per context");
assert(book.draftRev === 2, "policy save advances revision");

const bank = bankReview(book, "D0001");
const denied = markPayoutPaid(book, { id: "PO1", driverId: "D0001", status: "scheduled" }, "astrid", "po1-pay", "2026-10-06T10:00:00.000Z");
assert(denied.error?.includes("in review"), "payout cannot be paid before bank approval");

const approved = reviewBank(book, bank, "approved", "astrid", "Verified account holder", "2026-10-06T10:01:00.000Z");
assert(!approved.error, "valid bank can be approved");
book = approved.book;
assert(bankReview(book, "D0001").status === "approved", "bank approval persists");

const paid = markPayoutPaid(book, { id: "PO1", driverId: "D0001", status: "scheduled" }, "astrid", "po1-pay", "2026-10-06T10:02:00.000Z");
assert(!paid.error, "approved bank can be paid");
book = paid.book;
const replay = markPayoutPaid(book, { id: "PO1", driverId: "D0001", status: "scheduled" }, "astrid", "po1-pay", "2026-10-06T10:03:00.000Z");
assert(replay.replay === true, "same payout operation key replays instead of double paying");

const voucher = issueWalletVoucher(book, "R0001", 20_000, "astrid", "Service recovery", "2026-10-06T10:04:00.000Z");
assert(!voucher.error, "allowed wallet voucher posts");
book = voucher.book;
assert(book.vouchers[0]?.amountOre === 20_000, "voucher amount persists");
assert(issueWalletVoucher(book, "R0001", 30_000, "astrid", "Bad amount", "2026-10-06T10:05:00.000Z").error?.includes("100, 200 or 500"), "voucher amount is constrained");

const voided = voidWalletVoucher(book, book.vouchers[0]!.id, "astrid", "Duplicate goodwill");
assert(!voided.error, "posted voucher can be voided");
book = voided.book;
assert(book.vouchers[0]?.status === "void", "voucher void is persisted instead of deleting history");

const reconciliation = runReconciliation(book, {
  capturedOre: 1_000_000,
  refundedOre: 100_000,
  payoutOre: 700_000,
  walletOre: 50_000,
  failedCount: 3,
}, "astrid", "Daily close", "2026-10-06T10:06:00.000Z");
assert(reconciliation.run.differenceOre === 200_000, "reconciliation difference is deterministic");
assert(reconciliation.book.reconciliations[0]?.note === "Daily close", "reconciliation run is retained");

// Q7 FINAL: an older saved policy with Swish, Klarna or PayPal opens with today's methods only.
const legacy = { ...defaultFinanceBook(), policies: { "Z001|economy|ios": { card: true, swish: true, klarna: false, apple: false, google: true, paypal: true, cash: true, wallet: true } } } as unknown as Parameters<typeof paymentPolicy>[0];
const legacyPolicy = paymentPolicy(legacy, { zoneId: "Z001", category: "economy", platform: "ios" });
assert(JSON.stringify(Object.keys(legacyPolicy)) === JSON.stringify(["card", "apple", "google", "cash", "wallet"]) && legacyPolicy.apple === false, "no Swish, Klarna or PayPal in a policy; saved values kept");

console.log("finance ops ok");
