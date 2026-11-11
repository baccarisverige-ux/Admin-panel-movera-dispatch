import { booleanWithin } from "@turf/boolean-within";
import { point, polygon } from "@turf/helpers";
import kinks from "@turf/kinks";
import { market, type MarketId } from "../markets/markets.ts";
import { localDay } from "../dashboard/time.ts";

/**
 * Driver bonuses. Two kinds:
 * - "rides": do rides in a time window (anywhere in the chosen zones) and earn a reward.
 * - "area": the same, but only rides inside areas drawn on the map count.
 * Every rule can be switched on or off. Amounts are major units (kr, €, DT).
 */

export const BONUS_KEY = "driverBonus";

export type BonusKind = "rides" | "area";
export type RewardType = "target" | "steps" | "per_ride" | "multiplier" | "guarantee";
export type AreaCounts = "pickup" | "dropoff" | "both";
export type Audience = "all" | "new" | "top" | "fleet" | "picked";

export type Step = { rides: number; amount: number };
export type BonusArea = { id: string; name: string; ring: [number, number][] };

export type BonusRules = {
  maxCancelPct: { on: boolean; value: number };
  minAcceptPct: { on: boolean; value: number };
  backToBack: { on: boolean; value: number };
  minFare: { on: boolean; value: number };
  minKm: { on: boolean; value: number };
  minRating: { on: boolean; value: number };
  minOnlineMin: { on: boolean; value: number };
  categories: { on: boolean; value: string[] };
  maxRides: { on: boolean; value: number };
  maxPayout: { on: boolean; value: number };
};

export type DriverBonus = {
  id: string;
  name: string;
  /** A short message from the admin, shown to drivers on the bonus card and on the map. */
  note: string;
  kind: BonusKind;
  country: MarketId;
  /** Zones where rides count, for ride bonuses. Empty means the whole country. */
  zones: string[];
  areas: BonusArea[];
  areaCounts: AreaCounts;
  reward: { type: RewardType; amount: number; steps: Step[]; rides: number; multiplier: number };
  /** Local time in the country, "07:00". When end is before start the window runs past midnight. */
  start: string;
  end: string;
  /** 0 = Monday … 6 = Sunday. */
  days: number[];
  from: string;
  until: string;
  rules: BonusRules;
  audience: Audience;
  fleetId: string;
  driverIds: string[];
  budget: number | null;
  status: "active" | "paused" | "ended";
  createdBy: string;
  createdAt: string;
  editedBy?: string;
};

export type BonusBook = { draftRev: number; bonuses: DriverBonus[] };

export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const REWARD_TYPES: { id: RewardType; label: string; hint: string }[] = [
  { id: "target", label: "Ride target", hint: "Do 3 rides, earn 150" },
  { id: "steps", label: "Steps", hint: "3 rides 100, 5 rides 200…" },
  { id: "per_ride", label: "Extra per ride", hint: "+20 on each ride" },
  { id: "multiplier", label: "Earnings boost", hint: "×1.3 on fares" },
  { id: "guarantee", label: "Guaranteed earnings", hint: "At least 300 per hour" },
];

export const AUDIENCES: { id: Audience; label: string }[] = [
  { id: "all", label: "All active drivers" },
  { id: "new", label: "New drivers (last 30 days)" },
  { id: "top", label: "Top drivers (rating 4.85+)" },
  { id: "fleet", label: "One fleet" },
  { id: "picked", label: "Drivers I pick" },
];

export function defaultRules(country: MarketId): BonusRules {
  return {
    maxCancelPct: { on: true, value: 10 },
    minAcceptPct: { on: false, value: 80 },
    backToBack: { on: false, value: 20 },
    minFare: { on: false, value: { SE: 80, FR: 8, TN: 8 }[country] },
    minKm: { on: false, value: 2 },
    minRating: { on: false, value: 4.7 },
    minOnlineMin: { on: false, value: 60 },
    categories: { on: false, value: [] },
    maxRides: { on: false, value: 10 },
    maxPayout: { on: false, value: { SE: 500, FR: 50, TN: 80 }[country] },
  };
}

