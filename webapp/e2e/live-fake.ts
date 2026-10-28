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

/** A driver's request (he asked with the code), an owner's invite to a number without an account, and one that expired. */
export const INVITATIONS = [
  { invitationId: "INV1", fleetId: "F1", fleetName: "Taxi Nord AB", direction: "driver_request", driverId: "D1002", driverName: "Carl Ek", status: "pending", createdAt: "2026-10-24T08:00:00Z", expiresAt: "2026-10-31T08:00:00Z", version: 1 },
  { invitationId: "INV2", fleetId: "F1", fleetName: "Taxi Nord AB", direction: "owner_invite", phone: "+46700000002", status: "pending", createdAt: "2026-10-25T09:30:00Z", expiresAt: "2026-11-01T09:30:00Z", version: 1 },
  { invitationId: "INV3", fleetId: "F1", fleetName: "Taxi Nord AB", direction: "owner_invite", driverId: "D1003", driverName: "Eva Lund", phone: "+46700000003", status: "pending", createdAt: "2026-10-10T09:30:00Z", expiresAt: "2026-10-17T09:30:00Z", version: 1 },
];

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

/** Safety part 1 (contract v0.7.0 §15): an SOS from a rider and a car-lost case, both new. */
export const SOS_INCIDENT = {
  incidentId: "inc_1", tripId: "T2002", kind: "sos", severity: "critical", status: "open", version: 1, raisedBy: "rider", zoneId: "Z001",
  riderId: "R502", driverId: "D1001", position: { lat: 59.3331, lng: 18.0651, accuracyM: 8, at: "2026-10-26T09:20:30Z" },
  driverPosition: { lat: 59.334, lng: 18.066, accuracy: 5, measuredAt: "2026-10-26T09:20:40Z" }, openedAt: "2026-10-26T09:20:31Z", updatedAt: "2026-10-26T09:20:31Z",
};
export const LOST_INCIDENT = {
  incidentId: "inc_2", tripId: "T2001", kind: "driver_silent", severity: "critical", status: "open", version: 1, raisedBy: "system", zoneId: "Z001",
  riderId: "R501", driverId: "D1001", openedAt: "2026-10-26T08:50:00Z", updatedAt: "2026-10-26T08:50:00Z",
};
export type Incident = Record<string, unknown> & { incidentId: string; status: string; version: number };

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
  invitations: (typeof INVITATIONS)[number][];
  /** GET /admin/incidents and the incident feed (contract v0.7.0). */
  incidents: Incident[];
  /** Feed events so far: one per change, numbered from 1. */
  incidentEvents: { eventId: string; sequence: number; kind: string; incident: Incident; occurredAt: string; serverTime: string }[];
};

