import { trx } from "../i18n/core.ts";
import area from "@turf/area";
import { booleanIntersects } from "@turf/boolean-intersects";
import { booleanWithin } from "@turf/boolean-within";
import { point, polygon } from "@turf/helpers";
import kinks from "@turf/kinks";
import { difference } from "@turf/difference";
import { intersect } from "@turf/intersect";
import { union } from "@turf/union";
import { featureCollection } from "@turf/helpers";
import type { MarketId } from "../markets/markets.ts";
import { cityById, citiesOf, rect as cityRect, type City } from "./cities.ts";

export const ZONE_TYPES = [
  { id: "service", label: "Service area" },
  { id: "operating", label: "Operating zone" },
  { id: "airport", label: "Airport" },
  { id: "boost", label: "Boost" },
  { id: "event", label: "Event" },
  { id: "no_pickup", label: "No pickup / no drop-off" },
  { id: "restricted", label: "Restricted" },
  { id: "fleet", label: "Fleet territory" },
  { id: "pickup", label: "Pickup point" },
] as const;

export type ZoneKind = (typeof ZONE_TYPES)[number]["id"];

export const ZONE_COLOR: Record<ZoneKind, string> = {
  service: "#111614",
  operating: "#1FA463",
  airport: "#D08A1E",
  boost: "#A86B12",
  event: "#5E6B66",
  no_pickup: "#C2453A",
  restricted: "#3D3430",
  fleet: "#146C43",
  pickup: "#111614",
};

export type PickupPoint = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  instructions: string;
  photoUrl: string;
};

export type CrossPrice = "pickup" | "dropoff" | "higher";

export type ZoneShape = {
  id: string;
  code: string;
  name: string;
  /** Country and city the zone belongs to. Every zone sits in one city. */
  country: MarketId;
  city: string;
  /** The zone id other sections use (pricing, dashboard), when the zone is linked to one. */
  marketZoneId: string;
  /** When set and in the future, the zone starts at that time after publishing. Local time, like 2026-10-19T06:00. */
  goLiveAt: string;
  /** Rides that start here and end in another zone: whose price is used. */
  crossPrice: CrossPrice;
  /** Drivers may take riders out of this zone. */
  leaveZone: boolean;
  /** Rides may go to another city. */
  otherCities: boolean;
  /** Streets where pickup and drop-off are not allowed, as lines of [lat, lng]. */
  noStopLines: [number, number][][];
  kind: ZoneKind;
  parentId: string | null;
  notes: string;
  color: string;
  priority: number;
  points: [number, number][];
  holes: [number, number][][];
  archived: boolean;
  active: boolean;
  categories: string[];
  options: string[];
  paymentMethods: string[];
  cash: boolean;
  pinRequired: boolean;
  pickupOnly: boolean;
  minAppVersion: string;
  suspendedUntil: string;
  suspendReason: string;
  priceSet: string;
  zoneFeeOre: number;
  airportFeeOre: number;
  boostRule: string;
  searchRadiusKm: number;
  offerSeconds: number;
  nextTripKm: number;
  destinationMode: boolean;
  maxWaitMin: number;
  pickups: PickupPoint[];
  queueOn: boolean;
  queuePolygon: [number, number][];
  pickupArea: [number, number][];
  maxQueueMin: number;
  queueFeeOre: number;
  terminals: string;
  schedule: "always" | "weekly" | "range";
  hours: string;
  from: string;
  until: string;
  /** Live (contract v0.11.0 §20): the name is the server's full name, shown without the city in front. */
  named?: boolean;
};

export type ZoneStatus = "draft" | "in_review";

export type ZoneBook = {
  authorId: string;
  status: ZoneStatus;
  draft: ZoneShape[];
  published: ZoneShape[];
  versions: ZoneShape[][];
};

export type ZoneIssue = { level: "error" | "warn"; zoneId: string; message: string };

export type ActivityPoint = {
  id: string;
  kind: "driver" | "trip" | "request" | "queue" | "demand_hour" | "demand_7d";
  name: string;
  lat: number;
  lng: number;
  online: boolean;
  stale?: boolean;
  weight?: number;
};

export const RIDE_CATEGORIES = ["economy", "comfort", "premium", "priority", "xl", "electric", "pet"];
export const RIDE_OPTIONS = ["baby_seat", "child_seat", "booster_seat", "extra_bags", "pet"];
/** Owner Q7 FINAL: no Swish, Klarna or PayPal. */
export const ZONE_PAYMENT_METHODS = ["card", "apple", "google", "cash", "wallet"];

const DEFAULT_PRIORITY: Record<ZoneKind, number> = {
  service: 10,
  operating: 20,
  airport: 40,
  boost: 60,
  event: 70,
  no_pickup: 100,
  restricted: 90,
  fleet: 50,
  pickup: 110,
};

function rect(south: number, west: number, north: number, east: number): [number, number][] {
  return [
    [south, west],
    [south, east],
    [north, east],
    [north, west],
  ];
}

export function makeZone(input: Pick<ZoneShape, "id" | "code" | "name" | "kind" | "points"> & Partial<ZoneShape>): ZoneShape {
  const airport = input.kind === "airport";
  return {
    parentId: input.kind === "service" ? null : "svc-stockholm",
    country: "SE",
    city: "stockholm",
    marketZoneId: "",
    goLiveAt: "",
    crossPrice: "pickup",
    leaveZone: true,
    otherCities: false,
    notes: "",
    color: ZONE_COLOR[input.kind],
    priority: DEFAULT_PRIORITY[input.kind],
    archived: false,
    active: true,
    categories: [...RIDE_CATEGORIES],
    options: [...RIDE_OPTIONS],
    paymentMethods: [...ZONE_PAYMENT_METHODS],
    cash: false,
    pinRequired: airport,
    pickupOnly: false,
    minAppVersion: "1.0.0",
    suspendedUntil: "",
    suspendReason: "",
    priceSet: "price-3",
    zoneFeeOre: airport ? 4500 : 0,
    airportFeeOre: airport ? 4500 : 0,
    boostRule: input.kind === "boost" ? "Friday 16:00–19:00 ×1.4" : "",
    searchRadiusKm: 5,
    offerSeconds: 8.5,
    nextTripKm: 30,
    destinationMode: false,
    maxWaitMin: 5,
    queueOn: airport,
    maxQueueMin: airport ? 45 : 0,
    queueFeeOre: airport ? 4500 : 0,
    terminals: "",
    schedule: "always",
    hours: "00:00–24:00",
    from: "",
    until: "",
    ...input,
    holes: input.holes ?? [],
    pickups: (input.pickups ?? []).map((pickup) => ({ ...pickup, photoUrl: pickup.photoUrl ?? "" })),
    queuePolygon: input.queuePolygon ?? (airport && input.points.length >= 3 ? [...input.points] : []),
    pickupArea: input.pickupArea ?? [],
    noStopLines: input.noStopLines ?? [],
  };
}

export function zoneStatus(zone: ZoneShape, book: ZoneBook): "Archived" | "In review" | "Draft" | "Published" {
  if (zone.archived) return "Archived";
  if (book.status === "in_review") return "In review";
  const published = book.published.find((item) => item.id === zone.id);
  if (!published) return "Draft";
  return JSON.stringify(published) === JSON.stringify(zone) ? "Published" : "Draft";
}

