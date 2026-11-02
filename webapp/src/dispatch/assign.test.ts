import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { loadLanguage, setLanguage } from "../i18n/core.ts";
import { contractJson } from "../contract/load.ts";
import { nextStatus, type Actor, type TripCommand } from "../domain/contract.ts";
import { writeSession } from "../auth/sessionStore.ts";
import { createFixtureAdminApi, type CommandInput } from "../api/create.ts";
import { signedInFixture } from "../api/fixtureSession.ts";
import { ApiError } from "../api/httpClient.ts";
import { activityItems } from "../platform/myActivity.ts";
import { commandById } from "../commands/registry.ts";
import { FEATURE_INDEX, featureTarget } from "./featureIndex.ts";
import {
  EVENT_KINDS,
  LOCKED_STATUSES,
  NEARBY_SCOPES,
  OFFER_STATUSES,
  RADAR_GROUP_MAX,
  RADAR_GROUP_MIN,
  RADIUS_PRESETS_KM,
  addDriverBonus,
  advanceAdminDispatch,
  bonusIssue,
  demoReply,
  directAssign,
  emptyAdminDispatch,
  nearbyDrivers,
  normalizeAdminDispatch,
  offerProgress,
  radarGroup,
  tripDispatch,
  type AssignContext,
} from "./assign.ts";
import type { LiveDriver } from "../dashboard/live.ts";

type AdminDispatch = {
  directAssign: { offerKind: string; timer: string; exclusive: boolean };
  radarGroup: { offerKind: string; minDrivers: number; maxDrivers: number; timer: string; repeatable: boolean };
  lockedStatuses: string[];
  nearbyScopes: string[];
  nearbyRadiusPresetsKm: number[];
  eventKinds: string[];
};
const contract = contractJson<{ adminDispatch: AdminDispatch; offerStatus: string[] }>("contract.json");

test("assign tool constants equal contract.json#adminDispatch", () => {
  const spec = contract.adminDispatch;
  assert.equal(spec.directAssign.offerKind, "assigned");
  assert.equal(spec.radarGroup.offerKind, "radar");
  assert.equal(RADAR_GROUP_MIN, spec.radarGroup.minDrivers);
  assert.equal(RADAR_GROUP_MAX, spec.radarGroup.maxDrivers);
  assert.deepEqual([...LOCKED_STATUSES].sort(), [...spec.lockedStatuses].sort());
  assert.deepEqual([...NEARBY_SCOPES], spec.nearbyScopes);
  assert.deepEqual([...RADIUS_PRESETS_KM], spec.nearbyRadiusPresetsKm);
  assert.deepEqual([...EVENT_KINDS], spec.eventKinds);
  assert.deepEqual([...OFFER_STATUSES], contract.offerStatus);
});

const T0 = "2026-10-20T10:00:00.000Z";
const at = (seconds: number) => new Date(Date.parse(T0) + seconds * 1000).toISOString();
const NAMES: Record<string, string> = { A: "Accepts", D: "Declines", N: "Never answers" };

function ctx(status: string, now = T0): AssignContext {
  return {
    tripId: "T1",
    tripStatus: status,
    currency: "SEK",
    fareMinor: 20_000,
    driverNetMinor: 16_000,
    exclusiveSeconds: 15,
    radarSeconds: 12,
    now,
    by: "lena",
    nameOf: (id) => NAMES[id[0]] ? `${NAMES[id[0]]} ${id}` : undefined,
    canTake: () => true,
  };
}

/** Driver ids whose demo answer is known, so the pure tests can follow the demo. */
function driverAnswering(answer: "accept" | "decline" | "none", prefix: string): string {
  for (let index = 0; index < 500; index += 1) if (demoReply(`${prefix}${index}`).answer === answer) return `${prefix}${index}`;
  throw new Error("no driver");
}

test("Q16 direct assign is one exclusive offer on the zone's exclusive timer; a decline frees the trip", () => {
  const decliner = driverAnswering("decline", "D");
  const sent = directAssign(emptyAdminDispatch(), ctx("searching"), decliner);
  assert.equal(sent.error, undefined);
  const [offer] = sent.offers;
  assert.equal(offer.kind, "assigned");
  assert.equal(offer.source, "admin");
  assert.equal(offer.status, "open");
  assert.equal(offer.expiresAt, at(15));
  assert.equal(sent.book.events.at(-1)?.kind, "offer_sent");
  const later = advanceAdminDispatch(sent.book, at(demoReply(decliner).afterSeconds), () => "offered");
  assert.equal(tripDispatch(later.book, "T1").offers[0].status, "declined");
  assert.deepEqual(later.changes, [{ tripId: "T1", to: "searching" }], "every offer ended: offer_lapsed back to searching");
  assert.equal(later.book.events.at(-1)?.kind, "offer_declined");
});

