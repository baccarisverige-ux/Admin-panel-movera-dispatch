import { LEVEL_COLOR, surgeLevel, type ZoneSurge } from "./surge.ts";

/** GeoJSON for the surge map styles: coloured zones, glow, hexagons, heatmap, labels, rings, bubbles, dots and soft outlines. */

export type SurgeStyle = "zones" | "glow" | "hex" | "heat" | "flat" | "label" | "rings" | "bubbles" | "dots" | "soft";

export const SURGE_STYLES: { id: SurgeStyle; label: string }[] = [
  { id: "zones", label: "Zones" },
  { id: "glow", label: "Glow" },
  { id: "hex", label: "Hexagons" },
  { id: "heat", label: "Heatmap" },
  { id: "flat", label: "Flat hexagons" },
  { id: "label", label: "Label only" },
  { id: "rings", label: "Pulse rings" },
  { id: "bubbles", label: "Bubbles" },
  { id: "dots", label: "Density dots" },
  { id: "soft", label: "Soft outline" },
];

export function isSurgeStyle(value: unknown): value is SurgeStyle {
  return SURGE_STYLES.some((item) => item.id === value);
}

type Point = [lng: number, lat: number];

const KM_LAT = 110.57;
const kmLng = (lat: number) => 111.32 * Math.cos((lat * Math.PI) / 180);

