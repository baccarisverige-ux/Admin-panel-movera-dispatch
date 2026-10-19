import { TRIP_STATUSES } from "../domain/contract.ts";

/** The demo rotates trips through the 18 pre-v0.3 statuses so every seeded trip id keeps its state (no cancelled_by_system in the seed). */
const SEED_TRIP_STATUSES = TRIP_STATUSES.filter((status) => status !== "cancelled_by_system");
import { market, type MarketId } from "../markets/markets.ts";
import type { DemoRecord } from "./seed.ts";
import { sosDriverId } from "./presence.ts";

/**
 * Demo records for France and Tunisia, plus past scheduled rides for Sweden.
 * Appended after the original Stockholm rows so their ids and order never change.
 */

type People = { first: readonly string[]; last: readonly string[]; phone: (index: number) => string };

const PEOPLE: Record<Exclude<MarketId, "SE">, People> = {
  FR: {
    first: ["Louis", "Camille", "Hugo", "Léa", "Gabriel", "Chloé", "Arthur", "Manon", "Jules", "Inès", "Lucas", "Emma", "Raphaël", "Jade"],
    last: ["Martin", "Bernard", "Dubois", "Laurent", "Moreau", "Simon", "Michel", "Lefebvre", "Leroy", "Roux", "Fournier"],
    phone: (index) => {
      const body = String(10203040 + index * 7919).slice(-8);
      return `+33 6 ${body.slice(0, 2)} ${body.slice(2, 4)} ${body.slice(4, 6)} ${body.slice(6, 8)}`;
    },
  },
  TN: {
    first: ["Mohamed", "Amira", "Youssef", "Yasmine", "Ahmed", "Salma", "Omar", "Ines", "Karim", "Meriem", "Aziz", "Rania", "Hamza", "Nour"],
    last: ["Ben Ali", "Trabelsi", "Gharbi", "Jlassi", "Hammami", "Mansouri", "Chaabane", "Ayari", "Khelifi", "Bouzid", "Mejri"],
    phone: (index) => {
      const body = String(20123456 + index * 7919).slice(-8);
      return `+216 ${body.slice(0, 2)} ${body.slice(2, 5)} ${body.slice(5, 8)}`;
    },
  },
};

/** Fleets per country: id, name, owner id. */
const FLEETS: Record<Exclude<MarketId, "SE">, [string, string, string][]> = {
  FR: [["F4", "Paris Premium Cars", "O3"], ["F5", "Seine Mobility", "O4"]],
  TN: [["F6", "Carthage Transport", "O5"], ["F7", "Lac VTC", "O5"]],
};

/** Fleet owners in every country. Sweden's own fleets F1–F3 point at O1 and O2. */
function fleetOwners(now: string): Built[] {
  const nowMs = Date.parse(now);
  const rows: [string, string, string, string, string, string, string, string][] = [
    ["O1", "Johan Ekström", "Ekström Taxi AB", "559012-3456", "+46 70 555 12 34", "johan@ekstromtaxi.se", "Z007", "active"],
    ["O2", "Sofia Lindqvist", "Söder Transport AB", "559077-8812", "+46 73 220 45 10", "sofia@sodertransport.se", "Z002", "active"],
    ["O3", "Antoine Girard", "Paris Premium Cars SAS", "852 314 907", "+33 6 41 22 87 15", "antoine@parispremium.fr", "FR-OCE", "active"],
    ["O4", "Claire Fontaine", "Seine Mobility SARL", "901 552 438", "+33 6 72 18 40 93", "claire@seinemobility.fr", "FR-BE", "on_hold"],
    ["O5", "Mehdi Ben Salah", "Carthage Transport SARL", "1784521/K", "+216 98 412 336", "mehdi@carthage-transport.tn", "TN-LAC", "active"],
    ["O6", "Leila Haddad", "Haddad Cars SUARL", "1823007/P", "+216 22 905 117", "leila@haddadcars.tn", "TN-AR", "pending"],
  ];
  return rows.map(([id, name, company, orgNumber, phone, email, zoneId, status], index) => ({
    id,
    name,
    company,
    orgNumber,
    phone,
    email,
    zoneId,
    status,
    kind: DOC_STATES[(index + 1) % DOC_STATES.length],
    joinedAt: new Date(nowMs - (200 + index * 97) * 86_400_000).toISOString(),
  }));
}

