import { readFileSync } from "node:fs";
import { expect, type Page, type Route } from "@playwright/test";

/**
 * A faked Movera server for the live trips screens (playwright.live.config.ts starts the app with
 * VITE_ADMIN_API=http://127.0.0.1:4310; every call to that origin is answered here with page.route).
 */
export const API = "http://127.0.0.1:4310";

export const ADMIN = {
  adminId: "A1",
  email: "owner@movera.se",
  name: "Nora Lind",
  role: "super",
  permissions: ["overview.read", "drivers.read", "trips.read", "riders.read", "zones.read", "finance.read", "payments.refund"],
  scope: { zones: "all" },
  idleTimeoutSeconds: 900,
  approvalExempt: true,
};

const SEK = (amountMinor: number) => ({ amountMinor, currency: "SEK" });

export const COMPLETED_TRIP = {
  tripId: "T2001",
  status: "completed",
  version: 7,
  sequence: 12,
  kind: "live",
  createdAt: "2026-10-25T08:00:00Z",
  acceptedAt: "2026-10-25T08:01:30Z",
  updatedAt: "2026-10-25T08:31:00Z",
  riderId: "R501",
  driverId: "D1001",
  vehicleId: "V1",
  zoneId: "Z001",
  categoryId: "standard",
  pickup: { address: "Sergels torg 1, Stockholm", lat: 59.3326, lng: 18.0649 },
  dropoff: { address: "Arlanda Terminal 5", lat: 59.6498, lng: 17.9238 },
  stops: [],
  fare: SEK(52000),
  fareLines: [
    { code: "base", amount: SEK(4500) },
    { code: "distance", amount: SEK(31000) },
    { code: "time", amount: SEK(16500) },
  ],
  driverEarnings: SEK(41600),
  commission: SEK(10400),
  paymentMethod: "card",
  paymentStatus: "captured",
  ratingStatus: "rated",
  pinRequired: false,
  driver: { driverId: "D1001", firstName: "Anna", vehicle: { vehicleId: "V1", make: "Volvo", model: "V90", plate: "ABC 123" } },
};

export const ACTIVE_TRIP = {
  ...COMPLETED_TRIP,
  tripId: "T2002",
  status: "in_trip",
  version: 3,
  createdAt: "2026-10-26T09:10:00Z",
  acceptedAt: "2026-10-26T09:11:00Z",
  updatedAt: "2026-10-26T09:20:00Z",
  riderId: "R502",
  fare: SEK(23000),
  fareLines: [],
  paymentStatus: "authorized",
  ratingStatus: "none",
};

export const CANCELLED_TRIP = {
  ...COMPLETED_TRIP,
  tripId: "T2003",
  status: "cancelled_by_rider",
  version: 4,
  createdAt: "2026-10-26T07:00:00Z",
  acceptedAt: undefined,
  updatedAt: "2026-10-26T07:04:00Z",
  riderId: "R503",
  driverId: undefined,
  vehicleId: undefined,
  driver: undefined,
  fare: SEK(0),
  fareLines: [],
  paymentStatus: "pending",
  cancellation: { actor: "rider", reasonCode: "changed_mind", at: "2026-10-26T07:04:00Z", fee: null },
};