test("Q13–Q15 radar groups: 1 to 10 drivers, repeat until one accepts, then the lock withdraws the rest", () => {
  const ids = Array.from({ length: 11 }, (_, index) => `N${index}`);
  assert.match(radarGroup(emptyAdminDispatch(), ctx("searching"), ids).error ?? "", /at most 10/);
  assert.match(radarGroup(emptyAdminDispatch(), ctx("searching"), []).error ?? "", /at least one/);
  assert.match(radarGroup(emptyAdminDispatch(), ctx("searching"), ["N1", "N1"]).error ?? "", /twice/);

  const silent = driverAnswering("none", "N");
  const accepter = driverAnswering("accept", "A");
  const first = radarGroup(emptyAdminDispatch(), ctx("searching"), [silent]);
  assert.equal(first.group?.expiresAt, at(12), "the zone's radar timer");
  assert.equal(first.offers[0].groupId, "T1-G1");
  // While group 1 still runs, the admin sends another group (the trip stays offered).
  const second = radarGroup(first.book, ctx("offered", at(1)), [accepter]);
  assert.equal(second.error, undefined);
  assert.equal(second.group?.number, 2);
  const answered = advanceAdminDispatch(second.book, at(1 + demoReply(accepter).afterSeconds), () => "offered");
  const state = tripDispatch(answered.book, "T1");
  assert.deepEqual(answered.changes, [{ tripId: "T1", to: "accepted", driverId: accepter }]);
  assert.equal(state.offers.find((offer) => offer.driverId === accepter)?.status, "claimed");
  assert.equal(state.offers.find((offer) => offer.driverId === silent)?.status, "claimed_elsewhere");
  assert.equal(state.lockedTo?.driverId, accepter);
  assert.deepEqual(answered.book.events.slice(-3).map((event) => event.kind), ["offer_withdrawn", "offer_accepted", "assignment_locked"]);
  // Locked: no more groups or direct assigns.
  for (const status of ["accepted", "driver_to_pickup", "completed", "cancelled_by_admin"]) {
    const refused = radarGroup(answered.book, ctx(status), [silent]);
    assert.equal(refused.code, "invalid_transition", status);
    assert.equal(directAssign(answered.book, ctx(status), silent).code, "invalid_transition", status);
  }
});

test("an offer nobody answers expires on its timer; a cancelled trip withdraws its open offers", () => {
  const silent = driverAnswering("none", "N");
  const sent = radarGroup(emptyAdminDispatch(), ctx("searching"), [silent]);
  assert.equal(advanceAdminDispatch(sent.book, at(11), () => "offered").changes.length, 0, "still open before the timer");
  const expired = advanceAdminDispatch(sent.book, at(12), () => "offered");
  assert.equal(tripDispatch(expired.book, "T1").offers[0].status, "expired");
  const cancelled = advanceAdminDispatch(sent.book, at(1), () => "cancelled_by_rider");
  assert.equal(tripDispatch(cancelled.book, "T1").offers[0].status, "withdrawn");
  assert.equal(cancelled.changes.length, 0);
});

test("Q17 driver bonus: above the country's limit → adjust the limit in Pricing; never above the hard max", () => {
  const limits = { limitMinor: 20_000, hardMaxMinor: 100_000 };
  const fmt = (minor: number) => `${minor / 100} kr`;
  assert.equal(bonusIssue(5_000, 0, limits, fmt), null);
  assert.equal(bonusIssue(20_000, 0, limits, fmt), null, "the limit itself is allowed");
  assert.match(bonusIssue(5_000, 16_000, limits, fmt)?.message ?? "", /adjust the limit in Pricing/, "the total per trip counts");
  assert.equal(bonusIssue(150_000, 0, limits, fmt)?.code, "over_hard_max");
  assert.equal(bonusIssue(0, 0, limits, fmt)?.code, "invalid");
  assert.equal(bonusIssue(12.5, 0, limits, fmt)?.code, "invalid");
});

