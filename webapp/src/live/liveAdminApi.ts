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
import { NO_FILTER, zoneFilterOf, type ZoneFilter } from "./zoneFilter.ts";

export { zoneFilterOf, type ZoneFilter };
import type { AdminApi, CommandInput, CommandResult } from "../api/create.ts";
import type { TripOffersView } from "../api/dispatchSim.ts";
import { ApiError } from "../api/httpClient.ts";
import { radarRepeatOf, toolRefusal, type RadarZoneSend } from "./dispatchTools.ts";
import { rememberSendTarget, sendTarget, setActiveRadarSend } from "../dispatch/radarSends.ts";
import type { ApprovalRow, AuditRow, DemoRecord, LiveDriverFacts, LiveTripFacts, ZoneScope } from "../api/seed.ts";
import type { LiveClient } from "./session.ts";
import { STATUS_PARAM, listQueryOf, setListQuery, type LiveListName } from "./liveLists.ts";
import { ridersOnlineRecords } from "../dashboard/riders.ts";
import { zoneSupplyRecords } from "../dashboard/insights.ts";
import type { AdminRating, SupportTicket, Approval, AuditEntry, DocumentSummary, Driver, DriverPerformance, Fleet, LiveDriverList, LiveDriverRow, LiveMoney, NearbyDriver, Page, Payment, RefundPayout, Rider, Trip, TripOffer, Vehicle } from "./types.ts";
import { bookFrom, incidentRecord, nudgeIncidentFeed, type ServerIncident } from "./incidents.ts";
import type { SafetyBook } from "../safety/ops.ts";
import type { NearbyDriver as AssignNearbyDriver } from "../dispatch/assign.ts";
import { controlBody, controlValueOf, dispatchControlPath, isPendingApproval, parseControl } from "./dispatchControl.ts";
import { zoneById } from "../markets/markets.ts";
import { remember, setLiveData } from "./realData.ts";
import { vehicleMissing } from "./activation.ts";
import { errorText, mainDocuments, requiredForVehicle } from "./format.ts";
import { tr } from "../i18n/index.ts";
import { SettingsChanged, createLiveSettings } from "./liveSettings.ts";

export const NOT_CONNECTED = "Not connected yet.";

const PAGE_LIMIT = 100;
/** One server page of a list page; "Load more" asks for the next one. */
export const LIST_PAGE = 50;
const MAX_PAGES = 20;

async function all<T>(client: LiveClient, path: string, filter: ZoneFilter = NO_FILTER, extra: Record<string, string> = {}): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  for (let index = 0; index < MAX_PAGES; index += 1) {
    const query = new URLSearchParams({ limit: String(PAGE_LIMIT), ...extra, ...(cursor ? { cursor } : {}) });
    for (const [key, value] of filter.params) query.set(key, value);
    const page: Page<T> = await client.json<Page<T>>(`${path}?${query.toString()}`);
    items.push(...page.items);
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  return items;
}