export function zoneTypeLabel(kind: ZoneKind): string {
  return trx(ZONE_TYPES.find((item) => item.id === kind)?.label ?? kind);
}

/** Greater Stockholm, 9 operating zones, Arlanda and Bromma — the 12 areas — plus one of each other type. */
export function stockholmZones(): ZoneShape[] {
  const operating: Array<[string, string, string, number, number, number, number, string]> = [
    ["op-norrmalm", "NRM", "Norrmalm", 59.325, 18.06, 59.35, 18.11, "Z001"],
    ["op-sodermalm", "SOD", "Södermalm", 59.255, 18.008, 59.318, 18.145, "Z002"],
    ["op-ostermalm", "OST", "Östermalm", 59.325, 18.118, 59.39, 18.185, "Z003"],
    ["op-kungsholmen", "KUN", "Kungsholmen", 59.322, 18.008, 59.355, 18.055, "Z004"],
    ["op-vasastan", "VAS", "Vasastan", 59.358, 18.015, 59.395, 18.1, "Z005"],
    ["op-bromma", "BRO", "Bromma", 59.3, 17.9, 59.345, 18, "Z006"],
    ["op-solna", "SOL", "Solna", 59.4, 17.99, 59.445, 18.055, "Z007"],
    ["op-kista", "KIS", "Kista", 59.4, 17.85, 59.455, 17.97, "Z008"],
    ["op-sodertalje", "SODT", "Södertälje", 59.17, 17.52, 59.23, 17.7, "Z009"],
  ];
  return [
    makeZone({ id: "svc-stockholm", code: "STO", name: "Greater Stockholm", kind: "service", parentId: null, points: rect(59.1, 17.4, 59.8, 18.5) }),
    ...operating.map(([id, code, name, south, west, north, east, marketZoneId]) => makeZone({ id, code, name, kind: "operating", marketZoneId, city: id === "op-sodertalje" ? "sodertalje" : "stockholm", points: rect(south, west, north, east) })),
    makeZone({ id: "air-arlanda", code: "ARN", name: "Arlanda", kind: "airport", marketZoneId: "ARN", terminals: "Terminal 2, Terminal 5", points: rect(59.62, 17.85, 59.68, 17.97) }),
    makeZone({ id: "air-bromma", code: "BMA", name: "Bromma airport", kind: "airport", marketZoneId: "BMA", terminals: "Main terminal", points: rect(59.348, 17.8, 59.378, 17.88) }),
    makeZone({ id: "boost-1", code: "BST", name: "Friday night Stureplan", kind: "boost", points: rect(59.333, 18.072, 59.341, 18.098) }),
    makeZone({ id: "event-1", code: "EVE", name: "Tele2 event", kind: "event", points: rect(59.22, 18.02, 59.248, 18.09) }),
    makeZone({ id: "nopick-1", code: "NOP", name: "Drottninggatan no pickup", kind: "no_pickup", points: rect(59.328, 18.068, 59.331, 18.09) }),
    makeZone({ id: "restricted-1", code: "DEP", name: "Depot", kind: "restricted", points: rect(59.3, 18.19, 59.32, 18.23) }),
    makeZone({ id: "fleet-1", code: "FLT", name: "Partner north", kind: "fleet", points: rect(59.46, 18, 59.505, 18.07) }),
    makeZone({ id: "pin-t5", code: "T5", name: "Terminal 5", kind: "pickup", parentId: "air-arlanda", points: [[59.651, 17.922]] }),
  ];
}

/** Grand Paris: eight operating zones and two airports. */
export function parisZones(): ZoneShape[] {
  const base = { country: "FR" as const, city: "paris", parentId: "svc-paris", zoneFeeOre: 0 };
  const operating: Array<[string, string, string, [number, number][]]> = [
    ["FR-PC", "PC", "Paris Centre", rect(48.85, 2.33, 48.868, 2.362)],
    ["FR-RG", "RG", "Rive Gauche", rect(48.83, 2.29, 48.8495, 2.329)],
    ["FR-OCE", "OCE", "Opéra–Champs-Élysées", rect(48.8685, 2.29, 48.882, 2.345)],
    ["FR-MN", "MN", "Montmartre–Nord", rect(48.8825, 2.33, 48.9, 2.375)],
    ["FR-BE", "BE", "Bastille–Est", rect(48.84, 2.3625, 48.868, 2.41)],
    ["FR-LD", "LD", "La Défense", rect(48.882, 2.215, 48.902, 2.26)],
    ["FR-SD", "SD", "Saint-Denis", rect(48.922, 2.33, 48.95, 2.385)],
    ["FR-BB", "BB", "Boulogne-Billancourt", rect(48.825, 2.22, 48.848, 2.26)],
  ];
  return [
    makeZone({ id: "svc-paris", code: "PAR", name: "Grand Paris", kind: "service", country: "FR", city: "paris", parentId: null, points: rect(48.7, 2.15, 49.05, 2.65) }),
    ...operating.map(([marketZoneId, code, name, points]) => makeZone({ ...base, id: `op-${marketZoneId.toLowerCase()}`, code: `PAR-${code}`, name, kind: "operating", marketZoneId, points })),
    makeZone({ ...base, id: "air-cdg", code: "CDG", name: "Charles de Gaulle", kind: "airport", marketZoneId: "CDG", terminals: "Terminal 1, Terminal 2E", zoneFeeOre: 500, airportFeeOre: 500, queueFeeOre: 500, points: rect(48.99, 2.51, 49.03, 2.6) }),
    makeZone({ ...base, id: "air-ory", code: "ORY", name: "Orly", kind: "airport", marketZoneId: "ORY", terminals: "Orly 1-2-3-4", zoneFeeOre: 500, airportFeeOre: 500, queueFeeOre: 500, points: rect(48.715, 2.34, 48.74, 2.39) }),
  ];
}

/** Grand Tunis: eight operating zones and Tunis-Carthage airport. */
export function tunisZones(): ZoneShape[] {
  const base = { country: "TN" as const, city: "tunis", parentId: "svc-tunis", zoneFeeOre: 0 };
  const operating: Array<[string, string, string, [number, number][]]> = [
    ["TN-TC", "TC", "Tunis Centre", rect(36.785, 10.155, 36.815, 10.2)],
    ["TN-LAC", "LAC", "Les Berges du Lac", rect(36.822, 10.215, 36.845, 10.26)],
    ["TN-LM", "LM", "La Marsa", rect(36.872, 10.31, 36.895, 10.345)],
    ["TN-CAR", "CAR", "Carthage", rect(36.84, 10.305, 36.8635, 10.335)],
    ["TN-SBS", "SBS", "Sidi Bou Saïd", rect(36.8636, 10.336, 36.8719, 10.355)],
    ["TN-LG", "LG", "La Goulette", rect(36.805, 10.285, 36.8395, 10.32)],
    ["TN-AR", "AR", "Ariana", rect(36.85, 10.17, 36.885, 10.2049)],
    ["TN-BA", "BA", "Ben Arous", rect(36.735, 10.2, 36.77, 10.25)],
  ];
  return [
    makeZone({ id: "svc-tunis", code: "TUN", name: "Grand Tunis", kind: "service", country: "TN", city: "tunis", parentId: null, points: rect(36.7, 10.05, 36.95, 10.4) }),
    ...operating.map(([marketZoneId, code, name, points]) => makeZone({ ...base, id: `op-${marketZoneId.toLowerCase()}`, code: `TUN-${code}`, name, kind: "operating", marketZoneId, cash: true, points })),
    makeZone({ ...base, id: "air-tun", code: "TUN-AIR", name: "Tunis-Carthage", kind: "airport", marketZoneId: "TUN", terminals: "Main terminal", zoneFeeOre: 3000, airportFeeOre: 3000, queueFeeOre: 3000, cash: true, points: rect(36.846, 10.205, 36.862, 10.245) }),
  ];
}

