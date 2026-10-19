import type { LiveDriver } from "../dashboard/live.ts";
import { zoneById, type MarketId } from "../markets/markets.ts";
import { fromSek } from "../pricing/zonePricing.ts";
import { distanceKm, EXTRAS, type CancelRecord, type DriverFacts, type ExtraId, type Version, type ZoneDispatch } from "./rules.ts";

/** Demo facts for dispatch: what each driver brings, rider cancels to check, and how dispatch did. */

function hash(text: string): number {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

export type DriverStats = { rating: number; acceptancePct: number; cancelPct: number; categories: string[] };

/** Live drivers as dispatch sees them. Drivers on a ride count only when they finish soon. */
export function driverFacts(live: readonly LiveDriver[], stats: (id: string) => DriverStats, pickup: [number, number] | null): DriverFacts[] {
  return live.filter((driver) => driver.state === "free" || driver.state === "trip").map((driver) => {
    const seed = hash(`dispatch:${driver.id}`);
    const info = stats(driver.id);
    const extras: ExtraId[] = EXTRAS.filter((_, index) => (seed >>> (index + 3)) % 3 === 0).map((extra) => extra.id);
    const onTrip = driver.state === "trip";
    const dropKm = pickup ? Math.round(distanceKm([driver.lat, driver.lng], pickup) * 10) / 10 : 2;
    return {
      id: driver.id,
      name: driver.name,
      lat: driver.lat,
      lng: driver.lng,
      zoneId: driver.zoneId,
      finishing: onTrip ? { inMin: 1 + (seed % 9), dropKm } : null,
      rating: info.rating,
      acceptancePct: info.acceptancePct,
      cancelPct: info.cancelPct,
      idleMin: onTrip ? 0 : seed % 34,
      categories: info.categories,
      extras,
      female: seed % 3 === 0,
      ridesThisHour: seed % 5,
      skipsInRow: (seed >>> 5) % 9 === 0 ? 3 : (seed >>> 5) % 2,
      noInRow: (seed >>> 7) % 11 === 0 ? 3 : (seed >>> 7) % 13 === 0 ? 6 : 0,
      favourite: (seed >>> 2) % 13 === 0,
      goingHome: (seed >>> 4) % 10 === 0,
      homeDirectionOk: (seed >>> 6) % 2 === 0,
      priorityUntilMin: (seed >>> 8) % 17 === 0 ? 6 : 0,
      queuePos: zoneById(driver.zoneId)?.kind === "airport" ? 1 + ((seed >>> 3) % 20) : null,
      restNeeded: (seed >>> 9) % 23 === 0,
    };
  });
}

export function onlyFinishingNearby(facts: DriverFacts[]): DriverFacts[] {
  // Riding drivers far from the pickup are not candidates at all; keep the list readable.
  return facts.filter((row) => !row.finishing || row.finishing.dropKm <= 6);
}

export type ZoneResults = { findSec: number; acceptedPct: number; noDriverPct: number; pickupMin: number; radarPct: number; exclusivePct: number; requests: number };

/** How dispatch did today in a zone. Deterministic from the zone and its rules, so a change shows a before and after. */
export function zoneResults(zoneId: string, rules: ZoneDispatch): ZoneResults {
  const seed = hash(`results:${zoneId}`);
  const airport = zoneById(zoneId)?.kind === "airport";
  const radarShare = rules.choose.how === "auto" ? 0.45 : rules.choose.main === "radar" ? 0.75 : 0.25;
  const reach = (rules.radar.on ? rules.radar.drivers : 3) * radarShare + (rules.exclusive.on ? rules.exclusive.drivers : 1) * (1 - radarShare);
  const widest = rules.radius.steps[rules.radius.steps.length - 1] ?? 8;
  const base = 22 + (seed % 18) + (airport ? 8 : 0);
  const findSec = Math.max(6, Math.round(base - reach * 1.6 - (rules.batching.on ? -1.5 : 0) + (rules.exclusive.seconds - 15) * 0.5));
  const noDriverPct = Math.max(0.4, Math.round((6 + (seed % 5) - widest * 0.35 - reach * 0.3 - (rules.waiting.some((step) => step.on && step.kind === "raise_price") ? 0.8 : 0)) * 10) / 10);
  const acceptedPct = Math.min(99, Math.round((78 + (seed % 9) + reach * 0.8 - noDriverPct) * 10) / 10);
  const pickupMin = Math.round((4 + (seed % 4) + widest * 0.18 - (rules.factors.find((item) => item.id === "eta")?.weight ?? 0) * 0.02) * 10) / 10;
  return {
    findSec,
    acceptedPct,
    noDriverPct,
    pickupMin: Math.max(2, pickupMin),
    radarPct: Math.round(Math.min(97, 70 + (seed % 15) + rules.radar.drivers)),
    exclusivePct: Math.round(Math.min(95, 52 + (seed % 20) + rules.exclusive.seconds * 0.6)),
    requests: 120 + (seed % 380),
  };
}

/** Results before and after the newest version that changed this zone. */
export function beforeAfter(zoneId: string, versions: readonly Version[], fallback: ZoneDispatch): { before: ZoneResults; after: ZoneResults; at: string } | null {
  const index = versions.findIndex((version) => version.zoneIds.includes(zoneId));
  if (index < 0) return null;
  const after = versions[index].live[zoneId] ?? fallback;
  const before = versions[index + 1]?.live[zoneId] ?? fallback;
  return { before: zoneResults(zoneId, before), after: zoneResults(zoneId, after), at: versions[index].at };
}

const RIDERS = ["Sara Lind", "Omar Haddad", "Julie Martin", "Amine Ben Ali", "Elin Berg", "Lucas Petit", "Nour Trabelsi", "Hugo Laurent"];

/** Rider cancels after a driver accepted, with the driver's route from accept to cancel. */
export function cancelRecords(country: MarketId, zones: readonly { id: string; name: string; center: [number, number] }[], drivers: readonly { id: string; name: string; zoneId: string }[], now: number): CancelRecord[] {
  const pool = zones.length ? zones : [];
  return Array.from({ length: Math.min(8, pool.length * 2) }, (_, index) => {
    const zone = pool[index % pool.length];
    const seed = hash(`${country}:cancel:${index}`);
    const driver = drivers.filter((row) => row.zoneId === zone.id)[index % Math.max(1, drivers.filter((row) => row.zoneId === zone.id).length)] ?? drivers[index % Math.max(1, drivers.length)] ?? { id: `D${index}`, name: "Driver", zoneId: zone.id };
    const angle = ((seed % 360) * Math.PI) / 180;
    const startKm = 1.2 + (seed % 30) / 10;
    const moved = [0.05, 0.6, 0.15, 0.45, 0.8, 0.3, 0.1, 0.55][index % 8];
    const pickup: [number, number] = [zone.center[0] + Math.sin(angle) * 0.004, zone.center[1] + Math.cos(angle) * 0.006];
    const from: [number, number] = [pickup[0] + Math.sin(angle + 1.4) * startKm / 140, pickup[1] + Math.cos(angle + 1.4) * startKm / 80];
    const path: [number, number][] = Array.from({ length: 6 }, (_, step) => {
      const k = (moved * step) / 5;
      return [from[0] + (pickup[0] - from[0]) * k + Math.sin(step) * 0.0004, from[1] + (pickup[1] - from[1]) * k + Math.cos(step) * 0.0004] as [number, number];
    });
    // A driver who went the other way: the path drifts away from the pickup.
    if (index % 8 === 0) path.splice(1, path.length - 1, ...[1, 2, 3, 4, 5].map((step) => [from[0] - (pickup[0] - from[0]) * 0.05 * step, from[1] - (pickup[1] - from[1]) * 0.05 * step] as [number, number]));
    const endKm = Math.round(Math.max(0.2, distanceKm(path[path.length - 1], pickup)) * 10) / 10;
    const kmAccept = Math.round(distanceKm(from, pickup) * 10) / 10;
    const minutesAfterAccept = [1, 4, 3, 5, 6, 2, 7, 4][index % 8];
    const cancelledAt = new Date(now - (index + 1) * 47 * 60_000);
    const acceptedAt = new Date(cancelledAt.getTime() - minutesAfterAccept * 60_000);
    return {
      id: `CX-${country}-${index + 1}`,
      tripId: `T${String(9100 + (seed % 800))}`,
      zoneId: zone.id,
      rider: RIDERS[index % RIDERS.length],
      driverId: driver.id,
      driver: driver.name,
      acceptedAt: acceptedAt.toISOString(),
      cancelledAt: cancelledAt.toISOString(),
      minutesAfterAccept,
      atAccept: { km: kmAccept, etaMin: Math.max(1, Math.round((kmAccept / 24) * 60)) },
      atCancel: { km: endKm, etaMin: Math.max(1, Math.round((endKm / 24) * 60)) },
      path,
      pickup,
      category: ["economy", "comfort", "premium", "xl", "economy", "priority", "electric", "xl"][index % 8],
      fare: fromSek([180, 260, 420, 340, 200, 240, 210, 360][index % 8], country),
    };
  });
}