test("live test 2026-11-01: the over-limit and hard-max messages are in Swedish and French too", async () => {
  const limits = { limitMinor: 1_800, hardMaxMinor: 9_000 };
  const fmt = (minor: number) => `${minor / 100} €`;
  try {
    await loadLanguage("fr");
    setLanguage("fr");
    assert.equal(bonusIssue(2_000, 0, limits, fmt)?.message, "Au-delà de la limite de 18 € par course : modifiez la limite dans Tarifs.");
    assert.equal(bonusIssue(10_000, 0, limits, fmt)?.message, "Au-delà du maximum absolu de 90 € par course. Aucune limite ne peut aller plus haut.");
    await loadLanguage("sv");
    setLanguage("sv");
    assert.equal(bonusIssue(2_000, 0, limits, fmt)?.message, "Över gränsen på 18 € per resa: ändra gränsen i Priser.");
    assert.equal(bonusIssue(10_000, 0, limits, fmt)?.message, "Över det hårda taket på 90 € per resa. Ingen gräns kan gå högre.");
  } finally {
    setLanguage("en");
  }
  assert.match(bonusIssue(2_000, 0, limits, fmt)?.message ?? "", /^Above the limit of 18 € per trip: adjust the limit in Pricing\.$/);
});

test("Q18 offers carry driverBonus and priority, included in the fare and earnings the driver sees", () => {
  const sent = directAssign(emptyAdminDispatch(), ctx("searching"), "N1", { driverBonusMinor: 5_000, priority: true });
  const [offer] = sent.offers;
  assert.equal(offer.driverBonusMinor, 5_000);
  assert.equal(offer.fareMinor, 25_000);
  assert.equal(offer.driverEarningsMinor, 21_000);
  assert.equal(offer.priority, true);
  assert.ok(sent.book.events.some((event) => event.kind === "driver_bonus_added" && event.amountMinor === 5_000));
});

test("Q14 nearby drivers: preset radius, whole zone, zone and neighbours; free drivers first, nearest first", () => {
  const base = { zoneName: "", lastSeenMin: 0, vehicle: null, plate: null, tripId: null, route: null, progress: 0 };
  const drivers: LiveDriver[] = [
    { ...base, id: "far", name: "Far", zoneId: "Z002", state: "free", lat: 59.40, lng: 18.07 },
    { ...base, id: "near", name: "Near", zoneId: "Z001", state: "free", lat: 59.3326, lng: 18.0649 },
    { ...base, id: "busy", name: "Busy", zoneId: "Z001", state: "trip", lat: 59.3327, lng: 18.0650 },
    { ...base, id: "nogps", name: "No GPS", zoneId: "Z001", state: "stale", lat: 59.3326, lng: 18.0649 },
  ];
  const facts = () => ({ rating: 4.8, categoryIds: ["economy"] });
  const pickup: [number, number] = [59.3326, 18.0649];
  const within5 = nearbyDrivers(pickup, "Z001", "economy", drivers, { scope: "radius", radiusKm: 5 }, facts);
  assert.deepEqual(within5.map((row) => row.driverId), ["near", "busy"]);
  assert.equal(within5[1].onlineStatus, "on_trip");
  assert.deepEqual(nearbyDrivers(pickup, "Z001", "economy", drivers, { scope: "zone" }, facts).map((row) => row.driverId), ["near", "busy"]);
  assert.ok(nearbyDrivers(pickup, "Z001", "economy", drivers, { scope: "zone_and_neighbours" }, facts).some((row) => row.driverId === "far"));
  assert.ok(nearbyDrivers(pickup, "Z001", "economy", drivers, { scope: "radius", radiusKm: 30 }, facts).some((row) => row.driverId === "far"));
});

/* ------------------------------------------------------------------ the demo fixture server, end to end */

const raw = createFixtureAdminApi(0);
const api = signedInFixture(raw);

async function run(input: Partial<CommandInput> & { action: string }) {
  return api.command({ targetId: "T0004", reason: "Rider asked support", actorId: "lena", before: "", after: "", expectedRev: await api.revision(), idempotencyKey: `${input.action}-${Math.random()}`, collection: input.action === "admin.trip.driverBonus" ? undefined : "trips", patch: input.action === "admin.trip.driverBonus" ? undefined : { status: "offered" }, ...input });
}

