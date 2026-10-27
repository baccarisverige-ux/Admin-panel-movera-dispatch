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

/** GET /admin/riders (AdminRider): wallet and unpaid fees from the server. */
export const RIDERS = [
  { riderId: "R501", firstName: "Ida", phone: "+46700000501", email: "ida@example.se", rating: 4.9, status: "active", version: 2, outstanding: null, wallet: { amountMinor: 5000, currency: "SEK" }, consents: {} },
  { riderId: "R502", firstName: "Omar", phone: "+46700000502", status: "active", version: 1, outstanding: { amountMinor: 4900, currency: "SEK" }, wallet: { amountMinor: 0, currency: "SEK" }, consents: {} },
];

/** GET /admin/live/drivers: Anna online on T2002 with a fresh position. */
export const LIVE_DRIVERS = { items: [{ driverId: "D1001", firstName: "Anna", onlineStatus: "on_trip", moving: true, location: { lat: 59.3345, lng: 18.0632, accuracy: 6, measuredAt: "2026-10-26T09:20:40Z" }, lastFixAt: "2026-10-26T09:20:41Z", stale: false, activeTripId: "T2002", tripStatus: "in_trip", vehicleId: "V1", plate: "ABC 123", zoneId: "Z001" }], staleAfterSeconds: 120, serverTime: "2026-10-26T09:21:00Z" };

export const PAYMENTS = [
  { paymentId: "pay_T2001", tripId: "T2001", amount: { amountMinor: 52000, currency: "SEK" }, method: "card", purpose: "trip", status: "captured", createdAt: "2026-10-25T08:31:00Z", cashCollected: { amountMinor: 0, currency: "SEK" }, walletApplied: { amountMinor: 0, currency: "SEK" } },
  { paymentId: "pay_T2003", tripId: "T2003", amount: { amountMinor: 4500, currency: "SEK" }, method: "cash", purpose: "trip", status: "failed", createdAt: "2026-10-26T07:04:00Z", cashCollected: { amountMinor: 0, currency: "SEK" }, walletApplied: { amountMinor: 0, currency: "SEK" } },
];

export const AUDIT = [
  { auditId: "41", at: "2026-10-26T08:00:00Z", actor: "admin", actorId: "A1", actorRole: "super", action: "driver.status", targetType: "driver", targetId: "D1001", reason: "Documents out of date", result: "committed", after: { zoneId: "Z001", accountStatus: "on_hold" }, requestId: "41" },
];

export const APPROVALS = [
  { approvalId: "AP7", action: "trip.refund", targetType: "trip", targetId: "T2001", status: "pending_approval", requestedBy: "A2", requestedAt: "2026-10-26T09:00:00Z" },
];

export const REFUND_PAYOUTS = [
  { refundId: "RF9", tripId: "T2003", amount: { amountMinor: 4500, currency: "SEK" }, status: "done", reason: "Charged twice", createdAt: "2026-10-26T08:10:00Z", riderId: "R503", riderName: "Lea", riderPhone: "+46700000503", payoutTo: { method: "swish", phone: "+46700000503" }, payoutStatus: "pending" },
];

export const PAYOUTS = [
  { payoutId: "PY1", driverId: "D1001", driverName: "Anna Berg", zoneId: "Z001", amount: { amountMinor: -6500, currency: "SEK" }, status: "pending", periodStart: "2026-10-19T22:00:00Z", periodEnd: "2026-10-26T23:00:00Z", createdAt: "2026-10-27T01:00:00Z", source: "weekly", tripCount: 2,
    lines: [{ code: "trips", amount: { amountMinor: 39400, currency: "SEK" }, count: 2 }, { code: "waiting", amount: { amountMinor: 600, currency: "SEK" } }, { code: "bonus", amount: { amountMinor: 1000, currency: "SEK" } }, { code: "fees", amount: { amountMinor: 2500, currency: "SEK" } }, { code: "cash_collected", amount: { amountMinor: -50000, currency: "SEK" } }] },
];

export const TICKETS = [
  { ticketId: "TK1", tripId: "T2001", openedBy: "rider", riderId: "R501", category: "ride_dispute", subject: "Charged too much", status: "open", priority: "normal", createdAt: "2026-10-26T09:00:00Z", updatedAt: "2026-10-26T09:00:00Z", zoneId: "Z001", lastMessageAt: "2026-10-26T09:00:00Z" },
];
export const TICKET_MESSAGES = [{ messageId: "M1", from: "rider", text: "The driver took a long way.", at: "2026-10-26T09:00:00Z" }];

