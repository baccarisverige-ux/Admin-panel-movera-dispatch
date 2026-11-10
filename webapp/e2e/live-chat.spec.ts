import { expect, test, type Page, type Route } from "@playwright/test";
import { ADMIN, API, fakeTripServer, signIn } from "./live-fake";

/**
 * Contract v0.13.0 §22: Admin › Chat in a live build reads and writes the trip chats (GET|POST
 * /trips/{tripId}/messages) of the trips in the admin's zones, only with support.reply. The chat closes for the
 * rider and the driver at drop-off; support may still write.
 * v0.18.56 §78 (G9-2.16): the list is GET /admin/chats — only open trips (chat.openStatuses) with at least one message,
 * newest message first, first names and counts, never a text or a phone. A finished trip leaves the list; its chat is
 * read on the trip page.
 */

const SUPPORT = [...ADMIN.permissions, "support.reply"];
const HEADERS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS", "content-type": "application/json" };

type Message = { messageId: string; tripId: string; from: string; text: string; at: string };

async function fakeMessages(page: Page, outOfZone: string[] = []) {
  const messages: Message[] = [
    { messageId: "msg1", tripId: "T2002", from: "rider", text: "Jag står vid entrén.", at: "2026-10-26T09:12:00Z" },
    { messageId: "msg2", tripId: "T2002", from: "driver", text: "Jag är där om två minuter.", at: "2026-10-26T09:13:00Z" },
    { messageId: "msg3", tripId: "T2001", from: "rider", text: "Tack för resan!", at: "2026-10-25T08:30:00Z" },
  ];
  const posts: { tripId: string; body: unknown; key?: string }[] = [];
  // The fake trips (live-fake.ts): T2001 completed, T2002 in_trip (driver Anna, rider without first name), T2003 cancelled without a driver.
  const trips: Record<string, { status: string; zoneId: string; riderFirstName: string | null; driverFirstName: string | null }> = {
    T2001: { status: "completed", zoneId: "Z001", riderFirstName: null, driverFirstName: "Anna" },
    T2002: { status: "in_trip", zoneId: "Z001", riderFirstName: null, driverFirstName: "Anna" },
    T2003: { status: "cancelled_by_rider", zoneId: "Z001", riderFirstName: null, driverFirstName: null },
  };
  const OPEN = ["accepted", "driver_to_pickup", "arrived", "rider_onboard", "in_trip", "approaching_dropoff"];
  const listAsked: string[] = [];
  await page.route(`${API}/api/v1/admin/chats*`, async (route: Route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: HEADERS });
    listAsked.push(new URL(request.url()).search);
    const items = Object.entries(trips).flatMap(([tripId, trip]) => {
      const own = messages.filter((item) => item.tripId === tripId);
      if (!OPEN.includes(trip.status) || !own.length) return [];
      const last = own.reduce((a, b) => (a.at > b.at ? a : b));
      return [{ tripId, ...trip, messageCount: own.length, lastMessageAt: last.at, lastFrom: last.from }];
    }).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
    return route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify({ items, nextCursor: null }) });
  });
  await page.route(`${API}/api/v1/trips/*/messages*`, async (route: Route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: HEADERS });
    const tripId = decodeURIComponent(new URL(request.url()).pathname.split("/")[4]);
    if (outOfZone.includes(tripId)) return route.fulfill({ status: 403, headers: HEADERS, body: JSON.stringify({ code: "forbidden", message: "This trip is outside your zones.", reason: "zone_out_of_scope", requestId: "r-403" }) });
    if (request.method() === "POST") {
      const body = request.postDataJSON() as { text: string };
      posts.push({ tripId, body, key: request.headers()["idempotency-key"] });
      const message = { messageId: `msg${messages.length + 1}`, tripId, from: "support", text: body.text, at: "2026-10-26T09:21:00Z" };
      messages.push(message);
      return route.fulfill({ status: 201, headers: HEADERS, body: JSON.stringify(message) });
    }
    return route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify({ items: messages.filter((item) => item.tripId === tripId), nextCursor: null }) });
  });
  return { messages, posts, listAsked, trips };
}

