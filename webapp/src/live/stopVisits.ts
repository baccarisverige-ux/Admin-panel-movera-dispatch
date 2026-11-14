/**
 * Job C9b (contract v0.18.98 §92, contract.json#autoArrive.stops + #stopWaits.projection; owner 2026-11-02 "At the pickup
 * AND at stops", Rules decisions/driver-g7.md:84): the server's facts of each middle stop as the admin shows them —
 * arrived (automatic or tapped), left, the stopped waiting while the driver is away and the finished away spells.
 * TripProjection.stops[i] is canonical; TripProjection.stopVisits[] is the mirror older servers send. Nothing is worked
 * out here: no clock, no money, no distance (owner rule R2).
 */
import type { LiveStopVisit, LiveTripFacts } from "../api/seed.ts";

type RawVisit = { stopIndex?: unknown; arrivedAt?: unknown; arrivedBy?: unknown; leftAt?: unknown; away?: { since?: unknown } | null; pausedSeconds?: unknown; pauseCount?: unknown };

const count = (value: unknown): number => (typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0);

function visitOf(raw: RawVisit | undefined): LiveStopVisit | null {
  if (!raw || typeof raw.arrivedAt !== "string") return null;
  return {
    arrivedAt: raw.arrivedAt,
    arrivedBy: raw.arrivedBy === "auto" || raw.arrivedBy === "tap" ? raw.arrivedBy : null,
    leftAt: typeof raw.leftAt === "string" ? raw.leftAt : null,
    awaySince: typeof raw.away?.since === "string" ? raw.away.since : null,
    pausedSeconds: count(raw.pausedSeconds),
    pauseCount: count(raw.pauseCount),
  };
}

/** One entry per stop (same order as stops), null for a stop the driver has not arrived at. */
export function stopVisitsOf(trip: { stops?: readonly unknown[]; stopVisits?: readonly unknown[] }): (LiveStopVisit | null)[] {
  const mirror = new Map<number, RawVisit>();
  for (const row of trip.stopVisits ?? []) {
    const visit = row as RawVisit;
    if (typeof visit?.stopIndex === "number") mirror.set(visit.stopIndex, visit);
  }
  return (trip.stops ?? []).map((stop, index) => {
    const own = stop as RawVisit;
    return visitOf(typeof own?.arrivedAt === "string" ? own : mirror.get(index));
  });
}

/** The stop the driver is at now (arrived, not left), numbered from 1 as on the trip page; null when none. */
export function currentStopOf(facts: Pick<LiveTripFacts, "stopVisits">): { number: number; visit: LiveStopVisit } | null {
  const visits = facts.stopVisits ?? [];
  for (let index = visits.length - 1; index >= 0; index -= 1) {
    const visit = visits[index];
    if (visit && !visit.leftAt) return { number: index + 1, visit };
  }
  return null;
}

/** "Stopped in all": the server's finished away seconds in whole minutes, rounded up (the pickup box does the same). */
export function stoppedMinutes(visit: Pick<LiveStopVisit, "pausedSeconds">): number {
  return Math.ceil(visit.pausedSeconds / 60);
}
