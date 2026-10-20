import type { AuditRow } from "../api/seed.ts";
import type { HistoryRow } from "../alerts/engine.ts";
import { HOURLY, type EarningsReport, type SeriesPoint } from "../dashboard/earnings.ts";
import type { PeriodWindow } from "../dashboard/period.ts";
import type { Activity } from "./activityLog.ts";

/** Reports: the numbers per tab for a period and its comparison, short notes on big changes, and who did what. */

export const REPORT_SETTINGS_KEY = "reportSettings";

export type ReportTab = "overview" | "rides" | "money" | "drivers" | "riders" | "dispatch" | "alerts" | "work" | "taxes" | "fleets" | "zones" | "surge" | "care" | "promos";
export type Compare = "previous" | "year" | "none";
export type Filters = { category: string; method: string; driverId: string; fleetId: string };
export const NO_FILTERS: Filters = { category: "", method: "", driverId: "", fleetId: "" };

export const TABS: { id: ReportTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "rides", label: "Rides" },
  { id: "money", label: "Money" },
  { id: "drivers", label: "Drivers" },
  { id: "riders", label: "Riders" },
  { id: "dispatch", label: "Dispatch" },
  { id: "alerts", label: "Alerts" },
  { id: "work", label: "Admin work" },
  { id: "taxes", label: "Taxes" },
  { id: "fleets", label: "Fleet owners" },
  { id: "zones", label: "Zones" },
  { id: "surge", label: "Surge" },
  { id: "care", label: "Support & safety" },
  { id: "promos", label: "Promotions" },
];

export type Format = "money" | "count" | "pct" | "min" | "sec" | "hours" | "stars";
export type Card = { id: string; label: string; value: number; previous: number | null; format: Format; info: string; goodDown?: boolean };
export type Note = { tone: "good" | "bad" | "info"; text: string };

const YEAR = 365 * 86_400_000;

/** The window to compare with: the period before, the same period last year, or nothing. */
export function compareWindow(window: PeriodWindow, mode: Compare): PeriodWindow {
  if (mode === "year") return { ...window, prevStart: window.start - YEAR, prevEnd: window.end - YEAR, compareLabel: "vs same time last year" };
  return window;
}

export function change(now: number, before: number | null): number | null {
  if (before === null || !before) return null;
  return Math.round(((now - before) / before) * 1000) / 10;
}

/** Notes for numbers that moved a lot. Good or bad depends on the number. */
export function notesFor(cards: readonly Card[], threshold = 15): Note[] {
  return cards.flatMap((card): Note[] => {
    const diff = change(card.value, card.previous);
    if (diff === null || Math.abs(diff) < threshold) return [];
    const up = diff > 0;
    const good = card.goodDown ? !up : up;
    return [{ tone: good ? "good" : "bad", text: `${card.label} is ${up ? "up" : "down"} ${Math.abs(diff)}%` }];
  });
}

/** Category and payment method filters scale the model by that share; 1 when there is no filter. */
export function filterShare(report: Pick<EarningsReport, "byCategory" | "byMethod" | "totals">, filters: Filters): number {
  const total = report.totals.grossMinor || 1;
  const category = filters.category ? (report.byCategory.find((item) => item.id === filters.category)?.minor ?? 0) / total : 1;
  const method = filters.method ? (report.byMethod.find((item) => item.id === filters.method)?.minor ?? 0) / total : 1;
  return category * method;
}

export type ZoneRow = { id: string; name: string; trips: number; cancelled: number; cancelPct: number; waitMin: number; grossMinor: number; netMinor: number; previousTrips: number; previousCancelPct: number };

export type RidesData = { cards: Card[]; series: SeriesPoint[]; byZone: ZoneRow[]; byHour: { hour: number; trips: number }[]; byCategory: { label: string; trips: number }[]; notes: Note[] };

