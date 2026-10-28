import type { MarketId, MarketZone } from "../markets/markets.ts";
import { isMarketId } from "../markets/markets.ts";
import { CITIES, citiesOf } from "./cities.ts";
import { makeZone, type ZoneShape } from "./releases.ts";

/**
 * Contract v0.11.0 §21 (contract.json#zones, owner 2026-10-28): the Zone object of GET /admin/zones and the request
 * bodies of POST /admin/zones, PUT /admin/zones/{zoneId} and POST …/open|close (server src/zones/routes.ts). Zones are
 * never deleted, only closed; one admin with zones.edit is enough.
 */
export type ZoneNames = { sv: string; fr: string; en: string };
export type ServerZone = {
  zoneId: string;
  names: ZoneNames;
  country: string;
  currency: "SEK" | "EUR" | "TND" | string;
  timeZone: string;
  kind: "operating" | "airport" | string;
  polygon: [number, number][];
  bounds: { south: number; west: number; north: number; east: number };
  center: { lat: number; lng: number };
  open: boolean;
  version: number;
  createdAt: string;
  updatedAt?: string;
  updatedBy?: string;
};

export type CreateZoneBody = {
  zoneId: string;
  names: ZoneNames;
  country: MarketId;
  currency: "SEK" | "EUR" | "TND";
  timeZone: string;
  kind: "operating" | "airport";
  polygon: [number, number][];
  open?: boolean;
};

export type UpdateZoneBody = { expectedVersion: number; names?: ZoneNames; kind?: "operating" | "airport"; polygon?: [number, number][] };

export const ZONE_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const NAME_MAX = 80;
export const POINTS_MAX = 500;

/** The name in the panel's language (sv, fr or en; English for any other). */
export function zoneName(names: ZoneNames, language: string): string {
  return (language === "sv" || language === "fr" ? names[language] : names.en) || names.en || names.sv || names.fr;
}

/** The demo city the zone sits in: the one whose outline holds its center, else the nearest of its country. */
export function cityOfZone(zone: Pick<ServerZone, "country" | "center">): string {
  const cities = isMarketId(zone.country) ? citiesOf(zone.country) : [];
  if (!cities.length) return "";
  const { lat, lng } = zone.center;
  const holding = cities.find((city) => inside(city.outline, lat, lng));
  if (holding) return holding.id;
  const far = (center: [number, number]) => (center[0] - lat) ** 2 + (center[1] - lng) ** 2;
  return [...cities].sort((a, b) => far(a.center) - far(b.center))[0]!.id;
}

function inside(ring: readonly [number, number][], lat: number, lng: number): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [latI, lngI] = ring[i]!;
    const [latJ, lngJ] = ring[j]!;
    if (lngI > lng !== lngJ > lng && lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI) hit = !hit;
  }
  return hit;
}

const kindOf = (kind: string): "operating" | "airport" => (kind === "airport" ? "airport" : "operating");

/** The demo zone shape of a server zone: id, code and link are the zoneId; open is "on"; the name is the full name. */
export function shapeOfServerZone(zone: ServerZone, language: string): ZoneShape {
  const country = isMarketId(zone.country) ? zone.country : "SE";
  return makeZone({
    id: zone.zoneId,
    code: zone.zoneId,
    name: zoneName(zone.names, language),
    named: true,
    kind: kindOf(zone.kind),
    country,
    city: cityOfZone(zone),
    parentId: null,
    marketZoneId: zone.zoneId,
    points: zone.polygon.map(([lat, lng]) => [lat, lng] as [number, number]),
    active: zone.open,
    queuePolygon: [],
  });
}

/** The top bar's entry of a server zone (grouped under its city, airports apart). */
export function marketZoneOf(zone: ServerZone, language: string): MarketZone & { country: string } {
  const city = CITIES.find((item) => item.id === cityOfZone(zone));
  return { id: zone.zoneId, name: zoneName(zone.names, language), city: city?.name ?? zone.country, kind: kindOf(zone.kind), center: [zone.center.lat, zone.center.lng], country: zone.country };
}

/** Problems the server would refuse a new zone for (400), checked before sending. Empty when it can go. */
export function createZoneProblem(body: Pick<CreateZoneBody, "zoneId" | "names" | "polygon">, existing: readonly Pick<ServerZone, "zoneId">[]): string {
  if (!ZONE_ID.test(body.zoneId)) return "The zone id needs 1–64 letters, digits, - or _.";
  if (existing.some((zone) => zone.zoneId === body.zoneId)) return "A zone with this id exists.";
  return namesProblem(body.names) || polygonProblem(body.polygon);
}

export function namesProblem(names: ZoneNames): string {
  if (!names.sv.trim() || !names.fr.trim() || !names.en.trim()) return "Give the zone a name in Swedish, French and English.";
  if ([names.sv, names.fr, names.en].some((name) => name.trim().length > NAME_MAX)) return "A name has at most 80 characters.";
  return "";
}

export function polygonProblem(polygon: readonly [number, number][]): string {
  if (polygon.length < 3) return "Make the shape first.";
  if (polygon.length > POINTS_MAX) return "The outline has at most 500 points.";
  return "";
}

/** A trimmed outline as the server takes it: not closed (the last point is not the first again), rounded to 6 decimals. */
export function outlineForServer(points: readonly [number, number][]): [number, number][] {
  const round = (value: number) => Math.round(value * 1e6) / 1e6;
  const out = points.map(([lat, lng]) => [round(lat), round(lng)] as [number, number]);
  const first = out[0];
  const last = out[out.length - 1];
  if (out.length > 3 && first && last && first[0] === last[0] && first[1] === last[1]) out.pop();
  return out;
}

/** A suggested id for a new zone: <country>-<two letters> for a city zone (FR-PC), the IATA code for an airport. */
export function suggestZoneId(country: MarketId, kind: "operating" | "airport", name: string, existing: readonly Pick<ServerZone, "zoneId">[]): string {
  const letters = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter(Boolean);
  const short = (letters.length > 1 ? letters.map((word) => word[0]).join("") : (letters[0] ?? "NEW")).slice(0, kind === "airport" ? 3 : 2) || "NEW";
  const base = kind === "airport" ? short.padEnd(3, "X") : `${country}-${short.padEnd(2, "X")}`;
  let id = base;
  for (let index = 2; existing.some((zone) => zone.zoneId === id); index += 1) id = `${base}${index}`;
  return id;
}