const DRIVER_STATUSES = ["active", "active", "pending", "active", "on_hold", "active", "suspended"] as const;
const DOC_STATES = ["approved", "in_review", "approved", "needed", "expiring", "approved"] as const;
const CATEGORIES = ["economy", "comfort", "premium", "priority", "xl", "electric", "pet"] as const;
const CARS: Record<Exclude<MarketId, "SE">, [string, string][]> = {
  FR: [["Peugeot", "508"], ["Renault", "Mégane E-Tech"], ["Toyota", "C-HR"], ["Tesla", "Model 3"]],
  TN: [["Kia", "Sportage"], ["Hyundai", "Tucson"], ["Peugeot", "301"], ["Toyota", "Corolla"]],
};

/** Typical fare range in minor units per market. */
const FARE: Record<MarketId, [base: number, step: number]> = {
  SE: [24_000, 1_500],
  FR: [1_400, 90],
  TN: [7_000, 450],
};

function mix(index: number): number {
  let value = (index + 7) * 2654435761;
  value = Math.imul(value ^ (value >>> 15), 0x2c1b3c6d);
  return (value >>> 0) % 1000;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

type Built = Pick<DemoRecord, "id"> & DemoRecord;

export type MarketRows = {
  drivers: Built[];
  fleets: Built[];
  riders: Built[];
  vehicles: Built[];
  trips: Built[];
  reservations: Built[];
  tickets: Built[];
  incidents: Built[];
  payments: Built[];
  payouts: Built[];
};

function countryRows(id: Exclude<MarketId, "SE">, offset: number, now: string, sizes: { drivers: number; riders: number; trips: number; reservations: number }): MarketRows {
  const people = PEOPLE[id];
  const zoneIds = market(id).zones.map((zone) => zone.id);
  const operating = market(id).zones.filter((zone) => zone.kind === "operating").map((zone) => zone.id);
  const nowMs = Date.parse(now);
  const zoneAt = (index: number) => (index % 6 === 5 ? zoneIds[zoneIds.length - 1] : operating[index % operating.length]);
  const person = (index: number) => `${people.first[index % people.first.length]} ${people.last[mix(index + offset) % people.last.length]}`;
  const [fareBase, fareStep] = FARE[id];

  const drivers = Array.from({ length: sizes.drivers }, (_, index) => ({
    id: `D${offset + index + 1}`,
    name: person(index),
    phone: people.phone(index + 20),
    zoneId: zoneAt(index),
    status: DRIVER_STATUSES[index % DRIVER_STATUSES.length],
    kind: DOC_STATES[index % DOC_STATES.length],
    fleetId: index % 4 === 1 ? FLEETS[id][(index >> 2) % 2][0] : null,
    joinedAt: new Date(nowMs - (40 + (mix(index) % 900)) * 86_400_000).toISOString(),
  }));
  const fleets = FLEETS[id].map(([fleetId, name, ownerId], index) => ({
    id: fleetId,
    name,
    phone: "",
    zoneId: operating[index],
    status: "active",
    ownerId,
  }));
  const vehicles = drivers.map((driver, index) => {
    const category = CATEGORIES[index % CATEGORIES.length];
    const [make, model] = CARS[id][index % CARS[id].length];
    return {
      id: `V${offset + index + 1}`,
      name: driver.name,
      phone: "",
      zoneId: driver.zoneId,
      status: index % 9 === 4 ? "ineligible" : "eligible",
      plate: id === "FR" ? `${String.fromCharCode(65 + (index % 26))}${String.fromCharCode(66 + (index % 24))}-${pad(100 + index, 3)}-MV` : `${pad(180 + (index % 60), 3)} TU ${pad(1000 + index * 37, 4)}`,
      driverId: driver.id,
      fleetId: driver.fleetId,
      year: 2018 + (index % 7),
      seats: category === "xl" ? 6 : 4,
      fuel: category === "electric" ? ("electric" as const) : index % 3 === 0 ? ("hybrid" as const) : ("petrol" as const),
      category,
      make,
      model,
    };
  });
  const riders = Array.from({ length: sizes.riders }, (_, index) => ({
    id: `R${offset + index + 1}`,
    name: person(index + 5),
    phone: people.phone(index + 300),
    zoneId: zoneAt(index),
    status: index % 19 === 0 ? "blocked" : "active",
    tripId: `T${offset + (index % sizes.trips) + 1}`,
  }));
  const trips = Array.from({ length: sizes.trips }, (_, index) => ({
    id: `T${offset + index + 1}`,
    name: riders[index % riders.length].name,
    phone: riders[index % riders.length].phone,
    zoneId: zoneAt(index),
    status: SEED_TRIP_STATUSES[index % SEED_TRIP_STATUSES.length],
    driverId: index % 4 === 0 ? null : drivers[index % drivers.length].id,
    fareOre: fareBase + (mix(index) % 40) * fareStep,
    createdAt: new Date(nowMs - (index % 30) * 86_400_000 - (mix(index) % 960) * 60_000).toISOString(),
  }));
  const reservations = Array.from({ length: sizes.reservations }, (_, index) => {
    const past = index % 2 === 1;
    const pickupAt = new Date(nowMs + (past ? -1 : 1) * (35 + index * 95) * 60_000).toISOString();
    const status = past
      ? index % 7 === 1 ? "cancelled" : index % 9 === 5 ? "no_show" : "completed"
      : index % 6 === 0 ? "waiting" : index % 5 === 0 ? "booked" : "assigned";
    return {
      id: `B${offset + index + 1}`,
      name: riders[index].name,
      phone: riders[index].phone,
      zoneId: zoneAt(index),
      status,
      driverId: status === "waiting" || status === "booked" ? null : drivers[index % drivers.length].id,
      category: CATEGORIES[index % CATEGORIES.length],
      fareOre: fareBase * 2 + (mix(index) % 30) * fareStep,
      pickupAt,
      returnAt: index % 8 === 0 ? new Date(Date.parse(pickupAt) + 6 * 3_600_000).toISOString() : null,
      policyVersion: "res-2",
    };
  });
  const tickets = Array.from({ length: 12 }, (_, index) => ({
    id: `S${offset + index + 1}`,
    name: riders[index].name,
    phone: riders[index].phone,
    zoneId: zoneAt(index),
    status: index % 3 === 0 ? "open" : "claimed",
  }));
  const incidents = Array.from({ length: 3 }, (_, index) => ({
    id: `INC-${id}-${index + 1}`,
    name: riders[index].name,
    phone: riders[index].phone,
    zoneId: zoneAt(index),
    status: index === 0 ? "queued" : "closed",
    driverId: index === 0 ? sosDriverId(drivers, zoneAt(index)) : null,
  }));
  const payments = Array.from({ length: 80 }, (_, index) => ({
    id: `PAY${offset + index + 1}`,
    name: index % 3 === 0 ? "Wallet" : "Card",
    phone: "",
    zoneId: zoneAt(index),
    status: index % 9 === 0 ? "failed" : "captured",
    fareOre: fareBase + (mix(index) % 50) * fareStep,
  }));
  const payouts = Array.from({ length: 4 }, (_, index) => ({
    id: `PO-${id}-${index + 1}`,
    name: `Week ${index + 1}`,
    phone: "",
    zoneId: operating[0],
    status: "scheduled",
    driverId: drivers[index].id,
    fareOre: fareBase * 60,
  }));
  return { drivers, fleets, riders, vehicles, trips, reservations, tickets, incidents, payments, payouts };
}

/** Thirty completed or cancelled Stockholm scheduled rides in the week before `now`. */
function swedishPastReservations(now: string, riders: readonly DemoRecord[], drivers: readonly DemoRecord[], zones: readonly string[]): Built[] {
  const nowMs = Date.parse(now);
  const [fareBase, fareStep] = FARE.SE;
  return Array.from({ length: 30 }, (_, index) => {
    const status = index % 6 === 2 ? "cancelled" : index % 7 === 4 ? "no_show" : "completed";
    return {
      id: `B${101 + index}`,
      name: riders[index + 40].name,
      phone: riders[index + 40].phone,
      zoneId: zones[index % zones.length],
      status,
      driverId: status === "completed" ? drivers[(index * 3) % drivers.length].id : null,
      category: CATEGORIES[index % CATEGORIES.length],
      fareOre: fareBase * 2 + (mix(index) % 30) * fareStep,
      pickupAt: new Date(nowMs - (50 + index * 330) * 60_000).toISOString(),
      returnAt: null,
      policyVersion: "res-2",
    };
  });
}

export function marketRows(now: string, se: { riders: readonly DemoRecord[]; drivers: readonly DemoRecord[]; zones: readonly string[] }): MarketRows & { fleetOwners: Built[]; sePastReservations: Built[] } {
  const fr = countryRows("FR", 1000, now, { drivers: 40, riders: 120, trips: 300, reservations: 30 });
  const tn = countryRows("TN", 2000, now, { drivers: 35, riders: 100, trips: 250, reservations: 28 });
  const keys = ["drivers", "fleets", "riders", "vehicles", "trips", "reservations", "tickets", "incidents", "payments", "payouts"] as const;
  const merged = Object.fromEntries(keys.map((key) => [key, [...fr[key], ...tn[key]]])) as MarketRows;
  return { ...merged, fleetOwners: fleetOwners(now), sePastReservations: swedishPastReservations(now, se.riders, se.drivers, se.zones) };
}
