import { tr } from "../i18n/index.ts";
import type { Page, SupportTicket } from "./types.ts";

/**
 * BQ-A04 (contract v0.18.112, contract.json#supportDesk.inboxOrder; owner item 109 "Yes, pages + oldest first (Rec.)",
 * Rules decisions/session-2026-11-06.md:1116): Admin › Support reads the tickets in the server's order (the oldest
 * waiting ticket first, then the others newest change first), 50 at a time with "Load more"; the panel never sorts.
 */
export const INBOX_PAGE = 50;

export type InboxFilters = { status: string; assigned: string; zoneQuery: string };

/** GET /admin/tickets for one page; `cursor` = the previous page's nextCursor, sent back unchanged. */
export function inboxPath(filters: InboxFilters, cursor: string | null): string {
  return `/admin/tickets?limit=${INBOX_PAGE}${filters.status ? `&status=${filters.status}` : ""}${filters.assigned ? `&assignedTo=${filters.assigned}` : ""}${filters.zoneQuery ? `&${filters.zoneQuery}` : ""}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
}

/** The loaded pages in the server's order; a ticket that moved between two reads shows once (its first place). */
export function joinInboxPages(pages: readonly Page<SupportTicket>[]): SupportTicket[] {
  const seen = new Set<string>();
  const out: SupportTicket[] = [];
  for (const page of pages) for (const item of page.items) if (!seen.has(item.ticketId)) { seen.add(item.ticketId); out.push(item); }
  return out;
}

/** "Waiting since <time>" while the person waits for an answer (SupportTicket.waitingSince); else null. */
export function waitingSinceText(ticket: SupportTicket, when: (iso: string) => string): string | null {
  return ticket.waitingSince ? tr("Waiting since {0}", [when(ticket.waitingSince)]) : null;
}
