import { test } from "node:test";
import assert from "node:assert/strict";
import { applyEvent, bookFrom, caseKind, connectIncidentFeed, incidentRecord, parseSse, ringing, type IncidentFeedEvent, type ServerIncident } from "./incidents.ts";
import { safetyAction } from "../safety/ops.ts";
import { caseOf, caseStep, emptyIncidentOps, positions } from "../safety/cases.ts";
import type { LiveClient } from "./session.ts";

/** Safety part 1 (contract v0.7.0 §15, owner decisions 2026-10-27): server incidents on the demo Incidents page. */

const SOS: ServerIncident = {
  incidentId: "inc_1", tripId: "trp_1", kind: "sos", severity: "critical", status: "open", version: 1, raisedBy: "rider", zoneId: "Z001",
  riderId: "rdr_1", driverId: "drv_1", position: { lat: 59.3331, lng: 18.0651, accuracyM: 8, at: "2026-10-27T10:00:30Z" },
  driverPosition: { lat: 59.334, lng: 18.066, measuredAt: "2026-10-27T10:00:40Z" }, openedAt: "2026-10-27T10:00:31Z",
};
const LOST: ServerIncident = { incidentId: "inc_2", tripId: "trp_2", kind: "driver_silent", severity: "critical", status: "open", version: 1, raisedBy: "system", zoneId: "Z001", openedAt: "2026-10-27T09:00:00Z" };

test("an incident becomes the page's record: statuses New / Taken / Solved / False alarm, car lost, positions", () => {
  const record = incidentRecord(SOS);
  assert.equal(record.status, "queued");
  assert.equal(record.kind, "sos");
  assert.equal(record.createdAt, SOS.openedAt);
  assert.equal(caseKind("driver_silent"), "car_lost");
  assert.equal(incidentRecord(LOST).kind, "car_lost");
  assert.deepEqual(["open", "investigating", "resolved", "dismissed"].map((status) => incidentRecord({ ...SOS, status: status as ServerIncident["status"] }).status), ["queued", "taken", "resolved", "dismissed"]);
  assert.deepEqual(["queued", "taken", "resolved", "dismissed"].map(caseStep), ["New", "Taken", "Solved", "False alarm"]);
  const item = caseOf(record, bookFrom([SOS]), emptyIncidentOps(), Date.parse("2026-10-27T10:01:00Z"));
  assert.equal(item.kind, "sos");
  assert.equal(item.level, "critical");
  assert.equal(item.raisedBy, "rider");
  const where = positions(item, Date.parse("2026-10-27T10:01:00Z"));
  assert.deepEqual([where.rider, where.driver, where.secondsAgo, where.live], [[59.3331, 18.0651], [59.334, 18.066], 20, true]);
  const lost = caseOf(incidentRecord(LOST), bookFrom([LOST]), emptyIncidentOps(), Date.parse("2026-10-27T10:01:00Z"));
  assert.deepEqual([lost.kind, lost.level, lost.raisedBy], ["car_lost", "critical", "system"]);
});

test("the safety book comes from the server: the owner who took it, and the closing note", () => {
  const taken = { ...SOS, status: "investigating" as const, version: 2, takenBy: "A1", takenAt: "2026-10-27T10:02:00Z" };
  const book = bookFrom([taken]);
  assert.equal(book.incidents.inc_1.owner, "A1");
  assert.deepEqual(book.incidents.inc_1.events.map((event) => event.kind), ["take"]);
  // The owner may solve or call it a false alarm; another admin may not.
  const row = incidentRecord(taken);
  assert.equal(safetyAction(book, row, "A1", "resolve", "Rider safe").status, "resolved");
  assert.equal(safetyAction(book, row, "A1", "dismiss", "").status, "dismissed");
  assert.ok(safetyAction(book, row, "A2", "dismiss", "x").error);
  // A new case can be called a false alarm at once; it cannot be solved before someone takes it.
  const fresh = incidentRecord(SOS);
  assert.equal(safetyAction(bookFrom([SOS]), fresh, "A2", "dismiss", "").status, "dismissed");
  assert.ok(safetyAction(bookFrom([SOS]), fresh, "A2", "resolve", "x").error);
  const closed = bookFrom([{ ...taken, status: "dismissed", resolvedBy: "A1", resolvedAt: "2026-10-27T10:03:00Z", resolution: "Pressed by mistake" }]);
  assert.deepEqual(closed.incidents.inc_1.events.map((event) => [event.kind, event.text]), [["take", "Took the case"], ["dismiss", "Pressed by mistake"]]);
  const lostBack = bookFrom([{ ...LOST, status: "resolved", resolvedAt: "2026-10-27T09:40:00Z", resolution: "position back" }]);
  assert.deepEqual(lostBack.incidents.inc_2.events.map((event) => [event.kind, event.actor]), [["resolve", "system"]]);
});

test("the alarm rings for open SOS and car-lost cases nobody took, oldest first", () => {
  let known = new Map<string, ServerIncident>();
  const event = (sequence: number, incident: ServerIncident, kind: IncidentFeedEvent["kind"] = "incident_opened"): IncidentFeedEvent => ({ eventId: `e${sequence}`, sequence, kind, incident, occurredAt: incident.openedAt });
  known = applyEvent(known, event(1, SOS));
  known = applyEvent(known, event(2, LOST));
  known = applyEvent(known, event(3, { ...SOS, incidentId: "inc_3", kind: "ride_check" }));
  assert.deepEqual(ringing(known.values()).map((row) => row.incidentId), ["inc_2", "inc_1"]);
  known = applyEvent(known, event(4, { ...SOS, status: "investigating", takenBy: "A1" }, "incident_updated"));
  known = applyEvent(known, event(5, { ...LOST, status: "resolved", resolution: "position back" }, "incident_closed"));
  assert.deepEqual(ringing(known.values()), []);
});

