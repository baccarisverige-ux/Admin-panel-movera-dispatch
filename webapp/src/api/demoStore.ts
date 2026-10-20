import { ApiError, classifyStatus } from "./httpClient.ts";
import { createSeed, inScope, searchDb, type DemoDb, type DemoRecord, type ZoneScope } from "./seed.ts";

export type Fault = "none" | "401" | "403" | "409" | "422" | "429" | "503" | "offline" | "slow" | "empty";

const DB_KEY = "movera-demo-v5";
const FAULT_KEY = "movera-demo-fault";

type StorageLike = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void; removeItem: (key: string) => void };

const memory = new Map<string, string>();
const memoryStorage: StorageLike = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value),
  removeItem: (key) => memory.delete(key),
};

function storage(): StorageLike {
  // C-26: a browser that blocks storage throws on access; the demo then keeps its data in memory.
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.getItem(DB_KEY);
      return localStorage;
    }
  } catch {
    // fall through
  }
  return memoryStorage;
}

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isRow = (value: unknown): value is DemoRecord => isObject(value) && typeof value.id === "string";
const AUDIT_RESULTS = new Set(["committed", "rejected", "denied", "conflict", "pending_approval"]);
const isAudit = (value: unknown): value is DemoDb["audits"][number] =>
  isObject(value) && ["id", "at", "actorId", "action", "targetId"].every((key) => typeof value[key] === "string") && AUDIT_RESULTS.has(String(value.result));

/**
 * C-26: stored demo data is checked, not cast. Each collection must be a list of records with an id (bad rows
 * are dropped, a missing or broken list comes back from the seed), audits need their fields, and the slices,
 * operations and approvals must have the right shape. Anything unreadable starts from the seed.
 */
let seedForRepair: DemoDb | null = null;

export function validateDb(stored: unknown): DemoDb {
  if (!isObject(stored) || !Array.isArray(stored.drivers)) return createSeed();
  // Lists that are missing come back from one seed made once, so a read stays fast.
  const seed = (seedForRepair ??= createSeed());
  const out: Record<string, unknown> = { ...stored };
  for (const [key, value] of Object.entries(seed)) {
    if (!Array.isArray(value) || key === "audits" || key === "approvals" || key === "rideChecks" || key === "inbox" || key === "zones") continue;
    const rows = stored[key];
    out[key] = Array.isArray(rows) ? rows.filter(isRow) : value;
  }
  out.zones = Array.isArray(stored.zones) ? stored.zones.filter((zone) => isObject(zone) && typeof zone.id === "string" && typeof zone.name === "string") : seed.zones;
  out.inbox = Array.isArray(stored.inbox) ? stored.inbox.filter((item) => isObject(item) && typeof item.id === "string" && typeof item.path === "string") : seed.inbox;
  if (stored.rideChecks !== undefined && !Array.isArray(stored.rideChecks)) delete out.rideChecks;
  out.rev = typeof stored.rev === "number" && Number.isFinite(stored.rev) ? stored.rev : seed.rev;
  out.updatedAt = typeof stored.updatedAt === "string" ? stored.updatedAt : seed.updatedAt;
  out.slices = isObject(stored.slices) ? stored.slices : {};
  out.operations = isObject(stored.operations) ? Object.fromEntries(Object.entries(stored.operations).filter(([, op]) => isObject(op) && typeof op.operationId === "string" && typeof op.status === "string")) : {};
  out.approvals = Array.isArray(stored.approvals) ? stored.approvals.filter((item) => isObject(item) && typeof item.id === "string" && typeof item.targetId === "string" && typeof item.amountOre === "number") : [];
  out.audits = Array.isArray(stored.audits) ? stored.audits.filter(isAudit) : [];
  return out as DemoDb;
}

let seedChecks: Pick<DemoDb, "rideChecks" | "incidents"> | null = null;

