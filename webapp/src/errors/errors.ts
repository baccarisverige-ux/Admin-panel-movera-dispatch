/**
 * Contract v0.16.0 §11, contract.json#telemetry.errorGroups (owner 2026-10-29, "Crashes & errors"): reports with the
 * same fingerprint are one ErrorGroup. GET /admin/errors lists them, newest lastSeen first; PATCH /admin/errors/{id}
 * { status } marks one fixed or open again. Both are open to any signed-in admin, every role.
 */
export type ErrorApp = "driver" | "rider" | "server";
export type ErrorPlatform = "android" | "ios" | "web" | "server";
export type ErrorStatus = "open" | "fixed";

export type ErrorGroup = {
  id: string;
  app: ErrorApp;
  platform: ErrorPlatform;
  appVersions: string[];
  message: string;
  topFrame?: string;
  kind: "crash" | "error";
  count: number;
  devices: number;
  firstSeen: string;
  lastSeen: string;
  status: ErrorStatus;
  fixedAt?: string;
};

export type ErrorGroupPage = { items: ErrorGroup[]; nextCursor: string | null };

export type ErrorFilters = { app?: ErrorApp; platform?: ErrorPlatform; version?: string; status?: ErrorStatus };

export const ERROR_APPS: readonly ErrorApp[] = ["driver", "rider", "server"];
export const ERROR_PLATFORMS: readonly ErrorPlatform[] = ["android", "ios", "web", "server"];
export const ERROR_STATUSES: readonly ErrorStatus[] = ["open", "fixed"];

/** The page reads the list again this often. */
export const ERRORS_REFRESH_MS = 30_000;

/** The list's query: at most 200, only the filters that are set. */
export function errorsPath(filters: ErrorFilters): string {
  const query = new URLSearchParams({ limit: "200" });
  for (const key of ["app", "platform", "version", "status"] as const) {
    const value = filters[key];
    if (value) query.set(key, value);
  }
  return `/admin/errors?${query.toString()}`;
}

export function sortNewest(items: readonly ErrorGroup[]): ErrorGroup[] {
  return [...items].sort((a, b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen));
}

/** Every version in the groups, newest version number first (for the version filter). */
export function versionsOf(items: readonly ErrorGroup[]): string[] {
  const all = new Set(items.flatMap((item) => item.appVersions));
  return [...all].sort((a, b) => b.localeCompare(a, "en", { numeric: true }));
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/**
 * The demo build's example groups: what the server would send, with times relative to now, so the demo page looks
 * like the live one. The status changes stay in this browser tab.
 */
export function createDemoErrors(now = Date.now()) {
  const at = (ago: number) => new Date(now - ago).toISOString();
  const groups: ErrorGroup[] = [
    { id: "ERR-1001", app: "driver", platform: "android", appVersions: ["1.4.2"], message: "TypeError: Cannot read properties of undefined (reading 'pickup')", topFrame: "OfferCard (offer/OfferCard.tsx:#)", kind: "crash", count: 42, devices: 17, firstSeen: at(2 * DAY), lastSeen: at(6 * MIN), status: "open" },
    { id: "ERR-1002", app: "rider", platform: "ios", appVersions: ["2.1.0", "2.1.1"], message: "Payment sheet closed before the card was confirmed", topFrame: "PaymentSheet.confirm (payments/sheet.ts:#)", kind: "error", count: 9, devices: 8, firstSeen: at(4 * DAY), lastSeen: at(38 * MIN), status: "open" },
    { id: "ERR-1003", app: "server", platform: "server", appVersions: ["0.16.0"], message: "Error: connect ETIMEDOUT # (maps routing)", topFrame: "routeQuote (src/routing/osrm.ts:#)", kind: "error", count: 23, devices: 0, firstSeen: at(1 * DAY), lastSeen: at(2 * HOUR), status: "open" },
    { id: "ERR-1004", app: "driver", platform: "ios", appVersions: ["1.4.1", "1.4.2"], message: "Location permission was revoked while online", topFrame: "LocationTracker.start (location/tracker.ts:#)", kind: "error", count: 5, devices: 4, firstSeen: at(6 * DAY), lastSeen: at(5 * HOUR), status: "open" },
    { id: "ERR-1005", app: "rider", platform: "android", appVersions: ["2.1.0"], message: "RangeError: Maximum call stack size exceeded", topFrame: "MapView.onRegionChange (map/MapView.tsx:#)", kind: "crash", count: 3, devices: 3, firstSeen: at(3 * DAY), lastSeen: at(1 * DAY), status: "fixed", fixedAt: at(20 * HOUR) },
    { id: "ERR-1006", app: "rider", platform: "web", appVersions: ["2.0.4"], message: "ChunkLoadError: Loading chunk # failed", topFrame: "lazyPage (app/router.tsx:#)", kind: "error", count: 12, devices: 11, firstSeen: at(9 * DAY), lastSeen: at(2 * DAY), status: "fixed", fixedAt: at(2 * DAY - 3 * HOUR) },
    { id: "ERR-1007", app: "driver", platform: "android", appVersions: ["1.3.9", "1.4.0"], message: "Error: Socket closed before the trip update was acknowledged", topFrame: "TripChannel.ack (realtime/channel.ts:#)", kind: "error", count: 67, devices: 29, firstSeen: at(14 * DAY), lastSeen: at(4 * DAY), status: "fixed", fixedAt: at(4 * DAY - 6 * HOUR) },
  ];
  const matches = (item: ErrorGroup, f: ErrorFilters) =>
    (!f.app || item.app === f.app) && (!f.platform || item.platform === f.platform) && (!f.version || item.appVersions.includes(f.version)) && (!f.status || item.status === f.status);
  return {
    list(filters: ErrorFilters): ErrorGroupPage {
      return { items: sortNewest(groups.filter((item) => matches(item, filters))).map((item) => ({ ...item })), nextCursor: null };
    },
    patch(id: string, status: ErrorStatus): ErrorGroup {
      const index = groups.findIndex((item) => item.id === id);
      if (index < 0) throw new Error(`No error group ${id}.`);
      const { fixedAt: _old, ...rest } = groups[index]!;
      void _old;
      groups[index] = status === "fixed" ? { ...rest, status, fixedAt: new Date().toISOString() } : { ...rest, status };
      return { ...groups[index]! };
    },
  };
}
