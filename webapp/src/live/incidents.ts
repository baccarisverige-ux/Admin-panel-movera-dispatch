/**
 * SOS and car-lost incidents from the Movera server (contract v0.7.0 §15, owner safety part 1, 2026-10-27).
 * The demo Incidents page keeps its own shape: each server Incident becomes a DemoRecord (status queued / taken /
 * resolved / dismissed = New / Taken / Solved / False alarm) and the safety book's owner and events come from
 * the server's takenBy / takenAt / resolvedBy / resolvedAt, so Take, Solved and False alarm read the server.
 *
 * The alarm feed is GET /admin/incidents/stream: Server-Sent Events read with fetch (the bearer token goes in a
 * header, never in a URL); when the stream cannot be held, the same events are polled as JSON every 10 s.
 */
import type { DemoRecord, LiveRideCheck } from "../api/seed.ts";
import type { IncidentEvent, SafetyBook } from "../safety/ops.ts";
import type { LiveClient } from "./session.ts";

export type ServerPosition = { lat: number; lng: number; accuracyM?: number; at?: string; measuredAt?: string };

export type ServerIncident = {
  incidentId: string;
  tripId?: string;
  kind: string;
  severity: string;
  status: "open" | "investigating" | "resolved" | "dismissed";
  version?: number;
  raisedBy?: "rider" | "driver" | "system";
  zoneId?: string;
  riderId?: string;
  driverId?: string;
  position?: ServerPosition;
  driverPosition?: ServerPosition;
  openedAt: string;
  updatedAt?: string;
  escalatedAt?: string;
  takenBy?: string;
  takenAt?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  resolution?: string;
  /** v0.12.0: the panel rings for an open incident with alarm true until it is taken. */
  alarm?: boolean;
  /** v0.12.0 §22: kind ride_check only. */
  rideCheck?: LiveRideCheck;
};

export type IncidentFeedEvent = {
  eventId: string;
  sequence: number;
  kind: "incident_opened" | "incident_updated" | "incident_escalated" | "incident_closed";
  incident: ServerIncident;
  occurredAt: string;
  serverTime?: string;
};

/** The demo page's words for the server's statuses. */
export const DEMO_STATUS: Record<ServerIncident["status"], string> = { open: "queued", investigating: "taken", resolved: "resolved", dismissed: "dismissed" };

/** Kinds that ring when an older server sends no `alarm` (contract.json#safety.alarmKinds, before v0.12.0). */
export const ALARM_KINDS = new Set(["sos", "driver_silent"]);

/** The Incidents page's kind: "Car lost" is the server's driver_silent. */
export function caseKind(kind: string): string {
  return kind === "driver_silent" ? "car_lost" : kind;
}

function position(p?: ServerPosition): { lat: number; lng: number; at: string | null } | null {
  return p && Number.isFinite(p.lat) && Number.isFinite(p.lng) ? { lat: p.lat, lng: p.lng, at: p.at ?? p.measuredAt ?? null } : null;
}

function flat(prefix: "phone" | "car", p: { lat: number; lng: number; at: string | null } | null): Partial<DemoRecord> {
  return p ? { [`${prefix}Lat`]: p.lat, [`${prefix}Lng`]: p.lng, [`${prefix}At`]: p.at } : {};
}

export function incidentRecord(incident: ServerIncident): DemoRecord {
  return {
    id: incident.incidentId,
    name: incident.riderId ?? "",
    phone: "",
    zoneId: incident.zoneId ?? "",
    status: DEMO_STATUS[incident.status] ?? incident.status,
    kind: caseKind(incident.kind),
    driverId: incident.driverId ?? null,
    createdAt: incident.openedAt,
    live: true,
    ...(incident.tripId ? { tripId: incident.tripId } : {}),
    ...(incident.raisedBy ? { raisedBy: incident.raisedBy } : {}),
    ...flat("phone", position(incident.position)),
    ...flat("car", position(incident.driverPosition)),
    escalatedAt: incident.escalatedAt ?? null,
    alarm: rings(incident),
    ...(incident.rideCheck ? { liveRideCheck: incident.rideCheck } : {}),
    ...(incident.version ? { version: incident.version } : {}),
    // v0.18.9 (G7): the case level is the server's (its kind default, or what an admin set with Change level).
    ...(incident.severity ? { severity: incident.severity } : {}),
  };
}

/** The safety book the Incidents page reads, made from the server's incidents (one owner per case). */
export function bookFrom(incidents: Iterable<ServerIncident>): SafetyBook {
  const book: SafetyBook = { draftRev: 1, policies: {}, incidents: {} };
  for (const incident of incidents) {
    const events: IncidentEvent[] = [];
    if (incident.takenBy && incident.takenAt) events.push({ at: incident.takenAt, actor: incident.takenBy, kind: "take", text: "Took the case" });
    if (incident.resolvedAt && (incident.status === "resolved" || incident.status === "dismissed")) {
      events.push({ at: incident.resolvedAt, actor: incident.resolvedBy ?? "system", kind: incident.status === "dismissed" ? "dismiss" : "resolve", text: incident.resolution ?? (incident.status === "dismissed" ? "False alarm" : "Solved") });
    }
    book.incidents[incident.incidentId] = { owner: incident.takenBy ?? null, events };
  }
  return book;
}

