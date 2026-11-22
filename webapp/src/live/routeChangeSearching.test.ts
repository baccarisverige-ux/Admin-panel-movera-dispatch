import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { sv } from "../i18n/sv.ts";
import { fr } from "../i18n/fr.ts";
import { tripFacts } from "./liveAdminApi.ts";
import { searchingChangeLines } from "./routeChangeSearching.ts";
import type { Trip } from "./types.ts";

/**
 * v0.18.143 (owner 2026-11-20 "must rider can change !!!!", contract.json#onTrip.routeChange.whileSearching): the
 * Live view's route-change card shows a change the rider made while the trip was searched (reason rider_changed_route)
 * with the event text (texts.adminEvent) and the new pickup.
 */
const money = (amountMinor: number) => ({ amountMinor, currency: "SEK" });
const change = {
  changeId: "rtc_1", routeQuoteId: "rtq_1", status: "accepted", answeredBy: "system", reason: "rider_changed_route",
  pickup: { address: "Klockarvägen 37", lat: 59.6, lng: 17.9 }, dropoff: { address: "T-Centralen", lat: 59.33, lng: 18.06 }, stops: [],
  total: money(28000), difference: money(-32000), askedAt: "2026-11-20T10:00:00Z", answerBy: "2026-11-20T10:00:00Z",
};
const trip = (routeChange: unknown) => ({
  tripId: "trp_ws", riderId: "rdr", driverId: null, zoneId: "Z001", status: "searching", kind: "live", categoryId: "economy", paymentMethod: "cash",
  pickup: change.pickup, dropoff: change.dropoff, stops: [], fare: money(28000), createdAt: "2026-11-20T09:59:00Z", updatedAt: "2026-11-20T10:00:00Z", version: 5, routeChange,
}) as unknown as Trip;

test("a change made while searching keeps its new pickup and reason in the trip facts", () => {
  const facts = tripFacts(trip(change));
  assert.equal(facts.routeChange?.reason, "rider_changed_route");
  assert.equal(facts.routeChange?.pickup?.address, "Klockarvägen 37");
  assert.deepEqual(searchingChangeLines(facts.routeChange!), { title: "Rider changed the route while searching", pickup: "Klockarvägen 37" });
});

test("a change asked of the driver has no searching lines (the card stays as before)", () => {
  const facts = tripFacts(trip({ ...change, reason: undefined, pickup: undefined, status: "pending", answeredBy: undefined }));
  assert.equal(searchingChangeLines(facts.routeChange!), null);
});

test("the event text is the contract's (sv, fr) and the Live card uses it", () => {
  // contract v0.18.143 onTrip.routeChange.whileSearching.texts.adminEvent (the copy lands after the contract merge, Rule 43(4)).
  const texts = { sv: "Resenären ändrade resan under sökningen", fr: "Le passager a modifié l’itinéraire pendant la recherche" };
  assert.equal((sv as Record<string, string>)["Rider changed the route while searching"], texts.sv);
  assert.equal((fr as Record<string, string>)["Rider changed the route while searching"], texts.fr);
  assert.ok((sv as Record<string, string>)["New pickup"]);
  const card = readFileSync(new URL("./LiveTripTools.tsx", import.meta.url), "utf8");
  assert.match(card, /searchingChangeLines\(change\)/);
});
