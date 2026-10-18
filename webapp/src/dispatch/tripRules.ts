/**
 * Destination mode and next trips during a trip (Round 13, R13-9 and R13-18). One set per zone, inside the zone's
 * dispatch rules, so they are drafted, published, undone and logged like every other dispatch setting.
 * Every part has its own on/off switch. The driver app reads them from the rules file (driverApp.destinationMode and
 * driverApp.nextTrips, by zone id).
 */

/** Destination mode: the driver sets a destination and gets trips that bring them closer. */
export type DestinationModeRules = {
  /** The whole Destination mode in this zone. Off = drivers cannot set a destination. */
  on: boolean;
  /** How long a destination stays active. */
  timeLimitOn: boolean;
  timeLimitHours: number;
  /** How many destinations one driver can set per day. */
  dailyLimitOn: boolean;
  perDay: number;
  /** A trip's drop-off must be this close to the driver's road route to the destination. */
  corridorOn: boolean;
  corridorKm: number;
  /** Focus: trips that end near the final destination, trips along the way, or both. */
  finalOn: boolean;
  onTheWayOn: boolean;
};

/** Next-trip offers while the driver drives a rider: only on the way to the final drop-off, never to a stop. */
export type NextTripRules = {
  /** Offers start when the driver is within this many km of the final drop-off. */
  withinKmOn: boolean;
  withinKm: number;
  /** Offers start when the driver is within this many minutes of the final drop-off. */
  withinMinOn: boolean;
  withinMin: number;
};

export type DestinationFocus = "final" | "onTheWay" | "both" | "none";

/** Lowest and highest value for each number, used by the fields and the checks. */
export const TRIP_RULE_LIMITS = {
  timeLimitHours: { min: 0.5, max: 12, step: 0.5 },
  perDay: { min: 1, max: 10, step: 1 },
  corridorKm: { min: 1, max: 50, step: 0.5 },
  withinKm: { min: 0.5, max: 50, step: 0.5 },
  withinMin: { min: 1, max: 60, step: 1 },
} as const;

/** Owner defaults: 2 h, 2 per day, 5 km corridor, focus both; next trips within 5 km or 10 min, all on. */
export function destinationModeDefault(): DestinationModeRules {
  return { on: true, timeLimitOn: true, timeLimitHours: 2, dailyLimitOn: true, perDay: 2, corridorOn: true, corridorKm: 5, finalOn: true, onTheWayOn: true };
}

export function nextTripsDefault(): NextTripRules {
  return { withinKmOn: true, withinKm: 5, withinMinOn: true, withinMin: 10 };
}

/** A stored set from an older save: missing or broken values come from the defaults. */
function completeFlat<T extends Record<string, boolean | number>>(base: T, stored: unknown): T {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return { ...base };
  const raw = stored as Record<string, unknown>;
  const next = { ...base } as Record<string, boolean | number>;
  for (const [key, fallback] of Object.entries(base)) {
    const value = raw[key];
    if (typeof fallback === "boolean" && typeof value === "boolean") next[key] = value;
    if (typeof fallback === "number" && typeof value === "number" && Number.isFinite(value)) next[key] = value;
  }
  return next as T;
}

export function completeDestinationMode(stored: unknown): DestinationModeRules {
  return completeFlat(destinationModeDefault(), stored);
}

export function completeNextTrips(stored: unknown): NextTripRules {
  return completeFlat(nextTripsDefault(), stored);
}

export function destinationFocus(rules: Pick<DestinationModeRules, "finalOn" | "onTheWayOn">): DestinationFocus {
  if (rules.finalOn && rules.onTheWayOn) return "both";
  if (rules.finalOn) return "final";
  if (rules.onTheWayOn) return "onTheWay";
  return "none";
}

export function focusSwitches(focus: Exclude<DestinationFocus, "none">): Pick<DestinationModeRules, "finalOn" | "onTheWayOn"> {
  return { finalOn: focus !== "onTheWay", onTheWayOn: focus !== "final" };
}

const out = (value: number, limit: { min: number; max: number }) => !Number.isFinite(value) || value < limit.min || value > limit.max;

/** Problems that stop a save. Only parts that are on are checked; nothing is checked when Destination mode is off. */
export function destinationModeIssues(rules: DestinationModeRules): string[] {
  if (!rules.on) return [];
  const L = TRIP_RULE_LIMITS;
  const issues: string[] = [];
  if (rules.timeLimitOn && out(rules.timeLimitHours, L.timeLimitHours)) issues.push(`Destination mode: time limit must be ${L.timeLimitHours.min} to ${L.timeLimitHours.max} h.`);
  if (rules.dailyLimitOn && (out(rules.perDay, L.perDay) || !Number.isInteger(rules.perDay))) issues.push(`Destination mode: destinations per day must be a whole number from ${L.perDay.min} to ${L.perDay.max}.`);
  if (rules.corridorOn && out(rules.corridorKm, L.corridorKm)) issues.push(`Destination mode: the corridor around the route must be ${L.corridorKm.min} to ${L.corridorKm.max} km.`);
  if (!rules.finalOn && !rules.onTheWayOn) issues.push("Destination mode: switch on Final destination or On the way, or both.");
  return issues;
}