export function newBonus(kind: BonusKind, country: MarketId, by: string, now: number): DriverBonus {
  const today = localDay(now, market(country).timeZone);
  const amount = { SE: 150, FR: 15, TN: 20 }[country];
  return {
    id: "",
    name: kind === "area" ? "Area bonus" : "Morning rush",
    note: "",
    kind,
    country,
    zones: [],
    areas: [],
    areaCounts: "pickup",
    reward: { type: "target", amount, steps: [{ rides: 3, amount }, { rides: 5, amount: amount * 2 }, { rides: 8, amount: amount * 3.5 }], rides: 3, multiplier: 1.3 },
    start: "07:00",
    end: "09:00",
    days: [0, 1, 2, 3, 4],
    from: today,
    until: "",
    rules: defaultRules(country),
    audience: "all",
    fleetId: "",
    driverIds: [],
    budget: null,
    status: "active",
    createdBy: by,
    createdAt: new Date(now).toISOString(),
  };
}

function circle(lat: number, lng: number, km: number): [number, number][] {
  const dLat = km / 111.32;
  const dLng = km / (111.32 * Math.cos((lat * Math.PI) / 180));
  return Array.from({ length: 36 }, (_, index) => {
    const angle = (2 * Math.PI * index) / 36;
    return [Number((lat + Math.sin(angle) * dLat).toFixed(6)), Number((lng + Math.cos(angle) * dLng).toFixed(6))] as [number, number];
  });
}

export function emptyBonusBook(): BonusBook {
  const base = (kind: BonusKind) => newBonus(kind, "SE", "nora", Date.parse("2026-10-01T08:00:00.000Z"));
  const morning = base("rides");
  const arlanda = base("area");
  return {
    draftRev: 1,
    bonuses: [
      {
        ...morning,
        id: "B-SEED-1",
        name: "Morning rush",
        zones: [],
        reward: { ...morning.reward, type: "target", amount: 150, rides: 3 },
        rules: { ...morning.rules, backToBack: { on: true, value: 20 } },
        from: "2026-10-01",
        until: "2026-12-31",
      },
      {
        ...arlanda,
        id: "B-SEED-2",
        name: "Arlanda evening",
        note: "Many flights land 17–20. Wait at Terminal 5, door 4.",
        areas: [{ id: "A1", name: "Arlanda terminals", ring: circle(59.649, 17.929, 2.5) }],
        areaCounts: "pickup",
        reward: { ...arlanda.reward, type: "per_ride", amount: 40, rides: 3 },
        start: "17:00",
        end: "20:00",
        days: [0, 1, 2, 3, 4, 5, 6],
        rules: { ...arlanda.rules, maxRides: { on: true, value: 6 }, minFare: { on: true, value: 200 }, maxPayout: { on: true, value: 240 } },
        from: "2026-10-01",
        until: "2026-11-30",
        budget: 20000,
        createdBy: "lena",
      },
    ],
  };
}

export function normalizeBonusBook(raw: unknown): BonusBook {
  const fallback = emptyBonusBook();
  if (!raw || typeof raw !== "object") return fallback;
  const book = raw as Partial<BonusBook>;
  if (!Array.isArray(book.bonuses)) return fallback;
  return {
    draftRev: typeof book.draftRev === "number" ? book.draftRev : 1,
    bonuses: book.bonuses.map((item) => ({ ...newBonus(item.kind ?? "rides", item.country ?? "SE", item.createdBy ?? "", Date.parse(item.createdAt ?? "") || 0), ...item, rules: { ...defaultRules(item.country ?? "SE"), ...(item.rules ?? {}) } })),
  };
}

/* ---------- Time ---------- */

export function toMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes > 0)) return null;
  return hours * 60 + minutes;
}

/** Day (0 = Monday), minutes after midnight and the date, in the country's time zone. */
export function localParts(ms: number, timeZone: string): { day: number; minutes: number; date: string } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
  const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday ?? "Mon");
  return { day, minutes: Number(parts.hour) * 60 + Number(parts.minute), date: `${parts.year}-${parts.month}-${parts.day}` };
}

function previousDate(date: string): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

