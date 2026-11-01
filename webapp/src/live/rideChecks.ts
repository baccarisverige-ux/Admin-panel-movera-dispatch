import type { Answer, ChoiceId, Outcome, RideCheck, Trigger } from "../safety/rideCheck.ts";
import type { RideCheckRow } from "./types.ts";

/**
 * v0.18.9 (G7, contract.json#onTrip.rideCheck.adminList): GET /admin/ride-checks gives one row per side; the Ride
 * checks list shows one check with both answers. Server triggers map to the list's own; need_help is a red answer.
 */
const TRIGGER: Record<string, Trigger> = { long_stop: "stop", off_route: "route", dropped_far: "far", possible_crash: "crash", longer: "longer" };

function answerOf(row: RideCheckRow | undefined): Answer | null {
  if (!row?.answer || row.answer === "no_answer") return null;
  const choice: ChoiceId = row.answer === "need_help" ? "unsafe" : "ok";
  return { at: row.answeredAt ?? row.shownAt ?? String(row["createdAt"] ?? ""), choice };
}

export function rideCheckRecords(rows: readonly RideCheckRow[], trips: (tripId: string) => { riderId?: string; driverId?: string; riderName?: string } | undefined): RideCheck[] {
  const byCheck = new Map<string, RideCheckRow[]>();
  for (const row of rows) {
    const key = `${row.tripId}|${row.checkId}`;
    byCheck.set(key, [...(byCheck.get(key) ?? []), row]);
  }
  const out: RideCheck[] = [];
  for (const sides of byCheck.values()) {
    const first = sides[0]!;
    const trigger = TRIGGER[first.trigger];
    if (!trigger) continue;
    const rider = sides.find((row) => row.side === "rider");
    const driver = sides.find((row) => row.side === "driver");
    const answers = [rider?.answer, driver?.answer];
    const status: Outcome = answers.includes("need_help") ? "help" : answers.every((answer) => answer === "ok") ? "ok" : "none";
    const trip = trips(first.tripId);
    out.push({
      id: `${first.tripId}~${first.checkId}`,
      name: trip?.riderName ?? trip?.riderId ?? "",
      phone: "",
      zoneId: first.zoneId ?? "",
      status,
      tripId: first.tripId,
      driverId: trip?.driverId ?? "",
      riderId: trip?.riderId ?? "",
      vehicleId: null,
      trigger,
      value: 0,
      place: "",
      at: first.shownAt ?? String(first["createdAt"] ?? ""),
      driver: answerOf(driver),
      rider: answerOf(rider),
      incidentId: sides.find((row) => row.incidentId)?.incidentId ?? null,
    });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
