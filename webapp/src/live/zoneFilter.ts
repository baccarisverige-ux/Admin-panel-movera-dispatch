import { isStandardZone, marketOfZone, marketZoneIds } from "../markets/markets.ts";
import type { ZoneScope } from "../api/seed.ts";

/**
 * Contract v0.17.2 (contract.json#adminListFilters; owner 2026-10-29: "if I chose France it show Sweden trips"):
 * the zones picked in the top bar, as list query params. Every zone of one country → country=XX; one zone →
 * zoneId; else zoneIds. `zones` is null without a filter; `denied` when the scope allows nothing.
 */
export type ZoneFilter = { params: [string, string][]; zones: ReadonlySet<string> | null; denied: boolean };
export const NO_FILTER: ZoneFilter = { params: [], zones: null, denied: false };

export function zoneFilterOf(scope: ZoneScope | undefined): ZoneFilter {
  if (scope === null || scope === undefined || scope === "all") return NO_FILTER;
  const listed = (Array.isArray(scope) ? [...scope] : [scope as string]).filter((zone) => zone !== "all");
  if (!listed.length || listed.includes("__scope-denied__")) return { params: [], zones: new Set(), denied: true };
  const zones = listed.filter((zone) => !isStandardZone(zone));
  if (!zones.length) return { params: [], zones: new Set(), denied: true };
  const set = new Set(zones);
  const owners = new Set(zones.map((zone) => marketOfZone(zone)?.id ?? ""));
  const [only] = [...owners];
  if (owners.size === 1 && only && marketZoneIds(only).every((zone) => set.has(zone))) return { params: [["country", only]], zones: set, denied: false };
  if (zones.length === 1) return { params: [["zoneId", zones[0]!]], zones: set, denied: false };
  return { params: [["zoneIds", zones.join(",")]], zones: set, denied: false };
}

