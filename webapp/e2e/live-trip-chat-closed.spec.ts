import { expect, test, type Route } from "@playwright/test";
import { ADMIN, API, fakeTripServer, signIn } from "./live-fake";

/**
 * Contract §22 / v0.18.56 §78: a finished trip leaves Admin › Chat; its chat is read on the trip page. When the trip
 * has ended the rider and the driver can no longer write, but support (support.reply) may still write — on the trip page.
 */

const SUPPORT = [...ADMIN.permissions, "support.reply"];
const HEADERS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS", "content-type": "application/json" };

type Message = { messageId: string; tripId: string; from: string; text: string; at: string };

test("trip page chat: a finished trip says it has ended and support can still send", async ({ page }) => {
  await fakeTripServer(page, { admin: { permissions: SUPPORT } });
  // The fake trip T2001 (live-fake.ts) is completed, driver Anna.
  const messages: Message[] = [{ messageId: "msg1", tripId: "T2001", from: "rider", text: "Tack för resan!", at: "2026-10-25T08:30:00Z" }];
  const posts: { tripId: string; body: unknown; key?: string }[] = [];
  await page.route(`${API}/api/v1/trips/*/messages*`, async (route: Route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: HEADERS });
    const tripId = decodeURIComponent(new URL(request.url()).pathname.split("/")[4]);
    if (request.method() === "POST") {
      const body = request.postDataJSON() as { text: string };
      posts.push({ tripId, body, key: request.headers()["idempotency-key"] });
      const message = { messageId: `msg${messages.length + 1}`, tripId, from: "support", text: body.text, at: "2026-10-26T09:21:00Z" };
      messages.push(message);
      return route.fulfill({ status: 201, headers: HEADERS, body: JSON.stringify(message) });
    }
    return route.fulfill({ status: 200, headers: HEADERS, body: JSON.stringify({ items: messages.filter((item) => item.tripId === tripId), nextCursor: null }) });
  });
  await signIn(page);
  await page.goto("/trips/T2001");
  const chat = page.getByTestId("trip-chat");
  await chat.getByRole("button", { name: "Show messages" }).click();
  await expect(chat.getByTestId("trip-chat-messages")).toContainText("Tack för resan!");
  const reply = chat.getByTestId("trip-chat-reply");
  await expect(reply).toContainText("The trip has ended: the rider and the driver can no longer write. Support can still answer.");
  await reply.getByLabel("Message as Support").fill("Hej, Support här.");
  await reply.getByRole("button", { name: "Send" }).click();
  await expect(chat.getByTestId("trip-chat-messages")).toContainText("Hej, Support här.");
  expect(posts).toEqual([{ tripId: "T2001", body: { text: "Hej, Support här." }, key: expect.any(String) }]);
  await expect(reply.getByLabel("Message as Support")).toHaveValue("");
});