/** Every country's zones: Stockholm, Paris and Tunis. */
export function seedZones(): ZoneShape[] {
  return [...stockholmZones(), ...parisZones(), ...tunisZones()];
}

export function coreZones(zones: readonly ZoneShape[]): ZoneShape[] {
  return zones.filter((item) => item.kind === "service" || item.kind === "operating" || item.kind === "airport");
}

function cloneZones(zones: ZoneShape[]): ZoneShape[] {
  return JSON.parse(JSON.stringify(zones)) as ZoneShape[];
}

export function emptyBook(authorId = "nora"): ZoneBook {
  const seed = seedZones();
  return { authorId, status: "draft", draft: seed, published: cloneZones(seed), versions: [cloneZones(seed)] };
}

function normalizePickup(raw: Partial<PickupPoint>): PickupPoint {
  return {
    id: raw.id ?? `pin-${Math.random().toString(16).slice(2)}`,
    name: raw.name ?? "Pickup",
    lat: Number(raw.lat) || 0,
    lng: Number(raw.lng) || 0,
    instructions: raw.instructions ?? "",
    photoUrl: raw.photoUrl ?? "",
  };
}

function normalizeZone(raw: ZoneShape): ZoneShape {
  return makeZone({
    ...raw,
    color: raw.color ?? ZONE_COLOR[raw.kind],
    priority: Number.isFinite(raw.priority) ? raw.priority : DEFAULT_PRIORITY[raw.kind],
    options: Array.isArray(raw.options) ? raw.options : [...RIDE_OPTIONS],
    paymentMethods: Array.isArray(raw.paymentMethods) ? raw.paymentMethods.filter((method: unknown) => ZONE_PAYMENT_METHODS.includes(method as string)) : [...ZONE_PAYMENT_METHODS],
    pickupOnly: raw.pickupOnly ?? false,
    pickups: (raw.pickups ?? []).map((pickup) => normalizePickup(pickup)),
    queuePolygon: raw.queuePolygon ?? (raw.kind === "airport" ? [...raw.points] : []),
    pickupArea: raw.pickupArea ?? [],
  });
}

export function normalizeZoneBook(raw: ZoneBook): ZoneBook {
  const normalize = (zones: ZoneShape[]) => zones.map((item) => normalizeZone(item));
  return {
    ...raw,
    status: raw.status === "in_review" ? "in_review" : "draft",
    draft: normalize(raw.draft ?? []),
    published: normalize(raw.published ?? []),
    versions: (raw.versions ?? []).map((version) => normalize(version)),
  };
}

export function updateDraft(book: ZoneBook, zoneId: string, points: [number, number][], authorId: string): ZoneBook {
  return setOuter(book, zoneId, points, authorId, false);
}

export function setOuter(book: ZoneBook, zoneId: string, points: [number, number][], authorId: string, keepHoles: boolean): ZoneBook {
  return {
    ...book,
    authorId,
    status: "draft",
    draft: book.draft.map((item) => (item.id === zoneId ? { ...item, points, holes: keepHoles ? item.holes : [] } : item)),
  };
}

export function addHole(book: ZoneBook, zoneId: string, hole: [number, number][], authorId: string): { book: ZoneBook; error?: string } {
  const zone = book.draft.find((item) => item.id === zoneId);
  const outer = zone ? asPolygon(zone, false) : null;
  const inner = polygon([closedRing(hole)]);
  if (!zone || !outer || hole.length < 3) return { book, error: "A hole needs at least 3 points inside the zone." };
  if (kinks(inner).features.length > 0) return { book, error: "The hole crosses itself." };
  if (!booleanWithin(inner, outer)) return { book, error: "The hole must sit inside the zone." };
  return {
    book: {
      ...book,
      authorId,
      status: "draft",
      draft: book.draft.map((item) => (item.id === zoneId ? { ...item, holes: [...item.holes, hole] } : item)),
    },
  };
}

export function patchZone(book: ZoneBook, zoneId: string, patch: Partial<ZoneShape>, authorId: string): ZoneBook {
  return {
    ...book,
    authorId,
    status: "draft",
    draft: book.draft.map((item) => (item.id === zoneId ? { ...item, ...patch, id: item.id } : item)),
  };
}

export function createZone(book: ZoneBook, authorId: string): { book: ZoneBook; id: string } {
  const id = `zone-${book.draft.length + 1}`;
  const created = makeZone({ id, code: `N${book.draft.length + 1}`, name: "New zone", kind: "operating", points: [] });
  return {
    id,
    book: { ...book, authorId, status: "draft", draft: [...book.draft, created] },
  };
}

export function archiveZone(book: ZoneBook, zoneId: string, authorId: string): ZoneBook {
  return patchZone(book, zoneId, { archived: true, active: false }, authorId);
}

export function addPickup(book: ZoneBook, zoneId: string, pickup: PickupPoint, authorId: string): ZoneBook {
  return {
    ...book,
    authorId,
    status: "draft",
    draft: book.draft.map((item) => (item.id === zoneId ? { ...item, pickups: [...item.pickups, pickup] } : item)),
  };
}

export function restoreZone(book: ZoneBook, zoneId: string, versionIndex: number, authorId: string): { book: ZoneBook; error?: string } {
  const snapshot = book.versions[versionIndex]?.find((item) => item.id === zoneId);
  if (!snapshot) return { book, error: "That version has no such zone." };
  return {
    book: patchZone(book, zoneId, { ...snapshot, id: zoneId }, authorId),
  };
}

function closedRing(points: [number, number][]): [number, number][] {
  const ring = points.map(([lat, lng]) => [lng, lat] as [number, number]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!first || !last) return ring;
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
  return ring;
}

function asPolygon(zone: ZoneShape, withHoles: boolean) {
  const ring = closedRing(zone.points);
  if (ring.length < 4) return null;
  const holes = withHoles ? zone.holes.map((hole) => closedRing(hole)).filter((hole) => hole.length >= 4) : [];
  return polygon([ring, ...holes]);
}

export function zoneAreaKm(zone: ZoneShape): number {
  const shape = asPolygon(zone, true);
  if (!shape) return 0;
  return area(shape) / 1_000_000;
}

