import type { DemoRecord } from "../api/seed.ts";
export type SafetyPolicy = { impossibleTravelMps: number; trustedContacts: number; dailyHours: number; weeklyHours: number; breakMinutes: number; warningMinutes: number; rideCheck: boolean; pin: boolean; sharing: boolean; audio: boolean; staleSeconds: number };
export type IncidentEvent = { at: string; actor: string; kind: "take" | "contact" | "resolve" | "dismiss"; text: string };
export type SafetyBook = { draftRev: number; policies: Record<string, SafetyPolicy>; incidents: Record<string, { owner: string | null; events: IncidentEvent[] }> };
export const DEFAULT_SAFETY: SafetyPolicy = { impossibleTravelMps: 55, trustedContacts: 5, dailyHours: 0, weeklyHours: 0, breakMinutes: 0, warningMinutes: 0, rideCheck: false, pin: false, sharing: true, audio: false, staleSeconds: 120 };
export function emptySafety(): SafetyBook { return { draftRev: 1, policies: {}, incidents: {} }; }
export function validateSafety(p: SafetyPolicy): string | undefined {
  if (Object.values(p).some(v => typeof v === "number" && (!Number.isFinite(v) || v < 0))) return "Values must be finite and non-negative.";
  if (p.impossibleTravelMps <= 0 || p.staleSeconds <= 0 || !Number.isInteger(p.trustedContacts) || p.trustedContacts > 20 || p.dailyHours > 24 || p.weeklyHours > 168) return "Safety values are outside their permitted ranges.";
  if (p.weeklyHours && p.dailyHours > p.weeklyHours) return "Daily hours cannot exceed weekly hours.";
}
export function safetyAction(book: SafetyBook, row: DemoRecord, actor: string, kind: IncidentEvent["kind"], text: string, at = new Date().toISOString()): { book: SafetyBook; status: string; error?: string } {
  const item = book.incidents[row.id] ?? { owner: null, events: [] };
  const fail = (error: string) => ({ book, status: row.status, error });
  // Safety part 1 (2026-10-27): "False alarm" closes a new case or the owner's taken case; its note may be empty.
  const note = kind === "dismiss" && !text.trim() ? "False alarm" : text;
  if (!note.trim()) return fail("Contact details or outcome are required.");
  if (kind === "take" && row.status !== "queued") return fail("Only queued incidents can be taken.");
  if (kind === "dismiss" && row.status === "queued") return { status: "dismissed", book: { ...book, draftRev: book.draftRev + 1, incidents: { ...book.incidents, [row.id]: { owner: item.owner, events: [...item.events, { at, actor, kind, text: note.trim() }] } } } };
  if (kind !== "take" && (row.status !== "taken" || item.owner !== actor)) return fail("Only the assigned responder can act on a taken incident.");
  const status = kind === "take" ? "taken" : kind === "resolve" ? "resolved" : kind === "dismiss" ? "dismissed" : row.status;
  return { status, book: { ...book, draftRev: book.draftRev + 1, incidents: { ...book.incidents, [row.id]: { owner: kind === "take" ? actor : item.owner, events: [...item.events, { at, actor, kind, text: note.trim() }] } } } };
}
