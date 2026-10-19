import type { TripStatus } from "./domain/contract.ts";
import { readFileSync } from "node:fs";
import { can } from "./auth/permissions.ts";
import { runCommand, emptyDb } from "./commands/run.ts";
import { publishContent, editContent, emptyContent, rollbackContent } from "./content/book.ts";
import { hideReview, averageStars, BONUSES } from "./growth/book.ts";
import { testSend } from "./messages/book.ts";
import { canStartCheckout, existingAuthContinues, type PaymentMethod } from "./payments/book.ts";
import { quoteRide } from "./pricing/quote.ts";
import { calculateFare, formatSek } from "./data/catalog.ts";
import { csvCell } from "./reports/csv.ts";
import { needsDriverSoon } from "./reservations/book.ts";
import { findRiders, RIDERS } from "./riders/book.ts";
import { publicIncident } from "./safety/book.ts";
import { deliveredToRider, reply, addNote, type Ticket } from "./support/book.ts";
import { cancelTrip } from "./trips/rules.ts";
import { publishZones, emptyBook } from "./zones/releases.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

const trip = { id: "T1", status: "completed" as TripStatus, category: "economy" as const, fareOre: 1000, ruleVersion: "price-3", driverId: "D1" };
assert(cancelTrip(trip, "no").error, "A01 finished trip cannot be cancelled");
assert(cancelTrip({ ...trip, status: "searching" }, "rider asked").trip.status === "cancelled_by_admin", "A02 searching can be cancelled");

let db = emptyDb();
const pending = runCommand(db, { action: "admin.refund.decide", idempotencyKey: "a", expectedRev: 1, actorId: "nora", targetId: "RF", reason: "twice", amountOre: 25000 }, "2026-10-05T10:00:00Z");
db = pending.db;
const again = runCommand(db, { action: "admin.refund.decide", idempotencyKey: "a", expectedRev: 1, actorId: "nora", targetId: "RF", reason: "twice", amountOre: 25000 }, "2026-10-05T10:00:01Z");
assert(again.db.audits.length === 1, "A03 one refund effect on retry");

assert(quoteRide("economy", 10, 20).label === formatSek(calculateFare("economy", 10, 20)), "A04 quote matches");

const methods = { card: true, swish: true, klarna: true, apple: true, google: true, paypal: true, cash: false, wallet: true } as Record<PaymentMethod, boolean>;
assert(!canStartCheckout(methods, "cash"), "A05 new cash checkout refused");
assert(existingAuthContinues({ id: "C", method: "cash", state: "authorized" }, methods), "A06 existing auth continues");

assert(needsDriverSoon({ id: "B", pickupAt: "2026-10-05T11:00:00Z", driverId: null, policyVersion: "res-2", status: "booked" }, "2026-10-05T10:30:00Z"), "A07 reservation flagged");
assert(!("pin" in publicIncident({ id: "I", state: "queued", locationAt: "t", accuracyM: 5, ownerId: null })), "A08 no PIN");

let ticket: Ticket = { id: "S", ownerId: null, ownerUntil: null, messages: [] };
ticket = addNote(ticket, "maja", "private");
const sent = reply(ticket, "maja", "hello", "k", new Set());
assert(deliveredToRider(sent.ticket).length === 1, "A09 private note not delivered");

const clash = runCommand(db, { action: "admin.refund.decide", idempotencyKey: "b", expectedRev: 1, actorId: "astrid", targetId: "RF", reason: "twice", amountOre: 25000 }, "2026-10-05T10:02:00Z");
assert(clash.outcome.status === 409, "A10 conflict");

assert(testSend({ app: "rider", zone: "Norrmalm" }, [{ id: "R1", app: "rider", zone: "Norrmalm" }, { id: "D1", app: "driver", zone: "Norrmalm" }]).join() === "R1", "A11 audience");
assert(!can("support", "finance.read"), "A12 support cannot open payments");
assert(findRiders(RIDERS, "T1002").length === 1, "A13 rider search");
assert(csvCell("=1+1").startsWith("'"), "A14 csv guard");
const zones = emptyBook("nora");
assert(publishZones(zones, "nora").error, "A15 author cannot publish zones");

const content = publishContent(editContent(emptyContent("nora"), "Next", "nora"), "lena").book;
assert(rollbackContent(content).published.body !== "Next", "rollback restores content");
const hidden = hideReview({ id: "V", stars: 1, text: "kept", hidden: false, hideReason: null }, "abuse");
assert(hidden.review.text === "kept" && averageStars([hidden.review]) === 0, "hidden review");
assert(BONUSES.length === 3, "three bonuses");

const css = readFileSync(new URL("./styles/tokens.css", import.meta.url), "utf8");
assert(css.includes("focus-visible"), "keyboard focus is visible");
const login = readFileSync(new URL("./pages/LoginPage.tsx", import.meta.url), "utf8");
assert(login.includes("<label>"), "login fields have labels");

console.log("acceptance ok");