test("chat: support reads and writes the trip chats of its zones; closed after drop-off", async ({ page }) => {
  await fakeTripServer(page, { admin: { permissions: SUPPORT } });
  const chat = await fakeMessages(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await page.getByRole("link", { name: "Chat", exact: true }).click();
  await expect(page.getByTestId("live-chat")).toBeVisible();
  const trips = page.getByTestId("live-chat-trips");
  // §78: only open trips with messages — T2002; the finished T2001 and the cancelled T2003 (no driver) are not listed.
  await expect(trips.getByRole("listitem")).toHaveCount(1);
  await expect(trips.getByRole("listitem").first()).toContainText("T2002");
  await expect(trips).not.toContainText("T2001");
  await expect(trips).not.toContainText("T2003");
  await expect(trips.getByRole("listitem").first()).toContainText("2 messages");
  await expect(trips.getByRole("listitem").first()).toContainText("Last: Anna");
  await expect(trips).not.toContainText("Jag står vid entrén.");
  expect(chat.listAsked.length).toBeGreaterThan(0);
  // G9 live 2026-11-02: titled by names ("Rider – Anna"), not the raw trip id; no "Not connected yet" badge.
  await expect(trips.getByRole("listitem").first().locator("b")).toHaveText("Rider – Anna");
  await expect(page.getByTestId("not-connected")).toHaveCount(0);
  const thread = page.getByTestId("live-chat-thread");
  await expect(thread).toContainText("Jag står vid entrén.");
  await expect(thread).toContainText("Jag är där om två minuter.");
  await expect(thread).not.toContainText("+46");
  await thread.getByLabel("Message as Support").fill("Hej, Support här.");
  await thread.getByRole("button", { name: "Send" }).click();
  await expect(thread).toContainText("Hej, Support här.");
  expect(chat.posts).toEqual([{ tripId: "T2002", body: { text: "Hej, Support här." }, key: expect.any(String) }]);
  // After the send the list is read again: Support wrote last.
  await expect(trips.getByRole("listitem").first()).toContainText("Last: Support");
  await expect(trips.getByRole("listitem").first()).toContainText("3 messages");
  // The trip is open: no "trip has ended" line.
  await expect(thread).not.toContainText("The trip has ended");
  // Drop-off: the trip is no longer open, so it leaves the chat list on the next read (its chat stays on the trip page).
  chat.trips.T2002!.status = "completed";
  await page.reload();
  await expect(page.getByTestId("live-chat")).toContainText("No trip chats in your zones.");
});

test("chat: a trip outside the admin's zones is refused by the server and said so", async ({ page }) => {
  await fakeTripServer(page, { admin: { permissions: SUPPORT } });
  await fakeMessages(page, ["T2002"]);
  await signIn(page);
  await page.goto("/chat");
  await expect(page.getByTestId("live-chat-thread").getByRole("alert")).toBeVisible();
});

test("chat: hidden for an admin without support.reply", async ({ page }) => {
  await fakeTripServer(page);
  const chat = await fakeMessages(page);
  await signIn(page);
  await expect(page.getByRole("link", { name: "Chat", exact: true })).toHaveCount(0);
  await page.goto("/chat");
  await expect(page.getByRole("heading", { level: 2, name: "No access" })).toBeVisible();
  await expect(page.getByTestId("live-chat")).toHaveCount(0);
  expect(chat.posts).toHaveLength(0);
});

test("chat: Swedish screenshot", async ({ page }) => {
  test.skip(!process.env.CHAT_SHOTS, "screenshots only on request");
  await fakeTripServer(page, { admin: { permissions: SUPPORT, language: "sv" } });
  await fakeMessages(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "Kontrollpanel");
  await page.goto("/chat");
  await expect(page.getByTestId("live-chat-thread")).toContainText("Jag är där om två minuter.");
  await page.screenshot({ path: `${process.env.CHAT_SHOTS}/admin-live-chat-sv.png` });
});
