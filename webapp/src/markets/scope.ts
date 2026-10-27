import { DEFAULT_MARKET, MARKETS, isMarketId, isStandardZone, marketOfZone, marketZoneIds, parseZoneList, type MarketId } from "./markets.ts";

/** The part of an agent's access that decides which countries and zones they can open. */
export type ScopeAccess = {
  zones: "all" | readonly string[];
  countries?: readonly MarketId[];
};

export function countryAllowed(access: ScopeAccess, id: MarketId): boolean {
  if (access.countries && !access.countries.includes(id)) return false;
  if (access.zones === "all") return true;
  const zones = new Set(marketZoneIds(id));
  return access.zones.some((zone) => zones.has(zone));
}

export function zoneAllowed(access: ScopeAccess, zoneId: string): boolean {
  const owner = marketOfZone(zoneId);
  // v0.8.0 (owner 2026-10-27): any admin of a country may work on its Standard.
  if (isStandardZone(zoneId)) return Boolean(owner) && countryAllowed(access, owner!.id);
  if (access.countries && (!owner || !access.countries.includes(owner.id))) return false;
  return access.zones === "all" || access.zones.includes(zoneId);
}

export function allowedCountries(access: ScopeAccess): MarketId[] {
  return MARKETS.map((item) => item.id).filter((id) => countryAllowed(access, id));
}

/** In the `scope` URL value: every zone of the country (with a Standard named beside it). */
export const ALL_ZONES = "all";

export type ResolvedScope = {
  country: MarketId;
  /** Zones picked in the top bar; empty means every allowed zone in the country. */
  zones: string[];
  /** What the API should filter by. */
  effective: string | string[];
  denied: boolean;
};

/**
 * Turn the URL (`country`, `scope`) and the remembered country into what every screen reads.
 * Zones in the URL decide the country when they name one; otherwise the URL country, then the
 * remembered one, then the first country the agent may open.
 */
export function resolveScope(access: ScopeAccess, input: { country?: string | null; scope?: string | null; remembered?: string | null }): ResolvedScope {
  const allowed = allowedCountries(access);
  const fallback = allowed[0] ?? DEFAULT_MARKET;
  const listed = parseZoneList(input.scope);
  // "all" with a Standard: every zone of the country and its Standard (owner 2026-10-27).
  const wantsAll = listed.includes(ALL_ZONES);
  const named = listed.filter((zone) => zone !== ALL_ZONES);
  const owner = named.map((zone) => marketOfZone(zone)?.id).find(isMarketId);
  const zones = wantsAll && owner ? [...named, ...marketZoneIds(owner).filter((zone) => zoneAllowed(access, zone) && !named.includes(zone))] : named;
  const fromZones = zones.map((zone) => marketOfZone(zone)?.id).find(isMarketId);
  const pick = (value: string | null | undefined) => (isMarketId(value) && allowed.includes(value) ? value : null);
  const country = fromZones ?? pick(input.country) ?? pick(input.remembered) ?? fallback;
  if (zones.length) {
    const denied = zones.some((zone) => !zoneAllowed(access, zone) || marketOfZone(zone)?.id !== country);
    if (denied) return { country, zones, effective: ["__scope-denied__"], denied: true };
    return { country, zones, effective: zones.length === 1 ? zones[0] : zones, denied: false };
  }
  if (!allowed.includes(country)) return { country, zones: [], effective: ["__scope-denied__"], denied: true };
  const effective = marketZoneIds(country).filter((zone) => zoneAllowed(access, zone));
  return { country, zones: [], effective, denied: false };
}

/**
 * Owner 2026-10-27: what a publish in Settings, Pricing or Dispatch applies to: exactly the zones chosen at
 * the top (each country's Standard only when it is chosen there); "All zones" is every zone the admin may
 * work in, without the Standard.
 */
export function publishTargets(scope: Pick<ResolvedScope, "zones" | "effective" | "denied">): string[] {
  if (scope.denied) return [];
  if (scope.zones.length) return [...scope.zones];
  return Array.isArray(scope.effective) ? [...scope.effective] : [scope.effective];
}