function hash(text: string): number {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

/** An irregular, district-like outline around a zone centre, so zones read as areas, not circles. */
export function zoneOutline(center: [number, number], radiusKm: number, seed: string): Point[] {
  const [lat, lng] = center;
  const h = hash(seed);
  const a = 0.12 + (h % 7) / 100;
  const b = 0.07 + ((h >>> 3) % 5) / 100;
  const phase = (h % 360) * (Math.PI / 180);
  const points: Point[] = [];
  for (let step = 0; step <= 48; step += 1) {
    const angle = (step / 48) * Math.PI * 2;
    const r = radiusKm * (1 + a * Math.sin(angle * 2 + phase) + b * Math.sin(angle * 3 - phase * 1.7));
    points.push([lng + (Math.cos(angle) * r) / kmLng(lat), lat + (Math.sin(angle) * r) / KM_LAT]);
  }
  points[points.length - 1] = points[0];
  return points;
}

function radiusOf(row: ZoneSurge): number {
  return row.airport ? 1.6 : 1.25;
}

export function zonesGeo(rows: readonly ZoneSurge[], selectedId: string | null) {
  return {
    type: "FeatureCollection" as const,
    features: rows.map((row) => ({
      type: "Feature" as const,
      properties: {
        zoneId: row.zoneId,
        color: LEVEL_COLOR[row.level],
        opacity: row.level === "none" ? 0.07 : 0.2 + Math.min(0.28, (row.multiplier - 1) * 0.14),
        source: row.source,
        selected: row.zoneId === selectedId,
      },
      geometry: { type: "Polygon" as const, coordinates: [zoneOutline(row.center, radiusOf(row), row.zoneId)] },
    })),
  };
}

export function glowGeo(rows: readonly ZoneSurge[]) {
  return {
    type: "FeatureCollection" as const,
    features: rows.map((row) => ({
      type: "Feature" as const,
      properties: { zoneId: row.zoneId, color: LEVEL_COLOR[row.level], size: row.level === "none" ? 0.55 : 0.85 + (row.multiplier - 1) * 0.8, strength: row.level === "none" ? 0.28 : 0.78 },
      geometry: { type: "Point" as const, coordinates: [row.center[1], row.center[0]] },
    })),
  };
}

/** One point per zone centre, for the heatmap, pulse rings, bubbles and the "×1.4" labels. */
export function pointsGeo(rows: readonly ZoneSurge[]) {
  return {
    type: "FeatureCollection" as const,
    features: rows.map((row) => ({
      type: "Feature" as const,
      properties: {
        zoneId: row.zoneId,
        color: LEVEL_COLOR[row.level],
        weight: Math.max(0.05, Math.min(1, (row.multiplier - 1) / 2)),
        size: row.level === "none" ? 0.6 : 1 + (row.multiplier - 1) * 0.9,
        label: row.multiplier > 1 ? `×${row.multiplier.toFixed(1)}` : "×1.0",
      },
      geometry: { type: "Point" as const, coordinates: [row.center[1], row.center[0]] },
    })),
  };
}

/** Small dots scattered in each zone: more of them where the surge is higher. Same places every time. */
export function dotsGeo(rows: readonly ZoneSurge[]) {
  const features = [];
  for (const row of rows) {
    const count = row.level === "none" ? 5 : Math.min(60, Math.round(10 + (row.multiplier - 1) * 30));
    const radius = radiusOf(row);
    const [lat, lng] = row.center;
    for (let index = 0; index < count; index += 1) {
      const h = hash(`${row.zoneId}:${index}`);
      const angle = ((h % 3600) / 3600) * Math.PI * 2;
      const distance = Math.sqrt(((h >>> 12) % 1000) / 1000) * radius;
      features.push({
        type: "Feature" as const,
        properties: { zoneId: row.zoneId, color: LEVEL_COLOR[row.level] },
        geometry: { type: "Point" as const, coordinates: [lng + (Math.cos(angle) * distance) / kmLng(lat), lat + (Math.sin(angle) * distance) / KM_LAT] },
      });
    }
  }
  return { type: "FeatureCollection" as const, features };
}

const HEX_KM = 0.3;
const REACH_KM = 2.4;

/**
 * A hexagon grid over every zone. Each cell takes the strongest surge reaching it,
 * fading with distance from the zone centre, so hot spots read at a glance.
 */
export function hexGeo(rows: readonly ZoneSurge[]) {
  if (!rows.length) return { type: "FeatureCollection" as const, features: [] };
  const lat0 = rows.reduce((sum, row) => sum + row.center[0], 0) / rows.length;
  const lng0 = rows.reduce((sum, row) => sum + row.center[1], 0) / rows.length;
  const toKm = ([lat, lng]: [number, number]) => [(lng - lng0) * kmLng(lat0), (lat - lat0) * KM_LAT] as const;
  const toLngLat = (x: number, y: number): Point => [lng0 + x / kmLng(lat0), lat0 + y / KM_LAT];
  const width = Math.sqrt(3) * HEX_KM;
  const seen = new Set<string>();
  const features = [];
  for (const row of rows) {
    const [cx, cy] = toKm(row.center);
    const rMin = Math.floor((cy - REACH_KM) / (1.5 * HEX_KM));
    const rMax = Math.ceil((cy + REACH_KM) / (1.5 * HEX_KM));
    for (let r = rMin; r <= rMax; r += 1) {
      const qMin = Math.floor((cx - REACH_KM) / width - r / 2);
      const qMax = Math.ceil((cx + REACH_KM) / width - r / 2);
      for (let q = qMin; q <= qMax; q += 1) {
        const key = `${q},${r}`;
        if (seen.has(key)) continue;
        const x = width * (q + r / 2);
        const y = 1.5 * HEX_KM * r;
        let best = -1;
        let owner = row.zoneId;
        for (const other of rows) {
          const [ox, oy] = toKm(other.center);
          const reach = other.airport ? REACH_KM * 0.8 : REACH_KM;
          const distance = Math.hypot(x - ox, y - oy);
          if (distance > reach) continue;
          const fade = Math.exp(-((distance / (reach * 0.62)) ** 2));
          const value = (other.multiplier - 1) * fade;
          if (value > best) {
            best = value;
            owner = other.zoneId;
          }
        }
        if (best < 0) continue;
        seen.add(key);
        const texture = best > 0.02 ? ((hash(key) % 100) / 100 - 0.5) * 0.12 : 0;
        const value = Math.max(1, 1 + best + texture);
        const level = surgeLevel(value);
        const corners: Point[] = [];
        for (let corner = 0; corner <= 6; corner += 1) {
          const angle = (Math.PI / 180) * (60 * corner - 30);
          corners.push(toLngLat(x + HEX_KM * 0.94 * Math.cos(angle), y + HEX_KM * 0.94 * Math.sin(angle)));
        }
        features.push({
          type: "Feature" as const,
          properties: { zoneId: owner, color: LEVEL_COLOR[level], height: level === "none" ? 8 : Math.round((value - 1) * 900 + 40), opacity: level === "none" ? 0.18 : 0.8, value: Number(value.toFixed(2)) },
          geometry: { type: "Polygon" as const, coordinates: [corners] },
        });
      }
    }
  }
  return { type: "FeatureCollection" as const, features };
}
