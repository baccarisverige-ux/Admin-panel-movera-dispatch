import { tr } from "../i18n/core.ts";
import type { FoundText } from "./engine.ts";

/**
 * S4 B1.1 SF-1 (owner 2026-11-16 "Yes, same as drop-off (Rec.)"; contract v0.18.121
 * contract.json#alertDesk.serverDetection.kindDefaults.system_health.rule): the server's parked-job alert (system_health)
 * has the detail "<kind>: <refs>". For a parked pickup_geofence (the automatic arrival at the pickup, the waiting clock's
 * away / back, the automatic arrival at middle stops; critical, runs once more after 1 min) the panel says what the job
 * is and what happens next. Any other kind is shown as the server sent it.
 * Round 4, SF-2 (OQ-B101-2 "Yes, restart once + urgent alert (Rec.)": a session decision under the owner's night rule,
 * 2026-11-16, the owner reviews it; same contract text): a parked trip_eta too (the trip's live ETA tick, which also
 * sends the rider's "almost there" message and runs the late check of booked rides). Each kind has its own whole
 * sentence (the words after the name differ, and French agrees with the name).
 */
const PARKED_KIND_LINES: Readonly<Record<string, (refs: string) => string>> = {
  pickup_geofence: (refs) => tr("{0} stopped on the server for {1}. It runs once more by itself after 1 min; if it fails again it stays stopped. The driver's own taps still work.", [tr("Automatic arrival check (pickup, waiting clock, stops)"), refs]),
  trip_eta: (refs) => tr("{0} stopped on the server for {1}. It runs once more by itself after 1 min; if it fails again it stays stopped. Meanwhile the apps show an estimated time, and the rider's \"almost there\" message and the late check of booked rides wait.", [tr("Live arrival time (ETA) update"), refs]),
};

/** The panel's line for a parked-job alert of a kind it knows, else undefined (the server's text is shown). */
export function parkedJobDetail(kind: string, detailT: FoundText | undefined): string | undefined {
  if (kind !== "system_health" || detailT?.t !== "{0}" || typeof detailT.a[0] !== "string") return undefined;
  const named = /^([a-z_]+): (.+)$/.exec(detailT.a[0]);
  const line = named && Object.hasOwn(PARKED_KIND_LINES, named[1]!) ? PARKED_KIND_LINES[named[1]!] : undefined;
  return named && line ? line(named[2]!) : undefined;
}
