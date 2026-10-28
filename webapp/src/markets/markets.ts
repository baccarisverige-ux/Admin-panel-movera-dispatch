import { formatMoney as formatMinor } from "../domain/money.ts";
/** Countries Movera operates in, with their cities and zones. Sweden keeps the original zone ids. */

export type MarketId = "SE" | "FR" | "TN";

export type MarketZone = {
  id: string;
  name: string;
  city: string;
  kind: "operating" | "airport";
  center: [lat: number, lng: number];
};

export type Market = {
  id: MarketId;
  name: string;
  currency: "SEK" | "EUR" | "TND";
  /** Minor units per major unit: öre, cents, millimes. */
  minorUnits: number;
  locale: string;
  timeZone: string;
  center: [lat: number, lng: number];
  zoom: number;
  zones: MarketZone[];
};

function zones(city: string, rows: Array<[string, string, number, number, ("airport" | undefined)?]>): MarketZone[] {
  return rows.map(([id, name, lat, lng, kind]) => ({ id, name, city, kind: kind ?? "operating", center: [lat, lng] }));
}

const SEED_MARKETS: readonly Market[] = [
  {
    id: "SE",
    name: "Sweden",
    currency: "SEK",
    minorUnits: 100,
    locale: "sv-SE",
    timeZone: "Europe/Stockholm",
    center: [59.334, 18.04],
    zoom: 10.6,
    zones: zones("Greater Stockholm", [
      ["Z001", "Norrmalm", 59.334, 18.063],
      ["Z002", "Södermalm", 59.314, 18.07],
      ["Z003", "Östermalm", 59.338, 18.088],
      ["Z004", "Kungsholmen", 59.33, 18.03],
      ["Z005", "Vasastan", 59.346, 18.048],
      ["Z006", "Bromma", 59.34, 17.94],
      ["Z007", "Solna", 59.36, 18.0],
      ["Z008", "Kista", 59.403, 17.944],
      ["Z009", "Södertälje", 59.195, 17.628],
      ["ARN", "Arlanda", 59.649, 17.929, "airport"],
      ["BMA", "Bromma airport", 59.354, 17.948, "airport"],
    ]),
  },
  {
    id: "FR",
    name: "France",
    currency: "EUR",
    minorUnits: 100,
    locale: "fr-FR",
    timeZone: "Europe/Paris",
    center: [48.86, 2.34],
    zoom: 10.8,
    zones: zones("Grand Paris", [
      ["FR-PC", "Paris Centre", 48.86, 2.347],
      ["FR-RG", "Rive Gauche", 48.845, 2.32],
      ["FR-OCE", "Opéra–Champs-Élysées", 48.872, 2.31],
      ["FR-MN", "Montmartre–Nord", 48.887, 2.35],
      ["FR-BE", "Bastille–Est", 48.853, 2.385],
      ["FR-LD", "La Défense", 48.892, 2.238],
      ["FR-SD", "Saint-Denis", 48.936, 2.357],
      ["FR-BB", "Boulogne-Billancourt", 48.835, 2.24],
      ["CDG", "Charles de Gaulle", 49.009, 2.548, "airport"],
      ["ORY", "Orly", 48.726, 2.365, "airport"],
    ]),
  },
  {
    id: "TN",
    name: "Tunisia",
    currency: "TND",
    minorUnits: 1000,
    locale: "fr-TN",
    timeZone: "Africa/Tunis",
    center: [36.84, 10.22],
    zoom: 10.8,
    zones: zones("Grand Tunis", [
      ["TN-TC", "Tunis Centre", 36.8, 10.18],
      ["TN-LAC", "Les Berges du Lac", 36.835, 10.235],
      ["TN-LM", "La Marsa", 36.878, 10.325],
      ["TN-CAR", "Carthage", 36.853, 10.323],
      ["TN-SBS", "Sidi Bou Saïd", 36.869, 10.341],
      ["TN-LG", "La Goulette", 36.818, 10.305],
      ["TN-AR", "Ariana", 36.862, 10.195],
      ["TN-BA", "Ben Arous", 36.753, 10.222],
      ["TUN", "Tunis-Carthage", 36.851, 10.227, "airport"],
    ]),
  },
];

/**
 * Contract v0.11.0 §20 (owner 2026-10-28, decision #9 "the server's list is the truth"): in a live build the zones of
 * every country come from GET /admin/zones (src/live/LiveZones.tsx sets them here); the demo keeps the seeds above.
 * Each market's `zones` reads the server's list while one is set, so every screen (top bar, scope, pages) follows it.
 */
let liveZones: ReadonlyMap<MarketId, MarketZone[]> | null = null;
let liveZonesVersion = 0;
const liveZoneListeners = new Set<() => void>();

export function setLiveMarketZones(zones: readonly (MarketZone & { country: string })[] | null): void {
  if (zones === null) liveZones = null;
  else {
    const byCountry = new Map<MarketId, MarketZone[]>(SEED_MARKETS.map((item) => [item.id, []]));
    for (const { country, ...zone } of zones) if (isMarketId(country)) byCountry.get(country)!.push(zone);
    liveZones = byCountry;
  }
  liveZonesVersion += 1;
  liveZoneListeners.forEach((listener) => listener());
}

