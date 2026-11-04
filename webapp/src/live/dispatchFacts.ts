import { DASH } from "./driverFacts.ts";

/**
 * Contract v0.18.21 §45 (contract.json#dispatchDriverFacts, owner 2026-11-04 "real driver facts"): the Dispatch page
 * reads each online driver's facts from GET /admin/zones/{zoneId}/driver-facts. A fact the server does not track yet is
 * null: the page writes "—" and no alert fires on it. Nothing is made up from the driver id.
 */
export type ServerDriverFacts = {
  driverId: string;
  zoneId: string;
  state: "free" | "trip";
  rating: number | null;
  acceptancePct: number | null;
  cancelPct: number | null;
  idleMin: number | null;
  categoryIds: string[];
  missedInRow: number | null;
  ridesThisHour: number | null;
  restNeeded: boolean | null;
  finishingInMin: number | null;
  skipsInRow: number | null;
  queuePos: number | null;
  female: boolean | null;
  favourite: boolean | null;
  goingHome: boolean | null;
};

export const driverFactsPath = (zoneId: string) => `/admin/zones/${encodeURIComponent(zoneId)}/driver-facts`;

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const bool = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);

/** One server row; anything missing or of the wrong type becomes null (never a default number). */
export function parseDriverFacts(raw: unknown): ServerDriverFacts | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.driverId !== "string" || typeof row.zoneId !== "string") return null;
  return {
    driverId: row.driverId,
    zoneId: row.zoneId,
    state: row.state === "trip" ? "trip" : "free",
    rating: num(row.rating),
    acceptancePct: num(row.acceptancePct),
    cancelPct: num(row.cancelPct),
    idleMin: num(row.idleMin),
    categoryIds: Array.isArray(row.categoryIds) ? row.categoryIds.filter((id): id is string => typeof id === "string") : [],
    missedInRow: num(row.missedInRow),
    ridesThisHour: num(row.ridesThisHour),
    restNeeded: bool(row.restNeeded),
    finishingInMin: num(row.finishingInMin),
    skipsInRow: num(row.skipsInRow),
    queuePos: num(row.queuePos),
    female: bool(row.female),
    favourite: bool(row.favourite),
    goingHome: bool(row.goingHome),
  };
}

export function parseDriverFactsList(raw: unknown): ServerDriverFacts[] {
  const items = raw && typeof raw === "object" ? (raw as { items?: unknown }).items : null;
  return Array.isArray(items) ? items.map(parseDriverFacts).filter((row): row is ServerDriverFacts => row !== null) : [];
}

/** A yes/no fact as text: "—" when the server has none. */
export function yesNoOrDash(value: boolean | null, yes: string, no: string): string {
  return value === null ? DASH : value ? yes : no;
}

export type OfflineRow = { driverId: string; driver: string; zoneId: string; count: number };

/**
 * The auto-offline warning: drivers whose missed offers in a row reached their zone's limit. A driver with no count
 * (null) never raises it; a limit of 0 or off raises nothing.
 */
export function autoOfflineRows(facts: readonly { id: string; name: string; zoneId: string; noInRow: number | null }[], limitOf: (zoneId: string) => number | null): OfflineRow[] {
  return facts.flatMap((row) => {
    const limit = limitOf(row.zoneId);
    if (row.noInRow === null || limit === null || limit <= 0 || row.noInRow < limit) return [];
    return [{ driverId: row.id, driver: row.name, zoneId: row.zoneId, count: row.noInRow }];
  });
}

/** The server counts missed offers in a row up to 50 (contract v0.18.21 §45); at the cap the page writes "50+". */
export const MISSED_IN_ROW_CAP = 50;
export function missedText(value: number | null): string {
  return value === null ? DASH : value >= MISSED_IN_ROW_CAP ? `${MISSED_IN_ROW_CAP}+` : String(value);
}
