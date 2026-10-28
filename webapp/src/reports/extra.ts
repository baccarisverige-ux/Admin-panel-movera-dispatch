import type { Totals } from "../dashboard/earnings.ts";
import type { MarketId } from "../markets/markets.ts";
import type { Card, Note, ZoneRow } from "./engine.ts";
import { tr, trx } from "../i18n/index.ts";

/**
 * The extra reports: taxes for a Swedish company working in three countries, fleet owners,
 * zones side by side, pricing and surge, support and safety, and what promotions brought back.
 * Rides are demo numbers until the backend is connected.
 */

export const TAX_RULES_KEY = "taxRules";

/** A rate that can be switched off. */
export type Rate = { on: boolean; pct: number };

export type CountryTax = {
  /** VAT inside the ride price (passenger transport). */
  rideVat: Rate;
  /** On: Movera sells the ride and owes its VAT. Off: the driver or fleet does. */
  moveraSellsRide: boolean;
  /** Swedish VAT on Movera's commission. */
  commissionVat: Rate;
  /** Commission billed from Sweden to drivers abroad: the driver accounts for the VAT, not Movera. */
  reverseCharge: boolean;
  /** Tax kept back from driver payouts, where the country asks for it. */
  withholding: Rate;
};

export type TaxRules = {
  draftRev: number;
  /** Movera is a Swedish company: everything is also shown in SEK. */
  home: "SE";
  countries: Record<MarketId, CountryTax>;
  /** SEK for one unit of the currency. */
  sekPer: { EUR: number; TND: number };
  /** Swedish company tax, a rough estimate on net revenue before costs. Off by default. */
  companyTax: Rate;
};

export function emptyTaxRules(): TaxRules {
  return {
    draftRev: 1,
    home: "SE",
    countries: {
      SE: { rideVat: { on: true, pct: 6 }, moveraSellsRide: false, commissionVat: { on: true, pct: 25 }, reverseCharge: false, withholding: { on: false, pct: 0 } },
      FR: { rideVat: { on: true, pct: 10 }, moveraSellsRide: false, commissionVat: { on: true, pct: 25 }, reverseCharge: true, withholding: { on: false, pct: 0 } },
      TN: { rideVat: { on: true, pct: 7 }, moveraSellsRide: false, commissionVat: { on: true, pct: 25 }, reverseCharge: true, withholding: { on: false, pct: 3 } },
    },
    sekPer: { EUR: 11.5, TND: 3.5 },
    companyTax: { on: false, pct: 20.6 },
  };
}

export function normalizeTaxRules(value: unknown): TaxRules {
  const base = emptyTaxRules();
  if (!value || typeof value !== "object") return base;
  const raw = value as Partial<TaxRules>;
  const countries = { ...base.countries };
  for (const id of ["SE", "FR", "TN"] as const) if (raw.countries?.[id]) countries[id] = { ...base.countries[id], ...raw.countries[id] };
  return { draftRev: typeof raw.draftRev === "number" ? raw.draftRev : 1, home: "SE", countries, sekPer: { ...base.sekPer, ...(raw.sekPer ?? {}) }, companyTax: { ...base.companyTax, ...(raw.companyTax ?? {}) } };
}

export function taxRulesError(rules: TaxRules): string | null {
  for (const [id, row] of Object.entries(rules.countries)) {
    for (const [label, rate] of [["Ride VAT", row.rideVat], ["VAT on commission", row.commissionVat], ["Tax kept from drivers", row.withholding]] as const) {
      if (rate.on && (rate.pct < 0 || rate.pct > 50)) return tr("{0}: {1} must be 0 to 50%.", [id, trx(label)]);
    }
  }
  if (rules.sekPer.EUR <= 0 || rules.sekPer.TND <= 0) return "Exchange rates must be more than zero.";
  if (rules.companyTax.on && (rules.companyTax.pct <= 0 || rules.companyTax.pct > 50)) return "Company tax must be 1 to 50%.";
  return null;
}

