import type { ActionSpec } from "../commands/registry.ts";
import type { OperationRow } from "./seed.ts";

/**
 * The pure parts of running a command from a screen: when a read is retried (C-18), which cached reads a
 * command can have changed (C-18), and what a re-check of the server says about a slow command (C-14).
 */

/** At most 2 retries, and only for errors that can pass (offline, 429, 503). A 401/403/422 shows at once. */
export function queryRetry(failureCount: number, error: unknown): boolean {
  const retryable = Boolean(error && typeof error === "object" && (error as { retryable?: unknown }).retryable === true);
  return retryable && failureCount < 2;
}

/** Collections and slices a command writes: what its registry entry declares, plus the ones the request names. */
export type Touched = { all: boolean; collections: Set<string>; slices: Set<string> };

export function touchedBy(spec: Pick<ActionSpec, "id" | "writes"> | undefined, input: { collection?: string; sliceKey?: string }): Touched {
  // Approvals carry out another command on the server (a refund changes payments or trips), and a reset replaces everything.
  const all = !spec || spec.id.startsWith("admin.approval.") || spec.id === "admin.shell.reset";
  const collections = new Set<string>(spec ? Object.keys(spec.writes.collections) : []);
  const slices = new Set<string>(spec ? spec.writes.slices : []);
  if (input.collection) collections.add(input.collection);
  if (input.sliceKey) slices.add(input.sliceKey);
  return { all, collections, slices };
}

/** Reads every command can change: the audit, approvals and the store revision, plus search results. */
const ALWAYS = new Set(["audit", "approvals", "revision", "freshness", "inbox", "search", "activity"]);

/** True when a cached query (by its key) may show data the command changed, so it must be read again. */
export function queryTouched(queryKey: readonly unknown[], touched: Touched): boolean {
  if (touched.all) return true;
  const [kind, name] = queryKey;
  if (typeof kind !== "string") return true;
  if (ALWAYS.has(kind)) return true;
  if (kind === "records") return typeof name !== "string" || touched.collections.has(name);
  if (kind === "slice") return typeof name !== "string" || touched.slices.has(name);
  // Static reads (the page catalog) never change with a command.
  if (kind === "admin-page") return false;
  return true;
}

export type Outcome = { phase: "committed" | "pending_approval" | "rejected"; message: string; retrySameKey: boolean };

/**
 * What a slow or lost command really did, from the server's record of its operation key (C-14).
 * `null` means the server has no record of it: it never arrived, so nothing changed.
 */
export function outcomeOf(operation: OperationRow | null, fallback: string, answer?: { status: "committed" | "pending_approval"; message: string } | null): Outcome {
  // The command's own answer arrived (only late): it is the outcome. A live server keeps no operation record to ask
  // (G4 live: a slow preset save said "Failed. The server has no record of it" although it had just saved it).
  if (!operation && answer) return { phase: answer.status, message: answer.message, retrySameKey: false };
  if (!operation) return { phase: "rejected", message: `Failed. The server has no record of it, so nothing changed. ${fallback} Retry uses the same operation key.`.replace(/\s+/g, " ").trim(), retrySameKey: true };
  if (operation.status === "committed") return { phase: "committed", message: `Done. ${operation.message}`, retrySameKey: false };
  if (operation.status === "pending_approval") return { phase: "pending_approval", message: operation.message, retrySameKey: false };
  return { phase: "rejected", message: `Failed. ${operation.message}`, retrySameKey: false };
}

/** The line shown while a slow command is being confirmed with the server. */
export const CHECKING_MESSAGE = "Checking… The server is taking longer than usual; this updates to Done or Failed.";
/** Shown when another command is still running, instead of ignoring the click (C-16). */
export const BUSY_MESSAGE = "Please wait: another action is still running.";
/** Shown when even the re-check could not reach the server. */
export const UNREACHABLE_MESSAGE = "Failed. The server could not be reached to confirm it. Retry uses the same operation key, so it is never done twice.";

/**
 * The store revision each query's data was read at (C-10). A command sends the oldest revision among the
 * queries on screen, so a screen that shows data from before someone else's change gets a 409 instead of
 * silently overwriting it. After a command the reads it can have changed are read again, and the others are
 * moved to the new revision when it was the only change (C-18), so the next try is up to date.
 */
export const readAt = new Map<string, number>();

/**
 * Reads data and records the revision it belongs to. The revision is read before and after the data; when a
 * change landed in between (a command committing while a timed refresh was out), the data is read again, so
 * the recorded revision is the data's own. Recording the earlier revision in that case made the next command
 * on the screen fail with "Someone else changed this" although it was the admin's own change it had seen.
 */
export async function readTracked<T>(api: { revision: () => Promise<number> }, key: readonly unknown[], read: () => Promise<T>): Promise<T> {
  const id = JSON.stringify(key);
  const revision = () => api.revision().catch(() => undefined);
  let before = await revision();
  let data = await read();
  for (let attempt = 0; attempt < 2; attempt++) {
    const after = await revision();
    if (before === undefined || after === undefined || before === after) break;
    before = after;
    data = await read();
  }
  if (before !== undefined) readAt.set(id, before);
  return data;
}

/** How long a finished command waits for the screen's re-read before its follow-up runs (the re-read goes on). */
export const REFRESH_WAIT_MS = 1500;

/**
 * G6 live fix (owner live test 2026-11-01): waits for [work] but never longer than [ms]; a failure is ignored (the
 * re-read is only a refresh). A live command answers without a revision, so its re-read reads every screen again,
 * which can take long; the "Please wait" and the screen's follow-up (clearing the typed money) must not wait for it.
 */
export async function atMost(work: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([work.catch(() => undefined), new Promise<void>((resolve) => { timer = setTimeout(resolve, ms); })]);
  clearTimeout(timer);
}
