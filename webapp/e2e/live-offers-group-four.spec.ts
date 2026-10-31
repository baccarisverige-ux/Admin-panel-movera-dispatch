import { expect, test, type Page, type Route } from "@playwright/test";
import { ACTIVE_TRIP, ADMIN, API, fakeSettings, fakeTripServer, signIn } from "./live-fake";

/**
 * Driver group 4 "Incoming offer & exclusive offer" (contract v0.18.6, Rules decisions/driver-g4.md), the admin parts
 * on live against a faked server:
 * - G4-E4 rider raise limit per zone; decision 3 "Show rider rating on offers"; G4-E2/E3 auto-offline text; G4-E7.
 * - G4-F1 no "Waiting for a second admin" box or badge (History + Undo stay); G4-F5 no Cancel checks on live.
 * - G4-F2 saved presets per country, F3 driver groups (send to a group = the server picks), F4 radar zones + rules
 *   (send with the rule, Stop a repeating radar), F6 events (pin, local times, sv/fr/en) — all on /admin/dispatch/*.
 * With G4_SHOTS set, screenshots are saved there.
 */

const SHOTS = process.env.G4_SHOTS;
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }); };
const G4_ADMIN = { permissions: [...ADMIN.permissions, "settings.read", "settings.edit", "settings.publish", "dispatch.edit", "trips.intervene"] };
const SEARCHING = { ...ACTIVE_TRIP, tripId: "T2003", status: "searching", version: 2, driverId: undefined, driver: undefined, acceptedAt: undefined, riderId: "R501", createdAt: new Date(Date.now() - 4 * 60_000).toISOString() };
const RING: [number, number][] = [[59.32, 18.04], [59.32, 18.09], [59.345, 18.09], [59.345, 18.04]];
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS", "access-control-expose-headers": "*" };
const json = (route: Route, status: number, body?: unknown) => route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: body === undefined ? "" : JSON.stringify(body) });

const confirm = async (page: Page) => {
  const modal = page.locator(".modal.open").last();
  const reason = modal.getByLabel(/^(Reason|Skäl)$/);
  if ((await reason.count()) && (await reason.inputValue()) === "") await reason.selectOption({ index: 1 });
  await modal.getByRole("button", { name: /^(Confirm|Bekräfta)$/ }).click();
};

type Sent = { method: string; path: string; body: Record<string, unknown> | null };
type Tools = Record<"presets" | "groups" | "radar-zones" | "radar-rules" | "events", Array<Record<string, unknown>>>;
const ID_KEY = { presets: "presetId", groups: "groupId", "radar-zones": "radarZoneId", "radar-rules": "ruleId", events: "eventId" } as const;