test("SSE text is split into whole events; a half event waits for the rest", () => {
  const one = JSON.stringify({ eventId: "e1", sequence: 1, kind: "incident_opened", incident: SOS, occurredAt: SOS.openedAt });
  const parsed = parseSse(`: stream open\n\nid: 1\ndata: ${one}\n\nid: 2\ndata: {"eventId"`);
  assert.equal(parsed.events.length, 1);
  assert.equal(parsed.events[0].incident.incidentId, "inc_1");
  assert.equal(parsed.rest, 'id: 2\ndata: {"eventId"');
  assert.deepEqual(parseSse("data: not json\n\n").events, []);
});

test("the feed reads the SSE stream with the bearer token, and falls back to polling every 10 s", async () => {
  const one = JSON.stringify({ eventId: "e1", sequence: 1, kind: "incident_opened", incident: SOS, occurredAt: SOS.openedAt });
  const asked: { url: string; auth: string | null }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    asked.push({ url, auth: new Headers(init?.headers).get("Authorization") });
    const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(`id: 1\ndata: ${one}\n\n`)); controller.close(); } });
    return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
  }) as unknown as typeof fetch;
  const polled: string[] = [];
  const two = { eventId: "e2", sequence: 2, kind: "incident_escalated", incident: { ...SOS, escalatedAt: "2026-10-27T10:02:31Z" }, occurredAt: "2026-10-27T10:02:31Z" };
  const client = {
    baseUrl: "https://api.example.test",
    state: () => ({ accessToken: "access-1" }),
    json: async (path: string) => {
      polled.push(path);
      return { items: polled.length === 1 ? [two] : [], nextCursor: null };
    },
  } as unknown as LiveClient;
  const got: IncidentFeedEvent[] = [];
  const modes: string[] = [];
  const waits: number[] = [];
  let release: () => void = () => undefined;
  const done = new Promise<void>((resolve) => (release = resolve));
  const stop = connectIncidentFeed(client, (event) => got.push(event), (mode) => modes.push(mode), {
    fetchImpl,
    sleep: async (ms) => {
      waits.push(ms);
      if (waits.length >= 2) release();
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  });
  await done;
  stop();
  assert.equal(asked[0].url, "https://api.example.test/api/v1/admin/incidents/stream?after=0");
  assert.equal(asked[0].auth, "Bearer access-1");
  assert.deepEqual(got.map((event) => event.sequence), [1, 2]);
  assert.equal(polled[0], "/admin/incidents/stream?after=1&limit=100");
  assert.deepEqual(modes.slice(0, 3), ["connecting", "live", "polling"]);
  assert.equal(waits[0], 10_000);
});

/** Safety part 2 (contract v0.12.0 §22, owner decisions 2026-10-28): Ride check cases from the server. */
const HELP: ServerIncident = {
  incidentId: "inc_3", tripId: "trp_3", kind: "ride_check", severity: "critical", status: "open", version: 1, raisedBy: "driver", zoneId: "Z001", alarm: true,
  rideCheck: { checkId: "rc-1", trigger: "off_route", by: "driver", answer: "need_help", shownAt: "2026-10-28T10:00:00Z", answeredAt: "2026-10-28T10:00:20Z" },
  openedAt: "2026-10-28T10:00:20Z",
};
const SILENT: ServerIncident = {
  incidentId: "inc_4", tripId: "trp_4", kind: "ride_check", severity: "critical", status: "open", version: 1, raisedBy: "system", zoneId: "Z001", alarm: false,
  rideCheck: { checkId: "rc-2", trigger: "long_stop", by: "rider", answer: "no_answer", shownAt: "2026-10-28T10:00:00Z", lateAnswer: "ok" },
  openedAt: "2026-10-28T10:02:00Z",
};

test("Ride check cases: alarm only when the server says so; trigger, who and answer reach the case", async () => {
  assert.deepEqual(ringing([HELP, SILENT, SOS, { ...SOS, incidentId: "inc_5", alarm: false }]).map((row) => row.incidentId), ["inc_1", "inc_3"]);
  const help = caseOf(incidentRecord(HELP), bookFrom([HELP]), emptyIncidentOps(), Date.parse("2026-10-28T10:01:00Z"));
  assert.deepEqual([help.kind, help.level, help.raisedBy, help.rideCheck?.answer], ["ride_check", "critical", "driver", "need_help"]);
  assert.equal(incidentRecord(HELP).alarm, true);
  const silent = incidentRecord(SILENT);
  assert.equal(silent.alarm, false);
  const item = caseOf(silent, bookFrom([SILENT]), emptyIncidentOps(), Date.parse("2026-10-28T10:03:00Z"));
  const { liveAnswerLabel, liveTriggerLabel } = await import("../safety/cases.ts");
  assert.equal(liveAnswerLabel(item.rideCheck!), "No answer in 2 minutes · Late answer: I'm OK");
  assert.equal(liveAnswerLabel(help.rideCheck!), "I need help");
  assert.deepEqual(["dropped_far", "long_stop", "off_route", "possible_crash", "x"].map(liveTriggerLabel), ["Dropped far from the destination", "Long stop", "Off the route", "Possible crash", "x"]);
  assert.equal(liveAnswerLabel({ ...help.rideCheck!, lateAnswer: "need_help" }), "I need help · Late answer: I need help");
});