export function ridesData(report: EarningsReport, zones: readonly ZoneRow[], share: number): RidesData {
  const t = report.totals;
  const p = report.previous;
  const avgFare = t.trips ? t.grossMinor / t.trips : 1;
  const completed = Math.round(t.trips * share);
  const cancelled = Math.round(t.cancelled * share);
  const requested = completed + cancelled;
  const prevRequested = Math.round((p.trips + p.cancelled) * share);
  const cards: Card[] = [
    { id: "requested", label: "Rides requested", value: requested, previous: prevRequested, format: "count", info: "Completed rides plus cancelled ones." },
    { id: "completed", label: "Rides completed", value: completed, previous: Math.round(p.trips * share), format: "count", info: "Rides that reached the drop-off." },
    { id: "cancelled", label: "Rides cancelled", value: cancelled, previous: Math.round(p.cancelled * share), format: "count", info: "Cancelled by the rider, the driver or an admin.", goodDown: true },
    { id: "cancelRate", label: "Cancel rate", value: requested ? Math.round((cancelled / requested) * 1000) / 10 : 0, previous: prevRequested ? Math.round(((p.cancelled * share) / prevRequested) * 1000) / 10 : null, format: "pct", info: "Rides cancelled ÷ rides requested.", goodDown: true },
    { id: "wait", label: "Average wait", value: t.trips ? Math.round((t.waitMinTotal / t.trips) * 10) / 10 : 0, previous: p.trips ? Math.round((p.waitMinTotal / p.trips) * 10) / 10 : null, format: "min", info: "From request until the driver arrives, averaged over completed rides.", goodDown: true },
  ];
  const zoneNotes: Note[] = zones
    .filter((zone) => zone.previousCancelPct > 0 && zone.trips > 20 && Math.abs(change(zone.cancelPct, zone.previousCancelPct) ?? 0) >= 25)
    .slice(0, 2)
    .map((zone) => {
      const diff = change(zone.cancelPct, zone.previousCancelPct) ?? 0;
      return { tone: diff > 0 ? "bad" : "good", text: `Cancels in ${zone.name} are ${diff > 0 ? "up" : "down"} ${Math.abs(diff)}%` };
    });
  return {
    cards,
    series: report.series.map((point) => ({ ...point, current: Number.isFinite(point.current) ? Math.round((point.current * share) / avgFare) : NaN, previous: point.previous === null ? null : Math.round((point.previous * share) / avgFare) })),
    byZone: [...zones],
    byHour: HOURLY.map((weight, hour) => ({ hour, trips: Math.round((completed * weight) / HOURLY.reduce((sum, value) => sum + value, 0)) })),
    byCategory: report.byCategory.map((item) => ({ label: item.label, trips: Math.round((item.minor / avgFare) * share) })),
    notes: [...notesFor(cards), ...zoneNotes],
  };
}

export type MoneyData = { cards: Card[]; series: SeriesPoint[]; byZone: ZoneRow[]; byCategory: { label: string; minor: number }[]; byMethod: { label: string; minor: number }[]; notes: Note[] };