export async function fakeTripServer(page: Page, init: Partial<TripState> = {}): Promise<TripState> {
  const state: TripState = { trips: [COMPLETED_TRIP, ACTIVE_TRIP, CANCELLED_TRIP].map((trip) => ({ ...trip })), calls: [], drivers: [{ ...DRIVER }, { ...OWNER }], fleets: [{ ...FLEET }], vehicles: [{ ...VEHICLE }], invitations: INVITATIONS.map((item) => ({ ...item })), incidents: [], incidentEvents: [], ...init };
  const feed = (kind: string, incident: Incident) => state.incidentEvents.push({ eventId: `ev${state.incidentEvents.length + 1}`, sequence: state.incidentEvents.length + 1, kind, incident: { ...incident }, occurredAt: "2026-10-26T09:21:00Z", serverTime: "2026-10-26T09:21:00Z" });
  if (!init.incidentEvents) state.incidents.forEach((incident) => feed(incident.escalatedAt ? "incident_escalated" : "incident_opened", incident));
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
      const status = url.searchParams.get("accountStatus");
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      return json(route, 200, { items: state.drivers.filter((item) => (!status || item.accountStatus === status) && (!q || JSON.stringify(item).toLowerCase().includes(q))), nextCursor: null });
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
    const filtered = <T extends { status: string }>(items: T[]) => {
      const status = url.searchParams.get("status");
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      return items.filter((item) => (!status || item.status === status) && (!q || JSON.stringify(item).toLowerCase().includes(q)));
    };
    if (p === "/api/v1/admin/fleets") return json(route, 200, { items: filtered(state.fleets), nextCursor: null });
    if (p === "/api/v1/admin/vehicles") return json(route, 200, { items: filtered(state.vehicles), nextCursor: null });
    if (p === "/api/v1/admin/fleets/F1") {
      const [owner, member] = [state.drivers.find((item) => item.driverId === "D1000"), state.drivers.find((item) => item.driverId === "D1001")];
      return json(route, 200, {
        fleet: state.fleets[0],
        drivers: [owner, member].filter(Boolean).map((item) => ({ driverId: item!.driverId, firstName: item!.firstName, lastName: item!.lastName, accountStatus: item!.accountStatus, onlineStatus: item!.onlineStatus, linkedAt: "2026-10-20T10:00:00Z" })),
        vehicles: state.vehicles,
        invitations: state.invitations.filter((item) => item.status === "pending"),
      });
    }
    if (p === "/api/v1/admin/fleets/F1/code") {
      state.fleets[0] = { ...state.fleets[0]!, code: "MV-BBBB2", version: state.fleets[0]!.version + 1 };
      return json(route, 200, state.fleets[0]);
    }
    const invitation = /^\/api\/v1\/admin\/fleets\/F1\/invitations\/([^/]+)\/(accept|cancel)$/.exec(p);
    if (invitation) {
      const item = state.invitations.find((row) => row.invitationId === invitation[1]);
      if (!item) return json(route, 404, { code: "not_found", message: "No such invitation in this fleet.", requestId: "r-inv404", retryable: false, reason: "invitation_not_found" });
      if (Date.parse(item.expiresAt) < Date.parse("2026-10-25T12:00:00Z")) return json(route, 409, { code: "invalid_transition", message: "The invitation has expired.", requestId: "r-inv409", retryable: false, reason: "invitation_expired" });
      if (invitation[2] === "accept" && !item.driverId) return json(route, 409, { code: "invalid_transition", message: "That number has no account yet.", requestId: "r-inv409b", retryable: false, reason: "driver_not_signed_up" });
      item.status = invitation[2] === "accept" ? "accepted" : "cancelled";
      return json(route, 200, { ...item, decidedAt: "2026-10-25T12:00:00Z", version: 2 });
    }
    if (p === "/api/v1/admin/fleets/F1/drivers/D1001/remove") return json(route, 409, { code: "invalid_transition", message: "The driver is on a trip.", requestId: "r-trip", retryable: false, reason: "on_trip" });
    if (p === "/api/v1/admin/documents/DOC2/file") return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "image/png" }, body: PNG });
    if (p === "/api/v1/admin/documents/DOC2/review") {
      state.drivers = state.drivers.map((item) => (item.driverId === "D1001" ? { ...item, documents: item.documents.map((doc) => (doc.documentId === "DOC2" ? { ...doc, status: body.decision } : doc)) } : item));
      return json(route, 200, { documentId: "DOC2", ownerId: "D1001", type: "driving_license", status: body.decision, version: 2, reviewNote: body.note });
    }
    const review = /^\/api\/v1\/admin\/vehicles\/([^/]+)\/review$/.exec(p);
    if (review) {
      const index = state.vehicles.findIndex((item) => item.vehicleId === review[1]);
      if (index < 0) return json(route, 404, { code: "not_found", message: "No such vehicle.", requestId: "r-404v", retryable: false });
      if (body.expectedVersion !== state.vehicles[index].version) return json(route, 409, { code: "version_mismatch", message: "Stale version", requestId: "r-409v", retryable: false });
      state.vehicles[index] = { ...state.vehicles[index], status: body.decision, version: state.vehicles[index].version + 1 };
      return json(route, 200, state.vehicles[index]);
    }
    if (p === "/api/v1/admin/incidents") return json(route, 200, { items: state.incidents, nextCursor: null });
    if (p === "/api/v1/admin/incidents/stream") {
      const after = Number(url.searchParams.get("after") ?? 0);
      const items = state.incidentEvents.filter((event) => event.sequence > after);
      if ((request.headers().accept ?? "").includes("text/event-stream")) {
        return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "text/event-stream" }, body: `: stream open\n\n${items.map((event) => `id: ${event.sequence}\ndata: ${JSON.stringify(event)}\n\n`).join("")}` });
      }
      return json(route, 200, { items, nextCursor: null });
    }
    const incidentCall = /^\/api\/v1\/admin\/incidents\/([^/]+)(?:\/(take|resolve|dismiss))?$/.exec(p);
    if (incidentCall) {
      const index = state.incidents.findIndex((item) => item.incidentId === incidentCall[1]);
      if (index < 0) return json(route, 404, { code: "not_found", message: "No such incident.", requestId: "r-404i", retryable: false });
      const current = state.incidents[index];
      if (!incidentCall[2]) return json(route, 200, current);
      if (body.expectedVersion !== current.version) return json(route, 409, { code: "version_mismatch", message: "Stale version", requestId: "r-409i", retryable: false, projection: current });
      const from: Record<string, string[]> = { take: ["open"], resolve: ["open", "investigating"], dismiss: ["open", "investigating"] };
      if (!from[incidentCall[2]].includes(current.status)) return json(route, 409, { code: "invalid_transition", message: "Not now", requestId: "r-409j", retryable: false, projection: current });
      const at = "2026-10-26T09:22:00Z";
      const next: Incident = incidentCall[2] === "take"
        ? { ...current, status: "investigating", takenBy: "A1", takenAt: at, version: current.version + 1 }
        : { ...current, status: incidentCall[2] === "resolve" ? "resolved" : "dismissed", resolvedBy: "A1", resolvedAt: at, ...(body.note ? { resolution: body.note } : {}), version: current.version + 1 };
      state.incidents[index] = next;
      feed(incidentCall[2] === "take" ? "incident_updated" : "incident_closed", next);
      return json(route, 200, next);
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

/**
 * Contract v0.7.2 (contract.json#surgeLive): GET /admin/surge/now and GET /admin/zones/{zoneId}/surge/history, with
 * times relative to now (the page keeps the last 6 hours of the chart). `now` / `history` set to a number answer
 * with that error status. Every surge call is kept, so a spec can check that POST …/surge/notify never goes out.
 */
export type SurgeFake = {
  now: ((at: number) => unknown) | number;
  history: ((zoneId: string, at: number) => unknown) | number;
  calls: { method: string; path: string }[];
};

const minutesAgo = (at: number, minutes: number) => new Date(at - minutes * 60_000).toISOString();

/** The fake server's surge now: Norrmalm ×1.8 smart, Södermalm ×2.2 manual, Östermalm no surge (sample known). */
export const SURGE_NOW = (at: number) => ({
  at: new Date(at).toISOString(),
  zones: [
    { zoneId: "Z001", multiplier: 1.8, source: "smart", requests: 14, freeDrivers: 5, ratio: 2.8, checkedAt: minutesAgo(at, 1) },
    { zoneId: "Z002", multiplier: 2.2, source: "manual", until: new Date(at + 40 * 60_000).toISOString(), scheduleId: "sur_1", requests: 6, freeDrivers: 4, ratio: 1.5, checkedAt: minutesAgo(at, 1) },
    { zoneId: "Z003", multiplier: 1, source: "off", requests: 2, freeDrivers: 9, ratio: 0.2, checkedAt: minutesAgo(at, 1) },
  ],
});

/** The fake server's history of a zone: 6 hours of 10-minute points, the price check and a timeline. */
export const SURGE_HISTORY = (zoneId: string, at: number) => {
  const bucket = Math.floor(at / 600_000) * 600_000;
  const points = Array.from({ length: 37 }, (_, i) => {
    const time = bucket - (36 - i) * 600_000;
    const busy = i >= 30 ? 1 : 0;
    const requests = [4, 5, 7, 6, 8, 9, 7, 6, 5, 6, 8, 10, 12, 11, 9, 8, 7, 6, 6, 7, 9, 11, 13, 12, 10, 9, 8, 9, 11, 14, 20, 26, 30, 34, 38, 40, 42][i]!;
    const freeDrivers = busy ? 5 : 9 - (i % 3);
    return { at: new Date(time).toISOString(), requests, freeDrivers, ratio: Math.round((requests / freeDrivers) * 10) / 10, multiplier: busy ? (i >= 33 ? 1.8 : 1.5) : 1 };
  });
  return {
    zoneId,
    from: minutesAgo(at, 480),
    to: new Date(at).toISOString(),
    bucketMin: 10,
    points,
    priceCheck: { windowMin: 60, saw: 40, left: 12, leftPct: 30 },
    timeline: [
      { at: minutesAgo(at, 25), kind: "smart_change", multiplier: 1.8, previous: 1.5, by: "smart" },
      { at: minutesAgo(at, 60), kind: "smart_change", multiplier: 1.5, previous: 1, by: "smart", effect: { drivers: -2, ridesPct: 12, leftPct: 30 } },
      { at: minutesAgo(at, 180), kind: "manual_stop", multiplier: 1, previous: 2, by: "A1" },
      { at: minutesAgo(at, 240), kind: "manual_start", multiplier: 2, previous: 1, by: "A1", effect: { drivers: 4, ridesPct: 18, leftPct: 9 } },
    ],
  };
};

export async function fakeSurge(page: Page, init: Partial<Omit<SurgeFake, "calls">> = {}): Promise<SurgeFake> {
  const fake: SurgeFake = { now: SURGE_NOW, history: SURGE_HISTORY, calls: [], ...init };
  const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, headers: { ...CORS, "access-control-allow-methods": "GET,POST,PUT,OPTIONS", "content-type": "application/json" }, body: JSON.stringify(body) });
  const fail = (route: Route, status: number) => json(route, status, { code: status === 404 ? "not_found" : "unavailable", message: "No surge data.", requestId: `r-${status}s`, retryable: false });
  await page.route(/\/api\/v1\/admin\/(surge\/now|zones\/[^/]+\/surge(\/.*)?)(\?.*)?$/, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...CORS, "access-control-allow-methods": "GET,POST,PUT,OPTIONS" } });
    const url = new URL(request.url());
    fake.calls.push({ method: request.method(), path: url.pathname + url.search });
    const at = Date.now();
    if (url.pathname === "/api/v1/admin/surge/now") return typeof fake.now === "number" ? fail(route, fake.now) : json(route, 200, fake.now(at));
    const history = /^\/api\/v1\/admin\/zones\/([^/]+)\/surge\/history$/.exec(url.pathname);
    if (history) return typeof fake.history === "number" ? fail(route, fake.history) : json(route, 200, fake.history(decodeURIComponent(history[1]!), at));
    // Södermalm's running manual surge (the schedule Start / Stop reads); POST …/surge/notify is gone (404, v0.7.2).
    if (request.method() === "GET" && url.pathname === "/api/v1/admin/zones/Z002/surge") {
      return json(route, 200, { scheduleId: "sur_1", zoneId: "Z002", startAt: minutesAgo(at, 20), endAt: new Date(at + 40 * 60_000).toISOString(), cap: 2.2, points: [{ atMin: 0, multiplier: 2.2 }, { atMin: 60, multiplier: 2.2 }], status: "active", version: 3, createdBy: "A1" });
    }
    return fail(route, 404);
  });
  return fake;
}

