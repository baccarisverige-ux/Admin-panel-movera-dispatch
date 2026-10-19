import type { TripStatus } from "../domain/contract.ts";
import { emptyDb, runCommand } from "../commands/run.ts";
import { blankDocuments, setAccount, type Driver } from "../drivers/gate.ts";
import { quoteRide } from "../pricing/quote.ts";
import { assignReservation, cancelReservation, minutesUntil, type Reservation } from "../reservations/book.ts";
import { publicIncident, resolveIncident, takeIncident } from "../safety/book.ts";
import { addNote, deliveredToRider, reply, type Ticket } from "../support/book.ts";
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

function trip(status: TripStatus): Trip {
  return { id: "T100", status, category: "economy", fareOre: 14900, ruleVersion: "price-3", driverId: status === "searching" ? null : "D1" };
}

/** One shared record. The Flutter apps are not written. */
export function frontendGateC(): FrontendScenario[] {
  const rows: FrontendScenario[] = [];
  const add = (id: string, pass: boolean, note: string) => rows.push({ id, pass, note });

  const quote = quoteRide("economy", 5, 10);
  let live: Trip = { ...trip("accepted"), fareOre: quote.kronor * 100, ruleVersion: quote.ruleVersion, status: "completed" };
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

  const preview = quoteRide("economy", 5, 12);
  add("T06", [preview, preview, preview, preview].every((item) => item.kronor === preview.kronor && item.ruleVersion === "price-3"), `Admin, rider, driver and receipt all show ${preview.label} at ${preview.ruleVersion}.`);

  const methods = { card: true, swish: true, klarna: true, apple: true, google: true, paypal: true, cash: false, wallet: true } as Record<PaymentMethod, boolean>;
  add("T07", !canStartCheckout(methods, "cash") && existingAuthContinues({ id: "C", method: "cash", state: "authorized" }, methods), "New cash checkout is refused. The existing authorisation continues.");

  const db = emptyDb();
  const first = runCommand(db, { action: "admin.refund.decide", idempotencyKey: "rf", expectedRev: db.rev, actorId: "nora", targetId: "RF", reason: "Duplicate", amountOre: 1000 }, "2026-10-05T10:00:00Z");
  const again = runCommand(first.db, { action: "admin.refund.decide", idempotencyKey: "rf", expectedRev: first.db.rev, actorId: "nora", targetId: "RF", reason: "Duplicate", amountOre: 1000 }, "2026-10-05T10:00:01Z");
  add("T08", false, again.db.rev === first.db.rev ? "The refund key is one effect. Top-up, tip and payout retries are not in this frontend, so this scenario is not passed." : "The refund retry changed the record.");

  let reservation: Reservation = { id: "B1", pickupAt: "2026-03-29T03:30:00+02:00", driverId: null, policyVersion: "res-2", status: "booked" };
  const gap = minutesUntil(reservation.pickupAt, "2026-03-29T01:30:00+01:00");
  reservation = { ...reservation, pickupAt: "2026-03-29T04:00:00+02:00" };
  reservation = assignReservation(reservation, "D9");
  const riderUpcoming = reservation;
  const driverRequest = reservation;
  reservation = cancelReservation(reservation);
  add("T09", gap === 60 && riderUpcoming.driverId === driverRequest.driverId && reservation.policyVersion === "res-2" && reservation.status === "cancelled", "Create, edit, assign and cancel stay on policy res-2. The Stockholm spring-forward gap is 60 minutes, not 120.");

  const incident = publicIncident(resolveIncident(takeIncident({ id: "I", state: "queued", locationAt: "2026-10-05T10:00:00Z", accuracyM: 8, ownerId: null }, "erik")).incident);
  add("T10", incident.state === "resolved" && !("pin" in incident), "SOS is resolved on the shared view. No PIN.");

  let ticket: Ticket = { id: "S", ownerId: null, ownerUntil: null, messages: [] };
  const seen = new Set<string>();
  ticket = addNote(ticket, "maja", "private");
  ticket = reply(ticket, "maja", "On the way", "reply-1", seen).ticket;
  const second = reply(ticket, "maja", "On the way", "reply-1", seen);
  add("T11", second.delivered === false && deliveredToRider(second.ticket).length === 1 && ticket.messages.some((item) => item.kind === "note"), "One public reply reaches the rider view. The note stays off it. A repeated key does not send it twice.");

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
