import type * as maplibregl from "maplibre-gl";
import { along } from "./route";
import type { LiveDriver, LiveState } from "./live";

/**
 * Map pins for the live maps: a small top-view car per driver state and a small person for a waiting rider.
 * The icons are SVG drawn to bitmaps at 2× so they stay crisp on retina screens.
 */

export const CAR_COLOR: Record<LiveState, string> = {
  free: "#0ca30c",
  pickup: "#ef8a1f",
  trip: "#2a78d6",
  stale: "#898781",
  sos: "#d03b3b",
};

export const RIDER_COLOR = { waiting: "#d03b3b", offered: "#2a78d6" };

/** Darker shade of a hex colour, for outlines and the roof. */
function shade(hex: string, factor: number): string {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.max(0, Math.min(255, Math.round(((value >> shift) & 255) * factor)));
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, "0")).join("")}`;
}

/** A car seen from above, nose up. `badge` adds the small white person of a rider on board. */
export function carSvg(color: string, badge = false): string {
  const dark = shade(color, 0.72);
  const glass = shade(color, 0.5);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="44" viewBox="0 0 26 44">
  <ellipse cx="13" cy="41" rx="9" ry="2.2" fill="rgba(0,0,0,.18)"/>
  <rect x="1" y="9" width="3.4" height="9" rx="1.5" fill="${dark}"/><rect x="21.6" y="9" width="3.4" height="9" rx="1.5" fill="${dark}"/>
  <rect x="1" y="27" width="3.4" height="9" rx="1.5" fill="${dark}"/><rect x="21.6" y="27" width="3.4" height="9" rx="1.5" fill="${dark}"/>
  <path d="M6 5.5C6 2.5 8.5 1 13 1s7 1.5 7 4.5v31c0 3-2.5 4.5-7 4.5s-7-1.5-7-4.5z" fill="${color}" stroke="${dark}" stroke-width="1.4"/>
  <path d="M7.2 12.5c1.6-1.4 4-2 5.8-2s4.2.6 5.8 2l-1 5.5H8.2z" fill="${glass}"/>
  <path d="M8.2 31.5h9.6l.9 4.2c-1.6 1-3.9 1.4-5.7 1.4s-4.1-.4-5.7-1.4z" fill="${glass}"/>
  <rect x="9" y="2.6" width="8" height="1.6" rx=".8" fill="#fff" opacity=".7"/>
  <rect x="9" y="38.8" width="8" height="1.6" rx=".8" fill="#ffd1d1" opacity=".9"/>
  ${badge ? `<circle cx="13" cy="24.5" r="6.2" fill="#fff"/><circle cx="13" cy="22.2" r="2.1" fill="${color}"/><path d="M9.3 28.2c.5-2.3 2-3.4 3.7-3.4s3.2 1.1 3.7 3.4a6.2 6.2 0 0 1-7.4 0z" fill="${color}"/>` : ""}
</svg>`;
}

/** A small person: a waiting rider. Transparent background, thin white edge so it reads on any map. */
export function riderSvg(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="20" viewBox="0 0 18 20">
  <circle cx="9" cy="5.5" r="4.2" fill="${color}" stroke="#fff" stroke-width="1.4"/>
  <path d="M1.5 19c.6-5 3.6-7.6 7.5-7.6s6.9 2.6 7.5 7.6z" fill="${color}" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>
</svg>`;
}

const SCALE = 2;

function bitmap(svg: string): Promise<{ image: HTMLImageElement; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const [, width, height] = /width="(\d+)" height="(\d+)"/.exec(svg) ?? ["", "24", "24"];
    image.width = Number(width) * SCALE;
    image.height = Number(height) * SCALE;
    image.onload = () => resolve({ image, width: Number(width) * SCALE, height: Number(height) * SCALE });
    image.onerror = () => reject(new Error("icon"));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/** Image name on the map for a driver state. */
export const carIcon = (state: LiveState) => `car-${state}`;
export const RIDER_WAITING_ICON = "rider-waiting";
export const RIDER_OFFERED_ICON = "rider-offered";

/** Add every pin to the map once. Resolves when they are all there; a failed icon is skipped. */
export async function addMapIcons(map: maplibregl.Map): Promise<void> {
  const icons: [string, string][] = [
    ...(Object.keys(CAR_COLOR) as LiveState[]).map((state): [string, string] => [carIcon(state), carSvg(CAR_COLOR[state], state === "trip")]),
    [RIDER_WAITING_ICON, riderSvg(RIDER_COLOR.waiting)],
    [RIDER_OFFERED_ICON, riderSvg(RIDER_COLOR.offered)],
  ];
  await Promise.all(icons.map(async ([name, svg]) => {
    try {
      const { image, width, height } = await bitmap(svg);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.drawImage(image, 0, 0, width, height);
      if (!map.hasImage(name)) map.addImage(name, context.getImageData(0, 0, width, height), { pixelRatio: SCALE });
    } catch {
      // No icon: the layer falls back to nothing for this state, the click target still works.
    }
  }));
}

/** Compass bearing in degrees from `from` to `to` ([lat, lng]). */
export function bearing(from: readonly [number, number], to: readonly [number, number]): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const lat1 = toRad(from[0]);
  const lat2 = toRad(to[0]);
  const dLng = toRad(to[1] - from[1]);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Which way the car points: along its route while it moves, north when it stands free. */
export function headingOf(driver: Pick<LiveDriver, "state" | "route" | "progress">): number {
  if (!driver.route) return 0;
  const path = driver.state === "pickup" ? driver.route.approach : driver.state === "trip" ? driver.route.path : null;
  if (!path || path.length < 2) return 0;
  const at = along(path, driver.progress);
  const next = path[Math.min(path.length - 1, at.index + 1)];
  const from = path[at.index];
  if (from[0] === next[0] && from[1] === next[1]) return 0;
  return Math.round(bearing(from, next));
}

/** The rest of the way to the drop-off for a driver carrying a rider, as [lat, lng] points. */
export function remainingPath(driver: Pick<LiveDriver, "state" | "route" | "progress">): [number, number][] | null {
  if (driver.state !== "trip" || !driver.route || driver.route.path.length < 2) return null;
  const at = along(driver.route.path, driver.progress);
  return [at.point, ...driver.route.path.slice(at.index + 1)];
}