/** Whether a moment falls in the bonus window. A window past midnight belongs to the day it starts. */
export function inWindow(bonus: Pick<DriverBonus, "start" | "end" | "days" | "from" | "until">, ms: number, timeZone: string): boolean {
  const start = toMinutes(bonus.start);
  const end = toMinutes(bonus.end);
  if (start === null || end === null || start === end) return false;
  const local = localParts(ms, timeZone);
  let day = local.day;
  let date = local.date;
  if (end > start) {
    if (local.minutes < start || local.minutes >= end) return false;
  } else if (local.minutes >= start) {
    // Evening part of a window that ends after midnight.
  } else if (local.minutes < end) {
    day = (local.day + 6) % 7;
    date = previousDate(local.date);
  } else {
    return false;
  }
  if (!bonus.days.includes(day)) return false;
  if (bonus.from && date < bonus.from) return false;
  if (bonus.until && date > bonus.until) return false;
  return true;
}

export function windowMinutes(bonus: Pick<DriverBonus, "start" | "end">): number {
  const start = toMinutes(bonus.start);
  const end = toMinutes(bonus.end);
  if (start === null || end === null || start === end) return 0;
  return end > start ? end - start : 24 * 60 - start + end;
}

export function bonusState(bonus: DriverBonus, now: number, timeZone: string): "live" | "today" | "done" | "scheduled" | "paused" | "ended" {
  if (bonus.status === "paused") return "paused";
  const local = localParts(now, timeZone);
  if (bonus.status === "ended" || (bonus.until && local.date > bonus.until)) return "ended";
  if (bonus.from && local.date < bonus.from) return "scheduled";
  if (inWindow(bonus, now, timeZone)) return "live";
  if (!bonus.days.includes(local.day)) return "scheduled";
  const start = toMinutes(bonus.start) ?? 0;
  // Today's window is still to come, or it has passed (a night window past midnight starts later today).
  return local.minutes < start ? "today" : "done";
}

/* ---------- Checks ---------- */

function ring(points: [number, number][]) {
  const coords = points.map(([lat, lng]) => [lng, lat]);
  if (coords.length) coords.push([...coords[0]!]);
  return polygon([coords]);
}

