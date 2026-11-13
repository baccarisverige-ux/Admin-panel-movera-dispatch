/**
 * Zone studio helpers moved unchanged from releases.ts (S5 J2 / item 111, Rule 25): drawing tools (join, clip,
 * remove overlaps, circle, sizes, checks while drawing, suggested shape), what a publish changes, city gaps,
 * cities with zones, go-live state, what is inside a shape and the first shape of a GeoJSON / KML file.
 */
import area from "@turf/area";
import { booleanWithin } from "@turf/boolean-within";
import { point, polygon } from "@turf/helpers";
import kinks from "@turf/kinks";
import { difference } from "@turf/difference";
import { intersect } from "@turf/intersect";
import { union } from "@turf/union";
import { featureCollection } from "@turf/helpers";
import type { MarketId } from "../markets/markets.ts";
import { citiesOf, rect as cityRect, type City } from "./cities.ts";
import { activityPoints, asPolygon, closedRing, displayName, kmlCoordinates, makeZone, validateZones, type ZoneIssue, type ZoneKind, type ZoneShape } from "./releases.ts";

type Ring = [number, number][];

function fromTurfRing(ring: number[][]): Ring {
  const points = ring.map(([lng, lat]) => [Number((lat ?? 0).toFixed(6)), Number((lng ?? 0).toFixed(6))] as [number, number]);
  const first = points[0];
  const last = points[points.length - 1];
  if (first && last && first[0] === last[0] && first[1] === last[1]) points.pop();
  return points;
}

function asTurf(points: Ring) {
  return polygon([closedRing(points)]);
}

/** Join districts into one shape. They must touch. */
export function joinShapes(rings: Ring[]): { points: Ring; error?: string } {
  if (rings.length === 0) return { points: [], error: "Pick at least one district." };
  if (rings.length === 1) return { points: rings[0]!.map((point) => [...point] as [number, number]) };
  const joined = union(featureCollection(rings.map(asTurf)));
  if (!joined) return { points: [], error: "These districts could not be joined." };
  if (joined.geometry.type === "MultiPolygon") return { points: [], error: "These districts do not touch. Pick districts next to each other." };
  return { points: fromTurfRing(joined.geometry.coordinates[0] ?? []) };
}

/** Cut the shape so it stays inside the city. */
export function clipToCity(points: Ring, city: City): { points: Ring; error?: string } {
  if (points.length < 3) return { points, error: "Make the shape first." };
  const cut = intersect(featureCollection([asTurf(points), asTurf(city.outline)]));
  if (!cut) return { points, error: `The shape is not inside ${city.name}.` };
  if (cut.geometry.type === "MultiPolygon") {
    const biggest = [...cut.geometry.coordinates].sort((a, b) => area(polygon(b)) - area(polygon(a)))[0];
    return { points: fromTurfRing(biggest?.[0] ?? []) };
  }
  return { points: fromTurfRing(cut.geometry.coordinates[0] ?? []) };
}

/** Remove the parts that cover other operating zones, so zones touch without overlapping. */
export function removeOverlaps(points: Ring, others: readonly ZoneShape[]): { points: Ring; error?: string } {
  if (points.length < 3) return { points, error: "Make the shape first." };
  let shape: ReturnType<typeof asTurf> | ReturnType<typeof difference> = asTurf(points);
  for (const other of others) {
    if (!shape || other.archived || other.points.length < 3 || (other.kind !== "operating" && other.kind !== "airport")) continue;
    shape = difference(featureCollection([shape, asTurf(other.points)])) as typeof shape;
  }
  if (!shape) return { points, error: "Nothing is left once the other zones are removed." };
  if (shape.geometry.type === "MultiPolygon") {
    const biggest = [...shape.geometry.coordinates].sort((a, b) => area(polygon(b)) - area(polygon(a)))[0];
    return { points: fromTurfRing(biggest?.[0] ?? []) };
  }
  return { points: fromTurfRing(shape.geometry.coordinates[0] ?? []) };
}

/** A circle as a shape with 48 points. */
export function circleRing(lat: number, lng: number, km: number, steps = 48): Ring {
  const dLat = km / 111.32;
  const dLng = km / (111.32 * Math.cos((lat * Math.PI) / 180));
  return Array.from({ length: steps }, (_, index) => {
    const angle = (2 * Math.PI * index) / steps;
    return [Number((lat + Math.sin(angle) * dLat).toFixed(6)), Number((lng + Math.cos(angle) * dLng).toFixed(6))] as [number, number];
  });
}

export function ringAreaKm(points: Ring): number {
  return points.length < 3 ? 0 : area(asTurf(points)) / 1_000_000;
}