export function moneyData(report: EarningsReport, zones: readonly ZoneRow[], share: number, failed: { count: number; minor: number }): MoneyData {
  const t = report.totals;
  const p = report.previous;
  const s = (value: number) => Math.round(value * share);
  const cards: Card[] = [
    { id: "gross", label: "Bookings", value: s(t.grossMinor), previous: s(p.grossMinor), format: "money", info: "Everything riders paid for rides, before refunds." },
    { id: "commission", label: "Movera earnings", value: s(t.commissionMinor), previous: s(p.commissionMinor), format: "money", info: "Movera's commission on rides (20% placeholder until set in Pricing)." },
    { id: "drivers", label: "Driver earnings", value: s(t.driverMinor), previous: s(p.driverMinor), format: "money", info: "Bookings minus commission, plus tips." },
    { id: "tips", label: "Tips", value: s(t.tipsMinor), previous: s(p.tipsMinor), format: "money", info: "Tips riders gave drivers. All of it goes to the driver." },
    { id: "refunds", label: "Refunds & vouchers", value: s(t.refundsMinor), previous: s(p.refundsMinor), format: "money", info: "Money given back to riders, as refunds or vouchers.", goodDown: true },
    { id: "net", label: "Net revenue", value: s(t.netMinor), previous: s(p.netMinor), format: "money", info: "Movera earnings minus refunds and vouchers." },
    { id: "avgFare", label: "Average fare", value: t.trips ? Math.round(t.grossMinor / t.trips) : 0, previous: p.trips ? Math.round(p.grossMinor / p.trips) : null, format: "money", info: "Bookings ÷ completed rides." },
    { id: "failed", label: "Failed payments open", value: failed.minor, previous: null, format: "money", info: `${failed.count} payments failed and are not settled yet. Right now, not for the period.`, goodDown: true },
  ];
  return {
    cards,
    series: report.series.map((point) => ({ ...point, current: Number.isFinite(point.current) ? Math.round(point.current * share) : NaN, previous: point.previous === null ? null : Math.round(point.previous * share) })),
    byZone: [...zones],
    byCategory: report.byCategory.map((item) => ({ label: item.label, minor: Math.round(item.minor * share) })),
    byMethod: report.byMethod.map((item) => ({ label: item.label, minor: Math.round(item.minor * share) })),
    notes: notesFor(cards.filter((card) => card.previous !== null)),
  };
}

export type DriverRow = { id: string; name: string; zone: string; fleet: string; rides: number; hours: number; netMinor: number; bonusMinor: number; acceptancePct: number; cancelPct: number; rating: number; previousRides: number };

export function driversData(rows: readonly DriverRow[]): { cards: Card[]; rows: DriverRow[]; notes: Note[] } {
  const active = rows.filter((row) => row.rides > 0);
  const sum = (key: keyof DriverRow) => rows.reduce((total, row) => total + (row[key] as number), 0);
  const weighted = (key: "acceptancePct" | "cancelPct" | "rating") => {
    const rides = sum("rides");
    return rides ? Math.round((rows.reduce((total, row) => total + row[key] * row.rides, 0) / rides) * 10) / 10 : 0;
  };
  const cards: Card[] = [
    { id: "active", label: "Drivers who drove", value: active.length, previous: rows.filter((row) => row.previousRides > 0).length, format: "count", info: "Drivers with at least one completed ride in the period." },
    { id: "hours", label: "Online hours", value: Math.round(sum("hours")), previous: null, format: "hours", info: "Time drivers were online, with or without a rider." },
    { id: "rides", label: "Rides", value: sum("rides"), previous: sum("previousRides"), format: "count", info: "Completed rides by these drivers." },
    { id: "earnings", label: "Driver earnings", value: sum("netMinor"), previous: null, format: "money", info: "What drivers earned after commission, with tips and bonuses." },
    { id: "bonuses", label: "Bonuses paid", value: sum("bonusMinor"), previous: null, format: "money", info: "Driver bonuses from Drivers → Bonuses." },
    { id: "acceptance", label: "Acceptance rate", value: weighted("acceptancePct"), previous: null, format: "pct", info: "Offers accepted ÷ offers received, weighted by rides." },
    { id: "cancel", label: "Driver cancel rate", value: weighted("cancelPct"), previous: null, format: "pct", info: "Rides the driver cancelled after accepting ÷ rides accepted.", goodDown: true },
  ];
  const sorted = [...rows].sort((a, b) => b.rides - a.rides);
  const top = sorted[0];
  const total = sum("rides");
  const notes: Note[] = [...notesFor(cards)];
  if (top && total && top.rides / total >= 0.08) notes.push({ tone: "info", text: `${top.name} did ${Math.round((top.rides / total) * 100)}% of all rides` });
  return { cards, rows: sorted, notes };
}

export type RiderRow = { id: string; name: string; rides: number; spentMinor: number; isNew: boolean; promo: boolean; cancelRate: number };