export function nextTripsIssues(rules: NextTripRules): string[] {
  const L = TRIP_RULE_LIMITS;
  const issues: string[] = [];
  if (rules.withinKmOn && out(rules.withinKm, L.withinKm)) issues.push(`Next trips: distance to the drop-off must be ${L.withinKm.min} to ${L.withinKm.max} km.`);
  if (rules.withinMinOn && (out(rules.withinMin, L.withinMin) || !Number.isInteger(rules.withinMin))) issues.push(`Next trips: time to the drop-off must be a whole number from ${L.withinMin.min} to ${L.withinMin.max} min.`);
  return issues;
}

const num = (value: number) => String(Number(value.toFixed(2)));
const hours = (value: number) => (value === 1 ? "1 h" : `${num(value)} h`);

/** The rule in one plain line, shown live under the settings. */
export function destinationPreview(rules: DestinationModeRules): string {
  if (!rules.on) return "Destination mode is off in this zone. Drivers cannot set a destination.";
  const focus = destinationFocus(rules);
  if (focus === "none") return "Switch on Final destination or On the way, or no trips can match a destination.";
  const route = rules.corridorOn ? `within ${num(rules.corridorKm)} km of the route` : "along the route";
  const near = rules.corridorOn ? `that end within ${num(rules.corridorKm)} km of the destination` : "that end near the destination";
  const what = focus === "final" ? `Trips ${near}` : focus === "onTheWay" ? `Trips ${route} that bring the driver closer, not to the destination itself` : `Trips ${route} that bring the driver closer`;
  const time = rules.timeLimitOn ? `up to ${hours(rules.timeLimitHours)}` : "no time limit";
  const day = rules.dailyLimitOn ? `${rules.perDay} per day` : "no daily limit";
  return `${what}, ${time}, ${day}.`;
}

export function nextTripsPreview(rules: NextTripRules): string {
  const parts = [rules.withinKmOn ? `${num(rules.withinKm)} km` : "", rules.withinMinOn ? `${rules.withinMin} min` : ""].filter(Boolean);
  if (!parts.length) return "Next-trip offers can come on the whole last leg, on the way to the final drop-off. Exclusive and Exclusive reservations only.";
  return `Next-trip offers start within ${parts.join(" or ")} of the final drop-off, whichever comes first. Exclusive and Exclusive reservations only.`;
}

/** What the driver app reads for one zone: driverApp.destinationMode[zoneId]. */
export type DestinationModeForDriverApp = {
  enabled: boolean;
  timeLimitOn: boolean;
  timeLimitHours: number;
  dailyLimitOn: boolean;
  destinationsPerDay: number;
  corridorOn: boolean;
  corridorKm: number;
  focusFinalDestinationOn: boolean;
  focusOnTheWayOn: boolean;
  focus: DestinationFocus;
};

/** What the driver app reads for one zone: driverApp.nextTrips[zoneId]. */
export type NextTripsForDriverApp = {
  offerTypes: ["exclusive", "exclusiveReservation"];
  radarOffers: false;
  onlyOnTheWayToFinalDropoff: true;
  withinKmOfDropoffOn: boolean;
  withinKmOfDropoff: number;
  withinMinutesOfDropoffOn: boolean;
  withinMinutesOfDropoff: number;
  /** "either" = whichever switched-on limit comes first; "wholeLastLeg" = both off. */
  startWhen: "either" | "wholeLastLeg";
};

export function destinationModeForDriverApp(rules: DestinationModeRules): DestinationModeForDriverApp {
  return {
    enabled: rules.on,
    timeLimitOn: rules.timeLimitOn,
    timeLimitHours: rules.timeLimitHours,
    dailyLimitOn: rules.dailyLimitOn,
    destinationsPerDay: rules.perDay,
    corridorOn: rules.corridorOn,
    corridorKm: rules.corridorKm,
    focusFinalDestinationOn: rules.finalOn,
    focusOnTheWayOn: rules.onTheWayOn,
    focus: destinationFocus(rules),
  };
}

export function nextTripsForDriverApp(rules: NextTripRules): NextTripsForDriverApp {
  return {
    offerTypes: ["exclusive", "exclusiveReservation"],
    radarOffers: false,
    onlyOnTheWayToFinalDropoff: true,
    withinKmOfDropoffOn: rules.withinKmOn,
    withinKmOfDropoff: rules.withinKm,
    withinMinutesOfDropoffOn: rules.withinMinOn,
    withinMinutesOfDropoff: rules.withinMin,
    startWhen: rules.withinKmOn || rules.withinMinOn ? "either" : "wholeLastLeg",
  };
}

/** Readable labels for change lines and the history. */
export const TRIP_RULE_LABELS: Record<string, string> = {
  "destinationMode.on": "Destination mode",
  "destinationMode.timeLimitOn": "Destination mode time limit", "destinationMode.timeLimitHours": "Destination active for (h)",
  "destinationMode.dailyLimitOn": "Destination mode daily limit", "destinationMode.perDay": "Destinations per day",
  "destinationMode.corridorOn": "Destination corridor around the route", "destinationMode.corridorKm": "Destination corridor (km)",
  "destinationMode.finalOn": "Destination focus: final destination", "destinationMode.onTheWayOn": "Destination focus: on the way",
  "nextTrips.withinKmOn": "Next trips by distance to drop-off", "nextTrips.withinKm": "Next trips within (km of drop-off)",
  "nextTrips.withinMinOn": "Next trips by time to drop-off", "nextTrips.withinMin": "Next trips within (min of drop-off)",
};