function orientation(a: [number, number], b: [number, number], c: [number, number]): number {
  const value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
  if (Math.abs(value) < 1e-12) return 0;
  return value > 0 ? 1 : -1;
}

function properSegmentCross(a: [number, number], b: [number, number], c: [number, number], d: [number, number]): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4;
}

function polygonEdges(points: [number, number][]): Array<[[number, number], [number, number]]> {
  return points.map((pointA, index) => [pointA, points[(index + 1) % points.length] ?? pointA]);
}

function polygonsOverlapArea(
  left: ZoneShape,
  right: ZoneShape,
  leftShape: NonNullable<ReturnType<typeof asPolygon>>,
  rightShape: NonNullable<ReturnType<typeof asPolygon>>,
): boolean {
  if (!booleanIntersects(leftShape, rightShape)) return false;
  // Shapes that share area (also identical or nested ones with shared borders); touching borders is fine.
  const shared = intersect(featureCollection([leftShape, rightShape]));
  if (shared && area(shared) > 1000) return true;
  if (left.points.some(([lat, lng]) => booleanWithin(point([lng, lat]), rightShape))) return true;
  if (right.points.some(([lat, lng]) => booleanWithin(point([lng, lat]), leftShape))) return true;
  for (const [a, b] of polygonEdges(left.points)) {
    for (const [c, d] of polygonEdges(right.points)) {
      if (properSegmentCross(a, b, c, d)) return true;
    }
  }
  return false;
}

export function validateZones(zones: ZoneShape[]): ZoneIssue[] {
  const issues: ZoneIssue[] = [];
  const live = zones.filter((item) => !item.archived);
  const service = live.filter((item) => item.kind === "service").map((item) => ({ item, shape: asPolygon(item, false) }));
  const operating = live.filter((item) => item.kind === "operating");

  for (const item of live) {
    if (item.kind === "pickup") {
      if (item.points.length < 1) issues.push({ level: "error", zoneId: item.id, message: `${item.name} needs a point.` });
      continue;
    }
    if (item.points.length < 3) {
      issues.push({ level: "error", zoneId: item.id, message: `${item.name} needs at least 3 points.` });
      continue;
    }
    const shape = asPolygon(item, false);
    if (!shape) {
      issues.push({ level: "error", zoneId: item.id, message: `${item.name} is not a closed polygon.` });
      continue;
    }
    if (kinks(shape).features.length > 0) {
      issues.push({ level: "error", zoneId: item.id, message: `${item.name} crosses itself.` });
      continue;
    }
    for (const hole of item.holes) {
      const inner = polygon([closedRing(hole)]);
      if (hole.length < 3 || kinks(inner).features.length > 0 || !booleanWithin(inner, shape)) {
        issues.push({ level: "error", zoneId: item.id, message: `${item.name} has a hole outside the shape.` });
      }
    }
    for (const [label, boundary] of [["queue polygon", item.queuePolygon], ["pickup area", item.pickupArea]] as const) {
      if (boundary.length === 0) continue;
      if (boundary.length < 3) {
        issues.push({ level: "error", zoneId: item.id, message: `${item.name} ${label} needs at least 3 points.` });
        continue;
      }
      const child = polygon([closedRing(boundary)]);
      if (kinks(child).features.length > 0 || !booleanWithin(child, shape)) {
        issues.push({ level: "error", zoneId: item.id, message: `${item.name} ${label} must stay inside the zone.` });
      }
    }
    if (item.schedule === "weekly" && !item.hours.trim()) {
      issues.push({ level: "error", zoneId: item.id, message: `${item.name} weekly schedule needs hours.` });
    }
    if (item.schedule === "range" && (!item.from.trim() || !item.until.trim())) {
      issues.push({ level: "error", zoneId: item.id, message: `${item.name} date range needs from and until.` });
    }
    const squareKm = zoneAreaKm(item);
    if (item.kind === "service" && squareKm > 500) {
      issues.push({ level: "warn", zoneId: item.id, message: `${item.name} is the service area.` });
    } else if (squareKm > 500) {
      issues.push({ level: "warn", zoneId: item.id, message: `${item.name} is ${squareKm.toFixed(0)} km². Check it is not larger than intended.` });
    }
    if (squareKm < 0.01) issues.push({ level: "warn", zoneId: item.id, message: `${item.name} is under 0.01 km².` });
    if (item.points.length > 1000) issues.push({ level: "warn", zoneId: item.id, message: `${item.name} has more than 1,000 points.` });
    const city = cityById(item.city);
    if (item.kind === "operating") {
      // Only service areas around this zone's city count; a city without one (a new launch) has no such rule yet.
      const around = service.filter((entry) => entry.item.country === item.country && entry.shape && (!city || booleanWithin(point([city.center[1], city.center[0]]), entry.shape)));
      const inside = around.some((entry) => entry.shape && booleanWithin(shape, entry.shape));
      if (around.length && !inside) issues.push({ level: "error", zoneId: item.id, message: `${item.name} is outside the service area.` });
    }
    if (city && item.kind !== "service" && item.kind !== "airport" && !booleanWithin(shape, polygon([closedRing(city.outline)]))) {
      issues.push({ level: "warn", zoneId: item.id, message: `${item.name} goes outside ${city.name}.` });
    }
  }

  for (let i = 0; i < operating.length; i += 1) {
    for (let j = i + 1; j < operating.length; j += 1) {
      const left = operating[i];
      const right = operating[j];
      if (!left || !right) continue;
      const a = asPolygon(left, false);
      const b = asPolygon(right, false);
      if (!a || !b || left.points.length < 3 || right.points.length < 3) continue;
      if (kinks(a).features.length > 0 || kinks(b).features.length > 0) continue;
      if (polygonsOverlapArea(left, right, a, b)) {
        issues.push({ level: "error", zoneId: left.id, message: `${left.name} overlaps ${right.name}. Operating zones cannot overlap.` });
      }
    }
  }
  return issues;
}

export function zonesAt(zones: ZoneShape[], lat: number, lng: number): ZoneShape[] {
  const probe = point([lng, lat]);
  return zones.filter((item) => {
    if (item.archived) return false;
    if (item.kind === "pickup") {
      return item.points.some(([zoneLat, zoneLng]) => Math.abs(zoneLat - lat) < 0.002 && Math.abs(zoneLng - lng) < 0.002);
    }
    const shape = asPolygon(item, false);
    if (!shape || item.points.length < 3 || kinks(shape).features.length > 0) return false;
    return booleanWithin(probe, shape);
  });
}

function blocking(zones: ZoneShape[]): ZoneIssue | undefined {
  return validateZones(zones).find((issue) => issue.level === "error");
}

export function submitReview(book: ZoneBook, actorId: string): { book: ZoneBook; error?: string } {
  const issue = blocking(book.draft);
  if (issue) return { book, error: issue.message };
  const issues = validateZones(book.draft);
  for (const item of book.draft) {
    if (item.archived || item.kind === "pickup") continue;
    const before = book.published.find((entry) => entry.id === item.id);
    if (before && JSON.stringify(before) === JSON.stringify(item)) continue;
    const missing = launchChecklist(item, issues).find((entry) => entry.required && !entry.ok);
    if (missing) return { book, error: `${displayName(item)}: ${missing.label.toLowerCase()} missing.` };
  }
  return { book: { ...book, authorId: actorId, status: "in_review" } };
}

