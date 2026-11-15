import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { registerDictionary, setLanguage } from "../i18n/core.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import type { Page, SupportTicket } from "./types.ts";
import { INBOX_PAGE, inboxPath, joinInboxPages, waitingSinceText } from "./supportInbox.ts";

/**
 * BQ-A04 (contract v0.18.112, contract.json#supportDesk.inboxOrder; owner item 109 "Yes, pages + oldest first (Rec.)",
 * Rules decisions/session-2026-11-06.md:1116): Admin › Support shows the tickets in the server's order (the oldest
 * waiting first), 50 at a time with "Load more", and "Waiting since <time>" on a waiting ticket. Fails before: the
 * page read one page of 100 (`/admin/tickets?limit=100`), never followed nextCursor, and supportInbox.ts did not exist.
 */
registerDictionary("sv", sv);
registerDictionary("fr", fr);

const ticket = (id: string, extra: Partial<SupportTicket> = {}): SupportTicket => ({ ticketId: id, openedBy: "rider", category: "help", subject: id, status: "open", createdAt: "2026-11-15T09:00:00Z", updatedAt: "2026-11-15T09:00:00Z", ...extra });

test("A04: the inbox reads 50 at a time with the filters; the next page sends the cursor back; no sort key", () => {
  assert.equal(INBOX_PAGE, 50);
  const first = inboxPath({ status: "open", assigned: "me", zoneQuery: "country=SE" }, null);
  assert.equal(first, "/admin/tickets?limit=50&status=open&assignedTo=me&country=SE");
  assert.equal(inboxPath({ status: "", assigned: "", zoneQuery: "" }, null), "/admin/tickets?limit=50");
  const next = inboxPath({ status: "", assigned: "none", zoneQuery: "" }, "dzF8MjAyNi0xMS0xNVQwOTowMDowMC4wMDBafHRrdF8x");
  assert.equal(next, "/admin/tickets?limit=50&assignedTo=none&cursor=dzF8MjAyNi0xMS0xNVQwOTowMDowMC4wMDBafHRrdF8x");
  assert.ok(!/sort|order/.test(first + next), "the order is the server's (contract inboxOrder: no sort key)");
});

test("A04: pages join in the server's order (oldest waiting first), never re-sorted; a ticket on two pages shows once", () => {
  const pages: Page<SupportTicket>[] = [
    { items: [ticket("b", { waitingSince: "2026-11-15T09:10:00Z", updatedAt: "2026-11-15T09:55:00Z" }), ticket("c", { waitingSince: "2026-11-15T09:20:00Z" })], nextCursor: "x" },
    { items: [ticket("c", { waitingSince: "2026-11-15T09:20:00Z" }), ticket("e", { status: "pending", updatedAt: "2026-11-15T09:45:00Z" }), ticket("d", { status: "resolved", updatedAt: "2026-11-15T09:35:00Z" })], nextCursor: null },
  ];
  assert.deepEqual(joinInboxPages(pages).map((t) => t.ticketId), ["b", "c", "e", "d"]);
  assert.deepEqual(joinInboxPages([]), []);
});

test("A04: 'Waiting since <time>' in en, sv and fr; nothing on a ticket that does not wait", () => {
  const at = (iso: string) => `T(${iso})`;
  const expected = { en: "Waiting since T(2026-11-15T09:10:00Z)", sv: "Väntar sedan T(2026-11-15T09:10:00Z)", fr: "En attente depuis T(2026-11-15T09:10:00Z)" };
  for (const lang of ["en", "sv", "fr"] as const) {
    setLanguage(lang);
    try {
      assert.equal(waitingSinceText(ticket("b", { waitingSince: "2026-11-15T09:10:00Z" }), at), expected[lang]);
      assert.equal(waitingSinceText(ticket("e", { status: "pending" }), at), null);
    } finally {
      setLanguage("en");
    }
  }
});

test("A04: LiveSupport pages with useInfiniteQuery + Load more, shows the waiting line, keeps the server's order", () => {
  const page = readFileSync(new URL("./LiveSupport.tsx", import.meta.url), "utf8");
  assert.ok(!page.includes("/admin/tickets?limit=100"), "the one page of 100 is gone");
  assert.match(page, /useInfiniteQuery\(/);
  assert.match(page, /inboxPath\(/);
  assert.match(page, /getNextPageParam: \(last\) => last\.nextCursor/);
  assert.match(page, /joinInboxPages\(/);
  assert.match(page, /<LoadMore hasMore=\{Boolean\(list\.hasNextPage\)\}/);
  assert.match(page, /waitingSinceText\(item, when\)/);
  assert.ok(!/items\.sort\(|\.sort\(\(a, b\)/.test(page), "no sort in the panel");
  // Every reload after a command still refreshes the list (prefix of the query key).
  assert.match(page, /queryKey: \["live", "tickets", status, assigned, zoneQuery\]/);
  assert.match(page, /invalidateQueries\(\{ queryKey: \["live", "tickets"\] \}\)/);
});
