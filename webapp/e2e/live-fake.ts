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
  permissions: ["overview.read", "drivers.read", "trips.read", "riders.read", "zones.read", "finance.read", "payments.refund", "trips.intervene", "audit.read"],
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
  fareLines: [
    { code: "base", amount: SEK(4500) },
    { code: "distance", amount: SEK(12000) },
    { code: "time", amount: SEK(6500) },
    { code: "pickup_pay", amount: SEK(1500) },
  ],
  driverEarnings: SEK(16900),
  pickupPay: SEK(1500),
  commission: SEK(4600),
  paymentStatus: "authorized",
  ratingStatus: "not_requested",
  waiting: { arrivedAt: "2026-10-26T09:14:00Z", chargedSeconds: 120 },
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

/** Completed, paid, 100 kr of 300 kr already refunded (the audit has the refund). */
export const PART_REFUNDED_TRIP = {
  ...COMPLETED_TRIP,
  tripId: "T2004",
  version: 9,
  createdAt: "2026-10-24T12:00:00Z",
  updatedAt: "2026-10-24T12:40:00Z",
  riderId: "R501",
  fare: SEK(30000),
  fareLines: [{ code: "base", amount: SEK(30000) }],
  driverEarnings: SEK(24000),
  commission: SEK(6000),
  paymentStatus: "partially_refunded",
};

/** Expired while searching: never refundable (demo rule), even with a captured payment. */
export const EXPIRED_TRIP = {
  ...CANCELLED_TRIP,
  tripId: "T2005",
  status: "expired",
  version: 2,
  createdAt: "2026-10-23T06:00:00Z",
  updatedAt: "2026-10-23T06:10:00Z",
  riderId: "R503",
  cancellation: undefined,
  paymentStatus: "captured",
};

/** Waiting for a driver: the assign tools are open. */
export const SEARCHING_TRIP = {
  ...CANCELLED_TRIP,
  tripId: "T2006",
  status: "searching",
  version: 5,
  createdAt: "2026-10-26T10:00:00Z",
  updatedAt: "2026-10-26T10:00:30Z",
  riderId: "R504",
  categoryId: "economy",
  fare: SEK(18000),
  cancellation: undefined,
  paymentStatus: "pending",
};

export const RIDERS: Record<string, string> = { R501: "Lina", R502: "Omar", R503: "Sara", R504: "Ivo" };

export const NEARBY = [
  { driverId: "D1002", firstName: "Bo", onlineStatus: "online", moving: false, distanceMeters: 1200, pickupEtaSeconds: 180, zoneId: "Z001", categoryIds: ["economy"] },
  { driverId: "D1003", firstName: "Cem", onlineStatus: "on_trip", moving: true, distanceMeters: 2600, pickupEtaSeconds: 390, zoneId: "Z001", categoryIds: ["economy", "comfort"] },
];

export const OFFERS = [
  { offerId: "O2", tripId: "T2001", kind: "exclusive", status: "claimed", version: 2, expiresAt: "2026-10-25T08:01:45Z", fare: SEK(52000), driverEarnings: SEK(41600), driverId: "D1001", tripMeters: 41300, tripSeconds: 1860 },
  { offerId: "O1", tripId: "T2001", kind: "radar", status: "declined", version: 2, expiresAt: "2026-10-25T08:00:40Z", fare: SEK(52000), driverEarnings: SEK(41600), driverId: "D1009", tripMeters: 41300, tripSeconds: 1860 },
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
  /** POST /admin/trips/{id}/adjust answers 202 pending_approval. */
  adjustNeedsApproval?: boolean;
  /** GET /admin/audit rows (a refund already made on T2004 to start with). */
  audit: Record<string, unknown>[];
  offers: Record<string, unknown>[];
  /** Changes to the signed-in admin (language, permissions). */
  admin?: Partial<typeof ADMIN> & { language?: string };
};

