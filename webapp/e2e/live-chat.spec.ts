import { expect, test, type Page, type Route } from "@playwright/test";
import { ADMIN, API, fakeTripServer, signIn } from "./live-fake";

/**
 * Contract v0.13.0 §22: Admin › Chat in a live build reads and writes the trip chats (GET|POST
 * /trips/{tripId}/messages) of the trips in the admin's zones, only with support.reply. The chat closes for the
 * rider and the driver at drop-off; support may still write.
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
  return { messages, posts };
}

test("chat: support reads and writes the trip chats of its zones; closed after drop-off", async ({ page }) => {
  await fakeTripServer(page, { admin: { permissions: SUPPORT } });
  const chat = await fakeMessages(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await page.getByRole("link", { name: "Chat", exact: true }).click();
  await expect(page.getByTestId("live-chat")).toBeVisible();
  const trips = page.getByTestId("live-chat-trips");
  // Trips that had a driver: the open chat first; the cancelled trip without a driver has none.
  await expect(trips.getByRole("listitem")).toHaveCount(2);
  await expect(trips.getByRole("listitem").first()).toContainText("T2002");
  await expect(trips).not.toContainText("T2003");
  const thread = page.getByTestId("live-chat-thread");
  await expect(thread).toContainText("Jag står vid entrén.");
  await expect(thread).toContainText("Jag är där om två minuter.");
  await expect(thread).not.toContainText("+46");
  await thread.getByLabel("Message as Support").fill("Hej, Support här.");
  await thread.getByRole("button", { name: "Send" }).click();
  await expect(thread).toContainText("Hej, Support här.");
  expect(chat.posts).toEqual([{ tripId: "T2002", body: { text: "Hej, Support här." }, key: expect.any(String) }]);
  await trips.getByRole("button", { name: /T2001/ }).click();
  await expect(thread).toContainText("Tack för resan!");
  await expect(thread).toContainText("The trip has ended: the rider and the driver can no longer write. Support can still answer.");
  await expect(thread.getByLabel("Message as Support")).toBeEnabled();
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