export function publishZones(book: ZoneBook, actorId: string): { book: ZoneBook; error?: string } {
  if (book.status !== "in_review") return { book, error: "Send the draft for review before publishing." };
  if (actorId === book.authorId) return { book, error: "A second agent must publish." };
  const issue = blocking(book.draft);
  if (issue) return { book, error: issue.message };
  const snapshot = cloneZones(book.draft);
  return { book: { ...book, authorId: actorId, status: "draft", published: snapshot, versions: [...book.versions, snapshot] } };
}

export function rollbackZones(book: ZoneBook, actorId = book.authorId): ZoneBook {
  if (book.versions.length < 2) return book;
  const previous = book.versions[book.versions.length - 2] ?? [];
  const snapshot = cloneZones(previous);
  return {
    ...book,
    authorId: actorId,
    status: "draft",
    published: snapshot,
    draft: cloneZones(snapshot),
    versions: [...book.versions, cloneZones(snapshot)],
  };
}

export type ZoneImpact = {
  areaKm: number;
  deltaKm: number;
  drivers: number;
  trips: number;
  reservations: number;
  feeChanges: string[];
};

let activityCache: ActivityPoint[] | null = null;

export function activityPoints(): ActivityPoint[] {
  activityCache ??= buildActivity();
  return activityCache;
}

function buildActivity(): ActivityPoint[] {
  const points: ActivityPoint[] = [
    { id: "drv-1", kind: "driver", name: "Erik Lind", lat: 59.335, lng: 18.06, online: true },
    { id: "drv-2", kind: "driver", name: "Sara Berg", lat: 59.31, lng: 18.06, online: true, stale: true },
    { id: "drv-3", kind: "driver", name: "Noah Ek", lat: 59.34, lng: 18.1, online: true },
    { id: "drv-4", kind: "driver", name: "Maja Holm", lat: 59.332, lng: 18.02, online: false },
    { id: "drv-5", kind: "driver", name: "Lars Dahl", lat: 59.355, lng: 18.05, online: true },
    { id: "drv-6", kind: "driver", name: "Ingrid Sand", lat: 59.335, lng: 17.93, online: true },
    { id: "trip-1", kind: "trip", name: "T0001", lat: 59.336, lng: 18.064, online: true },
    { id: "trip-2", kind: "trip", name: "T0008", lat: 59.338, lng: 18.095, online: true },
    { id: "trip-3", kind: "trip", name: "T0014", lat: 59.648, lng: 17.91, online: true, stale: true },
    { id: "res-1", kind: "trip", name: "B0003", lat: 59.348, lng: 18.04, online: true },
    { id: "req-1", kind: "request", name: "Open request 1", lat: 59.337, lng: 18.08, online: true },
    { id: "req-2", kind: "request", name: "Open request 2", lat: 59.316, lng: 18.07, online: true },
    { id: "q-1", kind: "queue", name: "Queue 1", lat: 59.64, lng: 17.9, online: true },
    { id: "q-2", kind: "queue", name: "Queue 2", lat: 59.655, lng: 17.93, online: true },
    { id: "q-3", kind: "queue", name: "Queue 3", lat: 59.358, lng: 17.85, online: true },
  ];
  for (const [prefix, lat, lng, names] of [
    ["fr", 48.862, 2.34, ["Camille Petit", "Hugo Martin", "Léa Bernard", "Lucas Dubois", "Chloé Moreau", "Nathan Laurent", "Inès Simon"]],
    ["tn", 36.82, 10.22, ["Sami Ben Ali", "Yasmine Trabelsi", "Mehdi Gharbi", "Amira Jebali", "Karim Mansour", "Nour Hammami"]],
  ] as const) {
    names.forEach((name, index) => {
      const angle = index * 2.4;
      points.push({ id: `drv-${prefix}-${index}`, kind: "driver", name, lat: lat + Math.sin(angle) * 0.02 * (1 + (index % 3) / 2), lng: lng + Math.cos(angle) * 0.03 * (1 + (index % 3) / 2), online: index % 5 !== 4 });
    });
    for (let index = 0; index < 4; index += 1) {
      points.push({ id: `req-${prefix}-${index}`, kind: "request", name: `Open request ${index + 1}`, lat: lat + (index - 1.5) * 0.008, lng: lng + (index % 2 ? 0.012 : -0.01), online: true });
      points.push({ id: `trip-${prefix}-${index}`, kind: "trip", name: `T-${prefix.toUpperCase()}${index + 1}`, lat: lat - (index - 1.5) * 0.009, lng: lng + (index - 1.5) * 0.015, online: true });
    }
    for (let index = 0; index < 20; index += 1) {
      points.push({ id: `d7-${prefix}-${index}`, kind: "demand_7d", name: "Demand 7 days", lat: lat - 0.03 + (index % 5) * 0.014, lng: lng - 0.05 + Math.floor(index / 5) * 0.03, online: true, weight: 1 + (index % 5) });
      points.push({ id: `d1-${prefix}-${index}`, kind: "demand_hour", name: "Demand last hour", lat: lat - 0.02 + (index % 5) * 0.01, lng: lng - 0.03 + Math.floor(index / 5) * 0.02, online: true, weight: 1 + (index % 4) });
    }
  }
  for (let index = 0; index < 18; index += 1) {
    points.push({
      id: `d1-${index}`,
      kind: "demand_hour",
      name: "Demand last hour",
      lat: 59.31 + (index % 6) * 0.012,
      lng: 18.02 + Math.floor(index / 6) * 0.03,
      online: true,
      weight: 1 + (index % 4),
    });
  }
  for (let index = 0; index < 24; index += 1) {
    points.push({
      id: `d7-${index}`,
      kind: "demand_7d",
      name: "Demand 7 days",
      lat: 59.29 + (index % 8) * 0.015,
      lng: 17.98 + Math.floor(index / 8) * 0.045,
      online: true,
      weight: 1 + (index % 5),
    });
  }
  return points;
}

function countInside(zones: ZoneShape[], kind: ActivityPoint["kind"]): number {
  return activityPoints().filter((item) => item.kind === kind && zonesAt(zones, item.lat, item.lng).length > 0).length;
}

function serviceKm(zones: ZoneShape[]): number {
  const service = zones.find((item) => item.kind === "service" && !item.archived);
  return service ? zoneAreaKm(service) : 0;
}

export function zoneImpact(allPublished: ZoneShape[], allDraft: ZoneShape[], country: MarketId = "SE"): ZoneImpact {
  const published = allPublished.filter((item) => item.country === country);
  const draft = allDraft.filter((item) => item.country === country);
  const before = serviceKm(published);
  const after = serviceKm(draft);
  const feeChanges = draft.flatMap((item) => {
    const previous = published.find((zone) => zone.id === item.id);
    if (!previous || previous.zoneFeeOre === item.zoneFeeOre) return [];
    return [`${item.name} ${previous.zoneFeeOre / 100} kr → ${item.zoneFeeOre / 100} kr`];
  });
  const reservations = activityPoints().filter((item) => item.id.startsWith("res-") && zonesAt(draft, item.lat, item.lng).length > 0).length;
  return {
    areaKm: after,
    deltaKm: after - before,
    drivers: activityPoints().filter((item) => item.kind === "driver" && item.online && zonesAt(draft, item.lat, item.lng).length > 0).length,
    trips: countInside(draft, "trip") - reservations,
    reservations,
    feeChanges,
  };
}

