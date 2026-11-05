import type { AlertBook, AlertRecord, FoundAlert } from "../alerts/engine.ts";
import { adminLabel } from "./format.ts";

/**
 * v0.18.15 alerts full flow (contract.json#alertDesk; owner 2026-11-02 Q5 "FULL FLOW"): the Alerts page's book on
 * live comes from the server (GET /admin/alerts/book), and each alert command goes to its server call, so every admin
 * sees who works on an alert, the mutes, settings and rules; quiet hours are each admin's own.
 */

export type ServerAlertRecord = Omit<AlertRecord, "id" | "zoneId" | "events" | "owner"> & {
  alertId: string; zoneId?: string; owner?: string; ownerName?: string;
  events: (AlertRecord["events"][number] & { byName?: string })[];
};
export type AlertBookState = {
  rev: number; settings: Record<string, unknown>; rules: unknown[]; records: ServerAlertRecord[];
  mutes: Record<string, { until: string; by: string }>; quiet: { on: boolean; from: string; to: string };
  people: { adminId: string; name?: string }[];
  /** v0.18.20 (contract.json#alertDesk.serverDetection): the alerts the server found. */
  alerts?: FoundAlert[];
};

/**
 * The country the top bar shows (?country=, else the remembered one, else the admin's first country, else SE): the
 * alert and incident settings are per country on the server (checker MED).
 */
export function liveCountry(adminCountries?: readonly string[]): "SE" | "FR" | "TN" {
  const ok = (value: unknown): value is "SE" | "FR" | "TN" => value === "SE" || value === "FR" || value === "TN";
  let remembered: string | null;
  try {
    remembered = globalThis.localStorage?.getItem("movera-admin-country") ?? null;
  } catch {
    remembered = null;
  }
  const fromUrl = typeof globalThis.location === "object" ? new URLSearchParams(globalThis.location.search).get("country") : null;
  for (const candidate of [fromUrl, remembered, ...(adminCountries ?? [])]) if (ok(candidate)) return candidate;
  return "SE";
}

/** Admin names the alert lines show ("Nora Lind is working on it"), and the admins one may pass to. */
const names = new Map<string, string>();
let passPeople: { id: string; name: string }[] = [];
export function liveAgentName(id: string): string | undefined {
  return names.get(id);
}
export function livePassPeople(): { id: string; name: string }[] {
  return passPeople;
}

export function bookFromServer(state: AlertBookState, me: string | null): AlertBook {
  for (const person of state.people) names.set(person.adminId, adminLabel(person.name));
  for (const record of state.records) {
    if (record.owner && record.ownerName) names.set(record.owner, record.ownerName);
    for (const event of record.events) if (event.byName) names.set(event.by, event.byName);
  }
  passPeople = state.people.map((person) => ({ id: person.adminId, name: adminLabel(person.name) }));
  const records: Record<string, AlertRecord> = {};
  for (const r of state.records) {
    records[r.alertId] = {
      id: r.alertId, kind: r.kind, level: r.level, title: r.title, zoneId: r.zoneId ?? null, since: r.since, status: r.status, owner: r.owner ?? null,
      ...(r.snoozeUntil ? { snoozeUntil: r.snoozeUntil } : {}),
      events: r.events.map((event) => ({ at: event.at, by: event.by, kind: event.kind, text: event.text, ...(event.to ? { to: event.to } : {}) })),
    };
  }
  return {
    found: state.alerts ?? [],
    draftRev: state.rev,
    settings: state.settings as AlertBook["settings"],
    rules: state.rules as AlertBook["rules"],
    records,
    mutes: state.mutes,
    personal: me ? { [me]: { quiet: state.quiet } } : {},
  };
}

export type AlertCall = { method: "POST" | "PUT" | "DELETE"; path: string; body?: Record<string, unknown> };

/**
 * The server call for one Alerts button: the button hands over the book as it would be after the command (the
 * demo engine's result); the call is read from it. null = nothing to send (the button's own guard said no).
 */
export function alertCall(action: string, targetId: string, next: AlertBook, me: string, now: number, country: "SE" | "FR" | "TN" = "SE"): AlertCall | null {
  const id = encodeURIComponent(targetId);
  const record = next.records[targetId];
  const base = record ? { kind: record.kind, level: record.level, title: record.title, since: record.since, ...(record.zoneId ? { zoneId: record.zoneId } : {}) } : null;
  const last = record?.events.at(-1);
  switch (action) {
    case "admin.alerts.take":
      return base ? { method: "POST", path: `/admin/alerts/${id}/take`, body: base } : null;
    case "admin.alerts.done":
      return base ? { method: "POST", path: `/admin/alerts/${id}/done`, body: { ...base, ...(last?.kind === "done" && last.text && last.text !== "Solved" ? { note: last.text } : {}) } } : null;
    case "admin.alerts.snooze": {
      if (!base || !record?.snoozeUntil || !last) return null;
      const minutes = Math.max(1, Math.round((Date.parse(record.snoozeUntil) - Date.parse(last.at)) / 60_000));
      return { method: "POST", path: `/admin/alerts/${id}/snooze`, body: { ...base, minutes } };
    }
    case "admin.alerts.pass":
      return base && last?.to ? { method: "POST", path: `/admin/alerts/${id}/pass`, body: { ...base, to: last.to } } : null;
    case "admin.alerts.mute": {
      const mute = next.mutes[targetId];
      if (!mute) return { method: "DELETE", path: `/admin/alerts/mutes/${id}?country=${country}` };
      return { method: "PUT", path: `/admin/alerts/mutes/${id}?country=${country}`, body: { minutes: Math.max(1, Math.min(1440, Math.round((Date.parse(mute.until) - now) / 60_000))) } };
    }
    case "admin.alerts.quiet": {
      const quiet = next.personal[me]?.quiet;
      return quiet ? { method: "PUT", path: `/admin/alerts/quiet?country=${country}`, body: { on: quiet.on, from: quiet.from, to: quiet.to } } : null;
    }
    case "admin.alerts.settings":
      return { method: "PUT", path: "/admin/alerts/settings", body: { country, expectedRev: next.draftRev - 1, settings: next.settings } };
    case "admin.alerts.rule":
      return { method: "PUT", path: "/admin/alerts/rules", body: { country, expectedRev: next.draftRev - 1, rules: next.rules } };
    default:
      return null;
  }
}
