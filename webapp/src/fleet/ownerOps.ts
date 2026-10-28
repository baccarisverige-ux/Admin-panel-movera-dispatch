import { isLiveData } from "../live/realData.ts";
import type { DocStatus } from "../drivers/gate.ts";
import type { ThreadMessage } from "../drivers/ops.ts";

/** Documents a fleet owner provides. Some are shared with drivers (registration, tax, bank, terms). */
export const OWNER_DOCUMENTS = ["company_registration", "operator_license", "owner_id", "fleet_insurance", "tax_settings", "bank_statement", "terms"] as const;
export type OwnerDocId = (typeof OWNER_DOCUMENTS)[number];

export type OwnerDocument = { id: OwnerDocId; status: DocStatus; expiresAt: string; fileName: string; reviewerId: string; note: string };

export type OwnerOps = {
  ownerId: string;
  documents: Record<OwnerDocId, OwnerDocument>;
  note: string;
  accountReason: string;
  messages: ThreadMessage[];
  activity: string[];
};

export type OwnerOpsBook = { draftRev: number; owners: Record<string, OwnerOps> };
export type OwnerSeed = { id: string; name: string; status?: string; kind?: string };

const NO_EXPIRY = new Set<OwnerDocId>(["tax_settings", "bank_statement", "terms"]);

function isoDate(offsetDays: number): string {
  const base = new Date("2026-10-06T00:00:00.000Z");
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return base.toISOString().slice(0, 10);
}

export function emptyOwnerOpsBook(): OwnerOpsBook {
  return { draftRev: 1, owners: {} };
}

export function ownerOps(book: OwnerOpsBook, owner: OwnerSeed): OwnerOps {
  const stored = book.owners[owner.id];
  if (stored) return stored;
  // Live: no document is approved by "nora" and no message is made up; the server's documents are shown instead.
  const live = !isLiveData() && owner.status && owner.status !== "pending";
  const documents = Object.fromEntries(OWNER_DOCUMENTS.map((id, index) => [id, {
    id,
    status: live ? "approved" : "needed",
    expiresAt: NO_EXPIRY.has(id) ? "" : isoDate(150 + index * 40),
    fileName: `${id.replaceAll("_", "-")}.pdf`,
    reviewerId: live ? "nora" : "",
    note: "",
  } satisfies OwnerDocument])) as Record<OwnerDocId, OwnerDocument>;
  if (owner.kind === "expiring") documents.fleet_insurance = { ...documents.fleet_insurance, status: "expiring", expiresAt: isoDate(21) };
  if (owner.kind === "rejected") documents.operator_license = { ...documents.operator_license, status: "rejected", note: "Licence number does not match the company" };
  if (owner.status === "on_hold") documents.fleet_insurance = { ...documents.fleet_insurance, status: "expired", expiresAt: isoDate(-5) };
  return {
    ownerId: owner.id,
    documents,
    note: "",
    accountReason: owner.status === "on_hold" ? "Fleet insurance expired" : "",
    messages: live ? [{ from: "contact", text: "Hello, we are adding two new cars next month.", at: "2026-10-04T09:12:00.000Z", by: owner.id }] : [],
    activity: ["Fleet owner account created"],
  };
}

function save(book: OwnerOpsBook, next: OwnerOps): OwnerOpsBook {
  return { draftRev: book.draftRev + 1, owners: { ...book.owners, [next.ownerId]: next } };
}

export function reviewOwnerDocument(book: OwnerOpsBook, owner: OwnerSeed, id: OwnerDocId, status: DocStatus, actorId: string, note: string): OwnerOpsBook {
  const current = ownerOps(book, owner);
  return save(book, {
    ...current,
    documents: { ...current.documents, [id]: { ...current.documents[id], status, reviewerId: actorId, note: note.trim() } },
    activity: [`${id}: ${status} by ${actorId}`, ...current.activity].slice(0, 30),
  });
}

export function setOwnerDocumentExpiry(book: OwnerOpsBook, owner: OwnerSeed, id: OwnerDocId, expiresAt: string, actorId: string): OwnerOpsBook {
  const current = ownerOps(book, owner);
  return save(book, {
    ...current,
    documents: { ...current.documents, [id]: { ...current.documents[id], expiresAt } },
    activity: [`${id}: expiry ${expiresAt || "cleared"} by ${actorId}`, ...current.activity].slice(0, 30),
  });
}

export function setOwnerAccount(book: OwnerOpsBook, owner: OwnerSeed, status: string, reason: string, actorId: string): OwnerOpsBook {
  const current = ownerOps(book, owner);
  return save(book, { ...current, accountReason: reason.trim(), activity: [`Account ${status} by ${actorId}: ${reason.trim()}`, ...current.activity].slice(0, 30) });
}

export function setOwnerNote(book: OwnerOpsBook, owner: OwnerSeed, note: string, actorId: string): OwnerOpsBook {
  const current = ownerOps(book, owner);
  return save(book, { ...current, note: note.trim(), activity: [`Private note updated by ${actorId}`, ...current.activity].slice(0, 30) });
}

export function sendOwnerMessage(book: OwnerOpsBook, owner: OwnerSeed, text: string, actorId: string, at: string): OwnerOpsBook {
  const current = ownerOps(book, owner);
  return save(book, {
    ...current,
    messages: [...current.messages, { from: "admin" as const, text: text.trim(), at, by: actorId }].slice(-100),
    activity: [`Message sent by ${actorId}`, ...current.activity].slice(0, 30),
  });
}
