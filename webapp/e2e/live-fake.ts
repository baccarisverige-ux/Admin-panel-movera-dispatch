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

/** The contract's sample pricing document (contracts/fixtures/config): no-show fee 65 kr in every category. */
export const PRICING_DOCUMENT = JSON.parse(readFileSync(new URL("../../contracts/fixtures/config/pricing_document.json", import.meta.url), "utf8")) as { categories: Record<string, { waiting: { noShowFee: { amountMinor: number } } }> };

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
  /** The pricing draft of Z001 (GET/PUT /admin/config/pricing, POST …/publish). */
  pricing: { version: number; liveVersion: number; document: unknown };
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
    ...init,
  };
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
    if (p === "/api/v1/admin/config/pricing") {
      const pricing = state.pricing;
      if (url.searchParams.get("zoneId") && url.searchParams.get("zoneId") !== "Z001") return json(route, 404, { code: "not_found", message: "This zone has no such document yet.", requestId: "r-404c", retryable: false, reason: "config_not_found" });
      const view = () => ({ doc: "pricing", zoneId: "Z001", version: pricing.version, liveVersion: pricing.liveVersion, document: pricing.document, updatedAt: "2026-10-27T08:00:00Z", updatedBy: "A1" });
      if (method === "GET") return json(route, 200, view());
      if (body.expectedVersion !== pricing.version) return json(route, 409, { code: "version_mismatch", message: "Stale version", requestId: "r-409c", retryable: false });
      pricing.document = body.document;
      pricing.version += 1;
      return json(route, 200, view());
    }
    if (p === "/api/v1/admin/config/pricing/publish") {
      if (body.expectedVersion !== state.pricing.version) return json(route, 409, { code: "version_mismatch", message: "Stale version", requestId: "r-409p", retryable: false });
      if (state.publishNeedsApproval) return json(route, 202, { approvalId: "AP2", status: "pending", action: "config.publish" });
      state.pricing.liveVersion += 1;
      return json(route, 200, { doc: "pricing", zoneId: "Z001", version: state.pricing.liveVersion, publishedAt: "2026-10-27T10:00:00Z" });
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