const CURRENCY: Record<MarketId, "SEK" | "EUR" | "TND"> = { SE: "SEK", FR: "EUR", TN: "TND" };

/** Minor units of the country's money, as SEK minor units (öre). */
export function toSekMinor(minor: number, country: MarketId, minorUnits: number, rules: TaxRules): number {
  const currency = CURRENCY[country];
  if (currency === "SEK") return minor;
  const major = minor / minorUnits;
  return Math.round(major * rules.sekPer[currency] * 100);
}

export type TaxLine = {
  country: MarketId;
  grossMinor: number;
  commissionMinor: number;
  driverMinor: number;
  rideVatMinor: number;
  rideVatBy: "Movera" | "Drivers" | "Off";
  /** Swedish VAT Movera adds on its commission and pays to Skatteverket. */
  commissionVatMinor: number;
  /** Commission billed with reverse charge: the driver accounts for the VAT. */
  reverseChargeMinor: number;
  withholdingMinor: number;
  /** What Movera owes the tax office for this country. */
  moveraOwesMinor: number;
};

/** VAT inside a price that includes it. */
export function vatInside(minor: number, pct: number): number {
  return pct > 0 ? Math.round((minor * pct) / (100 + pct)) : 0;
}

export function taxLine(country: MarketId, totals: Pick<Totals, "grossMinor" | "commissionMinor" | "driverMinor">, rules: TaxRules): TaxLine {
  const rule = rules.countries[country];
  const rideVatMinor = rule.rideVat.on ? vatInside(totals.grossMinor, rule.rideVat.pct) : 0;
  const domestic = country === rules.home;
  const charged = rule.commissionVat.on && (domestic || !rule.reverseCharge);
  const commissionVatMinor = charged ? Math.round((totals.commissionMinor * rule.commissionVat.pct) / 100) : 0;
  const reverseChargeMinor = rule.commissionVat.on && !domestic && rule.reverseCharge ? totals.commissionMinor : 0;
  const withholdingMinor = rule.withholding.on ? Math.round((totals.driverMinor * rule.withholding.pct) / 100) : 0;
  const rideVatBy = !rule.rideVat.on ? "Off" : rule.moveraSellsRide ? "Movera" : "Drivers";
  return {
    country,
    grossMinor: totals.grossMinor,
    commissionMinor: totals.commissionMinor,
    driverMinor: totals.driverMinor,
    rideVatMinor,
    rideVatBy,
    commissionVatMinor,
    reverseChargeMinor,
    withholdingMinor,
    moveraOwesMinor: commissionVatMinor + (rideVatBy === "Movera" ? rideVatMinor : 0) + withholdingMinor,
  };
}

/** The whole company in SEK, and a rough company tax when switched on. */
export function companyTotals(lines: readonly { line: TaxLine; minorUnits: number }[], netSekMinor: number, rules: TaxRules): { owesSekMinor: number; commissionSekMinor: number; companyTaxSekMinor: number | null } {
  const sek = (minor: number, item: { line: TaxLine; minorUnits: number }) => toSekMinor(minor, item.line.country, item.minorUnits, rules);
  return {
    owesSekMinor: lines.reduce((sum, item) => sum + sek(item.line.moveraOwesMinor, item), 0),
    commissionSekMinor: lines.reduce((sum, item) => sum + sek(item.line.commissionMinor, item), 0),
    companyTaxSekMinor: rules.companyTax.on ? Math.round((Math.max(0, netSekMinor) * rules.companyTax.pct) / 100) : null,
  };
}

export type FleetDriver = { id: string; fleetId: string | null; zoneId: string; trips: number; grossMinor: number; netMinor: number; previousTrips: number; rating: number; online: boolean };
export type FleetRow = { id: string; name: string; drivers: number; online: number; trips: number; previousTrips: number; grossMinor: number; driverMinor: number; fleetMinor: number; perDriverTrips: number; rating: number };