/** v0.12.0: the server says whether a case rings (SOS, car lost, Ride check "I need help"; never "no answer"). */
export function rings(incident: Pick<ServerIncident, "alarm" | "kind">): boolean {
  return incident.alarm ?? ALARM_KINDS.has(incident.kind);
}

/** Open incidents with the alarm that nobody has taken: the alarm rings for these. */
export function ringing(incidents: Iterable<ServerIncident>): ServerIncident[] {
  return [...incidents].filter((incident) => incident.status === "open" && rings(incident)).sort((a, b) => Date.parse(a.openedAt) - Date.parse(b.openedAt));
}

/** Keeps the newest picture of every incident the feed has told about. */
export function applyEvent(known: ReadonlyMap<string, ServerIncident>, event: IncidentFeedEvent): Map<string, ServerIncident> {
  const next = new Map(known);
  next.set(event.incident.incidentId, event.incident);
  return next;
}

/** Splits an SSE text buffer into whole events; the rest waits for more text. */
export function parseSse(buffer: string): { events: IncidentFeedEvent[]; rest: string } {
  const events: IncidentFeedEvent[] = [];
  let rest = buffer.replace(/\r\n/g, "\n");
  let at: number;
  while ((at = rest.indexOf("\n\n")) !== -1) {
    const block = rest.slice(0, at);
    rest = rest.slice(at + 2);
    const data = block.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (!data) continue;
    try {
      events.push(JSON.parse(data) as IncidentFeedEvent);
    } catch {
      // A broken event is skipped; the next poll or reconnect reads it again.
    }
  }
  return { events, rest };
}

/** Rung after this admin's own Take / Solve / False alarm: a polling feed reads the change at once. */
const nudges = new Set<() => void>();
export function nudgeIncidentFeed(): void {
  for (const nudge of [...nudges]) nudge();
}

export type FeedMode = "connecting" | "live" | "polling";

type FeedOptions = { pollMs?: number; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> };

/**
 * Listens to the incident feed until the returned stop is called. Every event goes to onEvent once, in order
 * (replayed from the start, so the alarm knows every open case). SSE first; when it fails or ends, JSON polling
 * every pollMs (10 s) for a minute, then SSE again.
 */
export function connectIncidentFeed(client: LiveClient, onEvent: (event: IncidentFeedEvent) => void, onMode: (mode: FeedMode) => void = () => undefined, options: FeedOptions = {}): () => void {
  const pollMs = options.pollMs ?? 10_000;
  const fetchImpl = options.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let stopped = false;
  let after = 0;
  let controller: AbortController | null = null;
  const take = (event: IncidentFeedEvent) => {
    if (!event || typeof event.sequence !== "number" || event.sequence <= after || !event.incident) return;
    after = event.sequence;
    onEvent(event);
  };

  async function stream(): Promise<void> {
    const token = client.state()?.accessToken;
    if (!token) return;
    controller = new AbortController();
    const response = await fetchImpl(`${client.baseUrl.replace(/\/$/, "")}/api/v1/admin/incidents/stream?after=${after}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream", "X-Api-Version": "0.5" },
      signal: controller.signal,
    });
    if (!response.ok || !response.body || !(response.headers.get("content-type") ?? "").includes("text/event-stream")) return;
    onMode("live");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done || stopped) return;
      const parsed = parseSse(buffer + decoder.decode(value, { stream: true }));
      buffer = parsed.rest;
      parsed.events.forEach(take);
    }
  }

  async function poll(): Promise<void> {
    for (let page = 0; page < 20; page += 1) {
      const answer = await client.json<{ items: IncidentFeedEvent[]; nextCursor: string | null }>(`/admin/incidents/stream?after=${after}&limit=100`);
      answer.items.forEach(take);
      if (!answer.nextCursor) return;
      after = Math.max(after, Number(answer.nextCursor) || after);
    }
  }

  let wake: (() => void) | null = null;
  const nudge = () => wake?.();
  nudges.add(nudge);
  const nap = (ms: number) => new Promise<void>((resolve) => {
    wake = resolve;
    void sleep(ms).then(resolve);
  });

  void (async () => {
    onMode("connecting");
    while (!stopped) {
      try {
        await stream();
      } catch {
        // No stream (offline, a proxy that buffers, a refused token): poll instead.
      }
      if (stopped) break;
      onMode("polling");
      for (let round = 0; round < 6 && !stopped; round += 1) {
        try {
          await poll();
        } catch {
          // Try again on the next round.
        }
        await nap(pollMs);
      }
    }
  })();
  return () => {
    stopped = true;
    nudges.delete(nudge);
    wake?.();
    controller?.abort();
  };
}
