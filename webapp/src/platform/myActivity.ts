import type { AuditRow } from "../api/seed.ts";
import type { Activity } from "../reports/activityLog.ts";
import { linkFor, sectionOf } from "../reports/engine.ts";
import { toCsv } from "../reports/csv.ts";
import { RESULT_LABEL } from "./audit.ts";

/**
 * "My activity" in Dispatch (Q31, Q32): every action an admin did, in this session and earlier ones, with its
 * result and full details. Built on the command audit (saves, refused and waiting actions) and the activity log
 * (sign-ins, sign-outs, downloads), both kept in demo storage. The real backend must filter by actor itself.
 */

/** Entries stay visible this many days; older ones are archived (still exported by a super admin). */
export const ACTIVITY_VISIBLE_DAYS = 120;
const DAY_MS = 86_400_000;

export type ActivityStatus = "done" | "failed" | "waiting";

export const STATUS_LABEL: Record<ActivityStatus, string> = { done: "Done", failed: "Failed", waiting: "Waiting for a second admin" };

export type ActivityItem = {
  id: string;
  at: string;
  actorId: string;
  section: string;
  what: string;
  target: string;
  before: string;
  after: string;
  reason: string;
  scope: string;
  status: ActivityStatus;
  /** The exact result (for example "Not allowed" or "Changed by someone else"). */
  result: string;
  operationId: string;
  link: string | null;
};

function statusOf(result: AuditRow["result"]): ActivityStatus {
  if (result === "committed") return "done";
  if (result === "pending_approval") return "waiting";
  return "failed";
}

const ACTIVITY_TEXT: Record<Activity["kind"], string> = { signin: "Signed in", signout: "Signed out", export: "Downloaded", view: "Viewed" };

/** One list from the audit and the activity log, newest first. */
export function activityItems(audits: readonly AuditRow[], activity: readonly Activity[], label: (action: string) => string): ActivityItem[] {
  const fromAudit = audits.map((row): ActivityItem => ({
    id: row.id,
    at: row.at,
    actorId: row.actorId,
    section: sectionOf(row.action),
    what: label(row.action),
    target: row.targetId,
    before: row.before,
    after: row.after,
    reason: row.reason === "No person affected" ? "" : row.reason,
    scope: row.scope,
    status: statusOf(row.result),
    result: RESULT_LABEL[row.result] ?? row.result,
    operationId: row.operationId,
    link: linkFor(row.targetId, row.action),
  }));
  const fromLog = activity.map((row): ActivityItem => ({
    id: row.id,
    at: row.at,
    actorId: row.actorId,
    section: row.kind === "export" ? "Downloads" : "Sign-in",
    what: row.kind === "export" ? `${ACTIVITY_TEXT.export} ${row.what}` : row.what || ACTIVITY_TEXT[row.kind],
    target: "",
    before: "",
    after: "",
    reason: "",
    scope: row.zone ?? "all",
    status: "done",
    result: RESULT_LABEL.committed,
    operationId: "",
    link: null,
  }));
  return [...fromAudit, ...fromLog].sort((a, b) => b.at.localeCompare(a.at));
}

export type ActivityQuery = {
  viewerId: string;
  /** A super admin sees every admin's activity; everyone else only their own. */
  seeAll: boolean;
  /** For a super admin: one admin only, or "" for everyone. */
  actorId?: string;
  status?: ActivityStatus | "";
  text?: string;
  now: number;
};

/** What the viewer may see, split into visible (last 120 days) and archived. */
export function visibleActivity(items: readonly ActivityItem[], query: ActivityQuery): { visible: ActivityItem[]; archived: ActivityItem[] } {
  const actor = query.seeAll ? query.actorId ?? "" : query.viewerId;
  const text = (query.text ?? "").trim().toLowerCase();
  const cutoff = query.now - ACTIVITY_VISIBLE_DAYS * DAY_MS;
  const allowed = items.filter((item) =>
    (!actor || item.actorId === actor)
    && (!query.status || item.status === query.status)
    && (!text || [item.what, item.section, item.target, item.reason, item.before, item.after, item.scope, item.operationId, item.actorId].some((value) => value.toLowerCase().includes(text))),
  );
  return {
    visible: allowed.filter((item) => Date.parse(item.at) >= cutoff),
    archived: allowed.filter((item) => Date.parse(item.at) < cutoff),
  };
}

/** The start of the admin's current session: their last sign-in, if they have not signed out since. */
export function sessionStart(activity: readonly Activity[], actorId: string): number | null {
  const mine = activity.filter((row) => row.actorId === actorId && (row.kind === "signin" || row.kind === "signout")).sort((a, b) => a.at.localeCompare(b.at));
  const last = mine.at(-1);
  return last?.kind === "signin" ? Date.parse(last.at) : null;
}

export function activityCsv(items: readonly ActivityItem[], nameOf: (id: string) => string): string {
  return toCsv([
    ["When", "Admin", "Section", "Action", "Target", "Scope", "Before", "After", "Reason", "Status", "Result", "Operation"],
    ...items.map((item) => [item.at, nameOf(item.actorId), item.section, item.what, item.target, item.scope, item.before, item.after, item.reason, STATUS_LABEL[item.status], item.result, item.operationId]),
  ]);
}
