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
/** contract.json#adminLiveEvents.reconnectBackoff: 1 s doubling to 30 s, full jitter; no retry on 401 or sign-out. */
export const BACKOFF_FIRST_MS = 1_000;
export const BACKOFF_MAX_MS = 30_000;

/** The wait before try `attempt` (0 = first retry): a random point between 0 and min(max, first × 2^attempt). */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const step = Math.min(BACKOFF_MAX_MS, BACKOFF_FIRST_MS * 2 ** Math.min(attempt, 30));
  return Math.floor(random() * step);
}

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
  // S7 E1: ["assign-offers", tripId] is the trip page's offers + status read (else only its own 1 s / 15 s timer).
  trips: [["trip-record"], ["live", "trip"], ["live", "chat-trips"], ["records", "rideChecks"], ["assign-offers"]],
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
 * 503 proof 2026-11-06 (Rules plan/FIX-503-ADMIN-BURST-2026-11-06.md): a stream opened without a cursor gets the last
 * 24 h of events at once (5571 on staging), and reloading the lists for EACH event filled the server's database pool.
 * Events are now collected for EVENT_BATCH_MS and each changed list is reloaded once per batch; a resync reloads all.
 */
export const EVENT_BATCH_MS = 1_000;
export type KeyMatch = (key: readonly unknown[]) => boolean;
type BatchOptions = { windowMs?: number; setTimer?: (fn: () => void, ms: number) => unknown; clearTimer?: (handle: unknown) => void };
export function batchedInvalidator(invalidate: (match: KeyMatch) => void, options: BatchOptions = {}): { push: (event: Pick<AdminLiveEvent, "type">) => void; stop: () => void } {
  const windowMs = options.windowMs ?? EVENT_BATCH_MS;
  const setTimer = options.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let types = new Set<string>();
  let timer: unknown = null;
  const flush = () => {
    timer = null;
    const batch = types.has("resync") ? ["resync"] : [...types];
    types = new Set();
    if (batch.length) invalidate((key) => batch.some((type) => keyMatches({ type }, key)));
  };
  return {
    push(event) {
      if (!INVALIDATES[event.type]) return;
      types.add(event.type);
      if (timer === null) timer = setTimer(flush, windowMs);
    },
    stop() {
      if (timer !== null) clearTimer(timer);
      timer = null;
      types = new Set();
    },
  };
}

/**
 * Supervisor S7 R5: lists whose warnings the server sets on the clock (Reservations: no driver soon, may be late, not
 * started, overdue). The server's trips trigger does not fire on trips.reservation / scheduled_at, so no event comes:
 * they keep the page's own pace, also while the stream is open.
 */
const CLOCK_LISTS: ReadonlySet<string> = new Set(["reservations"]);

/**
 * The timer a live list should use. Demo / signed out: the page's own. Stream open: none (events refresh it).
 * Stream not open: every minute (owner L1). `follow` lists (map positions, ETAs) and CLOCK_LISTS keep their pace:
 * positions and clock warnings have no event.
 */
export function liveRefetchMs(state: LiveStreamState, name: string, pageMs: number | undefined, follow = false): number | false | undefined {
  if (pageMs === undefined || follow || CLOCK_LISTS.has(name) || state === "off" || !STREAMED_LISTS.has(name)) return pageMs;
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
  /** status 401 = the session is gone (or signed out): no retry. */
  onerror: ((info?: { status?: number }) => void) | null;
  /** An `id:` line with no data (the server moved the cursor past events not for this admin). */
  oncursor?: ((id: string) => void) | null;
  close(): void;
};
/** Opens the stream after `lastEventId` (null = from now). The browser's EventSource cannot send the bearer token, so live uses fetchEventSource. */
export type LiveSourceFactory = (lastEventId: string | null) => LiveEventSource;

type ConnectOptions = { random?: () => number; setTimer?: (fn: () => void, ms: number) => unknown; clearTimer?: (handle: unknown) => void };

/**
 * Keeps one stream open until stop is called: every event goes to onEvent once, in order; a drop sets
 * "reconnecting" and opens it again after a jittered backoff (1 s doubling to 30 s) with Last-Event-ID (the server
 * replays what was missed). A 401 (session gone, signed out) stops it: state "off", no more tries.
 */