/** /admin/dispatch/* (contract.json#dispatchTools) in memory, with versions, plus the trip's nearby drivers and sends. */
async function fakeTools(page: Page) {
  const at = "2026-10-31T09:00:00Z";
  const tools: Tools = {
    presets: [
      { presetId: "prs_se", country: "SE", name: "Weekend nights", values: { radar: { on: true, drivers: 9, seconds: 15, then: "widen_then_exclusive" } }, version: 1, createdAt: at, updatedAt: at, createdBy: "A1" },
      { presetId: "prs_fr", country: "FR", name: "Soirées Paris", values: {}, version: 1, createdAt: at, updatedAt: at },
    ],
    groups: [{ groupId: "grp_night", country: "SE", name: "Night drivers", driverIds: ["D1001"], version: 1, createdAt: at, updatedAt: at }],
    "radar-zones": [{ radarZoneId: "rz_city", country: "SE", zoneId: "Z001", name: "City core", polygon: RING, version: 1, createdAt: at, updatedAt: at }],
    "radar-rules": [{ ruleId: "rr_fast", country: "SE", name: "Fast repeat", radarZoneIds: ["rz_city"], seconds: 20, maxDrivers: 5, repeat: true, version: 1, createdAt: at, updatedAt: at }],
    events: [],
  };
  const sent: Sent[] = [];
  const sends: Sent[] = [];
  let seq = 0;
  await page.route(/\/api\/v1\/admin\/dispatch\//, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(request.url());
    const parts = url.pathname.replace("/api/v1/admin/dispatch/", "").split("/");
    const kind = parts[0] as keyof Tools;
    const id = parts[1] ? decodeURIComponent(parts[1]) : null;
    const body = (request.postDataJSON?.() ?? null) as Record<string, unknown> | null;
    if (request.method() !== "GET") sent.push({ method: request.method(), path: url.pathname + url.search, body });
    if (parts[2] === "free") return json(route, 200, { radarZoneId: id, free: 2, at });
    const list = tools[kind];
    if (!list) return json(route, 404, { code: "not_found", message: "No.", requestId: "r", retryable: false });
    const key = ID_KEY[kind];
    if (request.method() === "GET") return json(route, 200, { items: list });
    if (request.method() === "POST") {
      const item = { ...body, [key]: `${kind.slice(0, 3)}_new${++seq}`, version: 1, createdAt: at, updatedAt: at, ...(kind === "radar-zones" ? { country: "SE" } : {}) };
      list.push(item);
      return json(route, 201, item);
    }
    const index = list.findIndex((item) => item[key] === id);
    if (index < 0) return json(route, 404, { code: "not_found", message: "No.", requestId: "r", retryable: false });
    const current = list[index]!;
    const expected = request.method() === "DELETE" ? Number(url.searchParams.get("expectedVersion")) : Number(body?.["expectedVersion"]);
    if (expected !== current["version"]) return json(route, 409, { code: "version_mismatch", message: "Stale.", requestId: "r", retryable: false, projection: current });
    if (request.method() === "DELETE") {
      list.splice(index, 1);
      return json(route, 204);
    }
    const { expectedVersion: _drop, ...change } = body ?? {};
    void _drop;
    list[index] = { ...current, ...change, version: Number(current["version"]) + 1, updatedAt: at };
    return json(route, 200, list[index]);
  });
  await page.route(/\/api\/v1\/admin\/trips\/[^/]+\/(nearby-drivers|assign|radar-group|radar-zone\/stop)(\?.*)?$/, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(request.url());
    if (url.pathname.endsWith("/nearby-drivers")) {
      return json(route, 200, { scope: "zone", items: [{ driverId: "D1001", firstName: "Anna", onlineStatus: "online", location: { lat: 59.333, lng: 18.064, measuredAt: new Date().toISOString() }, distanceMeters: 900, pickupEtaSeconds: 180, zoneId: "Z001", categoryIds: ["standard"] }] });
    }
    const body = (request.postDataJSON?.() ?? null) as Record<string, unknown> | null;
    sends.push({ method: request.method(), path: url.pathname, body });
    if (url.pathname.endsWith("/radar-zone/stop")) return json(route, 200, { sendId: "rzs_1", tripId: "T2003", radarZoneId: "rz_city", ruleId: "rr_fast", seconds: 20, maxDrivers: 5, repeat: true, active: false, rounds: 2, startedAt: at, stoppedAt: at, stopReason: "admin" });
    if (url.pathname.endsWith("/radar-group")) {
      const zone = Boolean(body?.["radarZoneId"]);
      return json(route, 200, { groupId: "rg_1", tripId: "T2003", offers: [], expiresAt: new Date(Date.now() + 20_000).toISOString(), projection: { ...SEARCHING, status: "offered", version: 3 }, pickedFrom: zone ? "radar_zone" : "group", ...(zone ? { radarZoneSend: { sendId: "rzs_1", tripId: "T2003", radarZoneId: "rz_city", ruleId: "rr_fast", seconds: 20, maxDrivers: 5, repeat: true, active: true, rounds: 1, startedAt: at } } : {}) });
    }
    return json(route, 200, { ...SEARCHING, status: "offered", version: 3 });
  });
  return { tools, sent, sends };
}