const CONFIG_CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,OPTIONS", "access-control-expose-headers": "*" };
const configJson = (route: Route, status: number, body: unknown) => route.fulfill({ status, headers: { ...CONFIG_CORS, "content-type": "application/json" }, body: JSON.stringify(body) });
const sample = (name: string) => JSON.parse(readFileSync(new URL(`../../contracts/fixtures/config/${name}.json`, import.meta.url), "utf8")) as Record<string, unknown>;

type Entry = { version: number; liveVersion: number; usesStandard?: boolean; document: Record<string, unknown> };
type Sent = { method: string; path: string; body: Record<string, unknown> | null };

/** The config documents of the live settings flow (contract v0.8.0): Sweden's Standard, Z001 on the Standard, Z002 with its own. */
export async function fakeSettings(page: Page) {
  const docs = new Map<string, Entry>();
  const sent: Sent[] = [];
  const names = { pricing: "pricing_document", dispatch: "dispatch_document", rider_app_config: "rider_app_config", driver_app_config: "driver_app_config" } as const;
  for (const [doc, file] of Object.entries(names)) {
    const base = sample(file);
    docs.set(`${doc}:standard-SE`, { version: 2, liveVersion: 1, document: { ...base, zoneId: "standard-SE" } });
    docs.set(`${doc}:Z001`, { version: 1, liveVersion: 0, usesStandard: true, document: { ...base, zoneId: "Z001" } });
    docs.set(`${doc}:Z002`, { version: 3, liveVersion: 2, usesStandard: false, document: { ...base, zoneId: "Z002" } });
  }
  await page.route(`${API}/api/v1/admin/config/**`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CONFIG_CORS });
    const url = new URL(request.url());
    const [, , , , , doc, action] = url.pathname.split("/");
    const body = (request.postDataJSON?.() ?? null) as Record<string, unknown> | null;
    sent.push({ method: request.method(), path: url.pathname + url.search, body });
    const scope = (q: { zoneId?: unknown; country?: unknown }) => (q.zoneId ? String(q.zoneId) : `standard-${String(q.country)}`);
    if (request.method() === "GET") {
      const entry = docs.get(`${doc}:${scope({ zoneId: url.searchParams.get("zoneId"), country: url.searchParams.get("country") })}`);
      return entry ? configJson(route, 200, { doc, ...entry, updatedAt: "2026-10-27T09:00:00Z" }) : configJson(route, 404, { code: "not_found", message: "No such zone.", requestId: "r-404", retryable: false, reason: "zone_not_found" });
    }
    const key = `${doc}:${scope(body ?? {})}`;
    const entry = docs.get(key) ?? { version: 1, liveVersion: 0, document: {} };
    if (action === "use-standard") {
      docs.set(key, { ...entry, version: 1, liveVersion: 0, usesStandard: true });
      return configJson(route, 200, { doc, zoneId: body?.["zoneId"], version: 9, publishedAt: "2026-10-27T10:00:00Z" });
    }
    if (body?.["expectedVersion"] !== entry.version) return configJson(route, 409, { code: "version_mismatch", message: "The settings changed since you last saw them.", requestId: "r-409", retryable: false });
    if (request.method() === "PUT") {
      docs.set(key, { ...entry, version: entry.version + 1, document: body["document"] as Record<string, unknown> });
      return configJson(route, 200, { doc, ...docs.get(key), updatedAt: "2026-10-27T10:00:00Z" });
    }
    docs.set(key, { ...entry, version: entry.version + 1, liveVersion: entry.liveVersion + 1, usesStandard: false });
    return configJson(route, 200, { doc, version: entry.liveVersion + 1, publishedAt: "2026-10-27T10:00:00Z" });
  });
  return { docs, sent };
}

