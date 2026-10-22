import type { Candidate } from "../dashboard/riders.ts";
import { marketOfZone, zoneById } from "../markets/markets.ts";
import { neighbourZones, RADAR_GROUP_MAX } from "./assign.ts";
import { insideRing, liveRules, type DispatchBook, type DriverGroup, type LiveAction, type RadarZone, type RadarZoneRule } from "./rules.ts";

/**
 * The shared "Handle" system for a rider waiting for a driver, used in four places: the Dispatch › Live list,
 * the Dashboard riders list and the rider pop-up on both maps. Pure helpers; the React side is HandlePanel.tsx.
 *
 * A radar target is where a radar goes: a radar zone drawn on the map, one or more market zones (all free drivers
 * in them) or a saved driver group. The rule that applies follows the radar zone the ride is SENT to, never where a
 * driver happens to stand, so overlapping radar zones never clash.
 */

export type RadarTarget = { kind: "radar_zone"; id: string } | { kind: "zone"; ids: string[] } | { kind: "group"; id: string };

export type RadarScope = "zone" | "around";

export const LIVE_ACTIONS_KEPT = 200;

/** The rule for one radar zone: a rule naming the zone wins over a rule for all radar zones; none → null. */
export function radarRuleFor(rules: readonly RadarZoneRule[], radarZoneId: string): RadarZoneRule | null {
  return rules.find((rule) => rule.radarZoneIds !== "all" && rule.radarZoneIds.includes(radarZoneId)) ?? rules.find((rule) => rule.radarZoneIds === "all") ?? null;
}

/** The radar zones offered for a pickup zone: the zone's own, or with the zones around it (same country, nearby centre). */
export function radarZonesFor(zones: readonly RadarZone[], zoneId: string, scope: RadarScope): RadarZone[] {
  const ids = scope === "around" ? [zoneId, ...neighbourZones(zoneId)] : [zoneId];
  return zones.filter((zone) => ids.includes(zone.zoneId)).sort((a, b) => ids.indexOf(a.zoneId) - ids.indexOf(b.zoneId) || a.name.localeCompare(b.name));
}

/** The market zones an admin can pick for a zone-wide radar: the pickup zone first, then the rest of its country. */
export function zoneChoicesFor(zoneId: string): { id: string; name: string; near: boolean }[] {
  const place = marketOfZone(zoneId);
  if (!place) return [];
  const near = new Set([zoneId, ...neighbourZones(zoneId)]);
  return [...place.zones].sort((a, b) => Number(b.id === zoneId) - Number(a.id === zoneId) || Number(near.has(b.id)) - Number(near.has(a.id)) || a.name.localeCompare(b.name)).map((zone) => ({ id: zone.id, name: zone.name, near: near.has(zone.id) }));
}

/** The timer and size a radar to this target runs with: the radar zone's rule, else the pickup zone's radar settings. */
export function radarTimerFor(book: DispatchBook, target: RadarTarget, pickupZoneId: string): { seconds: number; maxDrivers: number; ruleName: string | null } {
  const zone = liveRules(book, pickupZoneId);
  const fallback = { seconds: zone.radar.seconds, maxDrivers: Math.min(RADAR_GROUP_MAX, Math.max(1, zone.radar.drivers)), ruleName: null };
  if (target.kind !== "radar_zone") return fallback;
  const rule = radarRuleFor(book.radarZoneRules, target.id);
  if (!rule) return fallback;
  return { seconds: rule.seconds, maxDrivers: Math.min(RADAR_GROUP_MAX, Math.max(1, rule.maxDrivers)), ruleName: rule.name };
}

type Positioned = { driver: { id: string; zoneId: string; lat: number; lng: number } };

/**
 * The free drivers a radar to this target reaches right now, nearest first, at most `max`.
 * Radar zone: inside its ring. Zones: in one of them. Group: its members among the free drivers.
 */
export function driversInTarget<T extends Positioned>(target: RadarTarget, candidates: readonly T[], book: Pick<DispatchBook, "radarZones" | "groups">, max = RADAR_GROUP_MAX): T[] {
  const cap = Math.min(RADAR_GROUP_MAX, Math.max(1, Math.floor(max)));
  if (target.kind === "radar_zone") {
    const zone = book.radarZones.find((item) => item.id === target.id);
    if (!zone || zone.ring.length < 3) return [];
    return candidates.filter((item) => insideRing([item.driver.lat, item.driver.lng], zone.ring)).slice(0, cap);
  }
  if (target.kind === "zone") return candidates.filter((item) => target.ids.includes(item.driver.zoneId)).slice(0, cap);
  const group = book.groups.find((item) => item.id === target.id);
  if (!group) return [];
  return candidates.filter((item) => group.driverIds.includes(item.driver.id)).slice(0, cap);
}

/** "Södermalm", "Norrmalm + Östermalm", "Night team". */
export function targetName(target: RadarTarget, book: Pick<DispatchBook, "radarZones" | "groups">): string {
  if (target.kind === "radar_zone") return book.radarZones.find((item) => item.id === target.id)?.name ?? "";
  if (target.kind === "zone") return target.ids.map((id) => zoneById(id)?.name ?? id).join(" + ");
  return book.groups.find((item) => item.id === target.id)?.name ?? "";
}

/** The LiveAction kind a send to this target is recorded as. */
export function actionKindFor(target: RadarTarget): LiveAction["kind"] {
  return target.kind === "radar_zone" ? "radar_zone" : target.kind === "group" ? "group" : "radar_group";
}

/** The default target for a waiting rider: the first radar zone in the pickup zone, else the whole pickup zone. */
export function defaultTarget(book: Pick<DispatchBook, "radarZones">, zoneId: string): RadarTarget {
  const first = radarZonesFor(book.radarZones, zoneId, "zone")[0];
  return first ? { kind: "radar_zone", id: first.id } : { kind: "zone", ids: [zoneId] };
}

/** The last thing an admin did with this ride from any of the four places, if anything. */
export function handledOf(book: Pick<DispatchBook, "liveActions">, tripId: string): LiveAction | undefined {
  return book.liveActions.find((action) => action.tripId === tripId);
}

/** The book with one more live action in front (the newest first), the oldest ones dropped. */
export function recordLiveAction(book: DispatchBook, action: Omit<LiveAction, "id">): DispatchBook {
  return { ...book, draftRev: book.draftRev + 1, liveActions: [{ id: `LA-${book.draftRev + 1}`, ...action }, ...book.liveActions].slice(0, LIVE_ACTIONS_KEPT) };
}

/** A group with nobody in it cannot take a ride. */
export function groupIssue(group: DriverGroup | undefined): string | null {
  if (!group) return "Choose a group.";
  if (!group.driverIds.length) return "This group has no drivers yet. Add drivers in Events & groups.";
  return null;
}

/** The nearest free driver who may drive the requested category, for "Exclusive to nearest". */
export function nearestAble(candidates: readonly Candidate[]): Candidate | null {
  return candidates.find((item) => item.categoryOk) ?? null;
}
