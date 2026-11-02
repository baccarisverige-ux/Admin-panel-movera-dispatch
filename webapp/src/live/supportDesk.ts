import { tr } from "../i18n/index.ts";
import type { SupportSettings } from "./types.ts";

/** v0.18.15 support desk helpers for LiveSupport (contract.json#supportDesk). */

/** The desk's command path and body for one button (contract.json#supportDesk.adminCommands). */
export function deskCall(ticketId: string, verb: "claim" | "assign" | "topic" | "waiting" | "solve" | "reopen" | "case", body: Record<string, unknown> = {}): { path: string; body: Record<string, unknown> } {
  return { path: `/admin/tickets/${encodeURIComponent(ticketId)}/${verb}`, body };
}

/** Settings checks before Save (the server checks the same: contract.json#supportDesk.settings.limits). */
export function settingsIssue(s: SupportSettings): string | null {
  if (!Number.isInteger(s.claimDays) || s.claimDays < 1 || s.claimDays > 30) return tr("Claim days must be 1 to 30.");
  if (!s.topics.some((t) => t.on)) return tr("At least one topic must be on.");
  for (const t of s.topics) {
    if (!Number.isInteger(t.firstReplyMin) || t.firstReplyMin < 1 || t.firstReplyMin > 10080) return tr("First answer must be 1 to 10080 minutes.");
    if (!Number.isInteger(t.solveHours) || t.solveHours < 1 || t.solveHours > 720) return tr("Solve time must be 1 to 720 hours.");
  }
  return null;
}