/** Each fleet owner: drivers, rides, what the drivers earned, and the owner's share of it. */
export function fleetRows(drivers: readonly FleetDriver[], fleets: readonly { id: string; name: string }[], sharePct: (zoneId: string) => number): FleetRow[] {
  return fleets.map((fleet) => {
    const mine = drivers.filter((row) => row.fleetId === fleet.id);
    const trips = mine.reduce((sum, row) => sum + row.trips, 0);
    const driverMinor = mine.reduce((sum, row) => sum + row.netMinor, 0);
    return {
      id: fleet.id,
      name: fleet.name,
      drivers: mine.length,
      online: mine.filter((row) => row.online).length,
      trips,
      previousTrips: mine.reduce((sum, row) => sum + row.previousTrips, 0),
      grossMinor: mine.reduce((sum, row) => sum + row.grossMinor, 0),
      driverMinor,
      fleetMinor: mine.reduce((sum, row) => sum + Math.round((row.netMinor * sharePct(row.zoneId)) / 100), 0),
      perDriverTrips: mine.length ? Math.round((trips / mine.length) * 10) / 10 : 0,
      rating: trips ? Math.round((mine.reduce((sum, row) => sum + row.rating * row.trips, 0) / trips) * 100) / 100 : 0,
    };
  }).filter((row) => row.drivers > 0);
}

export type ZoneCompare = ZoneRow & { ridesShare: number; perRideMinor: number; growthPct: number | null; ratio: number };

/** Zones side by side: share of rides, money per ride, growth and how busy they are. */
export function compareZones(rows: readonly ZoneRow[], ratios: Record<string, number>): { rows: ZoneCompare[]; notes: Note[] } {
  const total = rows.reduce((sum, row) => sum + row.trips, 0) || 1;
  const out = rows.map((row) => ({
    ...row,
    ridesShare: Math.round((row.trips / total) * 1000) / 10,
    perRideMinor: row.trips ? Math.round(row.grossMinor / row.trips) : 0,
    growthPct: row.previousTrips ? Math.round(((row.trips - row.previousTrips) / row.previousTrips) * 1000) / 10 : null,
    ratio: ratios[row.id] ?? 0,
  }));
  const notes: Note[] = [];
  const busiest = [...out].sort((a, b) => b.trips - a.trips)[0];
  if (busiest && busiest.trips) notes.push({ tone: "info", text: tr("{0} has the most rides ({1}%)", [busiest.name, busiest.ridesShare]) });
  const slow = [...out].filter((row) => row.trips).sort((a, b) => b.waitMin - a.waitMin)[0];
  if (slow && slow.waitMin >= 8) notes.push({ tone: "bad", text: tr("{0} has the longest wait ({1} min)", [slow.name, slow.waitMin]) });
  const grow = [...out].filter((row) => row.growthPct !== null).sort((a, b) => (b.growthPct ?? 0) - (a.growthPct ?? 0))[0];
  if (grow && (grow.growthPct ?? 0) >= 15) notes.push({ tone: "good", text: tr("{0} grew {1}%", [grow.name, grow.growthPct]) });
  return { rows: out, notes };
}

/** Demo surge from how busy a zone is: none up to 1.4 requests per free driver, then up to 2.5×. */
export function surgeFromRatio(ratio: number, cap = 2.5): number {
  if (ratio <= 1.4) return 1;
  return Math.min(cap, Math.round((1 + (ratio - 1.4) * 0.6) * 10) / 10);
}

export type SurgeZone = { id: string; name: string; samples: number; surgeSamples: number; avgMultiplier: number; peakMultiplier: number; surgePct: number; ridesInSurge: number; extraMinor: number; grossMinor: number };

/**
 * How often surge was on per zone, how high it went and what it added. The zone is sampled
 * at most 200 times over the period; rides in surge get their share of the zone's money.
 */
