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
  if (typeof localStorage === "undefined") return memoryStorage;
  return localStorage;
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
    const stored = JSON.parse(raw) as DemoDb;
    if (!stored || !Array.isArray(stored.drivers)) return createSeed();
    const parsed = withRideChecks(stored);
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
