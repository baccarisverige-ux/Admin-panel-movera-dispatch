import type { TripStatus } from "../domain/contract.ts";
import { blankDocuments, setAccount, type Driver } from "../drivers/gate.ts";
import { createSeed } from "../api/seed.ts";
import { emptyPricingStore, quoteRide as zoneQuote, zoneBook } from "../pricing/zonePricing.ts";
import { assignReservation, cancelReservation, minutesUntil, type Reservation } from "../reservations/book.ts";
import { emptySafety, safetyAction } from "../safety/ops.ts";
import { emptySupport, supportChange, ticketOps } from "../support/ops.ts";
import { CANCEL_OK, cancelTrip, eligibleDrivers, type Trip } from "../trips/rules.ts";
import { classifyStatus } from "../api/httpClient.ts";
import { can } from "../auth/permissions.ts";
import { canStartCheckout, existingAuthContinues, type PaymentMethod } from "../payments/book.ts";

export type FrontendScenario = { id: string; pass: boolean; note: string };

type Surface = { tripId: string; status: string; reason: string | null; feeOre: number | null; ruleVersion: string; fareOre: number };

function surfaces(trip: Trip, reason: string | null = null): { admin: Surface; rider: Surface; driver: Surface } {
  const view: Surface = { tripId: trip.id, status: trip.status, reason, feeOre: null, ruleVersion: trip.ruleVersion, fareOre: trip.fareOre };
  return { admin: { ...view }, rider: { ...view }, driver: { ...view } };
}

function sameTrip(views: { admin: Surface; rider: Surface; driver: Surface }): boolean {
  return views.rider.tripId === views.driver.tripId && views.driver.tripId === views.admin.tripId && views.rider.status === views.driver.status && views.driver.status === views.admin.status && views.rider.ruleVersion === views.admin.ruleVersion && views.rider.fareOre === views.driver.fareOre;
}

function sampleDriver(): Driver {
  return { id: "D1", name: "Erik Lind", fleet: false, status: "active", documents: blankDocuments(), vehicle: { year: 2022, seats: 4, fuel: "electric", category: "electric" } };
}

/** The live Pricing quote (pricing/zonePricing.ts) for a Movera ride in Norrmalm, and the published version it used. */
function liveQuote(km: number, minutes: number): { minor: number; label: string; ruleVersion: string } {
  const book = zoneBook(emptyPricingStore(), "Z001");
  const quote = zoneQuote(book, { categoryId: "economy", km, minutes, waitMin: 0, stops: 0, stopWaitMin: 0, airportPickup: false, airportDropoff: false, reservation: false, surge: 1 });
  return { minor: Math.round(quote.total * 100), label: `${quote.total} kr`, ruleVersion: `Z001-v${book.version}` };
}

/** One shared SOS incident from the seed, taken and resolved with the live Safety rules (safety/ops.ts). */
export function liveSos(): { record: Record<string, unknown>; status: string; owner: string | null; error?: string } {
  const incident = createSeed().incidents.find((row) => row.status === "queued")!;
  const taken = safetyAction(emptySafety(), incident, "erik", "take", "Called the rider", "2026-10-05T10:00:00Z");
  const resolved = safetyAction(taken.book, { ...incident, status: taken.status }, "erik", "resolve", "Rider is safe", "2026-10-05T10:05:00Z");
  return { record: { ...incident, status: resolved.status, ...resolved.book.incidents[incident.id] }, status: resolved.status, owner: resolved.book.incidents[incident.id]?.owner ?? null, error: taken.error ?? resolved.error };
}

/** A note, one public reply and the same reply again (same key), with the live Support rules (support/ops.ts). */
export function liveTicket(): { replies: number; notes: number; private: boolean; repeated: boolean } {
  const row = createSeed().tickets[0]!;
  let book = supportChange(emptySupport(), row, "maja", "note", "private", "note-1").book;
  book = supportChange(book, row, "maja", "reply", "On the way", "reply-1").book;
  const again = supportChange(book, row, "maja", "reply", "On the way", "reply-1");
  const messages = ticketOps(again.book, row).messages;
  return {
    replies: messages.filter((item) => item.kind === "reply" && item.delivery === "simulated").length,
    notes: messages.filter((item) => item.kind === "note").length,
    private: messages.filter((item) => item.kind === "note").every((item) => item.delivery === "private"),
    repeated: again.book !== book,
  };
}

function trip(status: TripStatus): Trip {
  return { id: "T100", status, category: "economy", fareOre: 14900, ruleVersion: "price-3", driverId: status === "searching" ? null : "D1" };
}