export function validateBonus(bonus: DriverBonus): string | null {
  if (!bonus.name.trim()) return "Give the bonus a name drivers see.";
  if (bonus.note.length > 140) return "Keep the message to drivers under 140 characters.";
  const { reward } = bonus;
  if (reward.type === "target") {
    if (!(reward.rides >= 1 && reward.rides <= 50)) return "The number of rides must be between 1 and 50.";
    if (!(reward.amount > 0)) return "The bonus amount must be above 0.";
  }
  if (reward.type === "steps") {
    if (reward.steps.length < 2) return "Add at least 2 steps.";
    for (let index = 0; index < reward.steps.length; index += 1) {
      const step = reward.steps[index]!;
      if (!(step.rides >= 1) || !(step.amount > 0)) return "Each step needs rides and an amount above 0.";
      const prev = reward.steps[index - 1];
      if (prev && (step.rides <= prev.rides || step.amount <= prev.amount)) return "Each step needs more rides and a bigger amount than the one before.";
    }
  }
  if (reward.type === "per_ride" && !(reward.amount > 0)) return "The extra per ride must be above 0.";
  if (reward.type === "multiplier" && !(reward.multiplier > 1 && reward.multiplier <= 3)) return "The boost must be between ×1.05 and ×3.";
  if (reward.type === "guarantee" && !(reward.amount > 0)) return "The guaranteed amount per hour must be above 0.";
  if ((reward.type === "multiplier" || reward.type === "guarantee" || reward.type === "per_ride") && !bonus.rules.maxPayout.on) return "Set the most one driver can earn (rule: max payout per driver).";
  const start = toMinutes(bonus.start);
  const end = toMinutes(bonus.end);
  if (start === null || end === null) return "Times look like 07:00.";
  if (start === end) return "Start and end time cannot be the same.";
  if (!bonus.days.length) return "Pick at least one day.";
  if (!bonus.from) return "Pick the first day.";
  if (bonus.until && bonus.until < bonus.from) return "The last day must be after the first day.";
  if (bonus.kind === "area") {
    if (!bonus.areas.length) return "Draw at least one area on the map.";
    for (const area of bonus.areas) {
      if (area.ring.length < 3) return `${area.name} needs at least 3 points.`;
      if (kinks(ring(area.ring)).features.length) return `${area.name} crosses itself. Draw it again.`;
    }
  }
  const { rules } = bonus;
  if (rules.maxCancelPct.on && !(rules.maxCancelPct.value >= 0 && rules.maxCancelPct.value <= 100)) return "Cancel rate must be 0–100%.";
  if (rules.minAcceptPct.on && !(rules.minAcceptPct.value >= 0 && rules.minAcceptPct.value <= 100)) return "Acceptance rate must be 0–100%.";
  if (rules.backToBack.on && !(rules.backToBack.value >= 1)) return "Time between rides must be at least 1 minute.";
  if (rules.minRating.on && !(rules.minRating.value >= 1 && rules.minRating.value <= 5)) return "Rating must be between 1 and 5.";
  if (rules.minOnlineMin.on && rules.minOnlineMin.value > windowMinutes(bonus)) return `Online time cannot be longer than the window (${windowMinutes(bonus)} min).`;
  if (rules.categories.on && !rules.categories.value.length) return "Pick at least one category, or switch the rule off.";
  if (rules.maxRides.on && !(rules.maxRides.value >= 1)) return "Max rides counted must be at least 1.";
  if (rules.maxPayout.on && !(rules.maxPayout.value > 0)) return "Max payout per driver must be above 0.";
  if (bonus.audience === "fleet" && !bonus.fleetId) return "Pick the fleet.";
  if (bonus.audience === "picked" && !bonus.driverIds.length) return "Pick at least one driver.";
  if (bonus.budget !== null && !(bonus.budget > 0)) return "The budget must be above 0, or empty for no budget.";
  const most = maxPerDriver(bonus);
  if (bonus.budget !== null && most !== null && most > bonus.budget) return `One driver can earn ${most}, more than the whole budget of ${bonus.budget}.`;
  return null;
}

/** The most one driver can earn in one window, when it has a limit. */
export function maxPerDriver(bonus: Pick<DriverBonus, "reward" | "rules">): number | null {
  const { reward, rules } = bonus;
  let most: number | null = null;
  if (reward.type === "target") most = reward.amount;
  if (reward.type === "steps") most = Math.max(...reward.steps.map((step) => step.amount), 0);
  if (reward.type === "per_ride" && rules.maxRides.on) most = reward.amount * rules.maxRides.value;
  if (rules.maxPayout.on) most = most === null ? rules.maxPayout.value : Math.min(most, rules.maxPayout.value);
  return most;
}

/* ---------- Who and what counts ---------- */

export type DriverFacts = { id: string; fleetId: string | null; status: string; rating: number; joinedDays: number };

export function inAudience(bonus: Pick<DriverBonus, "audience" | "fleetId" | "driverIds">, driver: DriverFacts): boolean {
  if (driver.status !== "active") return false;
  if (bonus.audience === "new") return driver.joinedDays <= 30;
  if (bonus.audience === "top") return driver.rating >= 4.85;
  if (bonus.audience === "fleet") return driver.fleetId === bonus.fleetId;
  if (bonus.audience === "picked") return bonus.driverIds.includes(driver.id);
  return true;
}

export type BonusRide = { id: string; start: number; end: number; fare: number; km: number; category: string; zoneId: string; pickup: [number, number]; dropoff: [number, number] };
export type DriverDay = { rides: BonusRide[]; cancelPct: number; acceptPct: number; rating: number; onlineMin: number };

export function insideAreas(areas: readonly BonusArea[], at: [number, number]): boolean {
  const probe = point([at[1], at[0]]);
  return areas.some((area) => area.ring.length >= 3 && booleanWithin(probe, ring(area.ring)));
}