/** Demo data saved before Ride check existed gets the seeded checks and their incidents. */
function withRideChecks(db: DemoDb): DemoDb {
  if (Array.isArray(db.rideChecks)) return db;
  seedChecks ??= (() => {
    const seed = createSeed();
    return { rideChecks: seed.rideChecks, incidents: seed.incidents.filter((row) => row.kind === "ride_check") };
  })();
  const have = new Set((db.incidents ?? []).map((row) => row.id));
  return { ...db, rideChecks: seedChecks.rideChecks, incidents: [...(db.incidents ?? []), ...seedChecks.incidents.filter((row) => !have.has(row.id))] };
}

export function loadDb(): DemoDb {
  const raw = storage().getItem(DB_KEY);
  if (!raw) return createSeed();
  try {
    const stored = JSON.parse(raw) as unknown;
    if (!isObject(stored) || !Array.isArray(stored.drivers)) return createSeed();
    const parsed = withRideChecks(validateDb(stored));
    return {
      ...parsed,
      operations: parsed.operations ?? {},
      approvals: parsed.approvals ?? [],
      audits: (parsed.audits ?? []).map((entry, index) => ({
        ...entry,
        operationId: entry.operationId ?? `legacy-${index + 1}`,
        scope: entry.scope ?? "all",
      })),
    };
  } catch {
    return createSeed();
  }
}

export function saveDb(db: DemoDb): DemoDb {
  const next = { ...db, updatedAt: new Date().toISOString() };
  storage().setItem(DB_KEY, JSON.stringify(next));
  return next;
}

export function resetDb(): DemoDb {
  const next = createSeed();
  storage().setItem(DB_KEY, JSON.stringify(next));
  storage().setItem(FAULT_KEY, "none");
  return next;
}

export function readFault(): Fault {
  const value = storage().getItem(FAULT_KEY);
  if (value === "401" || value === "403" || value === "409" || value === "422" || value === "429" || value === "503" || value === "offline" || value === "slow" || value === "empty") return value;
  return "none";
}

export function writeFault(fault: Fault): void {
  storage().setItem(FAULT_KEY, fault);
}

export async function pause(delayMs: number, fault: Fault): Promise<void> {
  const wait = fault === "slow" ? Math.max(delayMs, 1200) : delayMs;
  if (wait <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, wait));
}

export function assertWritable(fault: Fault): void {
  if (fault === "none" || fault === "slow" || fault === "empty") return;
  if (fault === "offline") throw new ApiError(0, classifyStatus(0));
  const status = Number(fault);
  if (status === 409) throw new ApiError(409, "This record changed. The newest version is still here.", { code: "version_mismatch", retryable: false });
  throw new ApiError(status, classifyStatus(status));
}

export function rowsFor(db: DemoDb, name: string, scope: ZoneScope, fault: Fault): DemoRecord[] {
  if (fault === "empty") return [];
  const table = db[name as keyof DemoDb];
  if (!Array.isArray(table)) return [];
  if (name === "zones") return inScope((table as DemoDb["zones"]).map((zone) => ({ ...zone, zoneId: zone.id })), scope).map(({ id, name: label }) => ({ id, name: label })) as DemoRecord[];
  return inScope(table as DemoRecord[], scope);
}

export function findHit(db: DemoDb, query: string, scope: ZoneScope = null) {
  return searchDb(db, query, scope);
}

export function addAudit(
  db: DemoDb,
  entry: Omit<DemoDb["audits"][number], "id" | "at" | "operationId" | "scope"> &
    Partial<Pick<DemoDb["audits"][number], "operationId" | "scope">>,
  bumpRevision = true,
): DemoDb {
  const next: DemoDb = {
    ...db,
    rev: bumpRevision ? db.rev + 1 : db.rev,
    audits: [
      {
        ...entry,
        operationId: entry.operationId ?? `op-audit-${db.audits.length + 1}`,
        scope: entry.scope ?? "all",
        id: `aud-${db.audits.length + 1}`,
        at: new Date().toISOString(),
      },
      ...db.audits,
    ],
  };
  return saveDb(next);
}
