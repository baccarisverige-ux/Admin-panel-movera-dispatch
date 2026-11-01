/**
 * "Back to the map": pages opened from a map pop-up carry `?back=<the map page's address>`, and the map page keeps
 * its view in its own address (`mapAt=lat,lng,zoom`, `mapOpen=driver:ID|rider:TRIP`), so going back lands on the
 * exact screen. Everything lives in the URL: it survives a reload, a new tab or a shared link.
 * (`from` is already a date filter on several pages, hence `back`.)
 */

export const BACK_PARAM = "back";
export const MAP_AT_PARAM = "mapAt";
export const MAP_OPEN_PARAM = "mapOpen";

export type MapAt = { lat: number; lng: number; zoom: number };
export type MapOpen = { kind: "driver" | "rider"; id: string };

const round = (value: number, digits: number) => Number(value.toFixed(digits));

export function encodeMapAt(at: MapAt): string {
  return `${round(at.lat, 5)},${round(at.lng, 5)},${round(at.zoom, 2)}`;
}

export function decodeMapAt(raw: string | null | undefined): MapAt | null {
  if (!raw) return null;
  const parts = raw.split(",").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  const [lat, lng, zoom] = parts;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || zoom < 0 || zoom > 22) return null;
  return { lat, lng, zoom };
}

export function encodeMapOpen(open: MapOpen | null): string | null {
  return open ? `${open.kind}:${open.id}` : null;
}

export function decodeMapOpen(raw: string | null | undefined): MapOpen | null {
  const match = /^(driver|rider):([\w-]{1,40})$/.exec(raw ?? "");
  return match ? { kind: match[1] as MapOpen["kind"], id: match[2] } : null;
}

/** The address without `back`, so a page never points back to itself. */
function withoutBack(pathAndSearch: string): string {
  const [path, query = ""] = pathAndSearch.split("?");
  const params = new URLSearchParams(query);
  params.delete(BACK_PARAM);
  const rest = params.toString();
  return rest ? `${path}?${rest}` : path;
}

/**
 * A safe return address: only a path on this site ("/…", never "//host" or a scheme), never the page itself.
 * Anything else gives null, and the page behaves as if it was opened directly.
 */
export function safeBack(raw: string | null | undefined, here: string): string | null {
  if (!raw || raw.length > 1500) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || [...raw].some((char) => char.charCodeAt(0) < 32)) return null;
  const target = withoutBack(raw);
  return target === withoutBack(here) ? null : target;
}

/** `href` with `back` set to `here` (an internal link opened from a map pop-up). */
/**
 * A rendered link's href and window.location both carry the router's basename (on the live site
 * "/Admin-panel-movera-dispatch/live"); navigate() and ?back= want the in-app path, or the basename doubles up
 * and the page opens as "Page not found".
 */
export function stripBase(path: string, base: string): string {
  const root = base.replace(/\/$/, "");
  if (!root || !path.startsWith(root)) return path;
  const rest = path.slice(root.length);
  if (rest === "") return "/";
  return rest.startsWith("/") || rest.startsWith("?") || rest.startsWith("#") ? (rest.startsWith("/") ? rest : `/${rest}`) : path;
}

export function withBack(href: string, here: string): string {
  const [pathPart, hash = ""] = href.split("#");
  const [path, query = ""] = pathPart.split("?");
  const params = new URLSearchParams(query);
  params.set(BACK_PARAM, withoutBack(here));
  return `${path}?${params.toString()}${hash ? `#${hash}` : ""}`;
}

/** Which screen the back button returns to, for its label. */
export function backPlace(target: string): "dashboard" | "dispatch" | "live" | "offers" | "other" {
  const path = target.split("?")[0];
  if (path === "/" || path === "") return "dashboard";
  if (path.startsWith("/dispatch/map") || path.startsWith("/live")) return "live";
  if (path.startsWith("/dispatch/radar") || path.startsWith("/dispatch/bookings") || path.startsWith("/offers")) return "offers";
  if (path.startsWith("/dispatch")) return "dispatch";
  return "other";
}

/** `search` with the map's view written in (or removed). */
export function searchWithMap(search: string, at: MapAt | null, open: MapOpen | null): string {
  const params = new URLSearchParams(search);
  if (at) params.set(MAP_AT_PARAM, encodeMapAt(at));
  else params.delete(MAP_AT_PARAM);
  const openText = encodeMapOpen(open);
  if (openText) params.set(MAP_OPEN_PARAM, openText);
  else params.delete(MAP_OPEN_PARAM);
  const text = params.toString();
  return text ? `?${text}` : "";
}