export function ridersData(rows: readonly RiderRow[], previousRiders: number, newPrevious: number): { cards: Card[]; top: RiderRow[]; notes: Note[] } {
  const active = rows.filter((row) => row.rides > 0);
  const fresh = active.filter((row) => row.isNew).length;
  const cards: Card[] = [
    { id: "active", label: "Riders who rode", value: active.length, previous: previousRiders, format: "count", info: "Riders with at least one completed ride in the period." },
    { id: "new", label: "New riders", value: fresh, previous: newPrevious, format: "count", info: "Riders whose first ride was in the period." },
    { id: "returning", label: "Returning riders", value: active.length - fresh, previous: previousRiders - newPrevious, format: "count", info: "Riders who rode before the period and again in it." },
    { id: "promo", label: "Used a promotion", value: active.filter((row) => row.promo).length, previous: null, format: "count", info: "Riders who paid less with a promotion or voucher in the period." },
    { id: "spend", label: "Average spend", value: active.length ? Math.round(active.reduce((sum, row) => sum + row.spentMinor, 0) / active.length) : 0, previous: null, format: "money", info: "What one rider paid on average in the period." },
  ];
  return { cards, top: [...active].sort((a, b) => b.spentMinor - a.spentMinor).slice(0, 15), notes: notesFor(cards) };
}

export type DispatchRow = { id: string; name: string; findSec: number; acceptedPct: number; noDriverPct: number; pickupMin: number; radarPct: number; exclusivePct: number; requests: number; mode: string };

export function dispatchData(rows: readonly DispatchRow[]): { cards: Card[]; rows: DispatchRow[]; notes: Note[] } {
  const requests = rows.reduce((sum, row) => sum + row.requests, 0) || 1;
  const avg = (key: "findSec" | "acceptedPct" | "noDriverPct" | "pickupMin" | "radarPct" | "exclusivePct") => Math.round((rows.reduce((sum, row) => sum + row[key] * row.requests, 0) / requests) * 10) / 10;
  const cards: Card[] = [
    { id: "find", label: "Time to find a driver", value: avg("findSec"), previous: null, format: "sec", info: "From request until a driver accepts.", goodDown: true },
    { id: "accepted", label: "Requests accepted", value: avg("acceptedPct"), previous: null, format: "pct", info: "Requests a driver accepted ÷ all requests." },
    { id: "nodriver", label: "No driver found", value: avg("noDriverPct"), previous: null, format: "pct", info: "Requests that ended without a driver.", goodDown: true },
    { id: "pickup", label: "Average pickup time", value: avg("pickupMin"), previous: null, format: "min", info: "From accept until the driver arrives.", goodDown: true },
    { id: "radar", label: "Accepted on Radar", value: avg("radarPct"), previous: null, format: "pct", info: "Radar offers that a driver accepted." },
    { id: "exclusive", label: "Accepted on Exclusive", value: avg("exclusivePct"), previous: null, format: "pct", info: "Exclusive offers that the driver accepted." },
  ];
  const worst = [...rows].sort((a, b) => b.noDriverPct - a.noDriverPct)[0];
  const notes: Note[] = worst && worst.noDriverPct >= 4 ? [{ tone: "bad", text: `${worst.name} has the most requests without a driver (${worst.noDriverPct}%)` }] : [];
  return { cards, rows: [...rows].sort((a, b) => b.requests - a.requests), notes };
}

