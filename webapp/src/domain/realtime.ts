import { isTerminal } from "./contract.ts";

/** contract.json#realtime: the trip event gate every app runs (cases in contracts/fixtures/events.json). */
export const EVENT_KINDS = ["trip_projection", "rider_cancelled", "driver_cancelled", "location", "driver_arrived", "rider_on_the_way", "payment_updated", "rating_updated", "message"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
/** Kinds that still pass after a terminal lifecycle status: payment and rating are fields, not statuses. */
export const AFTER_TERMINAL_KINDS: readonly EventKind[] = ["payment_updated", "rating_updated", "message"];

export type TripEvent = {
  eventId: string;
  tripId: string;
  sequence: number;
  version: number;
  kind: string;
  occurredAt?: string;
  serverTime?: string;
  projection?: { status?: string; [key: string]: unknown };
  /** Test shorthand in fixtures/events.json for projection.status. */
  status?: string;
  [key: string]: unknown;
};

export type Disposition = "accepted" | "accepted_with_gap" | "duplicate" | "blocked_after_terminal" | "invalid";

export type GateResult = {
  disposition: Disposition;
  /** True when the caller must resync: GET /trips/{tripId}, then GET /trips/{tripId}/events?after={sequence}. */
  resync: boolean;
};

/**
 * One gate per trip. Pure: no timers or I/O, so the live map and trip pages can feed it from polling
 * today and from the event stream later.
 */
export class TripEventGate {
  lastSequence = 0;
  terminal = false;
  /** The cached projection: replaced by lifecycle events, never by `location`. */
  projection: TripEvent["projection"] | null = null;
  private readonly seen = new Set<string>();

  offer(event: TripEvent): GateResult {
    if (!Number.isInteger(event.sequence) || event.sequence < 1 || !event.tripId?.trim()) return { disposition: "invalid", resync: false };
    if (this.seen.has(event.eventId) || event.sequence <= this.lastSequence) return { disposition: "duplicate", resync: false };
    if (this.terminal && !(AFTER_TERMINAL_KINDS as readonly string[]).includes(event.kind)) {
      this.remember(event);
      return { disposition: "blocked_after_terminal", resync: false };
    }
    const gap = this.lastSequence > 0 && event.sequence > this.lastSequence + 1;
    this.remember(event);
    if (event.kind !== "location") {
      const status = event.projection?.status ?? event.status;
      if (event.projection) this.projection = { ...this.projection, ...event.projection };
      else if (status) this.projection = { ...this.projection, status };
      if (status && isTerminal(status)) this.terminal = true;
    }
    return { disposition: gap ? "accepted_with_gap" : "accepted", resync: gap };
  }

  private remember(event: TripEvent) {
    this.lastSequence = event.sequence;
    this.seen.add(event.eventId);
  }
}

/** Gates for many trips (the live map). */
export class TripEventGates {
  private readonly gates = new Map<string, TripEventGate>();

  offer(event: TripEvent): GateResult {
    if (!event.tripId?.trim()) return { disposition: "invalid", resync: false };
    let gate = this.gates.get(event.tripId);
    if (!gate) this.gates.set(event.tripId, (gate = new TripEventGate()));
    return gate.offer(event);
  }

  gate(tripId: string): TripEventGate | undefined {
    return this.gates.get(tripId);
  }
}