/** Whether one ride counts, and if not, why. */
export function rideCounts(bonus: DriverBonus, ride: BonusRide, timeZone: string): string | null {
  if (!inWindow(bonus, ride.start, timeZone)) return "outside the time";
  if (bonus.kind === "rides" && bonus.zones.length && !bonus.zones.includes(ride.zoneId)) return "outside the zones";
  if (bonus.kind === "area") {
    const pick = insideAreas(bonus.areas, ride.pickup);
    const drop = insideAreas(bonus.areas, ride.dropoff);
    if (bonus.areaCounts === "pickup" && !pick) return "pickup outside the area";
    if (bonus.areaCounts === "dropoff" && !drop) return "drop-off outside the area";
    if (bonus.areaCounts === "both" && !(pick && drop)) return "not inside the area";
  }
  const { rules } = bonus;
  if (rules.minFare.on && ride.fare < rules.minFare.value) return "fare too low";
  if (rules.minKm.on && ride.km < rules.minKm.value) return "ride too short";
  if (rules.categories.on && !rules.categories.value.includes(ride.category)) return "category not in the bonus";
  return null;
}

/** The longest run of rides where each one starts at most gapMin after the one before ends. */
export function longestChain(rides: readonly BonusRide[], gapMin: number): BonusRide[] {
  const sorted = [...rides].sort((a, b) => a.start - b.start);
  let best: BonusRide[] = [];
  let current: BonusRide[] = [];
  for (const ride of sorted) {
    const last = current[current.length - 1];
    if (last && ride.start - last.end <= gapMin * 60_000) current.push(ride);
    else current = [ride];
    if (current.length > best.length) best = [...current];
  }
  return best;
}

export type BonusResult = {
  eligible: boolean;
  failed: string[];
  counted: number;
  /** Rides needed for the next payout, when the reward has a target. */
  target: number | null;
  earned: number;
  capped: boolean;
};

/** What one driver earns from a bonus on one day. */
export function evaluateBonus(bonus: DriverBonus, day: DriverDay, timeZone: string, driverShare = 0.8): BonusResult {
  const { rules, reward } = bonus;
  const failed: string[] = [];
  if (rules.maxCancelPct.on && day.cancelPct > rules.maxCancelPct.value) failed.push(`Cancel rate ${day.cancelPct}% is above ${rules.maxCancelPct.value}%`);
  if (rules.minAcceptPct.on && day.acceptPct < rules.minAcceptPct.value) failed.push(`Acceptance ${day.acceptPct}% is below ${rules.minAcceptPct.value}%`);
  if (rules.minRating.on && day.rating < rules.minRating.value) failed.push(`Rating ${day.rating.toFixed(2)} is below ${rules.minRating.value}`);
  if (rules.minOnlineMin.on && day.onlineMin < rules.minOnlineMin.value) failed.push(`Online ${day.onlineMin} min, needs ${rules.minOnlineMin.value} min`);
  let rides = day.rides.filter((ride) => rideCounts(bonus, ride, timeZone) === null);
  if (rules.backToBack.on) rides = longestChain(rides, rules.backToBack.value);
  if (rules.maxRides.on) rides = [...rides].sort((a, b) => a.start - b.start).slice(0, rules.maxRides.value);
  const counted = rides.length;
  let earned: number;
  let target: number | null = null;
  if (reward.type === "target") {
    target = reward.rides;
    earned = counted >= reward.rides ? reward.amount : 0;
  } else if (reward.type === "steps") {
    const reached = reward.steps.filter((step) => counted >= step.rides);
    earned = reached.length ? reached[reached.length - 1]!.amount : 0;
    target = reward.steps.find((step) => counted < step.rides)?.rides ?? null;
  } else if (reward.type === "per_ride") {
    earned = counted * reward.amount;
  } else if (reward.type === "multiplier") {
    earned = rides.reduce((sum, ride) => sum + ride.fare * driverShare, 0) * (reward.multiplier - 1);
  } else {
    const made = rides.reduce((sum, ride) => sum + ride.fare * driverShare, 0);
    earned = Math.max(0, (reward.amount * Math.min(day.onlineMin, windowMinutes(bonus))) / 60 - made);
  }
  let capped = false;
  if (rules.maxPayout.on && earned > rules.maxPayout.value) {
    earned = rules.maxPayout.value;
    capped = true;
  }
  const eligible = failed.length === 0;
  return { eligible, failed, counted, target, earned: eligible ? Math.round(earned * 100) / 100 : 0, capped };
}

