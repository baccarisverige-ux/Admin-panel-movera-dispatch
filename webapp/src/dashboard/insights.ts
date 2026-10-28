import { market, zoneById, type MarketId } from "../markets/markets.ts";
import type { Totals } from "./earnings.ts";
import type { LiveDriver } from "./live.ts";
import type { RideRequest } from "./riders.ts";
import { isLiveData } from "../live/realData.ts";

/** Smaller dashboard views built from the live state and the period totals. */

export type Level = "ok" | "tight" | "short";

export type ZoneBalance = { zoneId: string; name: string; center: [number, number]; waiting: number; free: number; busy: number; level: Level };

function hash(text: string): number {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

/** Riders waiting against free drivers in every zone, worst first. */
export function supplyDemand(id: MarketId, zoneIds: readonly string[], requests: readonly RideRequest[], drivers: readonly LiveDriver[]): ZoneBalance[] {
  const shown = new Set(zoneIds);
  return market(id).zones
    .filter((zone) => !shown.size || shown.has(zone.id))
    .map((zone) => {
      const waiting = requests.filter((request) => request.zoneId === zone.id && request.status === "searching").length;
      const free = drivers.filter((driver) => driver.zoneId === zone.id && driver.state === "free").length;
      const busy = drivers.filter((driver) => driver.zoneId === zone.id && (driver.state === "trip" || driver.state === "pickup")).length;
      const level: Level = waiting === 0 ? "ok" : free >= waiting ? "tight" : "short";
      return { zoneId: zone.id, name: zone.name, center: zone.center, waiting, free, busy, level };
    })
    .sort((a, b) => (b.waiting - b.free) - (a.waiting - a.free) || b.waiting - a.waiting);
}

export type AirportQueue = { zoneId: string; name: string; waiting: number; waitMin: number; pickupsLastHour: number };

/** Live: the airport rank queue is not on the server (null = "Not connected yet"). */
export function airportQueues(id: MarketId, drivers: readonly LiveDriver[], hourSeed: number): AirportQueue[] | null {
  if (isLiveData()) return null;
  return market(id).zones
    .filter((zone) => zone.kind === "airport")
    .map((zone) => {
      const free = drivers.filter((driver) => driver.zoneId === zone.id && driver.state === "free").length;
      const seed = hash(`${zone.id}:${hourSeed}`);
      // Airport rank: the drivers parked there plus a steady queue of drivers who are not on the map yet.
      const waiting = free + 2 + (seed % 9);
      return { zoneId: zone.id, name: zone.name, waiting, waitMin: 8 + (seed >>> 4) % 35, pickupsLastHour: 3 + (seed >>> 9) % 14 };
    });
}

export type CancelRow = { who: string; count: number; reasons: { label: string; count: number }[] };

/** The period's cancellations split by who cancelled and why. */
export function cancellations(totals: Totals): CancelRow[] | null {
  // Live: who cancelled and why is not summed by the server yet; never shares of a made-up total.
  if (isLiveData()) return null;
  const total = totals.cancelled;
  const split = (share: number, reasons: [string, number][]): CancelRow["reasons"] =>
    reasons.map(([label, part]) => ({ label, count: Math.round(total * share * part) }));
  return [
    { who: "Rider", count: Math.round(total * 0.56), reasons: split(0.56, [["Waited too long", 0.38], ["Changed plans", 0.27], ["Booked by mistake", 0.2], ["Price too high", 0.15]]) },
    { who: "Driver", count: Math.round(total * 0.27), reasons: split(0.27, [["Rider not at pickup", 0.41], ["Too far away", 0.33], ["Vehicle problem", 0.14], ["Other", 0.12]]) },
    { who: "No-show", count: Math.round(total * 0.12), reasons: split(0.12, [["Rider did not come", 1]]) },
    { who: "Admin", count: Math.round(total * 0.05), reasons: split(0.05, [["Safety", 0.5], ["Fraud check", 0.3], ["Duplicate booking", 0.2]]) },
  ];
}

export type RatingSummary = { average: number; rated: number; low: number; complaints: number; topComplaints: { label: string; count: number }[] };

export function ratings(totals: Totals, seedKey: string): RatingSummary | null {
  if (isLiveData()) return null;
  const seed = hash(seedKey);
  const rated = Math.round(totals.trips * 0.71);
  const complaints = Math.round(totals.trips * 0.004);
  return {
    average: totals.trips ? 4.72 + ((seed % 14) / 100) : 0,
    rated,
    low: Math.round(rated * 0.021),
    complaints,
    topComplaints: [
      { label: "Driver behaviour", count: Math.round(complaints * 0.34) },
      { label: "Route or detour", count: Math.round(complaints * 0.26) },
      { label: "Vehicle cleanliness", count: Math.round(complaints * 0.2) },
      { label: "Fare or payment", count: Math.round(complaints * 0.2) },
    ],
  };
}

export type BoostZone = { zoneId: string; name: string; kind: "Surge" | "Boost" | "Surge suggested"; detail: string };

/** Surges running now, driver boosts, and zones short of drivers where a surge could help. */
export function activeBoosts(bonuses: readonly { id: string; name: string; zoneId: string; status: string }[], balance: readonly ZoneBalance[], surges: readonly { zoneId: string; name: string; multiplier: number; source: string }[] = []): BoostZone[] {
  const surging = surges
    .filter((surge) => surge.multiplier > 1)
    .sort((a, b) => b.multiplier - a.multiplier)
    .map((surge) => ({ zoneId: surge.zoneId, name: surge.name, kind: "Surge" as const, detail: `×${surge.multiplier.toFixed(1)} · ${surge.source}` }));
  const hot = new Set(surging.map((item) => item.zoneId));
  const running = bonuses
    .filter((bonus) => bonus.status === "active" && zoneById(bonus.zoneId))
    .map((bonus) => ({ zoneId: bonus.zoneId, name: zoneById(bonus.zoneId)!.name, kind: "Boost" as const, detail: bonus.name }));
  const suggested = balance
    .filter((zone) => zone.level === "short" && !hot.has(zone.zoneId))
    .map((zone) => ({ zoneId: zone.zoneId, name: zone.name, kind: "Surge suggested" as const, detail: `${zone.waiting} waiting · ${zone.free} free` }));
  return [...surging, ...running, ...suggested];
}
