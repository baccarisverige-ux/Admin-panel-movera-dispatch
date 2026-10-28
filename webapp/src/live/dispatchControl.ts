/**
 * Contract v0.7.2 (CONTRACT.md §3.6): the live Dispatch "Zones right now" switch is the server's DispatchControl.
 *  - GET /admin/zones/{zoneId}/dispatch-control (trips.read) → DispatchControl { zoneId, paused, mode, by?, at?, version }.
 *  - PUT the same path (dispatch.edit) with { expectedVersion, paused, mode, note? } → DispatchControl.
 * One admin is enough (v0.7.2). A server that still files an approval answers 202 PendingApproval
 * { status: "pending_approval", approvalId }: the page then says it waits for a second admin. Pure, so node --test covers it.
 */
export type ControlMode = "radar" | "exclusive" | null;
export type ServerDispatchControl = { zoneId: string; paused: boolean; mode: ControlMode; by?: string; at?: string; version: number };
export type ControlValue = { paused: boolean; mode: ControlMode };

export function dispatchControlPath(zoneId: string): string {
  return `/admin/zones/${encodeURIComponent(zoneId)}/dispatch-control`;
}

/** The command's `after` ("paused" | "radar" | "exclusive" | "rules") as the switch to put. */
export function controlValueOf(after: string | undefined): ControlValue | null {
  if (after === "paused") return { paused: true, mode: null };
  if (after === "radar" || after === "exclusive") return { paused: false, mode: after };
  if (after === "rules") return { paused: false, mode: null };
  return null;
}

export function controlBody(current: Pick<ServerDispatchControl, "version"> | null, value: ControlValue, note?: string) {
  return { expectedVersion: current?.version ?? 0, paused: value.paused, mode: value.mode, ...(note ? { note: note.slice(0, 1000) } : {}) };
}

/** A DispatchControl answer, or null for anything else (a wrong shape is no answer). */
export function parseControl(value: unknown): ServerDispatchControl | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const mode = row.mode === "radar" || row.mode === "exclusive" ? row.mode : row.mode === null || row.mode === undefined ? null : undefined;
  if (typeof row.zoneId !== "string" || typeof row.paused !== "boolean" || mode === undefined || typeof row.version !== "number") return null;
  return { zoneId: row.zoneId, paused: row.paused, mode, version: row.version, ...(typeof row.by === "string" ? { by: row.by } : {}), ...(typeof row.at === "string" ? { at: row.at } : {}) };
}

export function isPendingApproval(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && (value as { status?: unknown }).status === "pending_approval");
}
