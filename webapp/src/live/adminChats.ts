import type { Page } from "./types.ts";
import { tr } from "../i18n/index.ts";
import { chatTripLabel } from "./tripChat.ts";

/**
 * v0.18.56 §78 (G9 part 2, G9-2.16 / AUDIT A15 N16; contract.json#chat.adminChats): the live chat list reads
 * GET /admin/chats (support.reply + the admin's zones; zoneId / zoneIds / country, cursor, limit): open trips with at least
 * one message, newest message first. A row has counts, the last time, who wrote last and first names — never a message
 * text and never a phone number. Replaces reading /admin/trips?limit=100 and filtering in the browser.
 */
export type ChatFrom = "rider" | "driver" | "support";
export type AdminChatRow = {
  tripId: string;
  zoneId: string;
  status: string;
  riderFirstName?: string | null;
  driverFirstName?: string | null;
  messageCount: number;
  lastMessageAt: string;
  lastFrom: ChatFrom;
};
export type AdminChatPage = Page<AdminChatRow>;

/** One page of the chat list. */
export const ADMIN_CHATS_LIMIT = 50;

export function adminChatsPath(params: readonly (readonly [string, string])[], cursor: string | null, limit = ADMIN_CHATS_LIMIT): string {
  const query = new URLSearchParams([...params.map(([k, v]) => [k, v] as [string, string]), ["limit", String(limit)], ...(cursor ? [["cursor", cursor] as [string, string]] : [])]);
  return `/admin/chats?${query.toString()}`;
}

/** Only the fields the contract allows: anything else the server might add (a text, a phone) is dropped. */
export function chatRowOf(raw: AdminChatRow): AdminChatRow {
  return {
    tripId: raw.tripId,
    zoneId: raw.zoneId,
    status: raw.status,
    riderFirstName: raw.riderFirstName ?? null,
    driverFirstName: raw.driverFirstName ?? null,
    messageCount: raw.messageCount,
    lastMessageAt: raw.lastMessageAt,
    lastFrom: raw.lastFrom,
  };
}

/** Reads one page (newest message first, as the server sends it). */
export async function readAdminChats(read: (path: string) => Promise<AdminChatPage>, params: readonly (readonly [string, string])[], cursor: string | null): Promise<AdminChatPage> {
  const answer = await read(adminChatsPath(params, cursor));
  return { items: answer.items.map(chatRowOf), nextCursor: answer.nextCursor };
}

/** Pages joined in order, a trip once (a later page never repeats a trip shown higher). */
export function joinChatPages(pages: readonly AdminChatPage[]): AdminChatRow[] {
  const seen = new Set<string>();
  return pages.flatMap((page) => page.items).filter((row) => (seen.has(row.tripId) ? false : (seen.add(row.tripId), true)));
}

export function chatRowLabel(row: AdminChatRow): { title: string; ref: string } {
  return chatTripLabel({ tripId: row.tripId, rider: { firstName: row.riderFirstName ?? undefined }, driver: { firstName: row.driverFirstName ?? undefined } });
}

export function lastFromText(row: AdminChatRow): string {
  const who = row.lastFrom === "support" ? tr("Support") : row.lastFrom === "rider" ? row.riderFirstName?.trim() || tr("Rider") : row.driverFirstName?.trim() || tr("Driver");
  return tr("Last: {0}", [who]);
}

export function messageCountText(count: number): string {
  return count === 1 ? tr("1 message") : tr("{0} messages", [count]);
}

/* ---------------------------------------------------------------- admin Message (G9-2.12) */

export type PersonKind = "driver" | "rider";
export const PERSON_MESSAGE_MAX = 2000;

/** POST /admin/drivers/{driverId}/message | /admin/riders/{riderId}/message (support.reply + the person's zone) → 201 SupportTicket. */
export function personMessagePath(kind: PersonKind, id: string): string {
  return `/admin/${kind === "driver" ? "drivers" : "riders"}/${encodeURIComponent(id)}/message`;
}

/** Why the text cannot be sent yet, or null. */
export function personMessageProblem(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return tr("Write a message.");
  if (trimmed.length > PERSON_MESSAGE_MAX) return tr("At most {0} characters.", [PERSON_MESSAGE_MAX]);
  return null;
}

export async function sendPersonMessage<T>(post: (path: string, body: unknown) => Promise<T>, kind: PersonKind, id: string, text: string): Promise<T> {
  const problem = personMessageProblem(text);
  if (problem) throw new Error(problem);
  return post(personMessagePath(kind, id), { text: text.trim() });
}
