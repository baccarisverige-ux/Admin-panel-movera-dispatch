import assert from "node:assert/strict";
import test from "node:test";
import type { RadarZone } from "../dispatch/rules.ts";
import type { MoneySplit } from "../trips/file.ts";
import type { LiveDriver } from "./live.ts";
import type { RideRequest } from "./riders.ts";
import { driverChip, driversIn, radarBalance, ringBounds } from "./supplyDrill.ts";
import { tripMoney } from "./tripMoney.ts";

const square: [number, number][] = [[59.30, 18.00], [59.30, 18.10], [59.40, 18.10], [59.40, 18.00]];
const other: [number, number][] = [[59.50, 18.00], [59.50, 18.10], [59.60, 18.10], [59.60, 18.00]];
const zone = (id: string, zoneId: string, name: string, ring: [number, number][]): RadarZone => ({ id, country: "SE", zoneId, name, ring, createdAt: "2026-10-22T00:00:00Z" });
const driver = (id: string, name: string, state: LiveDriver["state"], lat: number, lng: number, zoneId = "Z001"): LiveDriver => ({ id, name, zoneId, zoneName: "Norrmalm", state, lat, lng, lastSeenMin: 0, vehicle: null, plate: null, tripId: null, route: null, progress: 0 });
const request = (tripId: string, lat: number, lng: number, status: RideRequest["status"] = "searching"): RideRequest => ({ tripId, riderId: null, rider: "R", zoneId: "Z001", zoneName: "Norrmalm", at: [lat, lng], category: "economy", categoryLabel: "Movera", waitingMin: 3, status, offeredTo: null });

const drivers = [
  driver("D3", "Cleo", "trip", 59.35, 18.05),
  driver("D1", "Ada", "free", 59.35, 18.05),
  driver("D2", "Bo", "pickup", 59.36, 18.06),
  driver("D4", "Dan", "stale", 59.37, 18.07),
  driver("D5", "Eve", "free", 59.55, 18.05),
  driver("D6", "Finn", "free", 59.35, 18.05, "Z002"),
];

test("a zone's radar zones count what is inside each one", () => {
  const rows = radarBalance("Z001", [zone("R1", "Z001", "Karlaplan", square), zone("R2", "Z001", "North", other), zone("R3", "Z002", "Elsewhere", square)], drivers, [request("T1", 59.35, 18.05), request("T2", 59.35, 18.05, "offered"), request("T3", 59.55, 18.05)]);
  assert.deepEqual(rows.map((row) => row.id), ["R2", "R1"], "only this zone's radar zones, the most short of drivers first");
  const karlaplan = rows.find((row) => row.id === "R1")!;
  // D6 is in another zone but inside the drawn outline: a radar zone counts by its outline.
  assert.deepEqual({ waiting: karlaplan.waiting, free: karlaplan.free, busy: karlaplan.busy, total: karlaplan.total }, { waiting: 1, free: 2, busy: 2, total: 5 });
  const north = rows.find((row) => row.id === "R2")!;
  assert.deepEqual({ waiting: north.waiting, free: north.free }, { waiting: 1, free: 1 });
});

test("drivers inside a radar zone or a zone, free first, with their status chip", () => {
  assert.deepEqual(driversIn({ ring: square }, drivers).map((item) => item.id), ["D1", "D6", "D2", "D3", "D4"]);
  assert.deepEqual(driversIn({ zoneId: "Z002" }, drivers).map((item) => item.id), ["D6"]);
  assert.deepEqual(["free", "pickup", "trip", "sos", "stale"].map((state) => driverChip(state as LiveDriver["state"])), ["free", "pickup", "trip", "trip", "off"]);
  assert.deepEqual(ringBounds(square), [18.0, 59.3, 18.1, 59.4]);
  assert.equal(ringBounds([]), null);
});

const split = (over: Partial<MoneySplit> = {}): MoneySplit => ({
  country: "SE", state: "estimate", price: 20_000, appFee: 0, ridePrice: 20_000, commissionPct: 20, commission: 4_000, promo: 0, tip: 0,
  refunded: 0, payChange: 0, vat: 0, vatRate: 0.06, fleetPct: 0, fleet: 0, riderPaid: 20_000, driverGets: 16_000, moveraKeeps: 4_000, driverBonus: 0, ...over,
});

test("the Money tab: rider pays, driver gets fare share + pickup pay + added money, Movera keeps the rest", () => {
  const plain = tripMoney(split(), 1_500);
  assert.deepEqual([plain.riderPays, plain.fareShare, plain.pickupPay, plain.driverGets, plain.moveraKeeps, plain.covers, plain.estimate], [20_000, 16_000, 1_500, 17_500, 2_500, false, true]);
  // moneySplit already adds tip and bonus to driverGets and takes the bonus off Movera.
  const bonus = tripMoney(split({ driverBonus: 5_000, driverGets: 21_000, moveraKeeps: -1_000, tip: 0 }), 1_500);
  assert.deepEqual([bonus.fareShare, bonus.addedMoney, bonus.driverGets, bonus.moveraKeeps, bonus.covers], [16_000, 5_000, 22_500, -2_500, true]);
  const tip = tripMoney(split({ tip: 2_000, riderPaid: 22_000, driverGets: 18_000 }), null);
  assert.deepEqual([tip.tip, tip.fareShare, tip.pickupPay, tip.driverGets, tip.moveraKeeps], [2_000, 16_000, 0, 16_000, 4_000], "tips are shown apart; unknown pickup pay counts as 0");
});
