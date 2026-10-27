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

export const OFFERS = [
  { offerId: "O1", tripId: "T2001", kind: "radar", status: "declined", version: 2, expiresAt: "2026-10-25T08:00:40Z", fare: SEK(52000), driverEarnings: SEK(41600) },
  { offerId: "O2", tripId: "T2001", kind: "exclusive", status: "claimed", version: 2, expiresAt: "2026-10-25T08:01:45Z", fare: SEK(52000), driverEarnings: SEK(41600) },
];


export const DRIVER = {
  driverId: "D1001",
  accountStatus: "on_hold",
  onlineStatus: "offline",
  firstName: "Anna",
  lastName: "Berg",
  email: "anna@example.se",
  country: "SE",
  cityId: "stockholm_lan",
  accountType: "driver",
  zoneIds: ["Z001"],
  categoryIds: ["standard"],
  fleet: { fleetId: "F1", name: "Taxi Nord AB", role: "member", status: "approved", linkedAt: "2026-10-20T10:00:00Z" },
  documents: [
    { documentId: "DOC1", type: "terms", status: "approved" },
    { documentId: "DOC2", type: "driving_license", status: "in_review" },
  ],
  requiredDocuments: ["terms", "driving_license"],
  version: 2,
};

export const OWNER = { ...DRIVER, driverId: "D1000", firstName: "Bo", lastName: "Nord", email: "bo@example.se", accountStatus: "active", accountType: "fleet", fleet: { ...DRIVER.fleet, role: "owner" }, documents: [{ documentId: "DOC5", type: "terms", status: "approved" }, { documentId: "DOC6", type: "driving_license", status: "approved" }], version: 5 };

export const FLEET = {
  fleetId: "F1",
  name: "Taxi Nord AB",
  orgNumber: "556000-0001",
  country: "SE",
  cityId: "stockholm_lan",
  ownerDriverId: "D1000",
  ownerName: "Bo Nord",
  ownerEmail: "bo@example.se",
  status: "approved",
  code: "MV-AAAA1",
  driverCount: 2,
  vehicleCount: 1,
  createdAt: "2026-10-18T09:00:00Z",
  version: 3,
};

export const VEHICLE = { vehicleId: "V1", make: "Volvo", model: "V90", year: 2022, color: "black", plate: "ABC 123", seats: 4, categoryIds: ["standard"], status: "pending", version: 1, fleetId: "F1", driverId: "D1001" };

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
  /** Changes to the signed-in admin (language, permissions). */
  admin?: Partial<typeof ADMIN> & { language?: string };
  drivers: (typeof DRIVER)[];
  fleets: (typeof FLEET)[];
  vehicles: (typeof VEHICLE)[];
  /** Answer GET /admin/drivers with this status instead of the list. */
  driversFail?: number;
  /** Hold POST /admin/drivers/{id}/status this many ms. */
  statusDelayMs?: number;
};

export async function fakeTripServer(page: Page, init: Partial<TripState> = {}): Promise<TripState> {
  const state: TripState = { trips: [COMPLETED_TRIP, ACTIVE_TRIP, CANCELLED_TRIP].map((trip) => ({ ...trip })), calls: [], drivers: [{ ...DRIVER }, { ...OWNER }], fleets: [{ ...FLEET }], vehicles: [{ ...VEHICLE }], ...init };
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
    if (p === "/api/v1/admin/auth/sign-in" && body?.password !== "correct-horse") return json(route, 401, { code: "unauthenticated", message: "Unauthenticated", requestId: "r-401", retryable: false, reason: "invalid_credentials" });
    if (p === "/api/v1/admin/auth/sign-in") return json(route, 200, { accessToken: "access-1", refreshToken: "refresh-1", expiresIn: 900, actor: "admin", admin: { ...ADMIN, ...state.admin } });
    if (p === "/api/v1/admin/auth/sign-out") return route.fulfill({ status: 204, headers: CORS });
    if (request.headers().authorization !== "Bearer access-1") return json(route, 401, { code: "unauthenticated", message: "Sign in again.", requestId: "r-401", retryable: false });
    if (p === "/api/v1/admin/drivers") {
      if (state.driversFail) return json(route, state.driversFail, { code: "unavailable", message: "The server is busy.", requestId: "r-503", retryable: false });
      return json(route, 200, { items: state.drivers, nextCursor: null });
    }
    const driver = /^\/api\/v1\/admin\/drivers\/([^/]+)(\/status)?$/.exec(p);
    if (driver) {
      const index = state.drivers.findIndex((item) => item.driverId === driver[1]);
      if (index < 0) return json(route, 404, { code: "not_found", message: "No such driver.", requestId: "r-404d", retryable: false });
      if (!driver[2]) return json(route, 200, state.drivers[index]);
      await wait(state.statusDelayMs);
      const current = state.drivers[index];
      if (body.expectedVersion !== current.version) return json(route, 409, { code: "version_mismatch", message: "Stale version", requestId: "r-409d", retryable: false, projection: current });
      if (!body.note) return json(route, 400, { code: "invalid_request", message: "note is required", requestId: "r-400d", retryable: false });
      state.drivers[index] = { ...current, accountStatus: body.accountStatus, version: current.version + 1 };
      return json(route, 200, state.drivers[index]);
    }
    if (p === "/api/v1/admin/fleets") return json(route, 200, { items: state.fleets, nextCursor: null });
    if (p === "/api/v1/admin/vehicles") return json(route, 200, { items: state.vehicles, nextCursor: null });
    const review = /^\/api\/v1\/admin\/vehicles\/([^/]+)\/review$/.exec(p);
    if (review) {
      const index = state.vehicles.findIndex((item) => item.vehicleId === review[1]);
      if (index < 0) return json(route, 404, { code: "not_found", message: "No such vehicle.", requestId: "r-404v", retryable: false });
      if (body.expectedVersion !== state.vehicles[index].version) return json(route, 409, { code: "version_mismatch", message: "Stale version", requestId: "r-409v", retryable: false });
      state.vehicles[index] = { ...state.vehicles[index], status: body.decision, version: state.vehicles[index].version + 1 };
      return json(route, 200, state.vehicles[index]);
    }
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
    const one = /^\/api\/v1\/admin\/trips\/([^/]+)(\/offers|\/refund)?$/.exec(p);
    if (one) {
      const trip = state.trips.find((item) => item.tripId === one[1]);
      if (!trip) return json(route, 404, { code: "not_found", message: "No such trip.", requestId: "r-404t", retryable: false });
      if (!one[2]) return json(route, 200, trip);
      if (one[2] === "/offers") return json(route, 200, { items: OFFERS.filter((offer) => offer.tripId === trip.tripId), nextCursor: null });
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

export async function signIn(page: Page, landing = "Dashboard") {
  await page.goto("/");
  await page.getByLabel("Email").fill("owner@movera.se");
  await page.getByLabel("Password").fill("correct-horse");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 2, name: landing })).toBeVisible();
}