/* ---------- Saving ---------- */

function bump(book: BonusBook, bonuses: DriverBonus[]): BonusBook {
  return { draftRev: book.draftRev + 1, bonuses };
}

export function saveBonus(book: BonusBook, bonus: DriverBonus, by: string, now: number): { book: BonusBook; error?: string; id?: string } {
  const error = validateBonus(bonus);
  if (error) return { book, error };
  if (bonus.id && book.bonuses.some((item) => item.id === bonus.id)) {
    return { book: bump(book, book.bonuses.map((item) => (item.id === bonus.id ? { ...bonus, editedBy: by } : item))), id: bonus.id };
  }
  const id = `B-${now}-${book.bonuses.length + 1}`;
  return { book: bump(book, [{ ...bonus, id, createdBy: by, createdAt: new Date(now).toISOString() }, ...book.bonuses]), id };
}

export function setBonusStatus(book: BonusBook, id: string, status: DriverBonus["status"]): BonusBook {
  return bump(book, book.bonuses.map((item) => (item.id === id && item.status !== "ended" ? { ...item, status } : item)));
}

/* ---------- Words for drivers ---------- */

export function rewardLine(bonus: Pick<DriverBonus, "reward">, money: (value: number) => string): string {
  const { reward } = bonus;
  if (reward.type === "target") return `Do ${reward.rides} ride${reward.rides === 1 ? "" : "s"}, earn ${money(reward.amount)}`;
  if (reward.type === "steps") return reward.steps.map((step) => `${step.rides} rides ${money(step.amount)}`).join(" · ");
  if (reward.type === "per_ride") return `+${money(reward.amount)} on each ride`;
  if (reward.type === "multiplier") return `×${reward.multiplier} on your fares`;
  return `At least ${money(reward.amount)} per hour online`;
}

export function timeLine(bonus: Pick<DriverBonus, "start" | "end" | "days">): string {
  const days = bonus.days.length === 7 ? "Every day" : bonus.days.length === 5 && [0, 1, 2, 3, 4].every((day) => bonus.days.includes(day)) ? "Mon–Fri" : bonus.days.length === 2 && bonus.days.includes(5) && bonus.days.includes(6) ? "Sat–Sun" : [...bonus.days].sort().map((day) => DAY_SHORT[day]).join(", ");
  return `${days} · ${bonus.start}–${bonus.end}`;
}

/** The rules in simple words, as drivers read them in the app. */
export function ruleLines(bonus: DriverBonus, money: (value: number) => string, categoryName: (id: string) => string): string[] {
  const { rules } = bonus;
  const lines: string[] = [];
  if (bonus.kind === "area") lines.push(bonus.areaCounts === "pickup" ? "Pick up inside the area" : bonus.areaCounts === "dropoff" ? "Drop off inside the area" : "Pick up and drop off inside the area");
  if (rules.backToBack.on) lines.push(`Rides back to back: max ${rules.backToBack.value} min between rides`);
  if (rules.maxCancelPct.on) lines.push(`Cancel rate ${rules.maxCancelPct.value}% or less`);
  if (rules.minAcceptPct.on) lines.push(`Accept ${rules.minAcceptPct.value}% of offers or more`);
  if (rules.minRating.on) lines.push(`Rating ${rules.minRating.value} or more`);
  if (rules.minOnlineMin.on) lines.push(`Be online at least ${rules.minOnlineMin.value} min in the window`);
  if (rules.minFare.on) lines.push(`Rides of ${money(rules.minFare.value)} or more`);
  if (rules.minKm.on) lines.push(`Rides of ${rules.minKm.value} km or more`);
  if (rules.categories.on) lines.push(`Only ${rules.categories.value.map(categoryName).join(", ")}`);
  if (rules.maxRides.on) lines.push(`Up to ${rules.maxRides.value} rides count`);
  if (rules.maxPayout.on) lines.push(`Up to ${money(rules.maxPayout.value)} per driver`);
  return lines;
}