export function alertsData(rows: readonly HistoryRow[], window: PeriodWindow, open: { critical: number; important: number; info: number }): { cards: Card[]; rows: HistoryRow[]; byAdmin: { admin: string; count: number; avgSolve: number }[]; notes: Note[] } {
  const inWindow = (row: HistoryRow, start: number, end: number) => Date.parse(row.doneAt) >= start && Date.parse(row.doneAt) < end;
  const now = rows.filter((row) => inWindow(row, window.start, window.end));
  const before = rows.filter((row) => inWindow(row, window.prevStart, window.prevEnd));
  const avg = (list: readonly HistoryRow[], key: "takeMin" | "solveMin") => (list.length ? Math.round(list.reduce((sum, row) => sum + row[key], 0) / list.length) : 0);
  const byAdmin = [...new Set(now.map((row) => row.solvedBy))].map((admin) => {
    const list = now.filter((row) => row.solvedBy === admin);
    return { admin, count: list.length, avgSolve: avg(list, "solveMin") };
  }).sort((a, b) => b.count - a.count);
  const cards: Card[] = [
    { id: "solved", label: "Alerts solved", value: now.length, previous: before.length, format: "count", info: "Alerts marked solved in the period, SOS included." },
    { id: "critical", label: "Critical solved", value: now.filter((row) => row.level === "critical").length, previous: before.filter((row) => row.level === "critical").length, format: "count", info: "Solved alerts that were Critical." },
    { id: "take", label: "Time to take", value: avg(now, "takeMin"), previous: before.length ? avg(before, "takeMin") : null, format: "min", info: "From the alert starting until someone took it.", goodDown: true },
    { id: "solve", label: "Time to solve", value: avg(now, "solveMin"), previous: before.length ? avg(before, "solveMin") : null, format: "min", info: "From the alert starting until it was solved.", goodDown: true },
    { id: "open", label: "Open now", value: open.critical + open.important + open.info, previous: null, format: "count", info: `${open.critical} critical, ${open.important} important, ${open.info} info right now.`, goodDown: true },
  ];
  const notes: Note[] = [...notesFor(cards)];
  if (byAdmin[0] && now.length >= 3) notes.push({ tone: "info", text: `${byAdmin[0].admin} solved ${Math.round((byAdmin[0].count / now.length) * 100)}% of all alerts` });
  return { cards, rows: now, byAdmin, notes };
}

/* Admin work ---------------------------------------------------------------------------------- */

export type WorkKind = "save" | "signin" | "signout" | "view" | "export" | "alert";
export type WorkEvent = { id: string; at: string; actorId: string; kind: WorkKind; text: string; detail: string; scope: string; link: string | null; demo: boolean };

const DOMAIN_LABEL: Record<string, string> = {
  dispatch: "Dispatch", alerts: "Alerts", zone: "Zones", pricing: "Pricing", drivers: "Drivers", driver: "Drivers", rider: "Riders", riders: "Riders",
  trip: "Trips", reservation: "Reservations", payment: "Payments", payout: "Payouts", safety: "Safety", support: "Support", content: "Content",
  config: "Settings", team: "Team", profile: "Profile", vehicle: "Vehicles", fleetOwner: "Fleet owners", report: "Reports", live: "Dispatch", growth: "Promotions",
};

export function sectionOf(action: string): string {
  const domain = action.split(".")[1] ?? "";
  return DOMAIN_LABEL[domain] ?? (domain ? domain[0].toUpperCase() + domain.slice(1) : "Other");
}

/** Where to open what was changed, when the target is a known record. */
export function linkFor(targetId: string, action: string): string | null {
  if (/^D\d{3,}/.test(targetId)) return `/drivers/${targetId}`;
  if (/^R\d{3,}/.test(targetId)) return `/riders/${targetId}`;
  if (/^T\d{3,}/.test(targetId)) return `/trips/${targetId}`;
  if (/^RS?\d{3,}|^RES/.test(targetId) && action.includes("reservation")) return `/reservations/${targetId}`;
  if (/^PAY\d+/.test(targetId)) return `/payments/${targetId}`;
  if (/^PO\d+/.test(targetId)) return `/payouts/${targetId}`;
  if (action.startsWith("admin.dispatch.")) return "/dispatch?view=history";
  if (action.startsWith("admin.alerts.")) return "/alerts?view=history";
  if (/^INC-/.test(targetId)) return `/incidents?case=${targetId}`;
  if (action.startsWith("admin.safety.") || action.startsWith("admin.incident.")) return "/incidents";
  if (action.startsWith("admin.risk.")) return "/risk";
  if (action.startsWith("admin.shift.")) return "/handover?tab=past";
  if (action.startsWith("admin.zone.")) return "/zones";
  if (action === "admin.pricing.saveCountry") return "/pricing?tab=extras";
  if (action === "admin.config.saveCountry") return "/settings#country-apps";
  if (action.startsWith("admin.pricing.")) return "/pricing";
  return null;
}

