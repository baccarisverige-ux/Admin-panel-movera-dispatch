/**
 * The demo pages against the Movera server: an AdminApi that the demo screens read and write unchanged. The
 * collections the server already serves (drivers, fleets, fleet owners, vehicles, trips, trip offers) come from it,
 * mapped to the demo record shape; every other collection is empty and every other slice keeps the page's own
 * starting value, so the page looks as in the demo with a "Not connected yet" marker (src/live/connection.ts).
 * Commands the server has (driver status, vehicle review, full refund) go to it; any other command is refused.
 */
import { catalogFor } from "../data/catalog.ts";
import { CURRENCY, TIME_ZONE } from "../domain/contract.ts";
import { isCurrency } from "../domain/money.ts";
import { MARKETS } from "../markets/markets.ts";
import type { AdminApi, CommandInput, CommandResult } from "../api/create.ts";
import type { TripOffersView } from "../api/dispatchSim.ts";
import { ApiError } from "../api/httpClient.ts";
import type { ApprovalRow, AuditRow, DemoRecord, LiveTripFacts } from "../api/seed.ts";
import type { LiveClient } from "./session.ts";
import { STATUS_PARAM, listQueryOf, setListQuery, type LiveListName } from "./liveLists.ts";
import type { Approval, AuditEntry, DocumentSummary, Driver, Fleet, LiveDriverList, LiveDriverRow, LiveMoney, NearbyDriver, Page, Payment, RefundPayout, Rider, Trip, TripOffer, Vehicle } from "./types.ts";
import { bookFrom, incidentRecord, nudgeIncidentFeed, type ServerIncident } from "./incidents.ts";
import type { SafetyBook } from "../safety/ops.ts";
import type { NearbyDriver as AssignNearbyDriver } from "../dispatch/assign.ts";
import { zoneById } from "../markets/markets.ts";
import { remember, setLiveData } from "./realData.ts";

export const NOT_CONNECTED = "Not connected yet.";

const PAGE_LIMIT = 100;
/** One server page of a list page; "Load more" asks for the next one. */
export const LIST_PAGE = 50;
const MAX_PAGES = 20;

async function all<T>(client: LiveClient, path: string): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  for (let index = 0; index < MAX_PAGES; index += 1) {
    const query = new URLSearchParams({ limit: String(PAGE_LIMIT), ...(cursor ? { cursor } : {}) });
    const page: Page<T> = await client.json<Page<T>>(`${path}?${query.toString()}`);
    items.push(...page.items);
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  return items;
}