async function refused(work: Promise<unknown>, status: number, code: string) {
  await assert.rejects(work, (error: unknown) => error instanceof ApiError && error.status === status && error.code === code);
}

async function tripStatus(id = "T0004") {
  writeSession("lena");
  return (await api.list("trips", null)).find((row) => row.id === id)?.status;
}

test("scenario admin_direct_assign_locked_after_accept: assign, accept, then assign is invalid_transition", async () => {
  mock.timers.enable({ apis: ["Date"], now: Date.parse(T0) });
  try {
    await api.reset();
    assert.equal(await tripStatus(), "searching");
    // D0046 accepts in the demo; D0042 declines.
    assert.equal(demoReply("D0046").answer, "accept");
    assert.equal(demoReply("D0042").answer, "decline");
    await run({ action: "admin.trip.assign", value: { driverId: "D0042" } });
    assert.equal(await tripStatus(), "offered");
    mock.timers.tick(demoReply("D0042").afterSeconds * 1000);
    writeSession("lena");
    const declined = await api.tripOffers("T0004");
    assert.equal(declined.offers[0].status, "declined");
    assert.equal(declined.status, "searching", "the decline sends the trip back to searching");

    await run({ action: "admin.trip.assign", value: { driverId: "D0046" } });
    mock.timers.tick(demoReply("D0046").afterSeconds * 1000);
    assert.equal(await tripStatus(), "accepted");
    writeSession("lena");
    const locked = await api.tripOffers("T0004");
    assert.equal(locked.lockedTo?.driverId, "D0046");
    assert.equal((await api.list("trips", null)).find((row) => row.id === "T0004")?.driverId, "D0046");
    await refused(run({ action: "admin.trip.assign", value: { driverId: "D0006" } }), 409, "invalid_transition");
    await refused(run({ action: "admin.trip.radarGroup", value: { driverIds: ["D0006"] } }), 409, "invalid_transition");
    await refused(run({ action: "admin.trip.driverBonus", value: { amountMinor: 1000, priority: true } }), 409, "invalid_transition");
    // The contract scenario replays the same steps.
    const { scenarios } = contractJson<{ scenarios: { id: string; steps: [TripCommand, Actor, string][] }[] }>("fixtures/scenarios.json");
    for (const id of ["admin_direct_assign_locked_after_accept", "admin_radar_groups_repeat_until_accept"]) {
      let status = "draft";
      for (const [command, actor, expect] of scenarios.find((item) => item.id === id)!.steps) {
        const next = nextStatus(status, command, actor);
        assert.equal(next ?? "invalid_transition", expect, `${id}: ${command}`);
        if (next) status = next;
      }
    }
  } finally {
    mock.timers.reset();
  }
});

