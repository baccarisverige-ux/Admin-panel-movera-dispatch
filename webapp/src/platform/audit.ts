import type { AuditRow } from "../api/seed.ts";
import { toCsv } from "../reports/csv.ts";

/** Audit: search and filters over every recorded command, what changed, and a CSV export. */

export type AuditFilters = { query: string; actor: string; result: string; area: string; from: string; to: string };

export const EMPTY_FILTERS: AuditFilters = { query: "", actor: "", result: "", area: "", from: "", to: "" };

export const RESULT_LABEL: Record<AuditRow["result"], string> = {
  committed: "Done",
  rejected: "Rejected",
  denied: "Not allowed",
  conflict: "Changed by someone else",
  pending_approval: "Waiting for a second admin",
};

/** The section a command belongs to: the word after "admin." in its name. */
export function areaOf(action: string): string {
  const part = action.split(".")[1] ?? action;
  return part.replace(/Ops$/, "").replace(/([a-z])([A-Z])/g, (_, a: string, b: string) => `${a} ${b}`).toLowerCase();
}

export function filterAudit(rows: readonly AuditRow[], filters: AuditFilters): AuditRow[] {
  const q = filters.query.trim().toLowerCase();
  return rows.filter((row) =>
    (!filters.actor || row.actorId === filters.actor)
    && (!filters.result || row.result === filters.result)
    && (!filters.area || areaOf(row.action) === filters.area)
    && (!filters.from || row.at.slice(0, 10) >= filters.from)
    && (!filters.to || row.at.slice(0, 10) <= filters.to)
    && (!q || [row.action, row.targetId, row.actorId, row.reason, row.before, row.after, row.scope, row.operationId].some((value) => value.toLowerCase().includes(q))),
  );
}

/** Before and after as one short line, or null when nothing changed. */
export function changeOf(row: Pick<AuditRow, "before" | "after">): string | null {
  if (!row.before && !row.after) return null;
  if (row.before === row.after) return null;
  return `${row.before || "(empty)"} → ${row.after || "(empty)"}`;
}

export function auditCsv(rows: readonly AuditRow[]): string {
  return toCsv([
    ["When", "Admin", "Action", "Target", "Scope", "Before", "After", "Reason", "Result", "Operation"],
    ...rows.map((row) => [row.at, row.actorId, row.action, row.targetId, row.scope, row.before, row.after, row.reason, RESULT_LABEL[row.result] ?? row.result, row.operationId]),
  ]);
}

export function auditCounts(rows: readonly AuditRow[]): { total: number; today: number; failed: number; waiting: number; admins: number } {
  const today = new Date().toISOString().slice(0, 10);
  return {
    total: rows.length,
    today: rows.filter((row) => row.at.slice(0, 10) === today).length,
    failed: rows.filter((row) => row.result === "rejected" || row.result === "denied" || row.result === "conflict").length,
    waiting: rows.filter((row) => row.result === "pending_approval").length,
    // G3: only admins count; the server ("system", e.g. driver.auto_offline), drivers and riders are not admins.
    admins: new Set(rows.filter((row) => (row.actor ?? "admin") === "admin" && row.actorId !== "system").map((row) => row.actorId)).size,
  };
}