export const RATINGS = [
  { tripId: "T2001", from: "rider", stars: 2, tags: ["clean_car"], comment: "Late and rude", at: "2026-10-25T08:40:00Z", riderId: "R501", riderName: "Ida", driverId: "D1001", driverName: "Anna Berg", zoneId: "Z001", hidden: false },
  { tripId: "T2001", from: "driver", stars: 5, tags: ["polite", "on_time"], at: "2026-10-25T08:41:00Z", riderId: "R501", riderName: "Ida", driverId: "D1001", driverName: "Anna Berg", zoneId: "Z001", hidden: false },
];

export const RISK = [
  { who: "driver", id: "D1001", name: "Anna Berg", zoneId: "Z001", signals: { cancels: { value: 40, count: 2, total: 5 }, low_rating: { value: 3.9, count: 12 } } },
  { who: "rider", id: "R502", name: "Omar", zoneId: "Z001", signals: { failed_payments: { value: 5, count: 5 } } },
];

/** One live day and one summarized day per zone in the range asked (GET /admin/kpis). */
const SE_ZONES = ["Z001", "Z002", "Z003", "Z004", "Z005", "Z006", "Z007", "Z008", "Z009", "ARN", "BMA"];
export function kpiDays(from: string, to: string) {
  const out = [];
  for (let day = from; day <= to; ) {
    const live = day === to;
    for (const zoneId of SE_ZONES.slice(1)) out.push({ date: day, zoneId, source: live ? "live" : "summary", currency: "SEK", completedTrips: 0, cancelledTrips: 0, noShows: 0, gross: 0, commission: 0, driverEarnings: 0, pickupPay: 0, driverBonus: 0, cashCollected: 0, walletApplied: 0, newRiders: 0, newDrivers: 0 });
    out.push({ date: day, zoneId: "Z001", source: live ? "live" : "summary", currency: "SEK", completedTrips: 3, cancelledTrips: 1, noShows: 0, gross: 123400, commission: 24680, driverEarnings: 98720, pickupPay: 1500, driverBonus: 0, cashCollected: 52000, walletApplied: 0, newRiders: 1, newDrivers: 0 });
    const next = new Date(`${day}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    day = next.toISOString().slice(0, 10);
  }
  return out;
}

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
  invitations: (typeof INVITATIONS)[number][];
  /** GET /admin/incidents and the incident feed (contract v0.7.0). */
  incidents: Incident[];
  /** Feed events so far: one per change, numbered from 1. */
  incidentEvents: { eventId: string; sequence: number; kind: string; incident: Incident; occurredAt: string; serverTime: string }[];
  riders: Record<string, unknown>[];
  payouts: Record<string, unknown>[];
  tickets: Record<string, unknown>[];
  ticketMessages: Record<string, unknown>[];
  ratings: Record<string, unknown>[];
  approvals: (typeof APPROVALS)[number][];
  refundPayouts: (typeof REFUND_PAYOUTS)[number][];
};

export async function fakeTripServer(page: Page, init: Partial<TripState> = {}): Promise<TripState> {
  const state: TripState = { trips: [COMPLETED_TRIP, ACTIVE_TRIP, CANCELLED_TRIP].map((trip) => ({ ...trip })), calls: [], drivers: [{ ...DRIVER }, { ...OWNER }], fleets: [{ ...FLEET }], vehicles: [{ ...VEHICLE }], invitations: INVITATIONS.map((item) => ({ ...item })), incidents: [], incidentEvents: [], riders: RIDERS.map((item) => ({ ...item })), payouts: PAYOUTS.map((item) => ({ ...item })), tickets: TICKETS.map((item) => ({ ...item })), ticketMessages: TICKET_MESSAGES.map((item) => ({ ...item })), ratings: RATINGS.map((item) => ({ ...item })), approvals: APPROVALS.map((item) => ({ ...item })), refundPayouts: REFUND_PAYOUTS.map((item) => ({ ...item })), ...init };
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
    if (p === "/api/v1/admin/riders") return json(route, 200, { items: state.riders, nextCursor: null });
    if (p === "/api/v1/admin/live/drivers") return json(route, 200, LIVE_DRIVERS);
    if (p === "/api/v1/admin/payments") return json(route, 200, { items: PAYMENTS, nextCursor: null });
    if (p === "/api/v1/admin/audit") return json(route, 200, { items: AUDIT, nextCursor: null });
    if (p === "/api/v1/admin/approvals") return json(route, 200, { items: state.approvals, nextCursor: null });
    const decided = /^\/api\/v1\/admin\/approvals\/([^/]+)\/(approve|reject)$/.exec(p);
    if (decided) {
      state.approvals = state.approvals.filter((item) => item.approvalId !== decided[1]);
      return json(route, 200, { approvalId: decided[1], status: decided[2] === "approve" ? "approved" : "rejected" });
    }
    if (p === "/api/v1/admin/payouts" && method === "GET") return json(route, 200, { items: state.payouts, nextCursor: null });
    if (p === "/api/v1/admin/payouts" && method === "POST") {
      const made = { payoutId: `PY${state.payouts.length + 1}`, driverId: body.driverId, driverName: "Anna Berg", zoneId: "Z001", amount: { amountMinor: 41600, currency: "SEK" }, status: "pending", periodStart: body.from, periodEnd: body.to, createdAt: "2026-10-27T10:00:00Z", source: "manual", tripCount: 1, lines: [{ code: "trips", amount: { amountMinor: 41600, currency: "SEK" }, count: 1 }] };
      state.payouts.unshift(made);
      return json(route, 201, made);
    }
    const payoutPaid = /^\/api\/v1\/admin\/payouts\/([^/]+)\/paid$/.exec(p);
    if (payoutPaid) {
      const item = state.payouts.find((row) => row["payoutId"] === payoutPaid[1]);
      if (!item) return json(route, 404, { code: "not_found", message: "No such payout.", requestId: "r-404p", retryable: false });
      item["status"] = "paid";
      item["paidAt"] = "2026-10-27T10:05:00Z";
      return json(route, 200, item);
    }
    if (p === "/api/v1/admin/tickets") return json(route, 200, { items: state.tickets.filter((item) => !url.searchParams.get("status") || item["status"] === url.searchParams.get("status")), nextCursor: null });
    const ticket = /^\/api\/v1\/admin\/tickets\/([^/]+)(\/reply)?$/.exec(p);
    if (ticket) {
      const item = state.tickets.find((row) => row["ticketId"] === ticket[1]);
      if (!item) return json(route, 404, { code: "not_found", message: "No such ticket.", requestId: "r-404k", retryable: false });
      if (ticket[2]) {
        state.ticketMessages.push({ messageId: `M${state.ticketMessages.length + 1}`, from: "support", text: body.text, at: "2026-10-27T10:00:00Z", adminName: "Nora Lind" });
        item["status"] = body.status ?? "pending";
      }
      return json(route, 200, { ...item, messages: state.ticketMessages });
    }
    if (p === "/api/v1/admin/ratings") return json(route, 200, { items: state.ratings, nextCursor: null });
    const moderate = /^\/api\/v1\/admin\/ratings\/([^/]+)\/(rider|driver)\/(hide|restore)$/.exec(p);
    if (moderate) {
      const item = state.ratings.find((row) => row["tripId"] === moderate[1] && row["from"] === moderate[2]);
      if (!item) return json(route, 404, { code: "not_found", message: "No such rating.", requestId: "r-404r", retryable: false });
      item["hidden"] = moderate[3] === "hide";
      return json(route, 200, item);
    }
    if (p === "/api/v1/admin/risk/signals") return json(route, 200, { items: RISK, nextCursor: null });
    if (p === "/api/v1/admin/kpis") return json(route, 200, { days: kpiDays(url.searchParams.get("fromDate") ?? "2026-10-27", url.searchParams.get("toDate") ?? "2026-10-27"), generatedAt: "2026-10-27T10:00:00Z" });
    if (p === "/api/v1/admin/dispatch/stream") return json(route, 200, { items: [], nextCursor: null });
    if (p === "/api/v1/admin/refunds/payouts") return json(route, 200, { items: state.refundPayouts, nextCursor: null });
    const paid = /^\/api\/v1\/admin\/refunds\/([^/]+)\/paid$/.exec(p);
    if (paid) {
      state.refundPayouts = state.refundPayouts.filter((item) => item.refundId !== paid[1]);
      return json(route, 200, { refundId: paid[1], payoutStatus: "paid" });
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