export function workEvents(audits: readonly AuditRow[], activity: readonly Activity[], alerts: readonly HistoryRow[], label: (action: string) => string): WorkEvent[] {
  const saves: WorkEvent[] = audits.filter((row) => row.result === "committed").map((row) => ({
    id: row.id,
    at: row.at,
    actorId: row.actorId,
    kind: row.action.includes("revealSensitive") ? "view" : row.action.includes("export") ? "export" : "save",
    text: label(row.action),
    detail: [row.targetId, row.before || row.after ? `${row.before || "–"} → ${row.after || "–"}` : "", row.reason && row.reason !== "No person affected" ? `why: ${row.reason}` : ""].filter(Boolean).join(" · "),
    scope: row.scope,
    link: linkFor(row.targetId, row.action),
    demo: false,
  }));
  const logged: WorkEvent[] = activity.map((row) => ({ id: row.id, at: row.at, actorId: row.actorId, kind: row.kind, text: row.kind === "export" ? `Downloaded ${row.what}` : row.what, detail: "", scope: row.zone ?? "all", link: null, demo: false }));
  const solved: WorkEvent[] = alerts.map((row) => ({ id: `al-${row.id}-${row.doneAt}`, at: row.doneAt, actorId: row.solvedBy, kind: "alert", text: `Solved alert: ${row.title}`, detail: row.note && row.note !== "Solved" ? row.note : "", scope: row.zoneId ?? "all", link: "/alerts?view=history", demo: false }));
  return [...saves, ...logged, ...solved].sort((a, b) => b.at.localeCompare(a.at));
}

function hash(text: string): number {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

const DEMO_ACTIONS: Record<string, [string, string][]> = {
  super: [["admin.dispatch.publish", "Published dispatch rules"], ["admin.team.update", "Changed a role"], ["admin.alerts.settings", "Changed alert settings"]],
  ops: [["admin.dispatch.publish", "Published dispatch rules"], ["admin.drivers.bonusCreate", "Started a driver bonus"], ["admin.zone.publish", "Published zones"]],
  dispatcher: [["admin.trip.offer", "Offered a ride to a driver"], ["admin.dispatch.control", "Switched a zone to Radar"], ["admin.trip.reassign", "Reassigned a ride"]],
  support: [["admin.support.reply", "Answered a support ticket"], ["admin.rider.promoAdd", "Gave a rider a voucher"]],
  finance: [["admin.payment.refund", "Refunded a payment"], ["admin.payout.markPaid", "Marked a payout paid"]],
  safety: [["admin.safety.resolve", "Solved an SOS"], ["admin.safety.contact", "Called a rider after an SOS"]],
  compliance: [["admin.driver.documentApprove", "Approved a driver document"], ["admin.driver.activate", "Activated a driver"]],
  config: [["admin.pricing.publish", "Published prices"], ["admin.config.publish", "Published settings"]],
  content: [["admin.content.publish", "Published app content"]],
  fleet: [["admin.vehicle.activate", "Activated a vehicle"]],
  viewer: [],
};

/** Demo history for the last two weeks, so the tab is not empty before anyone works. Marked as demo. */
export function demoWork(agents: readonly { id: string; role: string; active: boolean }[], now: number, zoneIds: readonly string[]): WorkEvent[] {
  const out: WorkEvent[] = [];
  const zones = zoneIds.length ? zoneIds : ["all"];
  for (const agent of agents.filter((item) => item.active)) {
    for (let day = 1; day <= 14; day += 1) {
      const seed = hash(`${agent.id}:${day}`);
      const date = new Date(now - day * 86_400_000);
      if (date.getUTCDay() === 0 || date.getUTCDay() === 6 || seed % 7 === 0) continue;
      const startHour = 6 + (seed % 4);
      const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), startHour, (seed >>> 3) % 60);
      const end = start + (7 + ((seed >>> 5) % 3)) * 3_600_000;
      const zone = zones[seed % zones.length];
      const event = (offset: number, kind: WorkKind, text: string, detail = "", link: string | null = null): WorkEvent => ({ id: `demo-${agent.id}-${day}-${offset}-${kind}`, at: new Date(start + offset).toISOString(), actorId: agent.id, kind, text, detail, scope: zone, link, demo: true });
      out.push(event(0, "signin", "Signed in"), event(end - start, "signout", "Signed out"));
      const actions = DEMO_ACTIONS[agent.role] ?? [];
      const count = actions.length ? 2 + ((seed >>> 7) % 5) : 0;
      for (let index = 0; index < count; index += 1) {
        const [action, text] = actions[(seed >>> (index + 2)) % actions.length];
        out.push(event(((index + 1) * (end - start)) / (count + 2), "save", `${sectionOf(action)}: ${text}`, "", linkFor("", action)));
      }
      if ((seed >>> 11) % 4 === 0 && agent.role !== "viewer") out.push(event((end - start) / 2 + 600_000, "view", "Revealed a rider's phone number", "Reason: contact after a lost item"));
      if ((seed >>> 13) % 5 === 0) out.push(event((end - start) - 1_800_000, "export", "Downloaded a report (CSV)"));
    }
  }
  return out;
}

