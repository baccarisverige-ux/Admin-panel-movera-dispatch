/**
 * Admin live updates (contract v0.18.22 §46, contract.json#adminLiveEvents; Rules BASE job, owner L1 2026-11-04).
 * One stream GET /admin/events says WHAT changed (type + id + zone); the panel then reads those lists again.
 * While the stream is open the live lists do not poll; while it is not, a small "Reconnecting…" badge shows and
 * the lists refresh every minute. Pure module (no React) so node --test can drive it with a fake event source.
 */

export type AdminLiveEvent = { sequence: number; type: string; entityId: string; zoneId: string | null; occurredAt: string; serverTime: string };

/** off = demo build / signed out (pages keep their own timers); connecting = first try; open; reconnecting. */
export type LiveStreamState = "off" | "connecting" | "open" | "reconnecting";

export const ADMIN_EVENTS_PATH = "/admin/events";
/** contract.json#adminLiveEvents.client.fallbackPollSeconds (owner L1: "data still refreshes every minute"). */
export const FALLBACK_POLL_MS = 60_000;
export const RECONNECTING_TEXT = "Reconnecting…";
/** Wait before trying the stream again after it dropped (the server's heartbeat is 15 s). */
export const RETRY_MS = 5_000;

/** contract.json#adminLiveEvents.client.invalidates (a test keeps it equal to the contract). */
export const INVALIDATES: Readonly<Record<string, readonly string[]>> = {
  "trip.changed": ["trips", "reservations", "overview", "dispatch", "payments"],
  "driver.status": ["drivers", "dispatch", "overview"],
  "zone.supply": ["zoneSupply", "overview", "dispatch"],
  "alert.changed": ["alerts", "overview"],
  "ticket.changed": ["tickets"],
  "incident.changed": ["incidents", "alerts"],
  "approval.changed": ["approvals"],
  "payment.failed": ["payments", "alerts"],
  resync: ["*"],
};

/** The lists whose timers the stream replaces (each has an event that says when it changed). */
export const STREAMED_LISTS: ReadonlySet<string> = new Set(["trips", "reservations", "drivers", "zoneSupply", "incidents", "tickets", "payments", "approvals"]);

/** Extra react-query keys behind a contract list name (besides ["records", name], ["live", name] and [name]). */
const EXTRA_KEYS: Readonly<Record<string, ReadonlyArray<readonly unknown[]>>> = {
  trips: [["trip-record"], ["live", "trip"], ["live", "chat-trips"], ["records", "rideChecks"]],
  drivers: [["live", "driver"], ["live", "reservationDrivers"]],
  tickets: [["live", "ticket"]],
  alerts: [["slice", "alertOps"]],
  incidents: [["slice", "safetyOps"], ["slice", "incidentOps"]],
  overview: [["live", "kpis"], ["records", "kpis"]],
  dispatch: [["live", "dispatch-control"], ["slice", "adminDispatch"]],
  approvals: [["records", "approvals"]],
};

function startsWith(key: readonly unknown[], prefix: readonly unknown[]): boolean {
  return prefix.every((part, i) => key[i] === part);
}

/** Does this react-query key belong to a list the event changed? */
export function keyMatches(event: Pick<AdminLiveEvent, "type">, key: readonly unknown[]): boolean {
  const names = INVALIDATES[event.type];
  if (!names) return false;
  if (names.includes("*")) return true;
  return names.some((name) => startsWith(key, ["records", name]) || startsWith(key, ["live", name]) || key[0] === name || (EXTRA_KEYS[name] ?? []).some((prefix) => startsWith(key, prefix)));
}

/**
 * The timer a live list should use. Demo / signed out: the page's own. Stream open: none (events refresh it).
 * Stream not open: every minute (owner L1). `follow` lists (map positions, ETAs) keep their pace: positions have no event.
 */
export function liveRefetchMs(state: LiveStreamState, name: string, pageMs: number | undefined, follow = false): number | false | undefined {
  if (pageMs === undefined || follow || state === "off" || !STREAMED_LISTS.has(name)) return pageMs;
  return state === "open" ? false : FALLBACK_POLL_MS;
}

/* ---- the connection state, shared by every hook (useSyncExternalStore) */
let current: LiveStreamState = "off";
const watchers = new Set<() => void>();
export function liveStreamState(): LiveStreamState {
  return current;
}
export function setLiveStreamState(next: LiveStreamState): void {
  if (next === current) return;
  current = next;
  for (const watcher of [...watchers]) watcher();
}
export function watchLiveStream(watcher: () => void): () => void {
  watchers.add(watcher);
  return () => watchers.delete(watcher);
}
/** The badge: only once the stream failed or dropped, never during the first quick connect. */
export function showsReconnecting(state: LiveStreamState): boolean {
  return state === "reconnecting";
}