export function zonesToGeoJSON(zones: ZoneShape[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const item of zones) {
    if (item.archived) continue;
    const color = item.color || ZONE_COLOR[item.kind];
    if (item.kind === "pickup") {
      const [lat, lng] = item.points[0] ?? [59.33, 18.06];
      features.push({ type: "Feature", properties: { id: item.id, name: item.name, kind: item.kind, color }, geometry: { type: "Point", coordinates: [lng, lat] } });
      continue;
    }
    if (item.points.length < 3) continue;
    const holes = item.holes.map((hole) => closedRing(hole)).filter((hole) => hole.length >= 4);
    features.push({
      type: "Feature",
      properties: { id: item.id, name: item.name, kind: item.kind, color },
      geometry: { type: "Polygon", coordinates: [closedRing(item.points), ...holes] },
    });
  }
  return { type: "FeatureCollection", features };
}

export function geoJSONToZones(raw: string, book: ZoneBook, authorId: string): { book: ZoneBook; error?: string } {
  let parsed: GeoJSON.FeatureCollection;
  try {
    parsed = JSON.parse(raw) as GeoJSON.FeatureCollection;
  } catch {
    return { book, error: "That file is not JSON." };
  }
  if (!parsed || parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    return { book, error: "GeoJSON must be a FeatureCollection." };
  }
  const draft = book.draft.map((item) => ({ ...item }));
  for (const feature of parsed.features) {
    if (feature.type !== "Feature" || !feature.geometry) continue;
    const name = String(feature.properties?.name ?? "");
    const target = draft.find((item) => item.name === name || item.id === feature.properties?.id);
    if (!target) continue;
    if (feature.geometry.type === "Point") {
      const [lng, lat] = feature.geometry.coordinates;
      target.points = [[lat ?? 0, lng ?? 0]];
    }
    if (feature.geometry.type === "Polygon") {
      const rings = feature.geometry.coordinates;
      const outer = rings[0];
      if (!outer) continue;
      target.points = outer.slice(0, -1).map(([lng, lat]) => [lat ?? 0, lng ?? 0]);
      target.holes = rings.slice(1).map((ring) => ring.slice(0, -1).map(([lng, lat]) => [lat ?? 0, lng ?? 0]));
    }
  }
  return { book: { ...book, authorId, status: "draft", draft } };
}


type RectBounds = { south: number; west: number; north: number; east: number };

function rectBounds(points: [number, number][]): RectBounds | null {
  if (points.length !== 4) return null;
  const lats = [...new Set(points.map(([lat]) => Number(lat.toFixed(8))))].sort((a, b) => a - b);
  const lngs = [...new Set(points.map(([, lng]) => Number(lng.toFixed(8))))].sort((a, b) => a - b);
  if (lats.length !== 2 || lngs.length !== 2) return null;
  const combos = new Set(points.map(([lat, lng]) => `${Number(lat.toFixed(8))}:${Number(lng.toFixed(8))}`));
  for (const lat of lats) for (const lng of lngs) if (!combos.has(`${lat}:${lng}`)) return null;
  return { south: lats[0]!, north: lats[1]!, west: lngs[0]!, east: lngs[1]! };
}

export function splitZone(book: ZoneBook, zoneId: string, authorId: string): { book: ZoneBook; newId?: string; error?: string } {
  const source = book.draft.find((item) => item.id === zoneId);
  if (!source || source.kind === "pickup") return { book, error: "Select a polygon zone to split." };
  if (source.queuePolygon.length > 0 || source.pickupArea.length > 0) {
    return { book, error: "Clear or redraw queue and pickup subareas before splitting this zone." };
  }
  const bounds = rectBounds(source.points);
  if (!bounds) return { book, error: "Split currently requires a rectangular zone. Use Edit points to make the boundary rectangular first." };
  const latSpan = bounds.north - bounds.south;
  const lngSpan = bounds.east - bounds.west;
  const splitVertical = lngSpan >= latSpan;
  const newId = `${source.id}-split-${book.draft.filter((item) => item.id.startsWith(`${source.id}-split-`)).length + 1}`;
  const first = splitVertical
    ? rect(bounds.south, bounds.west, bounds.north, (bounds.west + bounds.east) / 2)
    : rect(bounds.south, bounds.west, (bounds.south + bounds.north) / 2, bounds.east);
  const second = splitVertical
    ? rect(bounds.south, (bounds.west + bounds.east) / 2, bounds.north, bounds.east)
    : rect((bounds.south + bounds.north) / 2, bounds.west, bounds.north, bounds.east);
  const sibling = normalizeZone({
    ...source,
    id: newId,
    code: `${source.code}-B`,
    name: `${source.name} B`,
    points: second,
    holes: [],
    pickups: [],
  });
  return {
    newId,
    book: {
      ...book,
      authorId,
      status: "draft",
      draft: [
        ...book.draft.map((item) => item.id === source.id ? { ...item, name: `${source.name} A`, code: `${source.code}-A`, points: first, holes: [] } : item),
        sibling,
      ],
    },
  };
}

export function mergeZones(book: ZoneBook, targetId: string, sourceId: string, authorId: string): { book: ZoneBook; error?: string } {
  if (targetId === sourceId) return { book, error: "Choose two different zones." };
  const target = book.draft.find((item) => item.id === targetId);
  const source = book.draft.find((item) => item.id === sourceId);
  if (!target || !source || target.kind === "pickup" || source.kind === "pickup") return { book, error: "Both merge targets must be polygon zones." };
  if (target.kind !== source.kind) return { book, error: "Merge requires zones of the same type." };
  if (target.queuePolygon.length > 0 || target.pickupArea.length > 0 || source.queuePolygon.length > 0 || source.pickupArea.length > 0) {
    return { book, error: "Clear or redraw queue and pickup subareas before merging these zones." };
  }
  const a = rectBounds(target.points);
  const b = rectBounds(source.points);
  if (!a || !b) return { book, error: "Merge currently requires rectangular zones." };
  const combined = {
    south: Math.min(a.south, b.south),
    west: Math.min(a.west, b.west),
    north: Math.max(a.north, b.north),
    east: Math.max(a.east, b.east),
  };
  const areaA = (a.north - a.south) * (a.east - a.west);
  const areaB = (b.north - b.south) * (b.east - b.west);
  const overlap = Math.max(0, Math.min(a.north, b.north) - Math.max(a.south, b.south))
    * Math.max(0, Math.min(a.east, b.east) - Math.max(a.west, b.west));
  const unionArea = areaA + areaB - overlap;
  const combinedArea = (combined.north - combined.south) * (combined.east - combined.west);
  if (Math.abs(unionArea - combinedArea) > 1e-8) {
    return { book, error: "These rectangles do not form one rectangle. Edit the boundaries before merging." };
  }
  return {
    book: {
      ...book,
      authorId,
      status: "draft",
      draft: book.draft.map((item) => {
        if (item.id === target.id) {
          return {
            ...item,
            points: rect(combined.south, combined.west, combined.north, combined.east),
            holes: [],
            priority: Math.max(target.priority, source.priority),
            notes: [target.notes, `Merged from ${source.name} (${source.id})`].filter(Boolean).join(" · "),
          };
        }
        if (item.id === source.id) return { ...item, archived: true, active: false };
        return item;
      }),
    },
  };
}