/** A list page's own rows: the server's search and status filter, as many pages as "Load more" asked for. */
async function paged<T>(client: LiveClient, name: LiveListName, path: string, filter: ZoneFilter = NO_FILTER): Promise<T[]> {
  const query = listQueryOf(name);
  const items: T[] = [];
  let cursor: string | null = null;
  for (let index = 0; index < query.pages; index += 1) {
    const params = new URLSearchParams({ limit: String(LIST_PAGE) });
    if (query.q) params.set("q", query.q);
    if (query.status) params.set(STATUS_PARAM[name], query.status);
    if (cursor) params.set("cursor", cursor);
    for (const [key, value] of filter.params) params.set(key, value);
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
export function docState(all: readonly DocumentSummary[] = [], required: readonly string[] = []): string {
  // v0.18.5 (G2-D1): a renewal waiting or refused does not change the state of the approved document.
  const documents = mainDocuments(all);
  if (documents.some((doc) => doc.status === "rejected")) return "rejected";
  if (documents.some((doc) => doc.status === "expired")) return "expired";
  const have = new Set(documents.filter((doc) => doc.status !== "missing").map((doc) => doc.type));
  if (required.some((type) => !have.has(type))) return "needed";
  if (documents.some((doc) => doc.status === "in_review")) return "in_review";
  return "approved";
}

/** G3-D2: the three numbers the panel shows from Driver.performance (null stays null → "—"). */
export function performanceFacts(performance: DriverPerformance): NonNullable<LiveDriverFacts["performance"]> {
  return { acceptancePct: performance.acceptancePct ?? null, cancellationPct: performance.cancellationPct ?? null, rating: performance.rating ?? null };
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
    liveAccount: {
      accountStatus: driver.accountStatus,
      documents: driver.documents ?? [],
      ...(driver.accountType ? { accountType: driver.accountType } : {}),
      ...(driver.country ? { country: driver.country } : {}),
      ...(driver.fleet ? { fleetRole: driver.fleet.role } : {}),
      ...(driver.vehicleId ? { vehicleId: driver.vehicleId } : {}),
      ...(driver.requiredDocuments ? { requiredDocuments: driver.requiredDocuments } : {}),
      ...(driver.requiredFleetDocuments ? { requiredFleetDocuments: driver.requiredFleetDocuments } : {}),
      ...(driver.categoryIds ? { categoryIds: [...driver.categoryIds] } : {}),
      ...(driver.createdAt ? { createdAt: driver.createdAt } : {}),
      ...(driver.termsAcceptedAt ? { termsAcceptedAt: driver.termsAcceptedAt } : {}),
    },
    liveDriver: {
      onlineStatus: live?.onlineStatus ?? driver.onlineStatus,
      rating: typeof driver.rating === "number" ? driver.rating : null,
      location: location ? { lat: location.lat, lng: location.lng, measuredAt: location.measuredAt } : null,
      lastFixAt: live?.lastFixAt ?? driver.lastFixAt ?? null,
      stale: live ? live.stale : null,
      activeTripId: live?.activeTripId ?? null,
      ...(driver.performance ? { performance: performanceFacts(driver.performance) } : {}),
    },
  };
}

const RIDE_CATEGORIES: string[] = ["economy", "comfort", "premium", "priority", "xl", "electric", "pet"];
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
    liveVehicleMissing: vehicleMissing(vehicle, driver?.country),
    ...(vehicle.fuel ? { fuel: vehicle.fuel } : {}),
    ...(RIDE_CATEGORIES.includes(vehicle.categoryIds?.[0] ?? "") ? { category: vehicle.categoryIds[0] as NonNullable<DemoRecord["category"]> } : {}),
    liveRuleProblems: [...(vehicle.ruleProblems ?? [])],
    liveCategoryIds: [...(vehicle.categoryIds ?? [])],
    liveVehicleStatus: vehicle.status,
    ...(vehicle.fitCategories ? { liveFitCategories: [...vehicle.fitCategories] } : {}),
    liveVehicleDocs: { documents: [...(vehicle.documents ?? [])], required: requiredForVehicle(vehicle, driver?.country), ...(driver?.country ? { country: driver.country } : {}) },
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
    ...(fleet.code ? { liveFleetCode: fleet.code } : {}),
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
    // v0.18.7 (driver group 5): the live row's position and ETA, the rider summary, the terms, the waiting amounts and the cancel.
    driverLocation: trip.driverLocation ? { lat: trip.driverLocation.lat, lng: trip.driverLocation.lng, measuredAt: trip.driverLocation.measuredAt } : null,
    eta: trip.eta && Number.isFinite(trip.eta.etaSeconds) && Number.isFinite(trip.eta.distanceMeters) ? { etaSeconds: trip.eta.etaSeconds, distanceMeters: trip.eta.distanceMeters, target: trip.eta.target === "dropoff" ? "dropoff" : "pickup", at: trip.eta.at, source: trip.eta.source === "osrm" ? "osrm" : trip.eta.source === "stale" ? "stale" : "estimate" } : null,
    rider: trip.rider?.firstName ? { firstName: trip.rider.firstName, rating: typeof trip.rider.rating === "number" ? trip.rider.rating : null } : null,
    terms: trip.terms ? {
      currency: trip.terms.currency, freeWaitMin: trip.terms.freeWaitMin, waitPerMinMinor: trip.terms.waitPerMin?.amountMinor ?? 0, noShowAfterMin: trip.terms.noShowAfterMin, noShowFeeMinor: trip.terms.noShowFee?.amountMinor ?? 0,
      noShowDriverSharePct: trip.terms.noShowDriverSharePct, cancelFreeMin: typeof trip.terms.cancelRule?.freeMin === "number" ? trip.terms.cancelRule.freeMin : null, cancelDriverSharePct: trip.terms.cancelDriverSharePct,
      cancelAfterArrivedIsNoShow: Boolean(trip.terms.cancelAfterArrivedIsNoShow), maxPickupMoveMeters: trip.terms.maxPickupMoveMeters,
    } : null,
    waiting: trip.waiting ? { arrivedAt: trip.waiting.arrivedAt, freeUntil: trip.waiting.freeUntil, noShowAt: trip.waiting.noShowAt, chargedSeconds: trip.waiting.chargedSeconds, noShowFeeMinor: minorOf(trip.waiting.noShowFee), noShowDriverShareMinor: minorOf(trip.waiting.noShowDriverShare), chargedSecondsNow: typeof trip.waiting.chargedSecondsNow === "number" ? trip.waiting.chargedSecondsNow : null, chargedSoFarMinor: minorOf(trip.waiting.chargedSoFar) } : null,
    cancellation: trip.cancellation ? { actor: trip.cancellation.actor, reasonCode: trip.cancellation.reasonCode, at: trip.cancellation.at, feeMinor: minorOf(trip.cancellation.fee), feeStatus: trip.cancellation.feeStatus ?? null, feeKind: trip.cancellation.feeKind ?? null, driverShareMinor: minorOf(trip.cancellation.driverShare), note: trip.cancellation.note ?? null } : null,
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
      // v0.18.7 (G5 Q3): every owed currency; an older server sends only outstanding (one currency).
      outstandingByCurrency: Array.isArray(rider.outstandingByCurrency) && rider.outstandingByCurrency.length ? rider.outstandingByCurrency.filter((money) => Number.isFinite(money?.amountMinor)).map((money) => ({ amountMinor: money.amountMinor, currency: money.currency })) : rider.outstanding ? [{ amountMinor: rider.outstanding.amountMinor, currency: rider.outstanding.currency }] : [],
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

/** A rating as a record (Admin › Reviews): id tripId~from, the server's hidden flag as the status. */
export function ratingRecord(rating: AdminRating): DemoRecord {
  return {
    id: `${rating.tripId}~${rating.from}`,
    name: (rating.from === "rider" ? rating.riderName : rating.driverName) ?? "",
    phone: "",
    zoneId: rating.zoneId,
    status: rating.hidden ? "hidden" : "visible",
    tripId: rating.tripId,
    createdAt: rating.at,
    live: true,
    liveRating: {
      tripId: rating.tripId, from: rating.from, stars: rating.stars, tags: rating.tags, comment: rating.comment ?? null, at: rating.at,
      riderId: rating.riderId, riderName: rating.riderName ?? null, driverId: rating.driverId ?? null, driverName: rating.driverName ?? null, zoneId: rating.zoneId,
      hidden: rating.hidden, hiddenBy: rating.hiddenBy ?? null, hiddenAt: rating.hiddenAt ?? null, hideReason: rating.hideReason ?? null,
    },
  };
}

/** A support ticket as the demo ticket record: the subject is the name, status open / pending / resolved / closed. */
export function ticketRecord(ticket: SupportTicket): DemoRecord {
  return { id: ticket.ticketId, name: ticket.subject, phone: "", zoneId: ticket.zoneId ?? "", status: ticket.status, ...(ticket.tripId ? { tripId: ticket.tripId } : {}), createdAt: ticket.createdAt, kind: ticket.category, ...(ticket.driverId ? { driverId: ticket.driverId } : {}), live: true };
}

export function auditRow(entry: AuditEntry): AuditRow {
  const after = entry.after ?? {};
  const zone = typeof after["zoneId"] === "string" ? (after["zoneId"] as string) : "";
  return {
    id: entry.auditId,
    operationId: entry.requestId,
    at: entry.at,
    actorId: entry.actorId,
    ...(entry.actor === "rider" || entry.actor === "driver" || entry.actor === "admin" || entry.actor === "system" ? { actor: entry.actor } : {}),
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

const FLEET_COMMANDS: Record<string, "approved" | "blocked"> = { "admin.fleetOwner.activate": "approved", "admin.fleetOwner.onHold": "blocked" };

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
  const settings = createLiveSettings({ json: (path) => client.json(path), put: (path, body) => client.put(path, body), post: (path, body) => client.post(path, body), del: (path) => client.del(path) });
  // The api outlives a session (it is made once per client): what was read for one admin is forgotten when they
  // sign out or another admin signs in, so the next admin's first read is the server's, never the last one's lists.
  let settingsAdmin = client.admin()?.adminId ?? null;
  client.subscribe((state) => {
    const adminId = state?.admin.adminId ?? null;
    if (adminId === settingsAdmin) return;
    settingsAdmin = adminId;
    settings.forget();
  });
  let currency: string = CURRENCY;

  async function readDrivers(own = false, filter: ZoneFilter = NO_FILTER): Promise<Driver[]> {
    const rows = own ? await paged<Driver>(client, "drivers", "/admin/drivers", filter) : await all<Driver>(client, "/admin/drivers");
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

  async function readRiders(own = false, filter: ZoneFilter = NO_FILTER): Promise<Rider[]> {
    const rows = own ? await paged<Rider>(client, "riders", "/admin/riders", filter) : await all<Rider>(client, "/admin/riders");
    rows.forEach((row) => riders.set(row.riderId, row));
    return rows;
  }

  /** GET /admin/live/drivers: who is online now, with the last position (drivers not offline). */
  async function readPresence(filter: ZoneFilter = NO_FILTER): Promise<void> {
    const query = new URLSearchParams(filter.params).toString();
    const answer = await client.json<LiveDriverList>(`/admin/live/drivers${query ? `?${query}` : ""}`);
    presence.clear();
    answer.items.forEach((row) => presence.set(row.driverId, row));
  }

  /** v0.17.2: a list of the zones picked in the top bar; the server filters, the rows are checked again here. */
  async function list(name: string, scope?: ZoneScope): Promise<DemoRecord[]> {
    const filter = name === "zones" ? NO_FILTER : zoneFilterOf(scope);
    if (filter.denied) return [];
    const read = await listRaw(name, filter);
    const zones = filter.zones;
    // A row without a zone (a rider, a refund without its trip) is the server's answer for those zones.
    const rows = zones ? read.filter((row) => !row.zoneId || zones.has(row.zoneId)) : read;
    remember(rows);
    return rows;
  }

  /** Live search (top bar): trips, drivers and riders of the picked zones whose id, name or phone matches. */
  async function search(text: string, scope?: ZoneScope): Promise<{ kind: string; id: string; label: string; path: string }[]> {
    const needle = text.trim();
    const filter = zoneFilterOf(scope);
    if (needle.length < 2 || filter.denied) return [];
    const params = new URLSearchParams([["q", needle], ["limit", "5"], ...filter.params]).toString();
    const quiet = <T,>(path: string) => client.json<Page<T>>(`${path}?${params}`).then((page) => page.items).catch(() => [] as T[]);
    const [tripRows, driverRows, riderRows] = await Promise.all([quiet<Trip>("/admin/trips"), quiet<Driver>("/admin/drivers"), quiet<Rider>("/admin/riders")]);
    return [
      ...tripRows.map((row) => ({ kind: "trip", id: row.tripId, label: row.tripId, path: `/trips/${row.tripId}` })),
      ...driverRows.map((row) => ({ kind: "driver", id: row.driverId, label: fullName(row.firstName, row.lastName) || row.driverId, path: `/drivers/${row.driverId}` })),
      ...riderRows.map((row) => ({ kind: "rider", id: row.riderId, label: row.firstName || row.riderId, path: `/riders/${row.riderId}` })),
    ].slice(0, 8);
  }

  async function listRaw(name: string, filter: ZoneFilter): Promise<DemoRecord[]> {
    if (name === "drivers") {
      const rows = await readDrivers(true, filter);
      await readPresence(filter).catch(() => undefined);
      return rows.map((row) => driverRecord(row, presence.get(row.driverId)));
    }
    if (name === "riders") return (await readRiders(true, filter)).map(riderRecord);
    // G3-R4 (v0.18.4): real riders online per zone of the admin (the server counts open apps and open requests).
    if (name === "ridersOnline") {
      const query = new URLSearchParams(filter.params).toString();
      return ridersOnlineRecords(await client.json<LiveDriverList>(`/admin/live/drivers${query ? `?${query}` : ""}`));
    }
    // G3-D5 (v0.18.4): the server's supply and demand per zone (every online driver counted, position or not).
    if (name === "zoneSupply") {
      const query = new URLSearchParams(filter.params).toString();
      return zoneSupplyRecords(await client.json<LiveDriverList>(`/admin/live/drivers${query ? `?${query}` : ""}`));
    }
    if (name === "payments") {
      const rows = await paged<Payment>(client, "payments", "/admin/payments", filter);
      return rows.map((row) => paymentRecord(row, trips.get(row.tripId)?.zoneId ?? ""));
    }
    if (name === "ratings") return (await all<AdminRating>(client, "/admin/ratings", filter)).map(ratingRecord);
    if (name === "tickets") return (await all<SupportTicket>(client, "/admin/tickets", filter)).map(ticketRecord);
    if (name === "refunds") {
      const rows = await all<{ refundId: string; tripId?: string; amount: LiveMoney; reason: string; status: string; createdAt?: string }>(client, "/admin/refunds", filter);
      return rows.map((row) => ({ id: row.refundId, name: row.tripId ? `pay_${row.tripId}` : "", phone: "", zoneId: row.tripId ? trips.get(row.tripId)?.zoneId ?? "" : "", status: row.status === "done" ? "refunded" : row.status, ...(row.tripId ? { tripId: row.tripId } : {}), fareOre: row.amount.amountMinor, ...(row.createdAt ? { createdAt: row.createdAt } : {}), notes: row.reason, live: true }));
    }
    if (name === "payouts") {
      const rows = await all<{ payoutId: string; driverId: string; driverName?: string; zoneId?: string; amount: LiveMoney; status: string; periodStart: string; periodEnd: string; source: string; tripCount: number; lines?: { code: string; amount: LiveMoney; count?: number }[]; createdAt: string }>(client, "/admin/payouts", filter);
      return rows.map((row) => ({
        id: row.payoutId, name: `${row.periodStart.slice(0, 10)} – ${row.periodEnd.slice(0, 10)}`, phone: "", zoneId: row.zoneId ?? "", status: row.status === "paid" ? "paid" : "scheduled", driverId: row.driverId, fareOre: row.amount.amountMinor, createdAt: row.createdAt, live: true,
        livePayout: { lines: (row.lines ?? []).map((line) => ({ code: line.code, amountMinor: line.amount.amountMinor, ...(line.count !== undefined ? { count: line.count } : {}) })), source: row.source, periodStart: row.periodStart, periodEnd: row.periodEnd, tripCount: row.tripCount, currency: row.amount.currency },
      }));
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
    // v0.18.7 (G5 Q3): the rider page's own trips (GET /admin/trips?riderId=…, every page), so the owed fees are all there.
    if (name.startsWith("tripsOfRider:")) {
      const riderId = name.slice("tripsOfRider:".length);
      if (!riderId) return [];
      const rows = await all<Trip>(client, "/admin/trips", filter, { riderId });
      rows.forEach((row) => trips.set(row.tripId, row));
      if (!riders.has(riderId)) await readRiders().catch(() => []);
      return rows.map((row) => tripRecord(row, riders.get(row.riderId)));
    }
    if (name === "trips") {
      const rows = await paged<Trip>(client, "trips", "/admin/trips", filter);
      rows.forEach((row) => trips.set(row.tripId, row));
      if (rows[0] && isCurrency(rows[0].fare.currency)) currency = rows[0].fare.currency;
      if (!riders.size) await readRiders().catch(() => []);
      return rows.map((row) => tripRecord(row, riders.get(row.riderId)));
    }
    if (name === "incidents") {
      const rows = await all<ServerIncident>(client, "/admin/incidents", filter);
      rows.forEach((row) => incidents.set(row.incidentId, row));
      return rows.map(incidentRecord);
    }
    if (name === "zones") return MARKETS.flatMap((market) => market.zones.map((zone) => ({ id: zone.id, name: zone.name, phone: "", zoneId: zone.id, status: "active" })));
    return [];
  }

  async function command(input: CommandInput): Promise<CommandResult> {
    const done = (message: string, status: CommandResult["status"] = "committed"): CommandResult => ({ message, operationId: input.idempotencyKey ?? input.action, status, rev: 0 });
    const explained = (error: unknown): never => {
      if (error instanceof ApiError) throw new ApiError(error.status, errorText(error), { code: error.code, reason: error.reason ?? undefined, details: [...error.details], requestId: error.requestId ?? undefined, retryable: false });
      throw error;
    };
    const toStatus = STATUS_COMMANDS[input.action];
    if (toStatus) {
      const driver = drivers.get(input.targetId) ?? (await client.json<Driver>(`/admin/drivers/${encodeURIComponent(input.targetId)}`));
      const next = await client.post<Driver>(`/admin/drivers/${encodeURIComponent(driver.driverId)}/status`, { expectedVersion: driver.version, accountStatus: toStatus, note: input.reason }).catch((error: unknown) => {
        // v0.10.1: the page lists the missing documents (details); the line under the button says why in short.
        if (error instanceof ApiError && error.status === 409 && error.code === "documents_not_approved") {
          throw new ApiError(409, "Not all required documents are approved.", { code: error.code, reason: error.reason ?? undefined, details: [...error.details], requestId: error.requestId ?? undefined, retryable: false });
        }
        throw error;
      });
      if (next?.driverId) drivers.set(next.driverId, next);
      return done("Saved.");
    }
    const decision = VEHICLE_COMMANDS[input.action];
    if (decision) {
      const vehicle = vehicles.get(input.targetId);
      if (!vehicle) throw new ApiError(404, "No such vehicle.", { code: "not_found" });
      // v0.18.5 (owner G2-D5.3): the admin gives the categories on approval (only fitCategories, ≥ 1 ride category);
      // G2-D5.7: a block always carries the admin's reason as the note.
      const picked = (input.value as { categoryIds?: unknown } | undefined)?.categoryIds;
      const categoryIds = decision === "approved" && Array.isArray(picked) ? picked.filter((id): id is string => typeof id === "string") : undefined;
      const note = input.reason?.trim();
      const next = await client.post<Vehicle>(`/admin/vehicles/${encodeURIComponent(vehicle.vehicleId)}/review`, { expectedVersion: vehicle.version, decision, ...(note ? { note: note.slice(0, 1000) } : {}), ...(categoryIds ? { categoryIds } : {}) }).catch(explained);
      if (next?.vehicleId) vehicles.set(next.vehicleId, next);
      return done("Saved.");
    }
    // Owner 2026-10-29 (group 2, live audit): Fleet owners Activate / Put on hold review the owner's fleet
    // (POST /admin/fleets/{fleetId}/review: approved, blocked) like a new fleet; targetId is the owner's driver id.
    const fleetDecision = FLEET_COMMANDS[input.action];
    if (fleetDecision) {
      const fleets = await readFleets();
      const fleet = fleets.find((item) => item.ownerDriverId === input.targetId || item.fleetId === input.targetId);
      if (!fleet) throw new ApiError(404, "No such fleet.", { code: "not_found" });
      await client.post<Fleet>(`/admin/fleets/${encodeURIComponent(fleet.fleetId)}/review`, { expectedVersion: fleet.version, decision: fleetDecision, ...(input.reason ? { note: input.reason.slice(0, 1000) } : {}) });
      return done("Saved.");
    }
    // Contract v0.18.0 (owner 2026-10-29, live audit): car details, the car's driver, the driver's categories and the
    // bank review go to the server; its refusals are explained (errorText) in the admin's language.
    if (input.action === "admin.vehicle.update" || input.action === "admin.vehicle.link") {
      const vehicle = vehicles.get(input.targetId) ?? (await paged<Vehicle>(client, "vehicles", "/admin/vehicles")).find((row) => row.vehicleId === input.targetId);
      if (!vehicle) throw new ApiError(404, "No such vehicle.", { code: "not_found" });
      const value = (input.value ?? {}) as Record<string, unknown>;
      const next = input.action === "admin.vehicle.update"
        ? await client.patch<Vehicle>(`/admin/vehicles/${encodeURIComponent(vehicle.vehicleId)}`, { expectedVersion: vehicle.version, ...value }).catch(explained)
        : await client.post<Vehicle>(`/admin/vehicles/${encodeURIComponent(vehicle.vehicleId)}/driver`, { expectedVersion: vehicle.version, driverId: (value["driverId"] as string | null | undefined) ?? null }).catch((error: unknown) => {
          // 409 documents_not_approved here is about the car's documents.
          if (error instanceof ApiError && error.code === "documents_not_approved") throw new ApiError(409, tr("The car's documents are not approved yet."), { code: error.code, retryable: false });
          return explained(error);
        });
      if (next?.vehicleId) vehicles.set(next.vehicleId, next);
      return done("Saved.");
    }
    if (input.action === "admin.driver.category") {
      const driver = await client.json<Driver>(`/admin/drivers/${encodeURIComponent(input.targetId)}`);
      const { categoryId, on } = (input.value ?? {}) as { categoryId?: string; on?: boolean };
      if (!categoryId) throw new ApiError(400, NOT_CONNECTED, { code: "invalid_request", retryable: false });
      const ids = new Set(driver.categoryIds ?? []);
      if (on) ids.add(categoryId);
      else ids.delete(categoryId);
      if (!ids.size) throw new ApiError(400, tr("Keep at least one category on."), { code: "invalid_request", retryable: false });
      const next = await client.put<Driver>(`/admin/drivers/${encodeURIComponent(driver.driverId)}/categories`, { expectedVersion: driver.version, categoryIds: [...ids] }).catch(explained);
      if (next?.driverId) drivers.set(next.driverId, next);
      return done("Saved.");
    }
    if (input.action === "admin.driver.bankReview") {
      const decision = input.after === "approved" || input.after === "rejected" ? input.after : null;
      if (!decision) throw new ApiError(400, NOT_CONNECTED, { code: "invalid_request", retryable: false });
      const note = ((input.value as { note?: string } | undefined)?.note ?? "").trim();
      // v0.18.5 (owner G2-D5.7): a rejection needs the admin's own words; the driver sees them.
      if (decision === "rejected" && !note) throw new ApiError(400, tr("Write why: the driver sees the reason."), { code: "invalid_request", reason: "note_required", retryable: false });
      await client.post(`/admin/drivers/${encodeURIComponent(input.targetId)}/bank/review`, { decision, ...(note ? { note: note.slice(0, 1000) } : {}) }).catch(explained);
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
      // v0.7.2 (contract.json#auth.admin.oneAdmin): one admin is enough; the refund is made at once.
      await client.post(`/admin/trips/${encodeURIComponent(trip.tripId)}/refund`, { expectedVersion: trip.version, amount: trip.fare, reason: input.reason });
      return done("Refunded.");
    }
    if (input.action === "admin.trip.waiveFee") {
      // v0.18.7 (G5 Q2/Q3): an owed cancel or no-show fee is waived on the trip (POST /admin/trips/{tripId}/adjust
      // waiveCancelFee); the rider's outstanding amount in that currency drops at once.
      // Checker round 1: the admin's own reason, never a default; refused before any send.
      const reason = (input.reason ?? "").trim();
      if (!reason) throw new ApiError(400, tr("Write why the fee is waived."), { code: "invalid_request", reason: "reason_required", retryable: false });
      const trip = await client.json<Trip>(`/admin/trips/${encodeURIComponent(input.targetId)}`);
      // A retry after a lost answer finds the fee already waived: that is done, not "changed".
      if (trip.cancellation?.feeStatus === "waived") {
        trips.set(trip.tripId, trip);
        return done("This fee is already waived.");
      }
      // The command's own Idempotency-Key, so a resend of the same click is the same operation on the server.
      const next = await client.json<Trip>(`/admin/trips/${encodeURIComponent(trip.tripId)}/adjust`, { method: "POST", body: JSON.stringify({ expectedVersion: trip.version, waiveCancelFee: true, reason: reason.slice(0, 1000) }), ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}) });
      trips.set(trip.tripId, next?.tripId ? next : { ...trip, cancellation: trip.cancellation ? { ...trip.cancellation, feeStatus: "waived" } : trip.cancellation });
      return done("Fee waived. The rider owes nothing for this trip.");
    }
    if (input.action === "admin.dispatch.control") {
      // Dispatch › Live: pause, force a mode, resume or back to the rules (PUT /admin/zones/{zoneId}/dispatch-control).
      const value = controlValueOf(input.after);
      if (!value) throw new ApiError(400, NOT_CONNECTED, { code: "invalid_request", retryable: false });
      const path = dispatchControlPath(input.targetId);
      const current = parseControl(await client.json<unknown>(path));
      const answer = await client.put<unknown>(path, controlBody(current, value, input.reason));
      // v0.7.2: one admin is enough. A server that still files an approval answers 202 PendingApproval.
      if (isPendingApproval(answer)) return done("Waiting for a second admin to approve.", "pending_approval");
      return done("Saved.");
    }
    // Pricing, Dispatch, Settings and Tips & limits publish to the server's config documents (contract v0.8.0).
    const settingsCall = settings.command(input.action, { targetId: input.targetId, value: input.value, ...(input.scope ? { scope: input.scope } : {}) });
    if (settingsCall) {
      try {
        const answer = await settingsCall;
        return typeof answer === "string" ? done(answer) : { ...done(answer.message), slice: answer.slice };
      } catch (error) {
        if (error instanceof SettingsChanged) throw new ApiError(409, error.message, { code: "version_mismatch", retryable: false });
        throw error;
      }
    }
    if (input.action === "admin.trip.assign" || input.action === "admin.trip.radarGroup") {
      // Exclusive offer or radar group (contract §9 /admin/trips/{id}/assign and /radar-group), with the trip's version.
      const trip = await client.json<Trip>(`/admin/trips/${encodeURIComponent(input.targetId)}`);
      trips.set(trip.tripId, trip);
      const params = (input.value ?? {}) as { driverId?: string; driverIds?: string[]; groupId?: string; radarZoneId?: string; ruleId?: string; target?: string; radarZoneName?: string; driverBonusMinor?: number; priority?: boolean };
      const bonus = params.driverBonusMinor ? { driverBonus: { amountMinor: params.driverBonusMinor, currency: trip.fare.currency } } : {};
      const common = { expectedVersion: trip.version, ...(input.reason ? { note: input.reason } : {}), ...bonus, ...(params.priority ? { priority: true } : {}) };
      if (input.action === "admin.trip.assign") {
        await client.post(`/admin/trips/${encodeURIComponent(trip.tripId)}/assign`, { ...common, driverId: params.driverId });
        return done("Exclusive offer sent.");
      }
      // v0.18.6 (G4-F3, F4): a driver group or a radar zone with its rule; the server picks the free drivers.
      const target = params.groupId ? { groupId: params.groupId } : params.radarZoneId && params.ruleId ? { radarZoneId: params.radarZoneId, ruleId: params.ruleId } : { driverIds: params.driverIds ?? [] };
      const answer = await client.post<{ groupId?: string; offers?: unknown[]; radarZoneSend?: RadarZoneSend }>(`/admin/trips/${encodeURIComponent(trip.tripId)}/radar-group`, { ...common, ...target }).catch((error: unknown) => {
        const text = toolRefusal(error);
        if (text && error instanceof ApiError) throw new ApiError(error.status, text, { code: error.code, reason: error.reason ?? undefined, retryable: false });
        throw error;
      });
      if (answer?.groupId && params.target) rememberSendTarget(answer.groupId, params.target);
      const send = answer?.radarZoneSend;
      setActiveRadarSend(send?.active ? { tripId: trip.tripId, sendId: send.sendId, radarZoneName: params.radarZoneName ?? params.target ?? "", seconds: send.seconds, maxDrivers: send.maxDrivers, rounds: send.rounds, startedAt: send.startedAt } : null, trip.tripId);
      if (send?.active && !(answer?.offers ?? []).length) return done("Nobody is free inside yet. The radar goes out again by itself.");
      return done(send?.active ? "Sent. The radar goes out again by itself until a driver accepts." : "Sent to the radar group.");
    }
    if (input.action === "admin.trip.radarZoneStop") {
      // v0.18.6 (G4-F4): stop a radar zone send that goes out again by itself.
      try {
        await client.post(`/admin/trips/${encodeURIComponent(input.targetId)}/radar-zone/stop`, input.reason ? { note: input.reason } : {});
      } catch (error) {
        setActiveRadarSend(null, input.targetId);
        const text = toolRefusal(error);
        if (text && error instanceof ApiError) throw new ApiError(error.status, text, { code: error.code, reason: error.reason ?? undefined, retryable: false });
        throw error;
      }
      setActiveRadarSend(null, input.targetId);
      return done("Stopped. The radar does not go out again.");
    }
    if (input.action === "admin.growthOps.moderate") {
      // Admin › Reviews: hide or show again (POST /admin/ratings/{tripId}/{from}/hide|restore). targetId is tripId~from.
      const [tripId, from] = input.targetId.split("~");
      if (!tripId || (from !== "rider" && from !== "driver")) throw new ApiError(400, NOT_CONNECTED, { code: "invalid_request", retryable: false });
      const verb = input.after === "shown" ? "restore" : "hide";
      await client.post(`/admin/ratings/${encodeURIComponent(tripId)}/${from}/${verb}`, { reason: input.reason || (verb === "hide" ? "Hidden by an admin" : "Shown again by an admin") });
      return done(verb === "hide" ? "Hidden." : "Shown again.");
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
    if (input.action === "admin.studio.publish" || input.action === "admin.studio.rollback") {
      // Content (contract v0.10.0 §19): one admin publishes to the zones chosen at the top; rollback per zone.
      const slot = encodeURIComponent(input.targetId);
      if (input.action === "admin.studio.publish") {
        const body = (input.value ?? {}) as { zoneIds?: string[] };
        if (!body.zoneIds?.length) throw new ApiError(400, "Choose the zones first.", { code: "invalid_request", retryable: false });
        await client.post(`/admin/content/${slot}/publish`, body);
        return done("Published.");
      }
      await client.post(`/admin/content/${slot}/rollback`, input.value ?? {});
      return done("Rolled back.");
    }
    if (input.action === "admin.zone.create" || input.action === "admin.zone.update" || input.action === "admin.zone.open" || input.action === "admin.zone.close") {
      // Zones (contract v0.11.0 §21): one admin with zones.edit; never deleted, only closed. A stale expectedVersion
      // is 409 version_mismatch: the page reloads the list and says so.
      const zone = encodeURIComponent(input.targetId);
      try {
        if (input.action === "admin.zone.create") {
          await client.post("/admin/zones", input.value);
          return done("Zone created.");
        }
        if (input.action === "admin.zone.update") {
          await client.put(`/admin/zones/${zone}`, input.value);
          return done("Zone saved.");
        }
        const verb = input.action === "admin.zone.open" ? "open" : "close";
        const body = (input.value ?? {}) as { expectedVersion?: number };
        await client.post(`/admin/zones/${zone}/${verb}`, { expectedVersion: body.expectedVersion, ...(input.reason ? { note: input.reason.slice(0, 1000) } : {}) });
        return done(verb === "open" ? "Zone opened." : "Zone closed.");
      } catch (error) {
        if (error instanceof ApiError && error.status === 409 && error.code === "version_mismatch") throw new ApiError(409, "The zone changed since you last saw it. The newest version was loaded; check it and try again.", { code: "version_mismatch", retryable: false });
        if (error instanceof ApiError && error.status === 409 && error.reason === "zone_exists") throw new ApiError(409, "A zone with this id exists.", { code: "conflict", retryable: false });
        if (error instanceof ApiError && error.status === 403 && error.reason === "zone_out_of_scope") throw new ApiError(403, "This zone is outside your scope.", { code: "forbidden", retryable: false });
        throw error;
      }
    }
    throw new ApiError(400, NOT_CONNECTED, { code: "invalid_request", retryable: false });
  }

  function nameOf(driverId: string): string {
    const driver = drivers.get(driverId);
    return driver ? fullName(driver.firstName, driver.lastName) : driverId;
  }

  /** The radar sends of a trip from its offers: one per groupId, numbered in order, named when this session sent it. */
  function radarGroupsOf(offers: ReadonlyArray<TripOffer & { groupId?: string; driverId?: string; expiresAt: string }>, tripId: string) {
    const byGroup = new Map<string, { driverIds: string[]; expiresAt: string }>();
    for (const offer of offers) {
      if (offer.kind !== "radar" || !offer.groupId) continue;
      const entry = byGroup.get(offer.groupId) ?? { driverIds: [], expiresAt: offer.expiresAt };
      if (offer.driverId) entry.driverIds.push(offer.driverId);
      if (offer.expiresAt > entry.expiresAt) entry.expiresAt = offer.expiresAt;
      byGroup.set(offer.groupId, entry);
    }
    return [...byGroup.entries()].reverse().map(([groupId, entry], index) => {
      const named = sendTarget(groupId);
      return { groupId, tripId, number: index + 1, driverIds: entry.driverIds, sentAt: entry.expiresAt, expiresAt: entry.expiresAt, by: "", ...(named ? { target: named.target, ...(named.maxDrivers ? { maxDrivers: named.maxDrivers } : {}) } : {}) };
    });
  }

  async function tripOffers(tripId: string): Promise<TripOffersView> {
    // The trip is read each time (not the list's copy): its radarZoneSend says whether a repeat still runs (G4-F4).
    const trip = await client.json<Trip>(`/admin/trips/${encodeURIComponent(tripId)}`).catch((error: unknown) => {
      const cached = trips.get(tripId);
      if (cached) return cached;
      throw error;
    });
    trips.set(trip.tripId, trip);
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
      // v0.18.6 (G4-F3, F4): radar offers grouped by their send, named after the driver group or radar zone when this
      // session sent it ("group Night drivers", "radar Södermalm").
      groups: radarGroupsOf(page.items, tripId),
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
      radarRepeat: radarRepeatOf(trip),
      // v0.18.7 (G5): the trip page follows this read (ETA every 30 s, the car's position, the cancel fee).
      live: tripFacts(trip),
    } as unknown as TripOffersView;
  }

  return {
    kind: "http",
    demo: false,
    ready: async () => ({ currency: isCurrency(currency) ? currency : CURRENCY, timeZone: TIME_ZONE, demo: false }),
    page: async (pageId) => catalogFor(pageId),
    list: async (name, scope) => list(name, scope),
    search: async (query, scope) => search(query, scope),
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
      const fromSettings = settings.readSlice(key, fallback);
      if (fromSettings) return (await fromSettings) as typeof fallback;
      if (key !== "safetyOps") return fallback;
      if (!incidents.size) await list("incidents").catch(() => []);
      return bookFrom(incidents.values()) as typeof fallback;
    },
    tripOffers,
    trip: async (tripId) => {
      const found = await client.json<Trip>(`/admin/trips/${encodeURIComponent(tripId)}`).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      });
      if (!found) return null;
      trips.set(found.tripId, found);
      if (!riders.has(found.riderId)) await readRiders().catch(() => []);
      const record = tripRecord(found, riders.get(found.riderId));
      remember([record]);
      return record;
    },
    nearbyDrivers: async (tripId, query) => {
      const params = new URLSearchParams({ scope: query.scope, ...(query.radiusKm !== undefined ? { radiusKm: String(query.radiusKm) } : {}) });
      const answer = await client.json<{ items: NearbyDriver[]; scope: typeof query.scope; radiusKm?: number }>(`/admin/trips/${encodeURIComponent(tripId)}/nearby-drivers?${params.toString()}`);
      const trip = trips.get(tripId);
      return { scope: answer.scope, ...(answer.radiusKm !== undefined ? { radiusKm: answer.radiusKm } : {}), items: answer.items.map((row) => nearbyRow(row, trip?.categoryId ?? "", drivers.get(row.driverId)?.rating ?? null)) };
    },
    // GET /admin/dispatch/stream as a JSON page (contract §4 AdminDispatchEvent).
    dispatchEvents: async (after) => {
      const page = await client.json<Page<{ eventId: string; sequence: number; kind: string; tripId: string; groupId?: string; offer?: { offerId: string; driverId?: string; driverBonus?: LiveMoney }; projection?: { driverBonus?: LiveMoney }; occurredAt: string }>>(`/admin/dispatch/stream?after=${after}&limit=200`);
      const items = page.items.map((event) => ({
        eventId: event.eventId,
        sequence: event.sequence,
        kind: event.kind,
        tripId: event.tripId,
        ...(event.groupId ? { groupId: event.groupId } : {}),
        ...(event.offer ? { offerId: event.offer.offerId } : {}),
        ...(event.offer?.driverId ? { driverId: event.offer.driverId, driverName: nameOf(event.offer.driverId) } : {}),
        ...(event.kind === "driver_bonus_added" && event.projection?.driverBonus ? { amountMinor: event.projection.driverBonus.amountMinor } : {}),
        occurredAt: event.occurredAt,
      })) as Awaited<ReturnType<AdminApi["dispatchEvents"]>>["items"];
      return { items, last: items.length ? items[items.length - 1]!.sequence : after };
    },
  };
}
