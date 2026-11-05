import assert from "node:assert/strict";
import test from "node:test";
import contract from "../../../contracts/contract.json" with { type: "json" };
import { AIRPORT_QUEUES_PATH, airportCards, parseQueueArea, parseQueueFeed, queueAreaBody, queueAreaPath, QUEUE_DEFAULTS } from "./airportQueue.ts";

/** Fix job 9 (contract v0.18.36 §60): the admin's queue area and the Dashboard airport card come from the server. */

test("contract v0.18.36 carries the airport queue with the owner's defaults (decline keeps the place)", () => {
  assert.equal(contract.version, "0.18.39");
  const aq = (contract as unknown as { airportQueue: { defaults: Record<string, unknown> } }).airportQueue;
  assert.deepEqual(aq.defaults, { on: false, leaveGraceMin: 3, offerSeconds: 30, maxQueueOffers: 3, keepPlaceAfterDecline: true });
  assert.deepEqual(QUEUE_DEFAULTS, aq.defaults);
});

test("paths: GET|PUT /admin/zones/{zoneId}/queue-area and GET /admin/airport-queues", () => {
  assert.equal(queueAreaPath("BMA"), "/admin/zones/BMA/queue-area");
  assert.equal(queueAreaPath("a b"), "/admin/zones/a%20b/queue-area");
  assert.equal(AIRPORT_QUEUES_PATH, "/admin/airport-queues");
});

test("the saved body is the whole area, numbers kept inside the contract ranges", () => {
  const ring: [number, number][] = [[59.3, 17.9], [59.3, 18], [59.4, 18]];
  assert.deepEqual(queueAreaBody({ polygon: ring, on: true, leaveGraceMin: 99, offerSeconds: 1, maxQueueOffers: 4, keepPlaceAfterDecline: true }),
    { polygon: ring, on: true, leaveGraceMin: 30, offerSeconds: 5, maxQueueOffers: 4, keepPlaceAfterDecline: true });
  assert.throws(() => queueAreaBody({ ...QUEUE_DEFAULTS, polygon: ring.slice(0, 2) }), /3 points/);
});

test("a server area reads back; a wrong shape is no answer", () => {
  const area = parseQueueArea({ areaId: "AQ-BMA", airportZoneId: "BMA", polygon: [[1, 2], [3, 4], [5, 6]], on: true, leaveGraceMin: 3, offerSeconds: 30, maxQueueOffers: 3, keepPlaceAfterDecline: true, updatedAt: "2026-11-05T10:00:00Z" });
  assert.equal(area?.airportZoneId, "BMA");
  assert.equal(parseQueueArea({ areaId: "x" }), null);
});

test("Dashboard airport card: the server feed (waiting, longest wait, pickups last hour), never the demo numbers", () => {
  const feed = parseQueueFeed({ items: [{ areaId: "AQ-BMA", airportZoneId: "BMA", on: true, waiting: 4, longestWaitMin: 12, pickupsLastHour: 2 }, { areaId: "AQ-ARN", airportZoneId: "ARN", on: false, waiting: 0, longestWaitMin: 0, pickupsLastHour: 0 }] });
  assert.deepEqual(airportCards(feed, (id) => (id === "BMA" ? "Bromma" : id)), [{ zoneId: "BMA", name: "Bromma", waiting: 4, waitMin: 12, pickupsLastHour: 2 }]);
  assert.equal(parseQueueFeed({ nope: 1 }), null);
  assert.equal(airportCards(null, (id) => id), null);
});

test("the queue map opens on the drawn area, else on the airport outline", async () => {
  const { queueMapView } = await import("./airportQueue.ts");
  const area: [number, number][] = [[59.645, 17.91], [59.645, 17.93], [59.655, 17.93]];
  const airport: [number, number][] = [[59.62, 17.85], [59.62, 17.97], [59.68, 17.97], [59.68, 17.85]];
  assert.deepEqual(queueMapView(area, airport), area);
  assert.deepEqual(queueMapView([], airport), airport);
  assert.equal(queueMapView([], []), undefined);
});