function rotatePoints(points: [number, number][], degrees: number): [number, number][] {
  if (points.length === 0) return points;
  const centerLat = points.reduce((sum, [lat]) => sum + lat, 0) / points.length;
  const centerLng = points.reduce((sum, [, lng]) => sum + lng, 0) / points.length;
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return points.map(([lat, lng]) => {
    const y = lat - centerLat;
    const x = (lng - centerLng) * Math.cos(centerLat * Math.PI / 180);
    const rx = x * cos - y * sin;
    const ry = x * sin + y * cos;
    return [
      Number((centerLat + ry).toFixed(6)),
      Number((centerLng + rx / Math.cos(centerLat * Math.PI / 180)).toFixed(6)),
    ];
  });
}

export function rotateZone(book: ZoneBook, zoneId: string, degrees: number, authorId: string): ZoneBook {
  const target = book.draft.find((item) => item.id === zoneId);
  if (!target || target.kind === "pickup") return book;
  return patchZone(book, zoneId, {
    points: rotatePoints(target.points, degrees),
    holes: target.holes.map((hole) => rotatePoints(hole, degrees)),
    queuePolygon: rotatePoints(target.queuePolygon, degrees),
    pickupArea: rotatePoints(target.pickupArea, degrees),
  }, authorId);
}

export function priorityZones(zones: ZoneShape[]): ZoneShape[] {
  return zones
    .filter((item) => !item.archived && item.kind !== "service" && item.kind !== "operating" && item.kind !== "pickup")
    .sort((left, right) => right.priority - left.priority || left.name.localeCompare(right.name));
}

export function reorderZonePriorities(book: ZoneBook, orderedIds: string[], authorId: string): ZoneBook {
  const priorities = new Map(orderedIds.map((id, index) => [id, 1000 - index * 10]));
  return {
    ...book,
    authorId,
    status: "draft",
    draft: book.draft.map((item) => priorities.has(item.id) ? { ...item, priority: priorities.get(item.id)! } : item),
  };
}

export function effectiveZonesAt(zones: ZoneShape[], lat: number, lng: number): ZoneShape[] {
  return zonesAt(zones, lat, lng).sort((left, right) => right.priority - left.priority);
}

export function zoneRuleSummary(zone: ZoneShape): string {
  const fees = [zone.zoneFeeOre ? `zone fee ${(zone.zoneFeeOre / 100).toFixed(0)} kr` : "", zone.airportFeeOre ? `airport fee ${(zone.airportFeeOre / 100).toFixed(0)} kr` : ""].filter(Boolean);
  return [
    `price ${zone.priceSet}`,
    fees.join(", "),
    zone.boostRule ? `boost ${zone.boostRule}` : "",
    zone.pickupOnly ? "pickup points only" : "",
    zone.cash ? "cash allowed" : "cash off",
    `priority ${zone.priority}`,
  ].filter(Boolean).join(" · ");
}

function xmlText(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_match, inner: string) => inner)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

function kmlCoordinates(raw: string): [number, number][] {
  return raw
    .trim()
    .split(/\s+/)
    .map((entry) => entry.split(",").map(Number))
    .filter((parts) => Number.isFinite(parts[0]) && Number.isFinite(parts[1]))
    .map(([lng, lat]) => [Number(lat.toFixed(6)), Number(lng.toFixed(6))] as [number, number]);
}

