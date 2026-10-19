import {
  addRiderPromotion,
  advanceRiderPrivacy,
  creditRiderWallet,
  emptyRiderOpsBook,
  removeRiderPromotion,
  revokeRiderSessions,
  riderOps,
  setRiderAccountReason,
  setRiderNote,
} from "./ops.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

const rider = { id: "R0001", name: "Erik Rider", status: "active", tripId: "T0001", fareOre: 0 };

let book = emptyRiderOpsBook();
assert(riderOps(book, rider).sessions.filter((item) => item.active).length > 0, "default rider has active sessions");

const tooLarge = creditRiderWallet(book, rider, 60_000, "astrid", "Goodwill");
assert(tooLarge.error?.includes("500 kr"), "wallet credit ceiling is enforced");

const credited = creditRiderWallet(book, rider, 10_000, "astrid", "Goodwill");
assert(!credited.error, "valid wallet credit succeeds");
book = credited.book;
assert(riderOps(book, rider).walletOre === 10_000, "wallet balance is updated");
assert(riderOps(book, rider).wallet[0]?.amountOre === 10_000, "wallet ledger records amount");

book = revokeRiderSessions(book, rider, "lena");
assert(riderOps(book, rider).sessions.every((item) => !item.active), "all sessions are revoked");

book = advanceRiderPrivacy(book, rider, "lena");
assert(riderOps(book, rider).privacy === "processing", "privacy moves to processing");
book = advanceRiderPrivacy(book, rider, "lena");
assert(riderOps(book, rider).privacy === "done", "privacy reaches done");

book = setRiderNote(book, rider, "VIP airport rider", "maja");
assert(riderOps(book, rider).privateNote === "VIP airport rider", "private note persists");
// UI-13: a pasted 3000-character note is capped at 2000 characters.
assert(riderOps(setRiderNote(book, rider, "x".repeat(3000), "lena"), rider).privateNote.length === 2000, "private note is capped at 2000 characters");

const promo = addRiderPromotion(book, rider, "welcome20", "Welcome 20", "lena");
assert(!promo.error, "promotion can be added");
book = promo.book;
assert(riderOps(book, rider).promotions[0]?.code === "WELCOME20", "promotion code is normalized");
assert(addRiderPromotion(book, rider, "welcome20", "Again", "lena").error?.includes("already active"), "duplicate active promotion is rejected");
book = removeRiderPromotion(book, rider, "WELCOME20", "lena");
assert(riderOps(book, rider).promotions[0]?.status === "expired", "promotion removal is versioned instead of deleted");

book = setRiderAccountReason(book, rider, "blocked", "Fraud review", "lena");
assert(riderOps(book, rider).accountReason === "Fraud review", "account reason persists");
assert(book.draftRev > 1, "rider operations revision advances");

console.log("rider ops ok");