/** A list page's own rows: the server's search and status filter, as many pages as "Load more" asked for. */
async function paged<T>(client: LiveClient, name: LiveListName, path: string): Promise<T[]> {
  const query = listQueryOf(name);
  const items: T[] = [];
  let cursor: string | null = null;
  for (let index = 0; index < query.pages; index += 1) {
    const params = new URLSearchParams({ limit: String(LIST_PAGE) });
    if (query.q) params.set("q", query.q);
    if (query.status) params.set(STATUS_PARAM[name], query.status);
    if (cursor) params.set("cursor", cursor);
    const page: Page<T> = await client.json<Page<T>>(`${path}?${params.toString()}`);
    items.push(...page.items);
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  setListQuery(name, { hasMore: Boolean(cursor) });
  return items;
}

function fullName(first: string, last?: string): string {
  return [first, last].filter(Boolean).join(" ");
}

/** The demo's one-word document state of a person or car. */
export function docState(documents: readonly DocumentSummary[] = [], required: readonly string[] = []): string {
  if (documents.some((doc) => doc.status === "rejected")) return "rejected";
  if (documents.some((doc) => doc.status === "expired")) return "expired";
  const have = new Set(documents.filter((doc) => doc.status !== "missing").map((doc) => doc.type));
  if (required.some((type) => !have.has(type))) return "needed";
  if (documents.some((doc) => doc.status === "in_review")) return "in_review";
  return "approved";
}

export function driverRecord(driver: Driver, live?: LiveDriverRow): DemoRecord {
  const location = live?.location ?? driver.location;
  return {
    id: driver.driverId,
    name: fullName(driver.firstName, driver.lastName),
    phone: "",
    zoneId: live?.zoneId ?? driver.zoneIds[0] ?? "",
    status: driver.accountStatus,
    kind: docState(driver.documents, driver.requiredDocuments),
    fleetId: driver.fleet?.fleetId ?? null,
    ...(driver.email ? { email: driver.email } : {}),
    live: true,
    liveDriver: {
      onlineStatus: live?.onlineStatus ?? driver.onlineStatus,
      rating: typeof driver.rating === "number" ? driver.rating : null,
      location: location ? { lat: location.lat, lng: location.lng, measuredAt: location.measuredAt } : null,
      lastFixAt: live?.lastFixAt ?? driver.lastFixAt ?? null,
      stale: live ? live.stale : null,
      activeTripId: live?.activeTripId ?? null,
    },
  };
}

const VEHICLE_STATUS: Record<string, string> = { approved: "eligible", pending: "pending", rejected: "ineligible", blocked: "on_hold" };

export function vehicleRecord(vehicle: Vehicle, drivers: ReadonlyMap<string, Driver>): DemoRecord {
  const driver = vehicle.driverId ? drivers.get(vehicle.driverId) : undefined;
  return {
    id: vehicle.vehicleId,
    name: driver ? fullName(driver.firstName, driver.lastName) : "",
    phone: "",
    zoneId: driver?.zoneIds[0] ?? "",
    status: VEHICLE_STATUS[vehicle.status] ?? vehicle.status,
    plate: vehicle.plate,
    driverId: vehicle.driverId ?? null,
    fleetId: vehicle.fleetId ?? null,
    year: vehicle.year,
    seats: vehicle.seats,
    make: vehicle.make,
    model: vehicle.model,
  };
}

const FLEET_STATUS: Record<string, string> = { approved: "active", pending: "pending", rejected: "on_hold", blocked: "suspended" };

export function fleetRecord(fleet: Fleet, zoneId: string): DemoRecord {
  return { id: fleet.fleetId, name: fleet.name, phone: "", zoneId, status: FLEET_STATUS[fleet.status] ?? fleet.status, ownerId: fleet.ownerDriverId };
}

export function ownerRecord(fleet: Fleet, zoneId: string): DemoRecord {
  return {
    id: fleet.ownerDriverId,
    name: fleet.ownerName,
    phone: "",
    zoneId,
    status: FLEET_STATUS[fleet.status] ?? fleet.status,
    company: fleet.name,
    orgNumber: fleet.orgNumber,
    joinedAt: fleet.createdAt,
    ...(fleet.ownerEmail ? { email: fleet.ownerEmail } : {}),
  };
}

/** The demo trip's payment state (DemoRecord.kind) from the server's paymentStatus. */
function paymentKind(status?: string): string | undefined {
  if (status === "partially_refunded") return "captured";
  return status && ["pending", "authorized", "captured", "failed", "refunded"].includes(status) ? status : undefined;
}

const minorOf = (money?: LiveMoney | null): number | null => (money && Number.isFinite(money.amountMinor) ? money.amountMinor : null);

/** The server's facts of a trip, kept whole on the record (owner rule, part 3: no page invents them). */
export function tripFacts(trip: Trip): LiveTripFacts {
  return {
    kind: trip.kind,
    categoryId: trip.categoryId,
    paymentMethod: trip.paymentMethod,
    paymentStatus: trip.paymentStatus ?? null,
    currency: trip.fare.currency,
    pickup: trip.pickup,
    dropoff: trip.dropoff,
    stops: trip.stops ?? [],
    fare: trip.fare.amountMinor,
    fareLines: (trip.fareLines ?? []).map((line) => ({ code: line.code, amountMinor: line.amount.amountMinor })),
    commission: minorOf(trip.commission),
    driverEarnings: minorOf(trip.driverEarnings),
    pickupPay: minorOf(trip.pickupPay),
    driverBonus: minorOf(trip.driverBonus),
    walletApplied: minorOf(trip.walletApplied),
    cashToCollect: minorOf(trip.cashToCollect),
    driverSilentAlert: trip.driverSilentAlert ?? null,
    ratingStatus: trip.ratingStatus ?? null,
    updatedAt: trip.updatedAt,
  };
}

export function tripRecord(trip: Trip, rider?: Rider): DemoRecord {
  return {
    id: trip.tripId,
    name: rider?.firstName || trip.riderId,
    phone: rider?.phone ?? "",
    zoneId: trip.zoneId,
    status: trip.status,
    driverId: trip.driverId ?? null,
    fareOre: trip.fare.amountMinor,
    createdAt: trip.createdAt,
    tripId: trip.riderId,
    ...(trip.acceptedAt ? { acceptedAt: trip.acceptedAt } : {}),
    ...(trip.scheduledAt ? { pickupAt: trip.scheduledAt } : {}),
    ...(paymentKind(trip.paymentStatus) ? { kind: paymentKind(trip.paymentStatus) } : {}),
    ...(trip.cancellation ? { cancelReasonCode: trip.cancellation.reasonCode } : {}),
    version: trip.version,
    live: true,
    liveTrip: tripFacts(trip),
  } as DemoRecord;
}

/** A rider row: AdminRider. zoneId is empty, the server keeps no home zone for a rider. */
export function riderRecord(rider: Rider): DemoRecord {
  return {
    id: rider.riderId,
    name: rider.firstName,
    phone: rider.phone,
    zoneId: "",
    status: rider.status,
    version: rider.version,
    ...(rider.email ? { email: rider.email } : {}),
    live: true,
    liveRider: {
      rating: typeof rider.rating === "number" ? rider.rating : null,
      walletMinor: minorOf(rider.wallet),
      outstandingMinor: rider.outstanding ? rider.outstanding.amountMinor : null,
      currency: rider.wallet?.currency ?? rider.outstanding?.currency ?? null,
      deletionRequestedAt: rider.deletionRequestedAt ?? null,
    },
  };
}

/** A payment row: the trip's PaymentIntent. name is the method, as in the demo's "Card". */
export function paymentRecord(payment: Payment, zoneId = ""): DemoRecord {
  return { id: payment.paymentId, name: payment.method, phone: "", zoneId, status: payment.status, tripId: payment.tripId, fareOre: payment.amount.amountMinor, createdAt: payment.createdAt, kind: payment.method, live: true };
}

/** A refund to send by hand (Swish/bank): the rider and the amount. */
export function refundPayoutRecord(row: RefundPayout): DemoRecord {
  return { id: row.refundId, name: row.riderName, phone: row.riderPhone, zoneId: "", status: row.payoutStatus ?? "pending", tripId: row.tripId, fareOre: row.amount.amountMinor, ...(row.createdAt ? { createdAt: row.createdAt } : {}), notes: row.reason ?? "", live: true };
}

/** A nearby driver as the assign tool shows it; the rating is the server's or null (never invented). */
export function nearbyRow(row: NearbyDriver, categoryId: string, rating: number | null): AssignNearbyDriver {
  return {
    driverId: row.driverId,
    name: row.firstName,
    onlineStatus: row.onlineStatus === "on_trip" ? "on_trip" : "online",
    distanceMeters: row.distanceMeters,
    pickupEtaSeconds: row.pickupEtaSeconds,
    zoneId: row.zoneId ?? "",
    zoneName: row.zoneId ? zoneById(row.zoneId)?.name ?? row.zoneId : "",
    categoryIds: row.categoryIds,
    categoryOk: !categoryId || row.categoryIds.includes(categoryId),
    rating,
    ...(row.openOfferId ? { openOfferId: row.openOfferId } : {}),
  };
}

export function auditRow(entry: AuditEntry): AuditRow {
  const after = entry.after ?? {};
  const zone = typeof after["zoneId"] === "string" ? (after["zoneId"] as string) : "";
  return {
    id: entry.auditId,
    operationId: entry.requestId,
    at: entry.at,
    actorId: entry.actorId,
    action: entry.action,
    targetId: entry.targetId,
    scope: zone,
    before: "",
    after: Object.keys(after).length ? JSON.stringify(after) : "",
    reason: entry.reason ?? "",
    result: entry.result === "pending_approval" ? "pending_approval" : "committed",
  };
}

const APPROVAL_STATUS: Record<Approval["status"], ApprovalRow["status"] | null> = { pending_approval: "pending", approved: "approved", rejected: "rejected", expired: null };

/** An approval row. The server's Approval has no amount: amountOre is NaN, and the page shows "Not connected yet". */
export function approvalRow(approval: Approval): ApprovalRow | null {
  const status = APPROVAL_STATUS[approval.status];
  if (!status) return null;
  return {
    id: approval.approvalId,
    action: approval.action,
    targetId: approval.targetId,
    requestedBy: approval.requestedBy,
    amountOre: Number.NaN,
    reason: "",
    status,
    ...(approval.decidedBy ? { decidedBy: approval.decidedBy } : {}),
    ...(approval.decidedAt ? { decidedAt: approval.decidedAt } : {}),
    ...(approval.decisionNote ? { decisionReason: approval.decisionNote } : {}),
  };
}

const STATUS_COMMANDS: Record<string, string> = {
  "admin.driver.activate": "active",
  "admin.driver.reactivate": "active",
  "admin.driver.onHold": "on_hold",
  "admin.driver.suspend": "suspended",
};

const VEHICLE_COMMANDS: Record<string, string> = { "admin.vehicle.activate": "approved", "admin.vehicle.hold": "blocked" };

/** Incidents page commands the server has (contract v0.7.0 §15): Take, Solved, False alarm. */
const INCIDENT_COMMANDS: Record<string, "take" | "resolve" | "dismiss"> = { "admin.safety.take": "take", "admin.safety.resolve": "resolve", "admin.safety.dismiss": "dismiss" };

export function createLiveAdminApi(client: LiveClient): AdminApi {
  setLiveData(true);
  const drivers = new Map<string, Driver>();
  const riders = new Map<string, Rider>();
  const presence = new Map<string, LiveDriverRow>();
  const vehicles = new Map<string, Vehicle>();
  const trips = new Map<string, Trip>();
  const incidents = new Map<string, ServerIncident>();
  let currency: string = CURRENCY;

  async function readDrivers(own = false): Promise<Driver[]> {
    const rows = own ? await paged<Driver>(client, "drivers", "/admin/drivers") : await all<Driver>(client, "/admin/drivers");
    rows.forEach((row) => drivers.set(row.driverId, row));
    return rows;
  }

  async function readFleets(): Promise<Fleet[]> {
    return paged<Fleet>(client, "fleets", "/admin/fleets");
  }

  async function fleetZones(fleets: Fleet[]): Promise<Map<string, string>> {
    if (!drivers.size) await readDrivers().catch(() => []);
    return new Map(fleets.map((fleet) => [fleet.fleetId, drivers.get(fleet.ownerDriverId)?.zoneIds[0] ?? ""]));
  }

  async function readRiders(own = false): Promise<Rider[]> {
    const rows = own ? await paged<Rider>(client, "riders", "/admin/riders") : await all<Rider>(client, "/admin/riders");
    rows.forEach((row) => riders.set(row.riderId, row));
    return rows;
  }

  /** GET /admin/live/drivers: who is online now, with the last position (drivers not offline). */
  async function readPresence(): Promise<void> {
    const answer = await client.json<LiveDriverList>("/admin/live/drivers");
    presence.clear();
    answer.items.forEach((row) => presence.set(row.driverId, row));
  }

  async function list(name: string): Promise<DemoRecord[]> {
    const rows = await listRaw(name);
    remember(rows);
    return rows;
  }

  async function listRaw(name: string): Promise<DemoRecord[]> {
    if (name === "drivers") {
      const rows = await readDrivers(true);
      await readPresence().catch(() => undefined);
      return rows.map((row) => driverRecord(row, presence.get(row.driverId)));
    }
    if (name === "riders") return (await readRiders(true)).map(riderRecord);
    if (name === "payments") {
      const rows = await paged<Payment>(client, "payments", "/admin/payments");
      return rows.map((row) => paymentRecord(row, trips.get(row.tripId)?.zoneId ?? ""));
    }
    if (name === "refundPayouts") {
      const answer = await client.json<Page<RefundPayout>>("/admin/refunds/payouts?payoutStatus=pending");
      return answer.items.map(refundPayoutRecord);
    }
    if (name === "vehicles") {
      const rows = await paged<Vehicle>(client, "vehicles", "/admin/vehicles");
      rows.forEach((row) => vehicles.set(row.vehicleId, row));
      if (!drivers.size) await readDrivers().catch(() => []);
      return rows.map((row) => vehicleRecord(row, drivers));
    }
    if (name === "fleets" || name === "fleetOwners") {
      const fleets = await readFleets();
      const zones = await fleetZones(fleets);
      return fleets.map((fleet) => (name === "fleets" ? fleetRecord : ownerRecord)(fleet, zones.get(fleet.fleetId) ?? ""));
    }
    if (name === "trips") {
      const rows = await paged<Trip>(client, "trips", "/admin/trips");
      rows.forEach((row) => trips.set(row.tripId, row));
      if (rows[0] && isCurrency(rows[0].fare.currency)) currency = rows[0].fare.currency;
      if (!riders.size) await readRiders().catch(() => []);
      return rows.map((row) => tripRecord(row, riders.get(row.riderId)));
    }
    if (name === "incidents") {
      const rows = await all<ServerIncident>(client, "/admin/incidents");
      rows.forEach((row) => incidents.set(row.incidentId, row));
      return rows.map(incidentRecord);
    }
    if (name === "zones") return MARKETS.flatMap((market) => market.zones.map((zone) => ({ id: zone.id, name: zone.name, phone: "", zoneId: zone.id, status: "active" })));
    return [];
  }

  async function command(input: CommandInput): Promise<CommandResult> {
    const done = (message: string, status: CommandResult["status"] = "committed"): CommandResult => ({ message, operationId: input.idempotencyKey ?? input.action, status, rev: 0 });
    const toStatus = STATUS_COMMANDS[input.action];
    if (toStatus) {
      const driver = drivers.get(input.targetId) ?? (await client.json<Driver>(`/admin/drivers/${encodeURIComponent(input.targetId)}`));
      const next = await client.post<Driver>(`/admin/drivers/${encodeURIComponent(driver.driverId)}/status`, { expectedVersion: driver.version, accountStatus: toStatus, note: input.reason });
      if (next?.driverId) drivers.set(next.driverId, next);
      return done("Saved.");
    }
    const decision = VEHICLE_COMMANDS[input.action];
    if (decision) {
      const vehicle = vehicles.get(input.targetId);
      if (!vehicle) throw new ApiError(404, "No such vehicle.", { code: "not_found" });
      const next = await client.post<Vehicle>(`/admin/vehicles/${encodeURIComponent(vehicle.vehicleId)}/review`, { expectedVersion: vehicle.version, decision, note: input.reason });
      if (next?.vehicleId) vehicles.set(next.vehicleId, next);
      return done("Saved.");
    }
    const step = INCIDENT_COMMANDS[input.action];
    if (step) {
      const incident = incidents.get(input.targetId) ?? (await client.json<ServerIncident>(`/admin/incidents/${encodeURIComponent(input.targetId)}`));
      // The note is the last line the page wrote in its safety book (the outcome box), else the reason.
      const book = input.value as SafetyBook | undefined;
      const note = step === "take" ? undefined : book?.incidents[input.targetId]?.events.at(-1)?.text ?? input.reason;
      const next = await client.post<ServerIncident>(`/admin/incidents/${encodeURIComponent(incident.incidentId)}/${step}`, { expectedVersion: incident.version ?? 1, ...(note ? { note } : {}) });
      if (next?.incidentId) incidents.set(next.incidentId, next);
      nudgeIncidentFeed();
      return done(step === "take" ? "Taken." : step === "resolve" ? "Solved." : "Marked as a false alarm.");
    }
    if (input.action === "admin.trip.refund") {
      const trip = trips.get(input.targetId) ?? (await client.json<Trip>(`/admin/trips/${encodeURIComponent(input.targetId)}`));
      const answer = await client.post<{ status?: string }>(`/admin/trips/${encodeURIComponent(trip.tripId)}/refund`, { expectedVersion: trip.version, amount: trip.fare, reason: input.reason });
      return answer?.status === "pending" ? done("Waits for a second admin.", "pending_approval") : done("Refunded.");
    }
    if (input.action === "admin.approval.approve" || input.action === "admin.approval.reject") {
      const decision = input.action.endsWith("approve") ? "approve" : "reject";
      await client.post(`/admin/approvals/${encodeURIComponent(input.targetId)}/${decision}`, { note: input.reason });
      return done(decision === "approve" ? "Approved." : "Rejected.");
    }
    if (input.action === "admin.refund.markPaid") {
      await client.post(`/admin/refunds/${encodeURIComponent(input.targetId)}/paid`, input.reason ? { note: input.reason } : {});
      return done("Marked as paid.");
    }
    throw new ApiError(400, NOT_CONNECTED, { code: "invalid_request", retryable: false });
  }

  function nameOf(driverId: string): string {
    const driver = drivers.get(driverId);
    return driver ? fullName(driver.firstName, driver.lastName) : driverId;
  }

  async function tripOffers(tripId: string): Promise<TripOffersView> {
    const trip = trips.get(tripId) ?? (await client.json<Trip>(`/admin/trips/${encodeURIComponent(tripId)}`));
    const page = await client.json<Page<TripOffer & { version?: number }>>(`/admin/trips/${encodeURIComponent(tripId)}/offers?limit=50`);
    const tripCurrency = isCurrency(trip.fare.currency) ? trip.fare.currency : CURRENCY;
    return {
      tripId,
      status: trip.status,
      currency: tripCurrency,
      offers: page.items.map((offer) => ({
        offerId: offer.offerId,
        tripId,
        driverId: offer.driverId ?? "",
        driverName: offer.driverId ? nameOf(offer.driverId) : "",
        kind: offer.kind === "radar" ? "radar" : "assigned",
        status: offer.status,
        source: "admin",
        version: offer.version ?? 1,
        sentAt: offer.expiresAt,
        expiresAt: offer.expiresAt,
        currency: tripCurrency,
        fareMinor: offer.fare.amountMinor,
        driverEarningsMinor: offer.driverEarnings?.amountMinor ?? 0,
        driverBonusMinor: offer.driverBonus?.amountMinor ?? 0,
        priority: Boolean(offer.priority),
        ...(offer.groupId ? { groupId: offer.groupId } : {}),
        by: offer.source ?? "",
      })),
      groups: [],
      bonusMinor: trip.driverBonus?.amountMinor ?? 0,
      bonusExclusiveMinor: 0,
      bonusRadarMinor: 0,
      priority: false,
      lockedTo: null,
      events: [],
      timers: { exclusiveSeconds: 0, radarSeconds: 0 },
      limits: { limitMinor: 0, hardMaxMinor: 0 },
      fareMinor: trip.fare.amountMinor,
      driverNetMinor: trip.driverEarnings?.amountMinor ?? 0,
      commissionMinor: trip.commission?.amountMinor ?? 0,
      accepted: null,
    } as unknown as TripOffersView;
  }

  return {
    kind: "http",
    demo: false,
    ready: async () => ({ currency: isCurrency(currency) ? currency : CURRENCY, timeZone: TIME_ZONE, demo: false }),
    page: async (pageId) => catalogFor(pageId),
    list: async (name) => list(name),
    search: async () => [],
    command,
    revision: async () => 0,
    audit: async () => (await all<AuditEntry>(client, "/admin/audit")).map(auditRow),
    approvals: async () => (await all<Approval>(client, "/admin/approvals")).map(approvalRow).filter((row): row is ApprovalRow => row !== null),
    operation: async () => null,
    reset: async () => { throw new ApiError(400, NOT_CONNECTED, { code: "invalid_request", retryable: false }); },
    getFault: async () => "none",
    setFault: async () => undefined,
    inbox: async () => [],
    freshness: async () => new Date().toISOString(),
    // The Incidents page's safety book (owner and steps of each case) comes from the server's incidents.
    readSlice: async (key, fallback) => {
      if (key !== "safetyOps") return fallback;
      if (!incidents.size) await list("incidents").catch(() => []);
      return bookFrom(incidents.values()) as typeof fallback;
    },
    tripOffers,
    nearbyDrivers: async (tripId, query) => {
      const params = new URLSearchParams({ scope: query.scope, ...(query.radiusKm !== undefined ? { radiusKm: String(query.radiusKm) } : {}) });
      const answer = await client.json<{ items: NearbyDriver[]; scope: typeof query.scope; radiusKm?: number }>(`/admin/trips/${encodeURIComponent(tripId)}/nearby-drivers?${params.toString()}`);
      const trip = trips.get(tripId);
      return { scope: answer.scope, ...(answer.radiusKm !== undefined ? { radiusKm: answer.radiusKm } : {}), items: answer.items.map((row) => nearbyRow(row, trip?.categoryId ?? "", drivers.get(row.driverId)?.rating ?? null)) };
    },
    dispatchEvents: async () => ({ items: [], last: 0 }),
  };
}