/* ---- the event source */
export type LiveEventSource = {
  onopen: (() => void) | null;
  onmessage: ((message: { data: string; lastEventId: string }) => void) | null;
  onerror: (() => void) | null;
  close(): void;
};
/** Opens the stream after `lastEventId` (null = from now). The browser's EventSource cannot send the bearer token, so live uses fetchEventSource. */
export type LiveSourceFactory = (lastEventId: string | null) => LiveEventSource;

type ConnectOptions = { retryMs?: number; setTimer?: (fn: () => void, ms: number) => unknown; clearTimer?: (handle: unknown) => void };

/**
 * Keeps one stream open until stop is called: every event goes to onEvent once, in order; a drop sets
 * "reconnecting" and opens it again after retryMs with Last-Event-ID (the server replays what was missed).
 */
export function connectAdminEvents(open: LiveSourceFactory, onEvent: (event: AdminLiveEvent) => void, onState: (state: LiveStreamState) => void = setLiveStreamState, options: ConnectOptions = {}): () => void {
  const retryMs = options.retryMs ?? RETRY_MS;
  const setTimer = options.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let stopped = false;
  let lastId: string | null = null;
  let lastSequence = 0;
  let source: LiveEventSource | null = null;
  let timer: unknown = null;

  const start = () => {
    timer = null;
    if (stopped) return;
    const mine = open(lastId);
    source = mine;
    mine.onopen = () => {
      if (!stopped && source === mine) onState("open");
    };
    mine.onmessage = (message) => {
      if (stopped || source !== mine) return;
      if (message.lastEventId) lastId = message.lastEventId;
      let event: AdminLiveEvent;
      try {
        event = JSON.parse(message.data) as AdminLiveEvent;
      } catch {
        return;
      }
      if (!event || typeof event.type !== "string") return;
      // resync keeps the cursor it came with; any other event is new only once.
      if (event.type !== "resync") {
        if (typeof event.sequence !== "number" || event.sequence <= lastSequence) return;
        lastSequence = event.sequence;
      }
      onEvent(event);
    };
    mine.onerror = () => {
      if (stopped || source !== mine) return;
      mine.close();
      source = null;
      onState("reconnecting");
      timer = setTimer(start, retryMs);
    };
  };

  onState("connecting");
  start();
  return () => {
    stopped = true;
    if (timer !== null) clearTimer(timer);
    source?.close();
    source = null;
    onState("off");
  };
}

/** Splits an SSE text buffer into whole messages (data + id); the rest waits for more text. */
export function parseSseMessages(buffer: string): { messages: Array<{ data: string; lastEventId: string }>; rest: string; lastId: string | null } {
  const messages: Array<{ data: string; lastEventId: string }> = [];
  let rest = buffer.replace(/\r\n/g, "\n");
  let lastId: string | null = null;
  let at: number;
  while ((at = rest.indexOf("\n\n")) !== -1) {
    const block = rest.slice(0, at);
    rest = rest.slice(at + 2);
    const lines = block.split("\n");
    const id = lines.filter((line) => line.startsWith("id:")).map((line) => line.slice(3).trim()).pop();
    if (id !== undefined) lastId = id;
    const data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (data) messages.push({ data, lastEventId: id ?? lastId ?? "" });
  }
  return { messages, rest, lastId };
}

type StreamClient = { baseUrl: string; state(): { accessToken: string } | null };

/** An EventSource over fetch, so the request carries Authorization: Bearer (live builds). */
export function fetchEventSource(client: StreamClient, fetchImpl: typeof fetch = (input, init) => fetch(input, init)): LiveSourceFactory {
  return (lastEventId) => {
    const controller = new AbortController();
    const source: LiveEventSource = { onopen: null, onmessage: null, onerror: null, close: () => controller.abort() };
    void (async () => {
      try {
        const token = client.state()?.accessToken;
        if (!token) throw new Error("signed out");
        const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "text/event-stream", "X-Api-Version": "0.5" };
        if (lastEventId) headers["Last-Event-ID"] = lastEventId;
        const response = await fetchImpl(`${client.baseUrl.replace(/\/$/, "")}/api/v1${ADMIN_EVENTS_PATH}`, { headers, signal: controller.signal });
        if (!response.ok || !response.body || !(response.headers.get("content-type") ?? "").includes("text/event-stream")) throw new Error(`stream ${response.status}`);
        source.onopen?.();
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const parsed = parseSseMessages(buffer + decoder.decode(value, { stream: true }));
          buffer = parsed.rest;
          for (const message of parsed.messages) source.onmessage?.(message);
        }
        throw new Error("stream ended");
      } catch {
        if (!controller.signal.aborted) source.onerror?.();
      }
    })();
    return source;
  };
}
