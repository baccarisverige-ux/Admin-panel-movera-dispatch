import { tr } from "../i18n/core.ts";

/**
 * v0.18.148 SOS by press time (contract.json#sosPressTime.incident / .admin; Rules LAUNCH-RULE.md "Queued (after
 * freeze)" item 1): an SOS kept on a phone without network may reach Movera after the trip ended. The case shows
 * when it was pressed (Incident.pressedAt) beside when Movera received it (Incident.openedAt), and the delay when it
 * is more than a minute. No setting: the windows are one fixed safety rule (contract: "No admin setting").
 */
export const PRESS_DELAY_SHOWN_MS = 60_000;

/** Incident.pressedAt as the server sent it; anything that is not a time is nothing (no line). */
export function pressedAtOf(raw: unknown): string | null {
  return typeof raw === "string" && Number.isFinite(Date.parse(raw)) ? raw : null;
}

/** The lines on an SOS case: pressed / received, and the delay when it is over a minute. Empty without a press time. */
export function pressTimeLines(pressedAt: number | null | undefined, receivedAt: number, time: (ms: number) => string): string[] {
  if (typeof pressedAt !== "number" || !Number.isFinite(pressedAt) || !Number.isFinite(receivedAt)) return [];
  const lines = [tr("SOS pressed {0} · received by Movera {1}", [time(pressedAt), time(receivedAt)])];
  const delay = receivedAt - pressedAt;
  if (delay > PRESS_DELAY_SHOWN_MS) lines.push(tr("Reached Movera {0} min after the press (the phone had no network).", [String(Math.round(delay / 60_000))]));
  return lines;
}