test("scenario admin_radar_groups_repeat_until_accept: groups again and again, first accept wins, the rest withdrawn", async () => {
  mock.timers.enable({ apis: ["Date"], now: Date.parse(T0) });
  try {
    await api.reset();
    writeSession("lena");
    const nearby = await api.nearbyDrivers("T0004", { scope: "radius", radiusKm: 5 });
    const free = nearby.items.filter((row) => row.onlineStatus === "online").map((row) => row.driverId);
    assert.ok(free.includes("D0006") && free.includes("D0022") && free.includes("D0046"), free.join(","));
    await refused(raw.nearbyDrivers("T0004", { scope: "radius", radiusKm: 0 }), 400, "invalid_request");

    await run({ action: "admin.trip.radarGroup", value: { driverIds: ["D0006", "D0022"] } });
    mock.timers.tick(6000);
    writeSession("lena");
    let view = await api.tripOffers("T0004");
    assert.equal(view.offers.find((offer) => offer.driverId === "D0006")?.status, "declined");
    assert.equal(view.offers.find((offer) => offer.driverId === "D0022")?.status, "open");
    assert.equal(view.groups[0].expiresAt, new Date(Date.parse(T0) + view.timers.radarSeconds * 1000).toISOString(), "the zone's radar timer");

    // A second group while the first still runs, with a bonus: open offers are raised too.
    await refused(run({ action: "admin.trip.radarGroup", value: { driverIds: ["D0022"] } }), 400, "invalid_request");
    await run({ action: "admin.trip.radarGroup", value: { driverIds: ["D0046", "D0058"], driverBonusMinor: 5000, priority: true } });
    writeSession("lena");
    view = await api.tripOffers("T0004");
    assert.equal(view.groups.length, 2);
    assert.ok(view.offers.filter((offer) => offer.status === "open").every((offer) => offer.driverBonusMinor === 5000 && offer.priority));
    mock.timers.tick(demoReply("D0046").afterSeconds * 1000);
    assert.equal(await tripStatus(), "accepted");
    writeSession("lena");
    view = await api.tripOffers("T0004");
    assert.equal(view.offers.find((offer) => offer.driverId === "D0046")?.status, "claimed");
    assert.ok(view.offers.filter((offer) => offer.driverId !== "D0046" && offer.driverId !== "D0006").every((offer) => offer.status === "claimed_elsewhere"));
    const events = (await api.dispatchEvents(0)).items.map((event) => event.kind);
    assert.ok(events.includes("assignment_locked") && events.includes("offer_withdrawn") && events.includes("driver_bonus_added"));
    await refused(run({ action: "admin.trip.radarGroup", value: { driverIds: ["D0042"] } }), 409, "invalid_transition");
    // The winner is busy with this trip now: another trip cannot offer to them meanwhile.
    writeSession("lena");
    const elsewhere = await api.nearbyDrivers("T0022", { scope: "radius", radiusKm: 10 });
    assert.equal(elsewhere.items.find((item) => item.driverId === "D0046")?.onlineStatus, "on_trip");
    await refused(run({ action: "admin.trip.assign", targetId: "T0022", value: { driverId: "D0046" } }), 400, "invalid_request");

    // Every action is in My activity: the audited commands, done and failed.
    const items = activityItems(await api.audit(), [], (action) => commandById(action)?.label ?? action).filter((item) => item.actorId === "lena");
    assert.ok(items.some((item) => item.what === "Send to a radar group" && item.status === "done"));
    assert.ok(items.some((item) => item.what === "Send to a radar group" && item.status === "failed"));
  } finally {
    mock.timers.reset();
  }
});

test("Q17 on the server: a bonus above the country limit is 400 invalid_request", async () => {
  mock.timers.enable({ apis: ["Date"], now: Date.parse(T0) });
  try {
    await api.reset();
    await refused(run({ action: "admin.trip.driverBonus", value: { amountMinor: 25_000, priority: true } }), 400, "invalid_request");
    await run({ action: "admin.trip.driverBonus", value: { amountMinor: 15_000, priority: true } });
    writeSession("lena");
    const view = await api.tripOffers("T0004");
    assert.equal(view.bonusMinor, 15_000);
    assert.equal(view.limits.limitMinor, 20_000);
    assert.equal(view.limits.hardMaxMinor, 100_000);
    await refused(run({ action: "admin.trip.driverBonus", value: { amountMinor: 10_000, priority: true } }), 400, "invalid_request");
    // An admin of another country cannot read this trip's offers.
    writeSession("camille");
    await assert.rejects(raw.tripOffers("T0004"), (error: unknown) => error instanceof ApiError && error.status === 403);
  } finally {
    mock.timers.reset();
  }
});

test("All features lists the assign tool, radar groups and Add money for driver", () => {
  for (const id of ["assign-tool", "radar-groups", "radar-group-timer", "add-money-driver"]) {
    const entry = FEATURE_INDEX.find((item) => item.id === id);
    assert.ok(entry, id);
    // The radar group timer is the zone's radar time, set in the Radar · Exclusive tab of Dispatch.
    assert.ok(featureTarget(entry!, "Z001").startsWith(id === "radar-group-timer" ? "/dispatch/radar" : "/dispatch"), id);
  }
});

/* ------------------------------------------------------------------ round 2: scoped money, radar targets, accepted driver */