export type AdminSummary = { actorId: string; actions: number; sections: { section: string; count: number }[]; alertsSolved: number; avgSolveMin: number; sessions: number; onlineMin: number; views: number; exports: number; lastAt: string | null };

/** Sign-in and sign-out pairs, with time online. A session still open counts until its last action. */
export function sessions(events: readonly WorkEvent[], actorId: string, now: number): { from: number; to: number; open: boolean }[] {
  const mine = events.filter((event) => event.actorId === actorId).sort((a, b) => a.at.localeCompare(b.at));
  const out: { from: number; to: number; open: boolean }[] = [];
  let current: { from: number; last: number } | null = null;
  for (const event of mine) {
    const at = Date.parse(event.at);
    if (event.kind === "signin") {
      if (current) out.push({ from: current.from, to: current.last, open: false });
      current = { from: at, last: at };
    } else if (event.kind === "signout") {
      if (current) out.push({ from: current.from, to: at, open: false });
      current = null;
    } else if (current) current.last = at;
  }
  if (current) out.push({ from: current.from, to: Math.max(current.last, Math.min(now, current.last + 15 * 60_000)), open: true });
  return out;
}

export function adminSummaries(events: readonly WorkEvent[], solved: readonly HistoryRow[], start: number, end: number, now: number): AdminSummary[] {
  const inWindow = events.filter((event) => Date.parse(event.at) >= start && Date.parse(event.at) < end);
  const actors = [...new Set(inWindow.map((event) => event.actorId))];
  return actors.map((actorId) => {
    const mine = inWindow.filter((event) => event.actorId === actorId);
    const saves = mine.filter((event) => event.kind === "save");
    const sections = new Map<string, number>();
    for (const event of saves) sections.set(event.text.split(":")[0], (sections.get(event.text.split(":")[0]) ?? 0) + 1);
    const done = solved.filter((row) => row.solvedBy === actorId && Date.parse(row.doneAt) >= start && Date.parse(row.doneAt) < end);
    const list = sessions(events, actorId, now).filter((item) => item.to >= start && item.from < end);
    const online = list.reduce((sum, item) => sum + Math.max(0, Math.min(item.to, end) - Math.max(item.from, start)), 0);
    return {
      actorId,
      actions: saves.length,
      sections: [...sections.entries()].map(([section, count]) => ({ section, count })).sort((a, b) => b.count - a.count),
      alertsSolved: done.length,
      avgSolveMin: done.length ? Math.round(done.reduce((sum, row) => sum + row.solveMin, 0) / done.length) : 0,
      sessions: list.length,
      onlineMin: Math.round(online / 60_000),
      views: mine.filter((event) => event.kind === "view").length,
      exports: mine.filter((event) => event.kind === "export").length,
      lastAt: mine[0]?.at ?? null,
    };
  }).sort((a, b) => b.actions + b.alertsSolved - (a.actions + a.alertsSolved));
}

