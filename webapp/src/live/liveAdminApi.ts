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
import type { DemoRecord } from "../api/seed.ts";
import type { LiveClient } from "./session.ts";
import type { DocumentSummary, Driver, Fleet, Page, Trip, TripOffer, Vehicle } from "./types.ts";

export const NOT_CONNECTED = "Not connected yet.";

const PAGE_LIMIT = 100;
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

export function driverRecord(driver: Driver): DemoRecord {
  return {
    id: driver.driverId,
    name: fullName(driver.firstName, driver.lastName),
    phone: "",
    zoneId: driver.zoneIds[0] ?? "",
    status: driver.accountStatus,
    kind: docState(driver.documents, driver.requiredDocuments),
    fleetId: driver.fleet?.fleetId ?? null,
    ...(driver.email ? { email: driver.email } : {}),
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

export function tripRecord(trip: Trip): DemoRecord {
  return {
    id: trip.tripId,
    name: trip.riderId,
    phone: "",
    zoneId: trip.zoneId,
    status: trip.status,
    driverId: trip.driverId ?? null,
    fareOre: trip.fare.amountMinor,
    createdAt: trip.createdAt,
    ...(trip.acceptedAt ? { acceptedAt: trip.acceptedAt } : {}),
    ...(trip.scheduledAt ? { pickupAt: trip.scheduledAt } : {}),
    ...(paymentKind(trip.paymentStatus) ? { kind: paymentKind(trip.paymentStatus) } : {}),
    ...(trip.cancellation ? { cancelReasonCode: trip.cancellation.reasonCode } : {}),
  } as DemoRecord;
}

const STATUS_COMMANDS: Record<string, string> = {
  "admin.driver.activate": "active",
  "admin.driver.reactivate": "active",
  "admin.driver.onHold": "on_hold",
  "admin.driver.suspend": "suspended",
};

const VEHICLE_COMMANDS: Record<string, string> = { "admin.vehicle.activate": "approved", "admin.vehicle.hold": "blocked" };

export function createLiveAdminApi(client: LiveClient): AdminApi {
  const drivers = new Map<string, Driver>();
  const vehicles = new Map<string, Vehicle>();
  const trips = new Map<string, Trip>();
  let currency: string = CURRENCY;

  async function readDrivers(): Promise<Driver[]> {
    const rows = await all<Driver>(client, "/admin/drivers");
    rows.forEach((row) => drivers.set(row.driverId, row));
    return rows;
  }

  async function readFleets(): Promise<Fleet[]> {
    return all<Fleet>(client, "/admin/fleets");
  }

  async function fleetZones(fleets: Fleet[]): Promise<Map<string, string>> {
    if (!drivers.size) await readDrivers().catch(() => []);
    return new Map(fleets.map((fleet) => [fleet.fleetId, drivers.get(fleet.ownerDriverId)?.zoneIds[0] ?? ""]));
  }

  async function list(name: string): Promise<DemoRecord[]> {
    if (name === "drivers") return (await readDrivers()).map(driverRecord);
    if (name === "vehicles") {
      const rows = await all<Vehicle>(client, "/admin/vehicles");
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
      const rows = await all<Trip>(client, "/admin/trips");
      rows.forEach((row) => trips.set(row.tripId, row));
      if (rows[0] && isCurrency(rows[0].fare.currency)) currency = rows[0].fare.currency;
      return rows.map(tripRecord);
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
    if (input.action === "admin.trip.refund") {
      const trip = trips.get(input.targetId) ?? (await client.json<Trip>(`/admin/trips/${encodeURIComponent(input.targetId)}`));
      const answer = await client.post<{ status?: string }>(`/admin/trips/${encodeURIComponent(trip.tripId)}/refund`, { expectedVersion: trip.version, amount: trip.fare, reason: input.reason });
      return answer?.status === "pending" ? done("Waits for a second admin.", "pending_approval") : done("Refunded.");
    }
    throw new ApiError(400, NOT_CONNECTED, { code: "invalid_request", retryable: false });
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
        driverId: "",
        driverName: "",
        kind: offer.kind === "radar" ? "radar" : "assigned",
        status: offer.status,
        source: "admin",
        version: offer.version ?? 1,
        sentAt: offer.expiresAt,
        expiresAt: offer.expiresAt,
        currency: tripCurrency,
        fareMinor: offer.fare.amountMinor,
        driverEarningsMinor: offer.driverEarnings?.amountMinor ?? 0,
        driverBonusMinor: 0,
        priority: false,
        by: "",
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
    audit: async () => [],
    approvals: async () => [],
    operation: async () => null,
    reset: async () => { throw new ApiError(400, NOT_CONNECTED, { code: "invalid_request", retryable: false }); },
    getFault: async () => "none",
    setFault: async () => undefined,
    inbox: async () => [],
    freshness: async () => new Date().toISOString(),
    readSlice: async (_key, fallback) => fallback,
    tripOffers,
    nearbyDrivers: async (_tripId, query) => ({ scope: query.scope, ...(query.radiusKm !== undefined ? { radiusKm: query.radiusKm } : {}), items: [] }),
    dispatchEvents: async () => ({ items: [], last: 0 }),
  };
}
