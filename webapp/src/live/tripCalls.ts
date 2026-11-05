import { tr, type MessageKey } from "../i18n/core.ts";

/**
 * v0.18.38 §62 (contract.json#inAppCalls.adminLog): Admin › Trip details › Calls. GET /admin/trips/{tripId}/calls
 * (trips.read, the trip in the admin's zones): who called whom, when, how long, how it ended. No audio, no numbers.
 */
export type CallView = {
  callId: string; tripId: string; from: "rider" | "driver"; to: "rider" | "driver"; state: "ringing" | "answered" | "ended" | "missed";
  startedAt: string; answeredAt: string | null; endedAt: string | null; endedReason: string | null; seconds: number;
};

export async function readTripCalls(read: (path: string) => Promise<{ items: CallView[] }>, tripId: string): Promise<CallView[]> {
  return (await read(`/admin/trips/${encodeURIComponent(tripId)}/calls`)).items;
}

const REASON: Record<string, MessageKey> = { hangup: "Hung up", declined: "Declined", failed: "Call failed", missed: "Not answered", max_length: "Too long", trip_cancelled: "Trip cancelled" };

/** One line of the log, in the admin's language. */
export function callLogLine(call: CallView, riderName: string, driverName: string): { who: string; detail: string; answered: boolean; tone: "ok" | "missed" | "failed" } {
  const caller = call.from === "rider" ? riderName : driverName;
  const callee = call.from === "rider" ? driverName : riderName;
  const answered = call.answeredAt !== null;
  const live = call.state === "ringing" || call.state === "answered";
  const length = tr("{0}:{1} min", [Math.floor(call.seconds / 60), String(call.seconds % 60).padStart(2, "0")]);
  const detail = live ? tr("Going on now") : !answered ? tr("Not answered") : `${length} · ${tr(REASON[call.endedReason ?? "hangup"] ?? "Hung up")}`;
  // A call that ended "failed" shows as failed, also when it had been answered (job 8 screenshot check).
  const tone = call.endedReason === "failed" ? "failed" : answered ? "ok" : "missed";
  return { who: tr("{0} called {1}", [caller, callee]), detail, answered, tone };
}
