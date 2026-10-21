import type { MarketId } from "../markets/markets.ts";
import type { DispatchBook, RadarZone, RadarZoneRule } from "./rules.ts";

/**
 * Radar zones: areas drawn on the map inside a market zone (Radar · Exclusive · Reservations › Radar).
 * A radar sent to one goes to the free drivers inside it at that moment. Zones are independent and may
 * overlap. A radar zone rule names the radar zones it applies to; "all" is the default and a rule that
 * names the zone wins over it. The rule follows the radar zone the request was sent to, never where a
 * driver happens to stand, so overlapping zones never clash.
 */

export const RADAR_RULE_LIMITS = { seconds: { min: 5, max: 120 }, maxDrivers: { min: 1, max: 10 } } as const;

export function blankRadarZone(country: MarketId, zoneId: string, id: string, at: string): RadarZone {
  return { id, country, zoneId, name: "", ring: [], createdAt: at };
}

export function blankRadarRule(country: MarketId, id: string): RadarZoneRule {
  return { id, country, name: "", radarZoneIds: "all", seconds: 20, maxDrivers: 10, repeat: false };
}

/** Radar zones of one market zone, newest last. */
export function radarZonesOf(book: DispatchBook, zoneId: string): RadarZone[] {
  return book.radarZones.filter((zone) => zone.zoneId === zoneId);
}

/** Radar zones of a whole country. */
export function radarZonesIn(book: DispatchBook, country: MarketId): RadarZone[] {
  return book.radarZones.filter((zone) => zone.country === country);
}

export function radarRulesIn(book: DispatchBook, country: MarketId): RadarZoneRule[] {
  return book.radarZoneRules.filter((rule) => rule.country === country);
}

/**
 * The rule a radar zone follows: the first rule naming it, else the first rule for all radar zones, else none
 * (the market zone's normal Radar timer and drivers apply).
 */
export function radarRuleFor(book: DispatchBook, radarZoneId: string, country: MarketId): RadarZoneRule | null {
  const rules = radarRulesIn(book, country);
  return rules.find((rule) => Array.isArray(rule.radarZoneIds) && rule.radarZoneIds.includes(radarZoneId))
    ?? rules.find((rule) => rule.radarZoneIds === "all")
    ?? null;
}

/** Ray casting on a [lat, lng] ring. A point on the edge counts as inside. */
export function pointInRing(point: [number, number], ring: readonly [number, number][]): boolean {
  if (ring.length < 3) return false;
  const [lat, lng] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [latI, lngI] = ring[i];
    const [latJ, lngJ] = ring[j];
    const crosses = (lngI > lng) !== (lngJ > lng);
    if (!crosses) continue;
    const latAt = ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI;
    if (lat < latAt) inside = !inside;
    else if (lat === latAt) return true;
  }
  return inside;
}

/** The drivers inside a radar zone right now. Pass the free ones to get "free drivers inside". */
export function driversInRadarZone<T extends { lat: number; lng: number }>(zone: RadarZone, drivers: readonly T[]): T[] {
  return drivers.filter((driver) => pointInRing([driver.lat, driver.lng], zone.ring));
}

/** What is wrong with a radar zone before it can be saved. */
export function radarZoneError(zone: RadarZone, others: readonly RadarZone[]): string | null {
  if (!zone.name.trim()) return "Give the radar zone a name.";
  if (zone.ring.length < 3) return "Draw the radar zone on the map.";
  if (others.some((other) => other.id !== zone.id && other.zoneId === zone.zoneId && other.name.trim().toLowerCase() === zone.name.trim().toLowerCase())) return "Another radar zone in this zone has that name.";
  return null;
}

/** What is wrong with a radar zone rule before it can be saved. */
export function radarRuleError(rule: RadarZoneRule, others: readonly RadarZoneRule[]): string | null {
  if (!rule.name.trim()) return "Give the rule a name.";
  if (Array.isArray(rule.radarZoneIds) && !rule.radarZoneIds.length) return "Pick at least one radar zone, or all of them.";
  if (!Number.isFinite(rule.seconds) || rule.seconds < RADAR_RULE_LIMITS.seconds.min || rule.seconds > RADAR_RULE_LIMITS.seconds.max) return `The radar time must be ${RADAR_RULE_LIMITS.seconds.min} to ${RADAR_RULE_LIMITS.seconds.max} seconds.`;
  if (!Number.isInteger(rule.maxDrivers) || rule.maxDrivers < RADAR_RULE_LIMITS.maxDrivers.min || rule.maxDrivers > RADAR_RULE_LIMITS.maxDrivers.max) return `Most drivers must be ${RADAR_RULE_LIMITS.maxDrivers.min} to ${RADAR_RULE_LIMITS.maxDrivers.max}.`;
  if (others.some((other) => other.id !== rule.id && other.country === rule.country && other.name.trim().toLowerCase() === rule.name.trim().toLowerCase())) return "Another rule has that name.";
  return null;
}

/** The book with a radar zone added or changed, as a new draft revision (saved like driver groups). */
export function withRadarZone(book: DispatchBook, zone: RadarZone): DispatchBook {
  const saved = { ...zone, name: zone.name.trim() };
  const exists = book.radarZones.some((item) => item.id === zone.id);
  return { ...book, draftRev: book.draftRev + 1, radarZones: exists ? book.radarZones.map((item) => (item.id === zone.id ? saved : item)) : [...book.radarZones, saved] };
}

/** The book without a radar zone; rules that named only this zone keep their other zones. */
export function withoutRadarZone(book: DispatchBook, radarZoneId: string): DispatchBook {
  return {
    ...book,
    draftRev: book.draftRev + 1,
    radarZones: book.radarZones.filter((item) => item.id !== radarZoneId),
    radarZoneRules: book.radarZoneRules.map((rule) => (Array.isArray(rule.radarZoneIds) ? { ...rule, radarZoneIds: rule.radarZoneIds.filter((id) => id !== radarZoneId) } : rule)),
  };
}

export function withRadarRule(book: DispatchBook, rule: RadarZoneRule): DispatchBook {
  const saved = { ...rule, name: rule.name.trim(), maxDrivers: Math.round(rule.maxDrivers), seconds: Math.round(rule.seconds) };
  const exists = book.radarZoneRules.some((item) => item.id === rule.id);
  return { ...book, draftRev: book.draftRev + 1, radarZoneRules: exists ? book.radarZoneRules.map((item) => (item.id === rule.id ? saved : item)) : [...book.radarZoneRules, saved] };
}

export function withoutRadarRule(book: DispatchBook, ruleId: string): DispatchBook {
  return { ...book, draftRev: book.draftRev + 1, radarZoneRules: book.radarZoneRules.filter((item) => item.id !== ruleId) };
}