export function connectAdminEvents(open: LiveSourceFactory, onEvent: (event: AdminLiveEvent) => void, onState: (state: LiveStreamState) => void = setLiveStreamState, options: ConnectOptions = {}): () => void {
  const random = options.random ?? Math.random;
  let attempt = 0;
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
      if (!stopped && source === mine) {
        attempt = 0;
        onState("open");
      }
    };
    mine.oncursor = (id) => {
      if (!stopped && source === mine && id) lastId = id;
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
    mine.onerror = (info) => {
      if (stopped || source !== mine) return;
      mine.close();
      source = null;
      if (info?.status === 401) {
        stopped = true;
        onState("off");
        return;
      }
      onState("reconnecting");
      timer = setTimer(start, backoffMs(attempt, random));
      attempt += 1;
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

/**
 * The session the stream signs with. Finder D4: `accessToken` is the session's fresh token (refreshed 30 s before it
 * runs out, session.ts freshToken) and `refresh` renews it once after a 401; without them the stored token is sent.
 */
type StreamClient = { baseUrl: string; state(): { accessToken: string } | null; accessToken?: () => Promise<string | null>; refresh?: () => Promise<boolean> };

/**
 * Finder D3: the server writes ": heartbeat" every 15 s (movera-server src/realtime/sse.ts). An open stream that sends
 * no bytes for this long is half-open (laptop sleep, Wi-Fi change): it is dropped, so connectAdminEvents shows
 * "Reconnecting…" (the lists poll again) and reopens it with Last-Event-ID. Before, it stayed "open" and the lists froze.
 */
export const STREAM_SILENCE_MS = 45_000;
type SilenceTimers = { setTimer?: (fn: () => void, ms: number) => unknown; clearTimer?: (handle: unknown) => void };

/**
 * Finder D3: the server writes ": heartbeat" every 15 s (movera-server src/realtime/sse.ts). An open stream that sends
 * no bytes for this long is half-open (laptop sleep, Wi-Fi change): it is dropped, so connectAdminEvents shows
 * "Reconnecting…" (the lists poll again) and reopens it with Last-Event-ID. Before, it stayed "open" and the lists froze.
 */
export const STREAM_SILENCE_MS = 45_000;
type SilenceTimers = { setTimer?: (fn: () => void, ms: number) => unknown; clearTimer?: (handle: unknown) => void };

/** An EventSource over fetch, so the request carries Authorization: Bearer (live builds). */
export function fetchEventSource(client: StreamClient, fetchImpl: typeof fetch = (input, init) => fetch(input, init), timers: SilenceTimers = {}): LiveSourceFactory {
  const setTimer = timers.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = timers.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  return (lastEventId) => {
    const controller = new AbortController();
    let watchdog: unknown = null;
    const disarm = () => {
      if (watchdog !== null) clearTimer(watchdog);
      watchdog = null;
    };
    let silent = false;
    const arm = () => {
      disarm();
      watchdog = setTimer(() => {
        watchdog = null;
        silent = true;
        controller.abort();
        source.onerror?.();
      }, STREAM_SILENCE_MS);
    };
    const source: LiveEventSource = { onopen: null, onmessage: null, onerror: null, oncursor: null, close: () => { disarm(); controller.abort(); } };
    let status: number | undefined;
    void (async () => {
      try {
        const url = `${client.baseUrl.replace(/\/$/, "")}/api/v1${ADMIN_EVENTS_PATH}`;
        const send = (token: string) => {
          const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "text/event-stream", "X-Api-Version": "0.5" };
          if (lastEventId) headers["Last-Event-ID"] = lastEventId;
          return fetchImpl(url, { headers, signal: controller.signal });
        };
        const token = client.accessToken ? await client.accessToken() : client.state()?.accessToken;
        if (!token) {
          status = 401;
          throw new Error("signed out");
        }
        let response = await send(token);
        // D4: a dead token (the stream reconnects long after the last refresh) is renewed once; only a refused
        // refresh (the session ended, the panel signs out) leaves the 401, which stops the stream.
        if (response.status === 401 && client.refresh && !controller.signal.aborted && (await client.refresh())) {
          const renewed = client.state()?.accessToken;
          if (renewed && !controller.signal.aborted) response = await send(renewed);
        }
        status = response.status;
        if (!response.ok || !response.body || !(response.headers.get("content-type") ?? "").includes("text/event-stream")) throw new Error(`stream ${response.status}`);
        source.onopen?.();
        arm();
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          arm();
          const parsed = parseSseMessages(buffer + decoder.decode(value, { stream: true }));
          buffer = parsed.rest;
          for (const message of parsed.messages) source.onmessage?.(message);
          // id-only lines move the cursor too, so a reconnect does not read those events again.
          if (parsed.lastId !== null) source.oncursor?.(parsed.lastId);
        }
        throw new Error("stream ended");
      } catch {
        disarm();
        if (!controller.signal.aborted && !silent) source.onerror?.(status === 401 ? { status } : undefined);
      }
    })();
    return source;
  };
}
