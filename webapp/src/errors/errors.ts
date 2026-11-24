import type { MessageKey } from "../i18n/en.ts";
/**
 * Contract v0.16.0 §11, contract.json#telemetry.errorGroups (owner 2026-10-29, "Crashes & errors"): reports with the
 * same fingerprint are one ErrorGroup. GET /admin/errors lists them, newest lastSeen first; PATCH /admin/errors/{id}
 * { status } marks one fixed or open again. Both are open to any signed-in admin, every role.
 */
export type ErrorApp = "driver" | "rider" | "server";
export type ErrorPlatform = "android" | "ios" | "web" | "server";
export type ErrorStatus = "open" | "fixed";
/** v0.18.157 (contract.json#crashCatcher.kinds): dart_error, native_crash and freeze next to the v0.16.0 crash and error. */
export type ErrorKind = "crash" | "error" | "dart_error" | "native_crash" | "freeze";

export type ErrorGroup = {
  id: string;
  app: ErrorApp;
  platform: ErrorPlatform;
  appVersions: string[];
  message: string;
  topFrame?: string;
  kind: ErrorKind;
  count: number;
  devices: number;
  firstSeen: string;
  lastSeen: string;
  status: ErrorStatus;
  fixedAt?: string;
};

export type ErrorGroupPage = { items: ErrorGroup[]; nextCursor: string | null };

export type ErrorFilters = { app?: ErrorApp; platform?: ErrorPlatform; version?: string; status?: ErrorStatus; kind?: ErrorKind };

/** v0.18.157 (contract.json#crashCatcher.breadcrumbs): one of the last events before the crash. */
export type CrashBreadcrumb = { at: string; type: "route" | "lifecycle" | "platform" | "network" | "log"; message: string };

/** v0.18.157 (contract.json#crashCatcher.admin.reports): one kept report of a group. */
export type ErrorReport = {
  at: string;
  kind: ErrorKind;
  appVersion?: string;
  build?: string;
  platform?: string;
  osVersion?: string;
  deviceModel?: string;
  screen?: string;
  tripId?: string;
  zoneId?: string;
  message: string;
  stack?: string;
  nativeReason?: { name: string; reason?: string };
  freezeMs?: number;
  breadcrumbs: CrashBreadcrumb[];
};
export type ErrorReportList = { items: ErrorReport[] };

export const ERROR_APPS: readonly ErrorApp[] = ["driver", "rider", "server"];
export const ERROR_PLATFORMS: readonly ErrorPlatform[] = ["android", "ios", "web", "server"];
export const ERROR_STATUSES: readonly ErrorStatus[] = ["open", "fixed"];
/** The contract's order (contract.json#telemetry.crashReport.kinds). */
export const ERROR_KINDS: readonly ErrorKind[] = ["crash", "error", "dart_error", "native_crash", "freeze"];

/** The English text key of a kind's label (tr() translates it). */
export function kindLabelKey(kind: ErrorKind): MessageKey {
  return ({ crash: "Crash", error: "Error", dart_error: "App error (Dart)", native_crash: "Native crash", freeze: "Freeze" } as const satisfies Record<ErrorKind, MessageKey>)[kind];
}

/** v0.18.157: GET /admin/errors/{errorId}/reports, the latest 20 kept reports. */
export function errorReportsPath(id: string): string {
  return `/admin/errors/${encodeURIComponent(id)}/reports?limit=20`;
}

/** The page reads the list again this often. */
export const ERRORS_REFRESH_MS = 30_000;

/** The list's query: at most 200, only the filters that are set. */
export function errorsPath(filters: ErrorFilters): string {
  const query = new URLSearchParams({ limit: "200" });
  for (const key of ["app", "platform", "version", "status", "kind"] as const) {
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
    { id: "ERR-1008", app: "rider", platform: "ios", appVersions: ["1.0.0"], message: "NSInvalidArgumentException: Configure: invalid GOOGLE_APP_ID", kind: "native_crash", count: 4, devices: 3, firstSeen: at(3 * HOUR), lastSeen: at(12 * MIN), status: "open" },
    { id: "ERR-1009", app: "driver", platform: "android", appVersions: ["1.0.0"], message: "The screen froze for 7 s (screen /home)", kind: "freeze", count: 2, devices: 2, firstSeen: at(5 * HOUR), lastSeen: at(1 * HOUR), status: "open" },
    { id: "ERR-1007", app: "driver", platform: "android", appVersions: ["1.3.9", "1.4.0"], message: "Error: Socket closed before the trip update was acknowledged", topFrame: "TripChannel.ack (realtime/channel.ts:#)", kind: "error", count: 67, devices: 29, firstSeen: at(14 * DAY), lastSeen: at(4 * DAY), status: "fixed", fixedAt: at(4 * DAY - 6 * HOUR) },
  ];
  const matches = (item: ErrorGroup, f: ErrorFilters) =>
    (!f.app || item.app === f.app) && (!f.platform || item.platform === f.platform) && (!f.version || item.appVersions.includes(f.version)) && (!f.status || item.status === f.status) && (!f.kind || item.kind === f.kind);
  const crumbs = (ago: number): CrashBreadcrumb[] => [
    { at: at(ago + 40_000), type: "route", message: "/home" },
    { at: at(ago + 20_000), type: "lifecycle", message: "resumed" },
    { at: at(ago + 5_000), type: "network", message: "POST /push/devices 400" },
  ];
  return {
    list(filters: ErrorFilters): ErrorGroupPage {
      return { items: sortNewest(groups.filter((item) => matches(item, filters))).map((item) => ({ ...item })), nextCursor: null };
    },
    /** v0.18.157: the demo's kept reports of one group (a native crash shows its reason and breadcrumbs). */
    reports(id: string): ErrorReportList {
      const group = groups.find((item) => item.id === id);
      if (!group) throw new Error(`No error group ${id}.`);
      const report: ErrorReport = {
        at: group.lastSeen,
        kind: group.kind,
        ...(group.appVersions[0] ? { appVersion: group.appVersions[0] } : {}),
        build: "7",
        platform: group.platform,
        ...(group.platform === "ios" ? { osVersion: "iOS 17.1", deviceModel: "iPhone15,2" } : group.platform === "android" ? { osVersion: "Android 14 (API 34)", deviceModel: "samsung SM-S911B" } : {}),
        screen: "/home",
        message: group.message,
        stack: group.topFrame ?? "",
        breadcrumbs: crumbs(now - Date.parse(group.lastSeen)),
        ...(group.kind === "native_crash" ? { nativeReason: { name: "NSInvalidArgumentException", reason: "Configure: invalid GOOGLE_APP_ID" } } : {}),
        ...(group.kind === "freeze" ? { freezeMs: 7200 } : {}),
      };
      return { items: [report] };
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