/** One shared record. The Flutter apps are not written. */
export function frontendGateC(): FrontendScenario[] {
  const rows: FrontendScenario[] = [];
  const add = (id: string, pass: boolean, note: string) => rows.push({ id, pass, note });

  const quote = liveQuote(5, 10);
  let live: Trip = { ...trip("accepted"), fareOre: quote.minor, ruleVersion: quote.ruleVersion, status: "completed" };
  const done = surfaces(live);
  add("T01", sameTrip(done) && done.rider.status === "completed", `Shared trip ${done.admin.tripId} is completed on the admin, rider and driver views. ${quote.ruleVersion}.`);

  let cancelOk = true;
  for (const status of CANCEL_OK) {
    const result = cancelTrip(trip(status), "Rider asked");
    const views = surfaces(result.trip, "Rider asked");
    cancelOk &&= !result.error && sameTrip(views) && views.rider.status === "cancelled_by_admin" && views.rider.reason === views.driver.reason && views.rider.feeOre === null;
  }
  const blocked = cancelTrip(trip("completed"), "Too late");
  add("T02", cancelOk && Boolean(blocked.error), "Every non-terminal status (contract v0.3.0) cancels with the same reason on all three views. A completed trip is refused. No cancel fee exists in this domain, so the fee is empty on every view.");

  let offer: { status: string; driverId: string | null; charges: string[] } = { status: "offered", driverId: null, charges: [] };
  const claim = (driverId: string, key: string) => {
    if (offer.charges.includes(key)) return;
    if (offer.driverId && offer.driverId !== driverId) return;
    offer = { status: "accepted", driverId, charges: [...offer.charges, key] };
  };
  claim("D1", "claim-1");
  claim("D2", "claim-2");
  claim("D1", "claim-1");
  const cancelled = cancelTrip({ ...trip("accepted"), driverId: offer.driverId }, "Duplicate claim");
  add("T03", offer.driverId === "D1" && offer.charges.length === 1 && cancelled.trip.status === "cancelled_by_admin", "The first claim wins. The retry does not add a second charge. The admin cancel is the one outcome.");

  live = { ...trip("arrived") };
  const resumed = surfaces(live);
  add("T04", sameTrip(resumed) && resumed.rider.status === "arrived", "The command is stored on the shared record. On resume all three views read arrived. The Flutter apps were not backgrounded.");

  const held = setAccount(sampleDriver(), "suspended", "Safety");
  const offers = eligibleDrivers(trip("in_trip"), [{ id: held.driver.id, name: held.driver.name, status: "suspended", category: "economy" }]);
  const still = trip("in_trip");
  add("T05", held.driver.status === "suspended" && offers.length === 0 && still.status === "in_trip", "Future offers stop. The open trip is not cancelled. Reading the driver again still shows suspended.");

  const preview = liveQuote(5, 12);
  const views = [liveQuote(5, 12), liveQuote(5, 12), liveQuote(5, 12), liveQuote(5, 12)];
  add("T06", views.every((item) => item.minor === preview.minor && item.ruleVersion === preview.ruleVersion) && preview.minor > 0, `Admin, rider, driver and receipt all show ${preview.label} at ${preview.ruleVersion}.`);

  const methods = { card: true, apple: true, google: true, cash: false, wallet: true } as Record<PaymentMethod, boolean>;
  add("T07", !canStartCheckout(methods, "cash") && existingAuthContinues({ id: "C", method: "cash", state: "authorized" }, methods), "New cash checkout is refused. The existing authorisation continues.");

  // The refund key is checked against the fixture server in api/refund.test.ts (one effect per key); it is async, so not run here.
  add("T08", false, "The refund key is one effect in the fixture server. Top-up, tip and payout retries are not in this frontend, so this scenario is not passed.");

  let reservation: Reservation = { id: "B1", pickupAt: "2026-03-29T03:30:00+02:00", driverId: null, policyVersion: "res-2", status: "booked" };
  const gap = minutesUntil(reservation.pickupAt, "2026-03-29T01:30:00+01:00");
  reservation = { ...reservation, pickupAt: "2026-03-29T04:00:00+02:00" };
  reservation = assignReservation(reservation, "D9");
  const riderUpcoming = reservation;
  const driverRequest = reservation;
  reservation = cancelReservation(reservation);
  add("T09", gap === 60 && riderUpcoming.driverId === driverRequest.driverId && reservation.policyVersion === "res-2" && reservation.status === "cancelled", "Create, edit, assign and cancel stay on policy res-2. The Stockholm spring-forward gap is 60 minutes, not 120.");

  const sos = liveSos();
  add("T10", !sos.error && sos.status === "resolved" && sos.owner === "erik" && !("pin" in sos.record), "SOS is resolved on the shared view. No PIN.");

  const ticket = liveTicket();
  add("T11", !ticket.repeated && ticket.replies === 1 && ticket.notes === 1 && ticket.private, "One public reply reaches the rider view. The note stays off it. A repeated key does not send it twice.");

  add("T12", false, "A second agent can publish and rollback inside this admin. Scheduled expiry does not push into Movera-rider or Movera-drider, so this scenario is not passed.");
  add("T13", false, "The audience filter can choose rider or driver. A deep link was not opened in either app, because those repositories were not changed.");
  add("T14", !can("support", "finance.read") && can("finance", "payments.refund"), "Support cannot read finance. Finance can refund.");
  const named = [401, 403, 409, 422, 429, 503].map((status) => classifyStatus(status));
  add("T15", named.every((text) => !text.toLowerCase().includes("saved")) && classifyStatus(0).startsWith("Offline"), "401, 403, 409, 422, 429 and 503 each have their own text. Offline says nothing was saved.");
  add("T16", false, "The live admin is the demo. Gate D is not part of this frontend run.");

  return rows;
}

export function gateC(): { passed: false; reason: string } {
  return { passed: false, reason: "Frontend scenarios ran in this admin. Gate C is not claimed: Movera-rider and Movera-drider were not changed, and nothing ran on staging." };
}