export function kmlToZones(raw: string, book: ZoneBook, authorId: string): { book: ZoneBook; error?: string } {
  if (!/<kml[\s>]/i.test(raw) && !/<Placemark[\s>]/i.test(raw)) return { book, error: "That file is not KML." };
  const placemarks = [...raw.matchAll(/<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/gi)];
  if (placemarks.length === 0) return { book, error: "KML contains no placemarks." };
  const draft = cloneZones(book.draft);
  let changed = 0;
  for (const match of placemarks) {
    const body = match[1] ?? "";
    const name = xmlText(/<name\b[^>]*>([\s\S]*?)<\/name>/i.exec(body)?.[1] ?? "");
    const id = /<Data\s+name=["']id["'][^>]*>[\s\S]*?<value>([\s\S]*?)<\/value>/i.exec(body)?.[1]?.trim() ?? "";
    const target = draft.find((item) => item.id === id || item.name === name);
    if (!target) continue;
    const coords = /<coordinates\b[^>]*>([\s\S]*?)<\/coordinates>/i.exec(body)?.[1];
    if (!coords) continue;
    const points = kmlCoordinates(coords);
    if (/<Point\b/i.test(body)) {
      if (points[0]) {
        target.points = [points[0]];
        changed += 1;
      }
      continue;
    }
    if (points.length >= 4) {
      const first = points[0]!;
      const last = points[points.length - 1]!;
      target.points = first[0] === last[0] && first[1] === last[1] ? points.slice(0, -1) : points;
      target.holes = [];
      changed += 1;
    }
  }
  if (changed === 0) return { book, error: "KML placemarks did not match an existing zone id or name." };
  return { book: { ...book, authorId, status: "draft", draft } };
}

export const ADDRESS_BOOK: { name: string; lat: number; lng: number }[] = [
  { name: "Östermalm, Stockholm", lat: 59.341, lng: 18.095 },
  { name: "Norrmalm, Stockholm", lat: 59.335, lng: 18.062 },
  { name: "Södermalm, Stockholm", lat: 59.312, lng: 18.07 },
  { name: "Arlanda Airport", lat: 59.649, lng: 17.923 },
  { name: "Bromma Airport", lat: 59.358, lng: 17.855 },
  { name: "Södertälje", lat: 59.195, lng: 17.628 },
  { name: "Kista", lat: 59.41, lng: 17.94 },
];


/* ---------- Countries, cities and new zones ---------- */

/** The name shown everywhere: the city first, like "Stockholm · Norrmalm". */
export function displayName(zone: Pick<ZoneShape, "name" | "city" | "named">): string {
  if (zone.named) return zone.name;
  const city = cityById(zone.city);
  if (!city || zone.name.toLowerCase().startsWith(`${city.name.toLowerCase()} · `)) return zone.name;
  return `${city.name} · ${zone.name}`;
}

export function zonesIn(zones: readonly ZoneShape[], country: MarketId): ZoneShape[] {
  return zones.filter((item) => item.country === country);
}

/** A short unique code like STO-KIN from the city code and the name. */
export function suggestCode(city: City, name: string, zones: readonly ZoneShape[]): string {
  const letters = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const short = (letters.length > 1 ? letters.map((word) => word[0]).join("") : (letters[0] ?? "NEW").slice(0, 3)).slice(0, 4) || "NEW";
  const base = `${city.code}-${short}`;
  let code = base;
  for (let index = 2; zones.some((item) => item.code === code); index += 1) code = `${base}${index}`;
  return code;
}

export type NewZone = {
  country: MarketId;
  city: string;
  kind: ZoneKind;
  name: string;
  code: string;
  points: [number, number][];
  holes?: [number, number][][];
  /** Copy prices, categories, payments and dispatch from this zone. */
  copyFrom?: string;
  schedule?: ZoneShape["schedule"];
  hours?: string;
  from?: string;
  until?: string;
  goLiveAt?: string;
};

const COPY_FIELDS = ["categories", "options", "paymentMethods", "cash", "pinRequired", "priceSet", "zoneFeeOre", "airportFeeOre", "searchRadiusKm", "offerSeconds", "nextTripKm", "destinationMode", "maxWaitMin", "crossPrice", "leaveZone", "otherCities", "minAppVersion"] as const;

export function createZoneIn(book: ZoneBook, input: NewZone, authorId: string): { book: ZoneBook; id: string; error?: string } {
  const city = cityById(input.city);
  if (!city || city.country !== input.country) return { book, id: "", error: "Pick the city first." };
  const name = input.name.trim();
  if (!name) return { book, id: "", error: "Give the zone a name." };
  if (!/^[A-Z0-9-]{2,12}$/.test(input.code)) return { book, id: "", error: "The code needs 2–12 capital letters, digits or dashes." };
  if (book.draft.some((item) => item.code === input.code && !item.archived)) return { book, id: "", error: `The code ${input.code} is already used.` };
  if (input.kind !== "pickup" && input.points.length < 3) return { book, id: "", error: "Make the shape first." };
  const service = book.draft.find((item) => {
    if (item.kind !== "service" || item.country !== input.country || item.archived) return false;
    const shape = asPolygon(item, false);
    return Boolean(shape && booleanWithin(point([city.center[1], city.center[0]]), shape));
  });
  const source = input.copyFrom ? book.draft.find((item) => item.id === input.copyFrom) : undefined;
  const copied = source ? Object.fromEntries(COPY_FIELDS.map((field) => [field, JSON.parse(JSON.stringify(source[field]))])) : {};
  let id = `zone-${city.id}-${input.code.toLowerCase()}`;
  for (let index = 2; book.draft.some((item) => item.id === id); index += 1) id = `zone-${city.id}-${input.code.toLowerCase()}-${index}`;
  const created = makeZone({
    ...copied,
    id,
    code: input.code,
    name: name.toLowerCase().startsWith(`${city.name.toLowerCase()} · `) ? name : `${city.name} · ${name}`,
    kind: input.kind,
    country: input.country,
    city: city.id,
    parentId: input.kind === "service" ? null : service?.id ?? null,
    points: input.points,
    holes: input.holes ?? [],
    schedule: input.schedule ?? "always",
    hours: input.hours ?? "00:00–24:00",
    from: input.from ?? "",
    until: input.until ?? "",
    goLiveAt: input.goLiveAt ?? "",
    zoneFeeOre: source ? source.zoneFeeOre : input.kind === "airport" ? 4500 : 0,
  });
  return { id, book: { ...book, authorId, status: "draft", draft: [...book.draft, created] } };
}

/** Delete a zone from the draft. It stays in older versions, so a rollback brings it back. */
export function deleteZone(book: ZoneBook, zoneId: string, authorId: string): { book: ZoneBook; error?: string } {
  const target = book.draft.find((item) => item.id === zoneId);
  if (!target) return { book, error: "Zone not found." };
  if (target.kind === "service" && book.draft.some((item) => item.parentId === target.id && !item.archived)) return { book, error: "Move or delete the zones inside this service area first." };
  return { book: { ...book, authorId, status: "draft", draft: book.draft.filter((item) => item.id !== zoneId && item.parentId !== zoneId) } };
}

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

export type ZoneHealth = { drivers: number; requests: number; trips: number; alert: string | null; tone: "good" | "busy" | "bad" | "quiet" };

export function zoneHealth(target: ZoneShape): ZoneHealth {
  if (target.points.length < 3 || target.kind === "pickup") return { drivers: 0, requests: 0, trips: 0, alert: null, tone: "quiet" };
  const shape = asPolygon(target, false);
  if (!shape || kinks(shape).features.length) return { drivers: 0, requests: 0, trips: 0, alert: "Shape needs fixing", tone: "bad" };
  const inside = activityPoints().filter((item) => booleanWithin(point([item.lng, item.lat]), shape));
  const drivers = inside.filter((item) => item.kind === "driver" && item.online).length;
  const requests = inside.filter((item) => item.kind === "request").length;
  const trips = inside.filter((item) => item.kind === "trip").length;
  if (!target.active) return { drivers, requests, trips, alert: "Switched off", tone: "bad" };
  if (requests > 0 && drivers === 0) return { drivers, requests, trips, alert: "No drivers", tone: "bad" };
  if (requests > drivers) return { drivers, requests, trips, alert: "Busy", tone: "busy" };
  if (drivers + requests + trips === 0) return { drivers, requests, trips, alert: null, tone: "quiet" };
  return { drivers, requests, trips, alert: null, tone: "good" };
}

export type LaunchItem = { id: string; label: string; ok: boolean; required: boolean; hint: string };

/** Green or red list a zone must pass before it goes live. */
export function launchChecklist(target: ZoneShape, allIssues: readonly ZoneIssue[]): LaunchItem[] {
  const issues = allIssues.filter((issue) => issue.zoneId === target.id);
  const city = cityById(target.city);
  const health = zoneHealth(target);
  const scheduleOk = target.schedule === "always" || (target.schedule === "weekly" ? Boolean(target.hours.trim()) : Boolean(target.from && target.until));
  return [
    { id: "shape", label: "Shape is valid", ok: !issues.some((issue) => issue.level === "error"), required: true, hint: issues.find((issue) => issue.level === "error")?.message ?? "No overlap, no crossing lines." },
    { id: "city", label: city ? `Inside ${city.name}` : "Belongs to a city", ok: Boolean(city) && !issues.some((issue) => issue.message.includes("goes outside")), required: false, hint: city ? "The shape stays inside the city." : "Pick the city." },
    { id: "categories", label: "Ride categories", ok: target.categories.length > 0, required: true, hint: `${target.categories.length} on` },
    { id: "payments", label: "Payment methods", ok: target.paymentMethods.length > 0, required: true, hint: `${target.paymentMethods.length} on` },
    { id: "prices", label: "Prices", ok: Boolean(target.priceSet.trim()), required: true, hint: target.priceSet ? `Price set ${target.priceSet}` : "Pick a price set." },
    { id: "hours", label: "Opening hours", ok: scheduleOk, required: true, hint: target.schedule === "always" ? "Always open" : target.schedule === "weekly" ? target.hours : `${target.from} – ${target.until}` },
    { id: "drivers", label: "Enough drivers", ok: health.drivers >= 2 || target.kind !== "operating", required: false, hint: `${health.drivers} online now` },
  ];
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