export function surgeZone(zone: { id: string; name: string; trips: number; grossMinor: number }, ratioAt: (at: number) => number, start: number, end: number, cap = 2.5): SurgeZone {
  const steps = Math.max(1, Math.min(200, Math.round((end - start) / 3_600_000)));
  const step = (end - start) / steps;
  let surge = 0;
  let sum = 0;
  let peak = 1;
  for (let index = 0; index < steps; index += 1) {
    const multiplier = surgeFromRatio(ratioAt(start + step * (index + 0.5)), cap);
    if (multiplier > 1) {
      surge += 1;
      sum += multiplier;
      peak = Math.max(peak, multiplier);
    }
  }
  const avg = surge ? Math.round((sum / surge) * 100) / 100 : 1;
  const share = surge / steps;
  const ridesInSurge = Math.round(zone.trips * share);
  const surgeGross = zone.grossMinor * share;
  return { id: zone.id, name: zone.name, samples: steps, surgeSamples: surge, avgMultiplier: avg, peakMultiplier: peak, surgePct: Math.round(share * 1000) / 10, ridesInSurge, extraMinor: avg > 1 ? Math.round(surgeGross - surgeGross / avg) : 0, grossMinor: zone.grossMinor };
}

export function surgeCards(rows: readonly SurgeZone[]): Card[] {
  const samples = rows.reduce((sum, row) => sum + row.samples, 0) || 1;
  const on = rows.reduce((sum, row) => sum + row.surgeSamples, 0);
  const rides = rows.reduce((sum, row) => sum + row.ridesInSurge, 0);
  const extra = rows.reduce((sum, row) => sum + row.extraMinor, 0);
  const gross = rows.reduce((sum, row) => sum + row.grossMinor, 0) || 1;
  const withSurge = rows.filter((row) => row.surgeSamples);
  return [
    { id: "surgeTime", label: "Time with surge", value: Math.round((on / samples) * 1000) / 10, previous: null, format: "pct", info: "Share of the period when at least the zone had surge on. Demo: from how busy the zone was." },
    { id: "avg", label: "Average surge", value: withSurge.length ? Math.round((withSurge.reduce((sum, row) => sum + row.avgMultiplier * row.surgeSamples, 0) / Math.max(1, on)) * 100) / 100 : 1, previous: null, format: "count", info: "How much prices were multiplied when surge was on, for example 1.4 means 40% more." },
    { id: "rides", label: "Rides with surge", value: rides, previous: null, format: "count", info: "Rides booked while surge was on." },
    { id: "extra", label: "Added by surge", value: extra, previous: null, format: "money", info: "What riders paid on top of the normal price because of surge." },
    { id: "share", label: "Share of bookings", value: Math.round((extra / gross) * 1000) / 10, previous: null, format: "pct", info: "Money added by surge ÷ all bookings." },
  ];
}

export type TicketFact = { openedAt: number; firstReplyAt: number | null; solvedAt: number | null; rating: number | null; topic: string; replyLate: boolean; solveLate: boolean; who: "rider" | "driver" };
export type CaseFact = { openedAt: number; takenAt: number | null; solvedAt: number | null; level: string; kind: string; state: string };

const avg = (values: readonly number[]) => (values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : 0);

