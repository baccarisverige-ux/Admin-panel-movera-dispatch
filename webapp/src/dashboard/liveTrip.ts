import type { DemoRecord } from "../api/seed.ts";
import { statusLabel } from "../domain/labels.ts";
import { CATEGORIES } from "../domain/contract.ts";
import { driverCode } from "../fleet/codes.ts";
import { formatMoney, market, marketOfZone, zoneById, type MarketId } from "../markets/markets.ts";
import type { LiveDriver } from "./live.ts";
import { lengthKm, type LatLng } from "./route.ts";
import { uiLocale } from "../i18n/core.ts";

/** What the admin sees about a driver's current trip, its waybill and the next pickup. */

export type Stop = { label: string; at: LatLng };

export type NextPickup = { id: string; rider: string; stop: Stop; atMs: number; source: "Reservation" | "Queued request"; link: string | null };

export type Waybill = {
  number: string;
  issuedAt: string;
  operator: string;
  fleet: string | null;
  driver: string;
  driverCode: string;
  licence: string;
  vehicle: string;
  plate: string;
  rider: string;
  passengers: number;
  bookedVia: string;
  bookedAt: string;
  pickup: string;
  pickupAt: string;
  dropoff: string;
  category: string;
  distance: string;
  fare: string;
  payment: string;
  status: string;
};

export type LiveTrip = {
  tripId: string;
  phase: "to_pickup" | "on_trip";
  rider: string;
  riderId: string | null;
  riderPhone: string;
  pickup: Stop;
  dropoff: Stop;
  category: string;
  payment: string;
  fare: string;
  distanceKm: number;
  /** Minutes to the pickup while heading there, otherwise to the drop-off. */
  etaMin: number;
  progressPct: number;
  startedAtMs: number;
  next: NextPickup | null;
  waybill: Waybill;
};

const STREETS: Record<MarketId, string[]> = {
  SE: ["Drottninggatan 12", "Sveavägen 44", "Götgatan 18", "Strandvägen 7", "Hantverkargatan 22", "Odengatan 51", "Karlaplan 3", "Kungsgatan 8", "Birger Jarlsgatan 15", "Hornsgatan 80"],
  FR: ["12 rue de Rivoli", "48 avenue des Champs-Élysées", "7 boulevard Saint-Germain", "21 rue Oberkampf", "3 place de la Bastille", "15 rue de la Pompe", "9 rue Lepic", "30 quai de Valmy", "5 rue du Bac", "64 rue de Charonne"],
  TN: ["12 avenue Habib Bourguiba", "8 rue de Marseille", "21 avenue de la Liberté", "4 rue du Lac Léman", "17 avenue Taieb Mhiri", "9 rue Sidi Bou Said", "33 avenue Hédi Nouira", "6 rue de Carthage", "14 avenue de Paris", "25 rue Ibn Khaldoun"],
};
const OPERATOR: Record<MarketId, string> = { SE: "Movera Sverige AB", FR: "Movera France SAS", TN: "Movera Tunisie SARL" };
const PAYMENT: Record<MarketId, string[]> = {
  SE: ["Card", "Apple Pay", "Google Pay", "Cash", "Wallet"],
  FR: ["Card", "Apple Pay", "Google Pay", "Cash", "Wallet"],
  TN: ["Cash", "Card", "Wallet"],
};
const SOURCE = ["Rider app", "Rider app", "Reservation", "Airport desk", "Business account"];
const SPEED_KMH = 26;