export function subscribeMarketZones(listener: () => void): () => void {
  liveZoneListeners.add(listener);
  return () => liveZoneListeners.delete(listener);
}

export const marketZonesVersion = () => liveZonesVersion;

/** True while the zones come from the server (live build, list loaded). */
export const hasLiveMarketZones = () => liveZones !== null;

export const MARKETS: readonly Market[] = SEED_MARKETS.map((seed) => {
  const item = { ...seed } as Market;
  Object.defineProperty(item, "zones", { enumerable: true, get: () => liveZones?.get(seed.id) ?? seed.zones });
  return item;
});

export const DEFAULT_MARKET: MarketId = "SE";

export function isMarketId(value: unknown): value is MarketId {
  return value === "SE" || value === "FR" || value === "TN";
}

export function market(id: MarketId): Market {
  return MARKETS.find((item) => item.id === id) ?? MARKETS[0];
}

/**
 * v0.8.0 (owner 2026-10-27): each country's Standard settings, edited like a zone in the live panel's Pricing and
 * Dispatch. Its id is the server's scope key, standard-<country>.
 */
export const standardZoneId = (id: MarketId) => `standard-${id}`;

export function standardZone(id: MarketId): MarketZone {
  const owner = MARKETS.find((item) => item.id === id)!;
  return { id: standardZoneId(id), name: "Standard", city: "Standard", kind: "operating", center: owner.center };
}

export function isStandardZone(zoneId: string): boolean {
  return /^standard-[A-Z]{2}$/.test(zoneId) && MARKETS.some((item) => standardZoneId(item.id) === zoneId);
}

export function marketOfZone(zoneId: string): Market | undefined {
  if (isStandardZone(zoneId)) return MARKETS.find((item) => standardZoneId(item.id) === zoneId);
  return MARKETS.find((item) => item.zones.some((zone) => zone.id === zoneId));
}

export function zoneById(zoneId: string): MarketZone | undefined {
  const standard = MARKETS.find((item) => standardZoneId(item.id) === zoneId);
  if (standard) return standardZone(standard.id);
  for (const item of MARKETS) {
    const found = item.zones.find((zone) => zone.id === zoneId);
    if (found) return found;
  }
  return undefined;
}

export function marketZoneIds(id: MarketId): string[] {
  return market(id).zones.map((zone) => zone.id);
}

/** Zones grouped by city, airports last, in display order. */
export function zoneGroups(id: MarketId, allowed?: (zoneId: string) => boolean): { label: string; zones: MarketZone[] }[] {
  const visible = market(id).zones.filter((zone) => !allowed || allowed(zone.id));
  const groups: { label: string; zones: MarketZone[] }[] = [];
  for (const zone of visible.filter((item) => item.kind === "operating")) {
    const group = groups.find((item) => item.label === zone.city);
    if (group) group.zones.push(zone);
    else groups.push({ label: zone.city, zones: [zone] });
  }
  const airports = visible.filter((item) => item.kind === "airport");
  if (airports.length) groups.push({ label: "Airports", zones: airports });
  return groups;
}

/** Parse the `scope` URL value: one zone id or a comma-separated list. */
export function parseZoneList(value: string | null | undefined): string[] {
  if (!value) return [];
  return Array.from(new Set(value.split(",").map((item) => item.trim()).filter(Boolean)));
}

/** The market of a record's zone, or `fallback` when the zone is not known. */
export function marketIdOfZone(zoneId: string | null | undefined, fallback: MarketId = DEFAULT_MARKET): MarketId {
  return (zoneId ? marketOfZone(zoneId)?.id : undefined) ?? fallback;
}

/** The market that uses this currency (each market has its own). */
export function marketOfCurrency(currency: Market["currency"]): MarketId {
  return MARKETS.find((item) => item.currency === currency)?.id ?? DEFAULT_MARKET;
}

/** Money of a record in its own zone's currency: a Tunis payment shows in DT with 3 decimals, not in kr. */
export function formatZoneMoney(minor: number, zoneId: string | null | undefined, fallback: MarketId = DEFAULT_MARKET): string {
  return formatMoney(minor, marketIdOfZone(zoneId, fallback));
}

/** Money in a given currency (approvals store their currency; older ones without it are SEK). */
export function formatCurrencyMoney(minor: number, currency: Market["currency"] = "SEK"): string {
  return formatMoney(minor, marketOfCurrency(currency));
}

/** Format an amount held in minor units in the market's currency, with the one formatter (C-23). */
export function formatMoney(minor: number, id: MarketId, options: { compact?: boolean } = {}): string {
  const item = market(id);
  return formatMinor({ amountMinor: Math.round(minor), currency: item.currency }, item.locale, options);
}

/** The local time zone of a record's zone (Stockholm, Paris or Tunis), for dates shown on that record. */
export function zoneTimeZone(zoneId: string | null | undefined, fallback: MarketId = DEFAULT_MARKET): string {
  return market(marketIdOfZone(zoneId, fallback)).timeZone;
}