export async function fakeTripServer(page: Page, init: Partial<TripState> = {}): Promise<TripState> {
  const state: TripState = {
    trips: [COMPLETED_TRIP, ACTIVE_TRIP, CANCELLED_TRIP].map((trip) => ({ ...trip })),
    calls: [],
    audit: [{ auditId: "1", at: "2026-10-24T13:00:00Z", actor: "admin", actorId: "A2", actorRole: "support", action: "trip.refund", targetType: "refund", targetId: "T2004", reason: "Late pickup", result: "committed", after: { direct: true, amount: SEK(10000), reason: "Late pickup" } }],
    offers: OFFERS.map((offer) => ({ ...offer })),
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
    // The Trips page's driver filter asks limit=200; the drivers list screens get the empty list they test with.
    if (p === "/api/v1/admin/drivers") return json(route, 200, { items: url.searchParams.get("limit") === "200" ? [{ driverId: "D1001", firstName: "Anna", lastName: "Berg", accountStatus: "active", onlineStatus: "online", zoneIds: ["Z001"], categoryIds: ["standard"], documents: [], version: 2 }] : [], nextCursor: null });
    if (p === "/api/v1/admin/riders") {
      const id = url.searchParams.get("q") ?? "";
      return json(route, 200, { items: RIDERS[id] ? [{ riderId: id, firstName: RIDERS[id], phone: "+46700000000", status: "active", version: 1 }] : [], nextCursor: null });
    }
    if (p === "/api/v1/admin/audit") {
      const target = url.searchParams.get("targetId");
      return json(route, 200, { items: state.audit.filter((row) => !target || row.targetId === target).slice().reverse(), nextCursor: null });
    }
    if (p === "/api/v1/admin/trips") {
      await wait(state.listDelayMs);
      if (state.listFails) return json(route, state.listFails, { code: "internal", message: "The server failed.", requestId: "r-500", retryable: true });
      const statuses = url.searchParams.getAll("status");
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const only = (key: string, field: string) => (trip: Record<string, unknown>) => !url.searchParams.get(key) || trip[field] === url.searchParams.get(key);
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const items = state.trips
        .filter((trip) => (!statuses.length || statuses.includes(String(trip.status))) && (!q || JSON.stringify(trip).toLowerCase().includes(q)))
        .filter(only("zoneId", "zoneId")).filter(only("categoryId", "categoryId")).filter(only("paymentStatus", "paymentStatus")).filter(only("driverId", "driverId"))
        .filter((trip) => (!from || String(trip.createdAt) >= from) && (!to || String(trip.createdAt) < to));
      const cursor = url.searchParams.get("cursor");
      if (!cursor && items.length > 2) return json(route, 200, { items: items.slice(0, 2), nextCursor: "c2" });
      return json(route, 200, { items: cursor ? items.slice(2) : items, nextCursor: null });
    }
    const one = /^\/api\/v1\/admin\/trips\/([^/]+)(?:\/([a-z-]+))?$/.exec(p);
    if (one) {
      const trip = state.trips.find((item) => item.tripId === one[1]);
      if (!trip) return json(route, 404, { code: "not_found", message: "No such trip.", requestId: "r-404t", retryable: false });
      const sub = one[2];
      if (!sub) return json(route, 200, trip);
      if (sub === "offers") return json(route, 200, { items: state.offers.filter((offer) => offer.tripId === trip.tripId), nextCursor: null });
      if (sub === "trace") return json(route, 200, { tripId: trip.tripId, fixes: trip.tripId === "T2001" ? [{ lat: 59.3326, lng: 18.0649 }, { lat: 59.45, lng: 17.99 }, { lat: 59.6498, lng: 17.9238 }] : [] });
      if (sub === "nearby-drivers") return json(route, 200, { items: NEARBY.map((row) => ({ ...row, ...(state.offers.some((offer) => offer.tripId === trip.tripId && offer.driverId === row.driverId && offer.status === "open") ? { openOfferId: "O9" } : {}) })), nextCursor: null });
      if (method !== "POST") return json(route, 404, { code: "not_found", message: `No route ${method} ${p}`, requestId: "r-404", retryable: false });
      if (sub === "refund") await wait(state.refundDelayMs);
      if (body.expectedVersion !== trip.version) return json(route, 409, { code: "version_mismatch", message: "Stale version", requestId: "r-409", retryable: false, projection: trip });
      const note = body.note ?? body.reason ?? null;
      const audit = (action: string, after: Record<string, unknown> = {}) => state.audit.push({ auditId: String(state.audit.length + 1), at: "2026-10-26T11:00:00Z", actor: "admin", actorId: "A1", actorRole: "super", action, targetType: sub === "refund" ? "refund" : "trip", targetId: trip.tripId, ...(note ? { reason: note } : {}), result: "committed", after: { direct: true, ...after } });
      const bump = (patch: Record<string, unknown>) => { Object.assign(trip, patch, { version: Number(trip.version) + 1 }); };
      if (sub === "refund") {
        if (state.refundNeedsApproval) return json(route, 202, { approvalId: "AP1", status: "pending", action: "trip.refund" });
        const fare = trip.fare as { amountMinor: number };
        const done = state.audit.filter((row) => row.targetId === trip.tripId && row.action === "trip.refund").reduce((sum, row) => sum + Number(((row.after as { amount?: { amountMinor: number } }).amount?.amountMinor) ?? 0), 0);
        const left = fare.amountMinor - done;
        if (body.amount.amountMinor > left) return json(route, 400, { code: "invalid_request", message: `At most ${left / 100} SEK is left to refund.`, requestId: "r-400", retryable: false, reason: "refund_too_large" });
        audit("trip.refund", { amount: body.amount, reason: body.reason });
        bump({ paymentStatus: body.amount.amountMinor === left ? "refunded" : "partially_refunded" });
        return json(route, 201, { refundId: "RF1", paymentId: "P1", tripId: trip.tripId, amount: body.amount, reason: body.reason, status: "done", createdAt: "2026-10-26T10:00:00Z" });
      }
      if (sub === "adjust") {
        if (state.adjustNeedsApproval) return json(route, 202, { approvalId: "AP2", status: "pending", action: "trip.adjust" });
        audit("trip.adjust", body);
        if (body.fare) bump({ fare: body.fare });
        if (body.waitingSeconds !== undefined) bump({ waiting: { ...(trip.waiting as object), chargedSeconds: body.waitingSeconds } });
        return json(route, 200, trip);
      }
      if (sub === "radar-group") {
        for (const id of body.driverIds as string[]) state.offers.unshift({ offerId: `O-${id}`, tripId: trip.tripId, kind: "radar", status: "open", version: 1, expiresAt: "2026-10-26T11:00:20Z", fare: trip.fare, driverEarnings: trip.fare, driverId: id });
        audit("trip.radar_group", body);
        bump({ status: "offered" });
        return json(route, 200, { groupId: "G1", tripId: trip.tripId, offers: [], expiresAt: "2026-10-26T11:00:20Z", projection: trip });
      }
      const next: Record<string, Record<string, unknown>> = {
        cancel: { status: "cancelled_by_admin", cancellation: { actor: "admin", reasonCode: body.reasonCode, at: "2026-10-26T11:00:00Z", fee: null } },
        reassign: { status: "searching", driverId: undefined, driver: undefined },
        assign: { status: "offered" },
        "no-show": { status: "no_show" },
        complete: { status: "completed" },
        "driver-bonus": { driverBonus: body.amount },
      };
      if (!next[sub]) return json(route, 404, { code: "not_found", message: `No route ${method} ${p}`, requestId: "r-404", retryable: false });
      if (sub === "assign") state.offers.unshift({ offerId: `O-${body.driverId}`, tripId: trip.tripId, kind: "assigned", status: "open", version: 1, expiresAt: "2026-10-26T11:00:15Z", fare: trip.fare, driverEarnings: trip.fare, driverId: body.driverId });
      audit(`trip.${sub.replace("-", "_")}`, body);
      bump(next[sub]);
      return json(route, 200, trip);
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