/** A trip whose driver waits at pickup: the admin may mark a no-show (contract §5). */
export const ARRIVED_TRIP = {
  ...COMPLETED_TRIP,
  tripId: "T2004",
  status: "arrived",
  version: 5,
  createdAt: "2026-10-27T09:00:00Z",
  acceptedAt: "2026-10-27T09:01:00Z",
  updatedAt: "2026-10-27T09:12:00Z",
  riderId: "R504",
  fare: SEK(23000),
  fareLines: [],
  paymentStatus: "authorized",
  ratingStatus: "none",
};

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../../contracts/fixtures/config/${name}.json`, import.meta.url), "utf8"));

/** The contract's sample pricing document (contracts/fixtures/config): no-show fee 65 kr in every category. */
export const PRICING_DOCUMENT = fixture("pricing_document") as { categories: Record<string, { waiting: { noShowFee: { amountMinor: number } } }> };

type Doc = Record<string, unknown> & { categories?: Record<string, Record<string, unknown>> };
/**
 * The same document as contract v0.6.0 has it (branch pricing/v0.6): seat fees only on child_seat, which joins the
 * seed with 15 kr seats. Built here because contracts/ is still the v0.5.6 copy.
 */
export function pricingV06(): Doc {
  const doc = structuredClone(PRICING_DOCUMENT) as Doc;
  for (const category of Object.values(doc.categories!)) {
    delete category.babySeatFee;
    delete category.childSeatFee;
  }
  doc.categories!.child_seat = { ...structuredClone(doc.categories!.economy!), base: SEK(3500), minimum: SEK(5900), babySeatFee: SEK(1500), childSeatFee: SEK(1500) };
  return doc;
}

/** The contract's sample rider and driver app documents of Z001. */
export const RIDER_DOCUMENT = fixture("rider_app_config") as Doc;
export const DRIVER_DOCUMENT = fixture("driver_app_config") as Doc;

export type ConfigName = "pricing" | "rider_app_config" | "driver_app_config";
export type Draft = { version: number; liveVersion: number; document: unknown };
export type SurgeRow = { scheduleId: string; zoneId: string; categoryIds: string[]; startAt: string; endAt: string; stepMinutes: number; cap: number; points: { atMin: number; multiplier: number }[]; status: string; version: number; createdBy: string; createdAt: string };

export const OFFERS = [
  { offerId: "O1", tripId: "T2001", kind: "radar", status: "declined", version: 2, expiresAt: "2026-10-25T08:00:40Z", fare: SEK(52000), driverEarnings: SEK(41600) },
  { offerId: "O2", tripId: "T2001", kind: "exclusive", status: "claimed", version: 2, expiresAt: "2026-10-25T08:01:45Z", fare: SEK(52000), driverEarnings: SEK(41600) },
];

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-expose-headers": "*" };

export type Call = { method: string; path: string; headers: Record<string, string>; body: unknown };
export type TripState = {
  trips: Record<string, unknown>[];
  calls: Call[];
  /** Answer GET /admin/trips with this status (e.g. 500) instead of the list. */
  listFails?: number;
  /** Hold GET /admin/trips this many ms (loading state). */
  listDelayMs?: number;
  /** POST /admin/trips/{id}/refund answers 202 pending_approval instead of 201. */
  refundNeedsApproval?: boolean;
  refundDelayMs?: number;
  /** The pricing draft of Z001 (GET/PUT /admin/config/pricing, POST …/publish); the same object as configs.pricing.Z001. */
  pricing: Draft;
  /** Every config draft per document and zone. A zone without one answers 404 config_not_found. */
  configs: Record<ConfigName, Record<string, Draft>>;
  /** The zones' surge schedules (GET/PUT /admin/zones/{zoneId}/surge, POST …/end). */
  surges: Record<string, SurgeRow>;
  /** These paths answer 400 invalid_request with this message (e.g. a schema refusal). */
  refuse?: Record<string, string>;
  /** POST /admin/config/pricing/publish answers 202 pending_approval instead of 200. */
  publishNeedsApproval?: boolean;
  /** Changes to the signed-in admin (language, permissions). */
  admin?: Partial<typeof ADMIN> & { language?: string };
};

export async function fakeTripServer(page: Page, init: Partial<TripState> = {}): Promise<TripState> {
  const state: TripState = {
    trips: [COMPLETED_TRIP, ACTIVE_TRIP, CANCELLED_TRIP].map((trip) => ({ ...trip })),
    calls: [],
    pricing: { version: 1, liveVersion: 1, document: structuredClone(PRICING_DOCUMENT) },
    surges: {},
    ...init,
    configs: init.configs ?? { pricing: {}, rider_app_config: {}, driver_app_config: {} },
  };
  state.configs.pricing.Z001 ??= state.pricing;
  state.pricing = state.configs.pricing.Z001;
  const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(body) });
  const wait = (ms?: number) => (ms ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());
  await page.route(`${API}/**`, async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const body = request.postDataJSON?.() ?? null;
    state.calls.push({ method, path: url.pathname + url.search, headers: request.headers(), body });
    const p = url.pathname;
    if (p === "/api/v1/admin/auth/sign-in") return json(route, 200, { accessToken: "access-1", refreshToken: "refresh-1", expiresIn: 900, actor: "admin", admin: { ...ADMIN, ...state.admin } });
    if (p === "/api/v1/admin/auth/sign-out") return route.fulfill({ status: 204, headers: CORS });
    if (request.headers().authorization !== "Bearer access-1") return json(route, 401, { code: "unauthenticated", message: "Sign in again.", requestId: "r-401", retryable: false });
    if (p === "/api/v1/admin/drivers") return json(route, 200, { items: [], nextCursor: null });
    if (p === "/api/v1/admin/trips") {
      await wait(state.listDelayMs);
      if (state.listFails) return json(route, state.listFails, { code: "internal", message: "The server failed.", requestId: "r-500", retryable: true });
      const statuses = url.searchParams.getAll("status");
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const items = state.trips.filter((trip) => (!statuses.length || statuses.includes(String(trip.status))) && (!q || JSON.stringify(trip).toLowerCase().includes(q)));
      const cursor = url.searchParams.get("cursor");
      if (!cursor && items.length > 2) return json(route, 200, { items: items.slice(0, 2), nextCursor: "c2" });
      return json(route, 200, { items: cursor ? items.slice(2) : items, nextCursor: null });
    }
    if (state.refuse?.[p]) return json(route, 400, { code: "invalid_request", message: state.refuse[p], requestId: "r-400r", retryable: false });
    const config = /^\/api\/v1\/admin\/config\/(pricing|rider_app_config|driver_app_config)(\/publish)?$/.exec(p);
    if (config) {
      const name = config[1] as ConfigName;
      const zoneId = url.searchParams.get("zoneId") ?? body?.zoneId ?? "";
      const draft = state.configs[name][zoneId];
      const view = (one: Draft) => ({ doc: name, zoneId, version: one.version, liveVersion: one.liveVersion, document: one.document, updatedAt: "2026-10-27T08:00:00Z", updatedBy: "A1" });
      if (method === "GET") return draft ? json(route, 200, view(draft)) : json(route, 404, { code: "not_found", message: "This zone has no such document yet.", requestId: "r-404c", retryable: false, reason: "config_not_found" });
      if (!config[2]) {
        if ((draft?.version ?? 1) !== body.expectedVersion) return json(route, 409, { code: "version_mismatch", message: "Stale version", requestId: "r-409c", retryable: false });
        const next = draft ?? (state.configs[name][zoneId] = { version: 1, liveVersion: 0, document: null });
        next.document = body.document;
        next.version += 1;
        return json(route, 200, view(next));
      }
      if (!draft || body.expectedVersion !== draft.version) return json(route, 409, { code: "version_mismatch", message: "Stale version", requestId: "r-409p", retryable: false });
      if (state.publishNeedsApproval) return json(route, 202, { approvalId: "AP2", status: "pending", action: "config.publish" });
      draft.liveVersion += 1;
      // Contract v0.6.0 publishPricing: the zone's app documents take the new waiting and pickup fee, and their draft version goes up by 1.
      if (name === "pricing") for (const app of ["rider_app_config", "driver_app_config"] as const) {
        const own = state.configs[app][zoneId];
        if (own) {
          own.version += 1;
          own.liveVersion += 1;
        }
      }
      return json(route, 200, { doc: name, zoneId, version: draft.liveVersion, publishedAt: "2026-10-27T10:00:00Z" });
    }
    const surge = /^\/api\/v1\/admin\/zones\/([^/]+)\/surge(\/end)?$/.exec(p);
    if (surge) {
      const zoneId = decodeURIComponent(surge[1]!);
      const row = state.surges[zoneId];
      if (method === "GET") return row ? json(route, 200, row) : route.fulfill({ status: 204, headers: CORS });
      if (body.expectedVersion !== (row?.version ?? 0)) return json(route, 409, { code: "version_mismatch", message: "Stale version", requestId: "r-409s", retryable: false });
      if (surge[2]) {
        if (!row) return json(route, 404, { code: "not_found", message: "No surge.", requestId: "r-404s", retryable: false });
        row.status = "ended";
        row.version += 1;
        return json(route, 200, row);
      }
      const next: SurgeRow = { scheduleId: "S1", zoneId, categoryIds: body.categoryIds ?? [], startAt: body.startAt, endAt: body.endAt, stepMinutes: body.stepMinutes ?? 5, cap: 6, points: body.points, status: "active", version: (row?.version ?? 0) + 1, createdBy: "A1", createdAt: body.startAt };
      state.surges[zoneId] = next;
      return json(route, 200, next);
    }
    const one = /^\/api\/v1\/admin\/trips\/([^/]+)(\/offers|\/refund|\/no-show)?$/.exec(p);
    if (one) {
      const trip = state.trips.find((item) => item.tripId === one[1]);
      if (!trip) return json(route, 404, { code: "not_found", message: "No such trip.", requestId: "r-404t", retryable: false });
      if (!one[2]) return json(route, 200, trip);
      if (one[2] === "/offers") return json(route, 200, { items: OFFERS.filter((offer) => offer.tripId === trip.tripId), nextCursor: null });
      if (one[2] === "/no-show") {
        if (body.expectedVersion !== trip.version) return json(route, 409, { code: "version_mismatch", message: "Stale version", requestId: "r-409n", retryable: false, projection: trip });
        trip.status = "no_show";
        trip.version = Number(trip.version) + 1;
        trip.cancellation = { actor: "admin", reasonCode: "rider_no_show", at: "2026-10-27T09:20:00Z", fee: body.waiveFee ? null : SEK(6500) };
        return json(route, 200, trip);
      }
      await wait(state.refundDelayMs);
      if (body.expectedVersion !== trip.version) return json(route, 409, { code: "version_mismatch", message: "Stale version", requestId: "r-409", retryable: false, projection: trip });
      if (state.refundNeedsApproval) return json(route, 202, { approvalId: "AP1", status: "pending", action: "trip.refund" });
      const fare = trip.fare as { amountMinor: number };
      if (body.amount.amountMinor > fare.amountMinor) return json(route, 400, { code: "invalid_request", message: `At most ${fare.amountMinor / 100} SEK is left to refund.`, requestId: "r-400", retryable: false, reason: "refund_too_large" });
      trip.paymentStatus = body.amount.amountMinor === fare.amountMinor ? "refunded" : "partially_refunded";
      trip.version = Number(trip.version) + 1;
      return json(route, 201, { refundId: "RF1", paymentId: "P1", tripId: trip.tripId, amount: body.amount, reason: body.reason, status: "done", createdAt: "2026-10-26T10:00:00Z" });
    }
    return json(route, 404, { code: "not_found", message: `No route ${method} ${p}`, requestId: "r-404", retryable: false });
  });
  return state;
}

export async function signIn(page: Page, landing = "Drivers") {
  await page.goto("/");
  await page.getByLabel("Email").fill("owner@movera.se");
  await page.getByLabel("Password").fill("correct-horse");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 2, name: landing })).toBeVisible();
}