test("money added for the driver applies to Exclusive, Radar or both; offers carry only their own kind's money", () => {
  const limits = { limitMinor: 20_000, hardMaxMinor: 100_000 };
  const fmt = (minor: number) => `${minor / 100} kr`;
  const exclusive = directAssign(emptyAdminDispatch(), ctx("searching"), "N1", { driverBonusMinor: 5_000, bonusScope: "exclusive" });
  assert.equal(exclusive.offers[0].fareMinor, 25_000);
  const trip = tripDispatch(exclusive.book, "T1");
  assert.deepEqual([trip.bonusExclusiveMinor, trip.bonusRadarMinor, trip.bonusMinor], [5_000, 0, 5_000]);
  // A radar afterwards carries no exclusive money.
  const radar = radarGroup(exclusive.book, ctx("offered"), ["N2"]);
  assert.equal(radar.offers[0].fareMinor, 20_000);
  assert.equal(radar.offers[0].driverBonusMinor, 0);
  // Money for the radar raises only the open radar offers; the limit counts per kind.
  const raised = addDriverBonus(radar.book, ctx("offered"), 3_000, true, limits, fmt, "radar");
  const offers = tripDispatch(raised.book, "T1").offers;
  assert.equal(offers.find((offer) => offer.driverId === "N1")?.fareMinor, 25_000, "the exclusive offer keeps its own money");
  assert.equal(offers.find((offer) => offer.driverId === "N2")?.fareMinor, 23_000);
  assert.equal(addDriverBonus(raised.book, ctx("offered"), 16_000, true, limits, fmt, "exclusive").error?.includes("adjust the limit"), true, "5 000 + 16 000 passes the exclusive limit");
  assert.equal(addDriverBonus(raised.book, ctx("offered"), 16_000, true, limits, fmt, "radar").error, undefined, "3 000 + 16 000 fits the radar limit");
  // Both: one amount for every kind.
  const both = directAssign(emptyAdminDispatch(), ctx("searching"), "N1", { driverBonusMinor: 2_000 });
  assert.deepEqual([tripDispatch(both.book, "T1").bonusExclusiveMinor, tripDispatch(both.book, "T1").bonusRadarMinor], [2_000, 2_000]);
});

test("older saves with one bonusMinor keep it for both Exclusive and Radar", () => {
  const book = normalizeAdminDispatch({ seq: 1, trips: { T1: { offers: [], groups: [], bonusMinor: 3_000, priority: true } }, events: [] });
  const trip = tripDispatch(book, "T1");
  assert.deepEqual([trip.bonusMinor, trip.bonusExclusiveMinor, trip.bonusRadarMinor], [3_000, 3_000, 3_000]);
  const newer = normalizeAdminDispatch({ trips: { T1: { offers: [], groups: [], bonusMinor: 3_000, bonusExclusiveMinor: 3_000, bonusRadarMinor: 0 } } });
  assert.deepEqual([tripDispatch(newer, "T1").bonusExclusiveMinor, tripDispatch(newer, "T1").bonusRadarMinor], [3_000, 0]);
});

test("a radar sent to a target with nobody inside stays on the radar for its timer, waiting for drivers", () => {
  const empty = radarGroup(emptyAdminDispatch(), ctx("searching"), [], { target: "radar Södermalm", maxDrivers: 3 });
  assert.equal(empty.error, undefined);
  assert.equal(empty.offers.length, 0);
  assert.equal(empty.group?.target, "radar Södermalm");
  assert.equal(empty.group?.maxDrivers, 3);
  const progress = offerProgress(tripDispatch(empty.book, "T1"), Date.parse(T0) + 5_000);
  assert.equal(progress.radarWaiting, true);
  assert.equal(progress.radarEndsAt, at(12));
  assert.equal(offerProgress(tripDispatch(empty.book, "T1"), Date.parse(T0) + 13_000).radarEndsAt, null, "the timer ended");
  // Without a target a radar still needs drivers; never more than the maximum.
  assert.match(radarGroup(emptyAdminDispatch(), ctx("searching"), []).error ?? "", /at least one driver/);
  assert.match(radarGroup(emptyAdminDispatch(), ctx("searching"), ["N1", "N2", "N3", "N4"], { target: "radar X", maxDrivers: 3 }).error ?? "", /at most 3 drivers/);
});