/** Width (east–west) and height (north–south) in km. */
export function ringSizeKm(points: Ring): { width: number; height: number } {
  if (points.length === 0) return { width: 0, height: 0 };
  const lats = points.map(([lat]) => lat);
  const lngs = points.map(([, lng]) => lng);
  const mid = (Math.min(...lats) + Math.max(...lats)) / 2;
  return {
    width: (Math.max(...lngs) - Math.min(...lngs)) * 111.32 * Math.cos((mid * Math.PI) / 180),
    height: (Math.max(...lats) - Math.min(...lats)) * 111.32,
  };
}

export function lineKm(line: Ring): number {
  let total = 0;
  for (let index = 1; index < line.length; index += 1) {
    const [lat1, lng1] = line[index - 1]!;
    const [lat2, lng2] = line[index]!;
    const x = (lng2 - lng1) * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
    total += Math.hypot(x, lat2 - lat1) * 111.32;
  }
  return total;
}

/** Checks while drawing a new shape, before it is saved. */
export function shapeChecks(points: Ring, city: City | undefined, kind: ZoneKind, zones: readonly ZoneShape[], ignoreId?: string): ZoneIssue[] {
  if (points.length < 3) return [{ level: "error", zoneId: "new", message: "Make the shape first." }];
  const probe = makeZone({ id: ignoreId ?? "new-shape", code: "NEW", name: "New zone", kind, points, city: city?.id ?? "", country: city?.country ?? "SE", parentId: zones.find((item) => item.kind === "service" && item.country === city?.country)?.id ?? null });
  const others = zones.filter((item) => item.id !== probe.id);
  const issues = validateZones([...others, probe]).filter((issue) => issue.zoneId === probe.id || issue.message.includes(probe.name));
  const size = ringAreaKm(points);
  if (size > 0 && size < 0.05) issues.push({ level: "warn", zoneId: probe.id, message: `Very small: ${size.toFixed(2)} km².` });
  return issues.map((issue) => {
    const other = /^(.+) overlaps New zone\./.exec(issue.message)?.[1] ?? /^New zone overlaps (.+?)\./.exec(issue.message)?.[1];
    return { ...issue, message: other ? `The shape overlaps ${other}. Operating zones cannot overlap.` : issue.message.replace("New zone", "The shape") };
  });
}

/** Suggested shape around where riders ask for rides in this city. */
export function suggestedShape(city: City): { points: Ring; error?: string } {
  const outline = asTurf(city.outline);
  const hot = activityPoints().filter((item) => (item.kind === "demand_7d" || item.kind === "request") && booleanWithin(point([item.lng, item.lat]), outline));
  if (hot.length < 3) return { points: [], error: `Not enough ride requests in ${city.name} yet.` };
  const lats = hot.map((item) => item.lat);
  const lngs = hot.map((item) => item.lng);
  const pad = 0.004;
  return { points: cityRect(Math.min(...lats) - pad, Math.min(...lngs) - pad, Math.max(...lats) + pad, Math.max(...lngs) + pad) };
}

export type ZoneChange = { zoneId: string; name: string; change: "added" | "changed" | "removed" | "archived"; fields: string[] };

const FIELD_LABEL: Partial<Record<keyof ZoneShape, string>> = {
  points: "shape", holes: "holes", name: "name", code: "code", kind: "type", active: "on/off", categories: "categories", paymentMethods: "payments",
  priceSet: "prices", zoneFeeOre: "zone fee", airportFeeOre: "airport fee", schedule: "opening hours", hours: "opening hours", pickups: "pickup points",
  goLiveAt: "go-live time", crossPrice: "rides between zones", leaveZone: "rides between zones", otherCities: "rides between zones", noStopLines: "no-stop streets", queueOn: "airport queue",
};

/** What changes for this country when the draft is published. */
export function zoneChanges(published: readonly ZoneShape[], draft: readonly ZoneShape[], country: MarketId): ZoneChange[] {
  const out: ZoneChange[] = [];
  for (const item of draft.filter((entry) => entry.country === country)) {
    const before = published.find((entry) => entry.id === item.id);
    if (!before) {
      out.push({ zoneId: item.id, name: displayName(item), change: "added", fields: [] });
      continue;
    }
    if (item.archived && !before.archived) {
      out.push({ zoneId: item.id, name: displayName(item), change: "archived", fields: [] });
      continue;
    }
    const fields = [...new Set((Object.keys(item) as (keyof ZoneShape)[]).filter((key) => JSON.stringify(item[key]) !== JSON.stringify(before[key])).map((key) => FIELD_LABEL[key] ?? "settings"))];
    if (fields.length) out.push({ zoneId: item.id, name: displayName(item), change: "changed", fields });
  }
  for (const item of published.filter((entry) => entry.country === country)) {
    if (!draft.some((entry) => entry.id === item.id)) out.push({ zoneId: item.id, name: displayName(item), change: "removed", fields: [] });
  }
  return out;
}