export function supportSafety(tickets: readonly TicketFact[], cases: readonly CaseFact[], start: number, end: number): { cards: Card[]; topics: { label: string; value: number }[]; levels: { label: string; value: number }[]; notes: Note[] } {
  const inside = (at: number) => at >= start && at < end;
  const opened = tickets.filter((row) => inside(row.openedAt));
  const solved = tickets.filter((row) => row.solvedAt !== null && inside(row.solvedAt));
  const replies = opened.filter((row) => row.firstReplyAt !== null).map((row) => ((row.firstReplyAt as number) - row.openedAt) / 60_000);
  const solveHours = solved.map((row) => ((row.solvedAt as number) - row.openedAt) / 3_600_000);
  const ratings = solved.map((row) => row.rating).filter((value): value is number => value !== null);
  const incidents = cases.filter((row) => inside(row.openedAt));
  const take = incidents.filter((row) => row.takenAt !== null).map((row) => ((row.takenAt as number) - row.openedAt) / 60_000);
  const close = cases.filter((row) => row.solvedAt !== null && inside(row.solvedAt)).map((row) => ((row.solvedAt as number) - row.openedAt) / 60_000);
  const late = opened.filter((row) => row.replyLate || row.solveLate).length;
  const count = (list: readonly string[]) => [...list.reduce((map, key) => map.set(key, (map.get(key) ?? 0) + 1), new Map<string, number>())].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  const notes: Note[] = [];
  if (late) notes.push({ tone: "bad", text: late > 1 ? tr("{0} tickets went past the time limit", [late]) : tr("{0} ticket went past the time limit", [late]) });
  const critical = incidents.filter((row) => row.level === "critical").length;
  if (critical) notes.push({ tone: "bad", text: critical > 1 ? tr("{0} critical incidents in this period", [critical]) : tr("{0} critical incident in this period", [critical]) });
  return {
    cards: [
      { id: "tickets", label: "Tickets opened", value: opened.length, previous: null, format: "count", info: "Riders and drivers who wrote to support in this period." },
      { id: "solved", label: "Tickets solved", value: solved.length, previous: null, format: "count", info: "Tickets an admin marked solved in this period." },
      { id: "reply", label: "First answer", value: Math.round(avg(replies)), previous: null, format: "min", info: "Average time until the first answer.", goodDown: true },
      { id: "solveTime", label: "Time to solve", value: avg(solveHours), previous: null, format: "hours", info: "Average time from the first message until solved.", goodDown: true },
      { id: "rating", label: "Support rating", value: avg(ratings), previous: null, format: "stars", info: "What people gave support after it was solved, out of 5." },
      { id: "incidents", label: "Incidents", value: incidents.length, previous: null, format: "count", info: "Safety incidents opened in this period.", goodDown: true },
      { id: "take", label: "Incident taken in", value: Math.round(avg(take)), previous: null, format: "min", info: "Average time until an admin took the incident.", goodDown: true },
      { id: "close", label: "Incident solved in", value: Math.round(avg(close)), previous: null, format: "min", info: "Average time until the incident was solved.", goodDown: true },
    ],
    topics: count(opened.map((row) => row.topic)),
    levels: count(incidents.map((row) => row.level)),
    notes,
  };
}

export type PromoRow = { id: string; kind: string; title: string; cost: number; rides: number; newRiders: number; revenue: number; status: string };

/** What promotions cost and what came back, per kind and in total. Major units. */
export function promoReturn(rows: readonly PromoRow[]): { cards: Card[]; byKind: { label: string; cost: number; revenue: number }[]; best: PromoRow | null } {
  const cost = rows.reduce((sum, row) => sum + row.cost, 0);
  const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const newRiders = rows.reduce((sum, row) => sum + row.newRiders, 0);
  const kinds = [...new Set(rows.map((row) => row.kind))];
  const best = [...rows].filter((row) => row.cost > 0).sort((a, b) => b.revenue / b.cost - a.revenue / a.cost)[0] ?? null;
  return {
    cards: [
      { id: "cost", label: "Spent on promotions", value: cost, previous: null, format: "money", info: "Discounts, rewards and bonuses given in this period.", goodDown: true },
      { id: "rides", label: "Rides from promotions", value: rows.reduce((sum, row) => sum + row.rides, 0), previous: null, format: "count", info: "Rides where a promotion was used." },
      { id: "new", label: "New riders", value: newRiders, previous: null, format: "count", info: "People whose first ride used a promotion." },
      { id: "perNew", label: "Cost per new rider", value: newRiders ? Math.round(cost / newRiders) : 0, previous: null, format: "money", info: "What one new rider cost in promotions.", goodDown: true },
      { id: "back", label: "Back per 1 spent", value: cost ? Math.round((revenue / cost) * 10) / 10 : 0, previous: null, format: "count", info: "What the rides brought in for each 1 spent." },
    ],
    byKind: kinds.map((kind) => ({ label: kind, cost: rows.filter((row) => row.kind === kind).reduce((sum, row) => sum + row.cost, 0), revenue: rows.filter((row) => row.kind === kind).reduce((sum, row) => sum + row.revenue, 0) })),
    best,
  };
}