/** Who may see other admins' work: Super admin and Operations always, plus the roles the Super admin adds. */
export function canSeeOthers(role: string, allowed: readonly string[]): boolean {
  return role === "super" || role === "ops" || allowed.includes(role);
}

/* Saved views and schedules ------------------------------------------------------------------ */

export type SavedView = { id: string; name: string; by: string; shared: boolean; tab: ReportTab; period: string; compare: Compare; filters: Filters; country: string; zones: string };
export type Schedule = { id: string; name: string; by: string; on: boolean; tab: ReportTab; format: "csv" | "pdf"; every: "day" | "week" | "month"; weekday: number; time: string; to: string; country: string };
export type ReportSettings = { draftRev: number; views: SavedView[]; schedules: Schedule[]; access: { roles: string[] } };

export function emptyReportSettings(): ReportSettings {
  return { draftRev: 1, views: [], schedules: [], access: { roles: [] } };
}

export function normalizeReportSettings(value: unknown): ReportSettings {
  const base = emptyReportSettings();
  if (!value || typeof value !== "object") return base;
  const raw = value as Partial<ReportSettings>;
  return {
    draftRev: typeof raw.draftRev === "number" && raw.draftRev > 0 ? raw.draftRev : 1,
    views: Array.isArray(raw.views) ? raw.views : [],
    schedules: Array.isArray(raw.schedules) ? raw.schedules : [],
    access: { roles: Array.isArray(raw.access?.roles) ? raw.access!.roles : [] },
  };
}

export function scheduleIssues(schedule: Schedule): string[] {
  const issues: string[] = [];
  if (!schedule.name.trim()) issues.push("Give the schedule a name.");
  const emails = schedule.to.split(/[,;\s]+/).filter(Boolean);
  if (!emails.length) issues.push("Add at least one email address.");
  if (emails.some((email) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) issues.push("One of the email addresses is not valid.");
  if (!/^\d\d:\d\d$/.test(schedule.time)) issues.push("Pick a time.");
  return issues;
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function scheduleLine(schedule: Schedule): string {
  const when = schedule.every === "day" ? `Every day at ${schedule.time}` : schedule.every === "week" ? `Every ${WEEKDAYS[schedule.weekday] ?? "Monday"} at ${schedule.time}` : `On the 1st of every month at ${schedule.time}`;
  const what = schedule.every === "day" ? "yesterday" : schedule.every === "week" ? "last week" : "last month";
  return `${when}: ${what}'s ${TABS.find((tab) => tab.id === schedule.tab)?.label ?? "report"} as ${schedule.format.toUpperCase()} to ${schedule.to.split(/[,;\s]+/).filter(Boolean).length} address${schedule.to.split(/[,;\s]+/).filter(Boolean).length === 1 ? "" : "es"}`;
}

export function csvOf(head: readonly string[], rows: readonly (string | number)[][]): string {
  const cell = (value: string | number) => {
    const text = String(value);
    const safe = /^[=+\-@\t\r]/.test(text) || /^[=+\-@]/.test(text.trimStart()) ? `'${text}` : text;
    return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [head, ...rows].map((line) => line.map(cell).join(",")).join("\n");
}