export type ZoneGaps = { coverage: number; cells: Ring[] };

/** Parts of the city that no operating zone or airport covers, on a grid. */
export function cityGaps(zones: readonly ZoneShape[], city: City, size = 24): ZoneGaps {
  const outline = asTurf(city.outline);
  const lats = city.outline.map(([lat]) => lat);
  const lngs = city.outline.map(([, lng]) => lng);
  const south = Math.min(...lats);
  const west = Math.min(...lngs);
  const dLat = (Math.max(...lats) - south) / size;
  const dLng = (Math.max(...lngs) - west) / size;
  const covering = zones.filter((item) => !item.archived && item.city === city.id && (item.kind === "operating" || item.kind === "airport") && item.points.length >= 3).map((item) => asPolygon(item, true)).filter((shape): shape is NonNullable<typeof shape> => Boolean(shape) && kinks(shape!).features.length === 0);
  let inside = 0;
  let covered = 0;
  const cells: Ring[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const lat = south + dLat * (row + 0.5);
      const lng = west + dLng * (col + 0.5);
      const probe = point([lng, lat]);
      if (!booleanWithin(probe, outline)) continue;
      inside += 1;
      if (covering.some((shape) => booleanWithin(probe, shape))) covered += 1;
      else cells.push(cityRect(south + dLat * row, west + dLng * col, south + dLat * (row + 1), west + dLng * (col + 1)));
    }
  }
  return { coverage: inside ? Math.round((covered / inside) * 100) : 0, cells };
}

export function citiesWithZones(zones: readonly ZoneShape[], country: MarketId): { city: City; zones: ZoneShape[] }[] {
  return citiesOf(country).map((city) => ({ city, zones: zones.filter((item) => item.city === city.id && item.country === country) }));
}

/** "Scheduled" when the zone waits for its go-live time. */
export function goLiveState(target: ZoneShape, now: number): "now" | "scheduled" {
  return target.goLiveAt && Date.parse(target.goLiveAt) > now ? "scheduled" : "now";
}

/** What is inside a shape right now: drivers, open requests, trips and requests over 7 days. */
export function activityInside(points: [number, number][]): { drivers: number; requests: number; trips: number; demand7d: number } {
  if (points.length < 3) return { drivers: 0, requests: 0, trips: 0, demand7d: 0 };
  const shape = polygon([closedRing(points)]);
  if (kinks(shape).features.length) return { drivers: 0, requests: 0, trips: 0, demand7d: 0 };
  const inside = activityPoints().filter((item) => booleanWithin(point([item.lng, item.lat]), shape));
  return {
    drivers: inside.filter((item) => item.kind === "driver" && item.online).length,
    requests: inside.filter((item) => item.kind === "request").length,
    trips: inside.filter((item) => item.kind === "trip").length,
    demand7d: inside.filter((item) => item.kind === "demand_7d").reduce((sum, item) => sum + (item.weight ?? 1) * 12, 0),
  };
}

/** The first shape in a GeoJSON or KML file. */
export function firstShapeFromFile(raw: string): { points: [number, number][]; error?: string } {
  const text = raw.trim();
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as GeoJSON.GeoJSON;
      const geometries: GeoJSON.Geometry[] = parsed.type === "FeatureCollection" ? parsed.features.map((feature) => feature.geometry) : parsed.type === "Feature" ? [parsed.geometry] : [parsed as GeoJSON.Geometry];
      for (const geometry of geometries) {
        const ring = geometry?.type === "Polygon" ? geometry.coordinates[0] : geometry?.type === "MultiPolygon" ? geometry.coordinates[0]?.[0] : undefined;
        if (ring && ring.length >= 4) return { points: fromTurfRing(ring) };
      }
      return { points: [], error: "The file has no shape (Polygon)." };
    } catch {
      return { points: [], error: "That file is not valid GeoJSON." };
    }
  }
  if (/<kml[\s>]|<Placemark[\s>]/i.test(text)) {
    const coords = /<coordinates\b[^>]*>([\s\S]*?)<\/coordinates>/i.exec(text)?.[1];
    const points = coords ? kmlCoordinates(coords) : [];
    if (points.length < 4) return { points: [], error: "The KML file has no shape." };
    const first = points[0]!;
    const last = points[points.length - 1]!;
    return { points: first[0] === last[0] && first[1] === last[1] ? points.slice(0, -1) : points };
  }
  return { points: [], error: "Use a GeoJSON or KML file." };
}