async function open(page: Page, path: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fakeTripServer(page, { admin: G4_ADMIN, trips: [{ ...SEARCHING }] as never });
  const settings = await fakeSettings(page);
  const server = await fakeTools(page);
  // Södermalm (Z002) has its own documents on the server: raise limit 1.5×, rider rating off.
  const dispatch = settings.docs.get("dispatch:Z002")!;
  settings.docs.set("dispatch:Z002", { ...dispatch, document: { ...dispatch.document, raisePrice: { maxFactor: 1.5 } } });
  const driver = settings.docs.get("driver_app_config:Z002")!;
  const offers = (driver.document["offers"] ?? {}) as Record<string, unknown>;
  settings.docs.set("driver_app_config:Z002", { ...driver, document: { ...driver.document, offers: { ...offers, offerCard: { ...((offers["offerCard"] ?? {}) as object), riderRating: false } } } });
  await signIn(page, "Dashboard");
  await page.goto(path);
  return { settings, ...server };
}

test("G4-E4 and decision 3: the zone's rider raise limit and rider rating switch come from the server, and the limit is saved with the dispatch document", async ({ page }) => {
  const { settings } = await open(page, "/dispatch?zone=Z002");
  const raise = page.getByRole("region", { name: "Rider raise limit" });
  await expect(raise.getByLabel("Rider raise limit")).toHaveValue("1.5");
  await expect(raise).toContainText("From 1× to 3×.");
  await expect(page.getByRole("region", { name: "Offer card" }).getByLabel("Show rider rating on offers on")).not.toBeChecked();
  await shot(page, "live-dispatch-raise-limit-rating");
  await raise.getByLabel("Rider raise limit").fill("2.5");
  const bar = page.getByRole("region", { name: "Publish" });
  await bar.getByRole("button", { name: "Publish now" }).click();
  await confirm(page);
  await expect.poll(() => settings.sent.filter((s) => s.method === "POST").map((s) => s.path)).toContain("/api/v1/admin/config/dispatch/publish");
  const put = settings.sent.find((s) => s.method === "PUT" && s.path.endsWith("/admin/config/dispatch"))!;
  expect((put.body!["document"] as Record<string, unknown>)["raisePrice"]).toEqual({ maxFactor: 2.5 });
  expect(put.body!["zoneId"]).toBe("Z002");
});