function hash(text: string): number {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

function address(id: MarketId, seed: number, zoneName: string): string {
  return `${STREETS[id][seed % STREETS[id].length]}, ${zoneName}`;
}

export function liveTrip(
  driver: LiveDriver,
  records: { trips: readonly DemoRecord[]; reservations: readonly DemoRecord[]; vehicles: readonly DemoRecord[]; fleets: readonly DemoRecord[]; riders: readonly DemoRecord[] },
  nowMs: number,
  shiftMs = 0,
): LiveTrip | null {
  if (!driver.route) return null;
  const id = marketOfZone(driver.zoneId)?.id ?? "SE";
  const { timeZone } = market(id);
  const zone = zoneById(driver.zoneId);
  const zoneName = zone?.name ?? driver.zoneId;
  const seed = hash(driver.id);
  const trip = records.trips.find((row) => row.id === driver.tripId) ?? null;
  const tripId = trip?.id ?? `T-${driver.id}`;
  const rider = trip?.name ?? records.riders[seed % Math.max(1, records.riders.length)]?.name ?? "Rider";
  const riderPhone = trip?.phone ?? "";
  const riderId = (trip ? records.riders.find((row) => row.phone === trip.phone)?.id : records.riders[seed % Math.max(1, records.riders.length)]?.id) ?? null;
  const phase = driver.state === "pickup" ? "to_pickup" : "on_trip";
  const pickup: Stop = { label: zone?.kind === "airport" ? `${zoneName}, arrivals` : address(id, seed, zoneName), at: driver.route.pickup };
  const dropSeed = (seed >>> 5) % STREETS[id].length === seed % STREETS[id].length ? (seed >>> 5) + 3 : seed >>> 5;
  const dropoff: Stop = { label: address(id, dropSeed, zoneName), at: driver.route.dropoff };
  const tripKm = lengthKm(driver.route.path);
  const left = phase === "to_pickup" ? lengthKm(driver.route.approach) * (1 - driver.progress) : tripKm * (1 - driver.progress);
  const etaMin = Math.max(1, Math.round((left / SPEED_KMH) * 60));
  const categoryId = (records.vehicles.find((row) => row.driverId === driver.id)?.category ?? "economy") as string;
  const category = CATEGORIES.find((item) => item.id === categoryId)?.label ?? "Movera";
  const payment = PAYMENT[id][seed % PAYMENT[id].length];
  const fareMinor = trip?.fareOre ?? 0;
  const fare = formatMoney(fareMinor || Math.round(tripKm * (id === "SE" ? 2_400 : id === "FR" ? 210 : 1_300) + (id === "SE" ? 6_000 : id === "FR" ? 450 : 2_500)), id);
  const startedAtMs = nowMs - Math.round((phase === "to_pickup" ? driver.progress * 6 : 6 + driver.progress * (tripKm / SPEED_KMH) * 60) * 60_000);
  const time = new Intl.DateTimeFormat(uiLocale(), { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone });
  const dateTime = new Intl.DateTimeFormat(uiLocale(), { dateStyle: "medium", timeStyle: "short", hourCycle: "h23", timeZone });

  const reservation = records.reservations
    .filter((row) => row.driverId === driver.id && row.pickupAt && row.status === "assigned")
    .map((row) => ({ row, atMs: Date.parse(row.pickupAt!) + shiftMs }))
    .filter((item) => item.atMs > nowMs && item.atMs < nowMs + 4 * 3_600_000)
    .sort((a, b) => a.atMs - b.atMs)[0];
  let next: NextPickup | null = null;
  if (reservation) {
    next = {
      id: reservation.row.id,
      rider: reservation.row.name,
      stop: { label: address(id, hash(reservation.row.id), zoneById(reservation.row.zoneId)?.name ?? zoneName), at: [driver.route.dropoff[0] + 0.006, driver.route.dropoff[1] - 0.008] },
      atMs: reservation.atMs,
      source: "Reservation",
      link: `/reservations/${reservation.row.id}`,
    };
  } else if (phase === "on_trip" && seed % 3 === 0) {
    const queued = records.riders[(seed >>> 3) % Math.max(1, records.riders.length)];
    next = {
      id: `Q-${driver.id}`,
      rider: queued?.name ?? "Rider",
      stop: { label: address(id, seed >>> 9, zoneName), at: [driver.route.dropoff[0] - 0.005, driver.route.dropoff[1] + 0.007] },
      atMs: nowMs + (etaMin + 4) * 60_000,
      source: "Queued request",
      link: null,
    };
  }

  const vehicle = records.vehicles.find((row) => row.driverId === driver.id);
  const fleet = vehicle?.fleetId ? records.fleets.find((row) => row.id === vehicle.fleetId)?.name ?? null : null;
  const code = driverCode(driver);
  const waybill: Waybill = {
    number: `WB-${id}-${new Date(startedAtMs).toISOString().slice(0, 10).replaceAll("-", "")}-${tripId.replace(/\D/g, "").padStart(4, "0").slice(-4)}`,
    issuedAt: dateTime.format(startedAtMs),
    operator: OPERATOR[id],
    fleet,
    driver: driver.name,
    driverCode: code,
    licence: `•••• ${String(1000 + (seed % 9000))}`,
    vehicle: driver.vehicle ?? "No vehicle linked",
    plate: driver.plate ?? "no plate",
    rider,
    passengers: 1 + (seed % 3),
    bookedVia: SOURCE[seed % SOURCE.length],
    bookedAt: dateTime.format(startedAtMs - (2 + (seed % 9)) * 60_000),
    pickup: pickup.label,
    pickupAt: phase === "to_pickup" ? `Expected ${time.format(nowMs + etaMin * 60_000)}` : time.format(startedAtMs + 6 * 60_000),
    dropoff: dropoff.label,
    category,
    distance: `${tripKm.toFixed(1)} km`,
    fare: `${fare} (estimate)`,
    payment,
    // Q35: the contract status words, as the rider and driver apps show them.
    status: statusLabel(phase === "to_pickup" ? "driver_to_pickup" : "in_trip"),
  };

  return {
    tripId,
    phase,
    rider,
    riderId,
    riderPhone,
    pickup,
    dropoff,
    category,
    payment,
    fare,
    distanceKm: Math.round(tripKm * 10) / 10,
    etaMin,
    progressPct: Math.round(driver.progress * 100),
    startedAtMs,
    next,
    waybill,
  };
}