test("offer progress counts who sees it on the radar, ignored and refused offers, and the driver who accepted", () => {
  const accept = driverAnswering("accept", "A");
  const decline = driverAnswering("decline", "D");
  const silent = driverAnswering("none", "N");
  const sent = radarGroup(emptyAdminDispatch(), ctx("searching"), [decline, silent]);
  const open = offerProgress(tripDispatch(sent.book, "T1"), Date.parse(T0) + 1_000);
  assert.deepEqual([open.onRadar, open.ignored, open.refused, open.accepted], [2, 0, 0, null]);
  const later = advanceAdminDispatch(sent.book, at(30), () => "offered").book;
  const ended = offerProgress(tripDispatch(later, "T1"), Date.parse(at(30)));
  assert.deepEqual([ended.onRadar, ended.ignored, ended.refused], [0, 1, 1]);
  const won = advanceAdminDispatch(directAssign(later, ctx("searching", at(30)), accept).book, at(60), () => "offered").book;
  assert.equal(offerProgress(tripDispatch(won, "T1"), Date.parse(at(60))).accepted?.driverId, accept);
});

test("on the server: a quick exclusive offer carries the money; the accepted driver shows with car, ETA and price", async () => {
  mock.timers.enable({ apis: ["Date"], now: Date.parse(T0) });
  try {
    await api.reset();
    await run({ action: "admin.trip.assign", value: { driverId: "D0046", driverBonusMinor: 5_000, bonusScope: "exclusive", priority: true } });
    writeSession("lena");
    const sent = await api.tripOffers("T0004");
    assert.equal(sent.offers[0].driverBonusMinor, 5_000);
    assert.deepEqual([sent.bonusExclusiveMinor, sent.bonusRadarMinor], [5_000, 0]);
    mock.timers.tick(demoReply("D0046").afterSeconds * 1000);
    assert.equal(await tripStatus(), "accepted");
    writeSession("lena");
    const done = await api.tripOffers("T0004");
    assert.equal(done.accepted?.driverId, "D0046");
    assert.equal(done.accepted?.kind, "assigned");
    assert.equal(done.accepted?.driverBonusMinor, 5_000);
    assert.equal(done.accepted?.fareMinor, done.fareMinor + 5_000);
    assert.match(done.accepted?.code ?? "", /^MV-SE-\d{4}$/);
    assert.ok(done.accepted?.etaMin === null || done.accepted!.etaMin >= 1);
    assert.equal(done.bonusMinor, 5_000, "only the accepted offer's money is paid");
  } finally {
    mock.timers.reset();
  }
});

test("on the server: a radar to a target with nobody inside goes out without offering the ride to anyone", async () => {
  mock.timers.enable({ apis: ["Date"], now: Date.parse(T0) });
  try {
    await api.reset();
    await run({ action: "admin.trip.radarGroup", value: { driverIds: [], target: "radar Södermalm", maxDrivers: 3 } });
    assert.equal(await tripStatus(), "searching", "nobody was offered the ride");
    writeSession("lena");
    const view = await api.tripOffers("T0004");
    assert.equal(view.groups.length, 1);
    assert.equal(view.groups[0].target, "radar Södermalm");
    assert.equal(view.offers.length, 0);
    await refused(run({ action: "admin.trip.radarGroup", value: { driverIds: [] } }), 400, "invalid_request");
  } finally {
    mock.timers.reset();
  }
});

test("live G8 8: money waits per kind — Radar money with no radar offer out says it waits for the next radar, an exclusive offer does not take it", async () => {
  const { waitingMoney } = await import("./assign.ts");
  const offer = (kind: "assigned" | "radar", status = "open") => ({ offerId: `o-${kind}`, tripId: "T1", driverId: "D1", kind, status }) as never;
  assert.deepEqual(waitingMoney({ bonusExclusiveMinor: 0, bonusRadarMinor: 2_000, offers: [] }), { exclusive: 0, radar: 2_000 });
  // The automatic exclusive offer is out: the radar money still waits for the radar.
  assert.deepEqual(waitingMoney({ bonusExclusiveMinor: 0, bonusRadarMinor: 2_000, offers: [offer("assigned")] }), { exclusive: 0, radar: 2_000 });
  // A radar offer is out: it carries the money, nothing waits.
  assert.deepEqual(waitingMoney({ bonusExclusiveMinor: 500, bonusRadarMinor: 2_000, offers: [offer("radar"), offer("assigned", "declined")] }), { exclusive: 500, radar: 0 });
  const { en } = await import("../i18n/en.ts");
  const { sv } = await import("../i18n/sv.ts");
  const { fr } = await import("../i18n/fr.ts");
  assert.equal(sv["Waiting for the next radar: {0}"], "Väntar på nästa radar: {0}");
  assert.ok(en["Waiting for the next radar: {0}"] && fr["Waiting for the next radar: {0}"]);
});