test("G4-E2/E3/E7: Radar shows the contract's rule text with 10 (hand-sent offers count); Exclusive has no reasons editor", async ({ page }) => {
  await open(page, "/dispatch/radar?zone=Z001");
  const offline = page.getByRole("region", { name: "Go offline automatically" });
  await expect(offline).toContainText("The driver goes offline after 10 missed or declined Exclusive or hand-sent offers in a row (Radar does not count).");
  await expect(page.getByLabel("Offline after offers not accepted")).toHaveValue("10");
  await page.goto("/dispatch/radar?tab=exclusive&zone=Z001");
  await expect(page.getByRole("region", { name: "Exclusive" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Exclusive reasons" })).toHaveCount(0);
  await expect(page.getByText("Not connected yet")).toHaveCount(0);
});

test("G4-F1/F5: no 'Waiting for a second admin' box or History badge, History stays; no Cancel checks on live; Events & groups is there", async ({ page }) => {
  await open(page, "/dispatch?zone=Z001");
  const views = page.getByRole("tablist", { name: "Dispatch sections" });
  await expect(views.getByRole("tab", { name: "History" })).toHaveText("History");
  await expect(views.getByRole("tab", { name: "Events & groups" })).toBeVisible();
  await expect(views.getByRole("tab", { name: "Cancel checks" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Waiting for a second admin" })).toHaveCount(0);
  await page.goto("/dispatch?view=cancels");
  await expect(page.getByRole("tablist", { name: "Dispatch sections" }).getByRole("tab", { name: "Rules" })).toHaveAttribute("aria-selected", "true");
  await page.goto("/dispatch?view=history");
  await expect(page.getByRole("heading", { name: "Published versions" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Waiting for a second admin" })).toHaveCount(0);
});

test("G4-F2: saved presets of the country come from the server; Save, Rename and Delete go to it with the version", async ({ page }) => {
  const { sent } = await open(page, "/dispatch?zone=Z001");
  await page.getByRole("button", { name: "Presets" }).click();
  const dialog = page.locator(".modal.open");
  const list = dialog.getByRole("list", { name: "Presets" });
  await expect(list).toContainText("Busy city");
  await expect(list).toContainText("Weekend nights");
  await expect(list).not.toContainText("Soirées Paris");
  await shot(page, "live-presets");
  await dialog.getByLabel("Preset name").fill("Rainy days");
  await dialog.getByRole("button", { name: "Save preset" }).click();
  await confirm(page);
  await expect.poll(() => sent.filter((s) => s.method === "POST" && s.path.endsWith("/presets")).length).toBe(1);
  const created = sent.find((s) => s.method === "POST" && s.path.endsWith("/presets"))!;
  expect(created.body).toMatchObject({ country: "SE", name: "Rainy days" });
  expect(Object.keys(created.body!["values"] as object)).toEqual(expect.arrayContaining(["radar", "exclusive", "raisePrice"]));
  expect(created.body!["values"]).not.toHaveProperty("zoneId");
  await expect(list).toContainText("Rainy days");
  await dialog.getByRole("button", { name: "Rename Weekend nights" }).click();
  await dialog.getByLabel("New name for Weekend nights").fill("Late nights");
  await dialog.getByRole("button", { name: "Save name" }).click();
  await confirm(page);
  await expect.poll(() => sent.find((s) => s.method === "PUT" && s.path.endsWith("/presets/prs_se"))?.body).toMatchObject({ expectedVersion: 1, name: "Late nights" });
  await expect(list).toContainText("Late nights");
  await dialog.getByRole("button", { name: "Delete Late nights" }).click();
  await confirm(page);
  await expect.poll(() => sent.some((s) => s.method === "DELETE" && s.path.endsWith("/presets/prs_se?expectedVersion=2"))).toBe(true);
  await expect(list).not.toContainText("Late nights");
});

test("G4-F3/F4: driver groups and radar zones are the server's; new and deleted groups go to it; the radar zone shows the server's free count", async ({ page }) => {
  const { sent } = await open(page, "/dispatch/radar?zone=Z001");
  const groups = page.getByRole("region", { name: "Driver groups" });
  await expect(groups).toContainText("Night drivers");
  const zones = page.getByTestId("radar-zones");
  await expect(zones).toContainText("City core");
  await expect(page.getByTestId("radar-zone-free-rz_city")).toContainText("2 free");
  // A rule lists the radar zone, so it cannot be removed before the rule changes (the server would refuse it).
  await expect(zones.getByRole("button", { name: "Remove City core" })).toBeDisabled();
  await expect(page.getByTestId("radar-zone-rules")).toContainText("Fast repeat");
  await expect(page.getByTestId("radar-zone-rules")).toContainText("sends again by itself");
  await shot(page, "live-radar-zones-groups");
  await groups.getByRole("button", { name: "New group" }).click();
  await groups.getByLabel("Group name").fill("Airport team");
  await groups.getByRole("button", { name: "Save group" }).click();
  await confirm(page);
  await expect.poll(() => sent.find((s) => s.method === "POST" && s.path.endsWith("/groups"))?.body).toMatchObject({ country: "SE", name: "Airport team", driverIds: [] });
  await expect(groups).toContainText("Airport team");
  await groups.getByRole("button", { name: "Delete Night drivers" }).click();
  await confirm(page);
  await expect.poll(() => sent.some((s) => s.method === "DELETE" && s.path.endsWith("/groups/grp_night?expectedVersion=1"))).toBe(true);
  await expect(groups).not.toContainText("Night drivers");
});

test("G4-F3/F4 send: Driver groups sends the groupId (the server picks); Radar zones sends the zone with its rule, then 'sending again' with Stop", async ({ page }) => {
  const { sends } = await open(page, "/dispatch?view=live");
  await page.getByRole("button", { name: /^Nearby drivers for / }).first().click();
  const panel = page.getByTestId("assign-panel");
  await expect(panel).toBeVisible();
  const picker = panel.getByTestId("radar-target");
  await picker.getByRole("button", { name: "Driver groups" }).click();
  await expect(picker.getByTestId("radar-server-picks")).toContainText("The free drivers of the group get it, nearest first, up to 10.");
  // A radar send asks no reason (contract command admin.trip.radarGroup): it goes at once.
  await panel.getByTestId("radar-sender").getByRole("button", { name: /Send radar/ }).click();
  await expect.poll(() => sends.find((s) => s.path.endsWith("/radar-group"))?.body).toMatchObject({ expectedVersion: 2, groupId: "grp_night" });
  expect(sends.find((s) => s.path.endsWith("/radar-group"))!.body).not.toHaveProperty("driverIds");

  await picker.getByRole("button", { name: "Radar zones" }).click();
  await expect(picker).toContainText("City core");
  await expect(picker).toContainText("sends again by itself");
  await panel.getByTestId("radar-sender").getByRole("button", { name: /Send radar/ }).click();
  await expect.poll(() => sends.filter((s) => s.path.endsWith("/radar-group")).length).toBe(2);
  expect(sends.filter((s) => s.path.endsWith("/radar-group"))[1]!.body).toMatchObject({ radarZoneId: "rz_city", ruleId: "rr_fast" });
  const repeat = panel.getByTestId("radar-repeat");
  await expect(repeat).toContainText("City core: sending again every 20 s to the free drivers inside, newcomers too");
  await shot(page, "live-radar-repeat");
  await repeat.getByRole("button", { name: "Stop" }).click();
  await expect.poll(() => sends.some((s) => s.path.endsWith("/radar-zone/stop"))).toBe(true);
  await expect(panel.getByTestId("radar-repeat")).toHaveCount(0);
  await expect(page.getByText("Not connected yet")).toHaveCount(0);
});

test("G4-F6: an event is made with its pin, local times and sv/fr/en texts and goes to the server in UTC; no driver bonus shortcut on live", async ({ page }) => {
  const { sent } = await open(page, "/dispatch?view=events");
  await page.getByRole("button", { name: "New event" }).click();
  const editor = page.getByRole("region", { name: "Event" });
  await expect(editor.getByRole("button", { name: /Also make a driver bonus/ })).toHaveCount(0);
  await editor.getByLabel("Event name").fill("Football final");
  await editor.getByLabel("Event starts").fill("2026-11-07T20:00");
  await editor.getByLabel("Event ends").fill("2026-11-07T23:30");
  await expect(editor.getByRole("alert")).toContainText("Put the event's pin on the map.");
  await editor.getByLabel("Event latitude").fill("59.3725");
  await editor.getByLabel("Event longitude").fill("18.0002");
  for (const [lang, title, text] of [["sv", "Fotbollsfinal", "Match på arenan"], ["fr", "Finale de football", "Match à l’arène"], ["en", "Football final", "Match at the arena"]] as const) {
    await editor.getByLabel(`Title for drivers (${lang})`).fill(title);
    await editor.getByLabel(`Description for drivers (${lang})`).fill(text);
  }
  await expect(editor.getByRole("alert")).toHaveCount(0);
  await shot(page, "live-event-editor");
  await editor.getByRole("button", { name: "Save event" }).click();
  await confirm(page);
  await expect.poll(() => sent.find((s) => s.method === "POST" && s.path.endsWith("/events"))?.body).toMatchObject({
    country: "SE", name: "Football final", location: { lat: 59.3725, lng: 18.0002 }, startsAt: "2026-11-07T19:00:00.000Z", endsAt: "2026-11-07T22:30:00.000Z", on: true,
    details: { title: { sv: "Fotbollsfinal", fr: "Finale de football", en: "Football final" }, description: { en: "Match at the arena" } },
  });
  const list = page.getByRole("list", { name: "Events" });
  await expect(list).toContainText("Football final");
  await expect(list).toContainText("2026-11-07 20:00");
  await page.getByRole("button", { name: "Football final on" }).click();
  await confirm(page);
  await expect.poll(() => sent.find((s) => s.method === "PUT" && s.path.includes("/events/"))?.body).toMatchObject({ expectedVersion: 1, on: false });
  void API;
});
