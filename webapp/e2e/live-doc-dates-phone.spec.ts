import { devices, expect, test, type Page } from "@playwright/test";
import { fakeTripServer, signIn } from "./live-fake";

/**
 * Doc-dates bug (owner 2026-11-24, on his iPhone): "admin can't write the dates of issue and expiry, and can only
 * confirm documents without dates". The date box opens the phone's number pad (inputmode numeric), which has no
 * "/" key: the digits never became a date and the box was emptied on leaving it. Here the admin types digits only,
 * as on the number pad, on an iPhone-sized touch screen; the dates are sent. (WebKit: run with PW_WEBKIT=1 where
 * the WebKit build is installed; the iPhone profile's size, touch and mobile flags are used either way.)
 */
const { defaultBrowserType: _browser, ...iphone } = devices["iPhone 15"];
test.use(process.env.PW_WEBKIT ? { ...devices["iPhone 15"] } : iphone);

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,OPTIONS", "access-control-expose-headers": "*" };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

async function licenceInReview(page: Page) {
  const state = await fakeTripServer(page, { admin: { permissions: ["overview.read", "drivers.read", "drivers.activate", "documents.approve", "vehicles.edit", "trips.read", "zones.read"] } } as never);
  const anna = state.drivers.find((item) => item.driverId === "D1001")!;
  anna.documents = [{ documentId: "DOC2", type: "driving_license", status: "in_review" }] as typeof anna.documents;
  const sent: unknown[] = [];
  await page.route(/\/api\/v1\/admin\/documents\/DOC2\/(file|review)$/, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    if (request.url().endsWith("/file")) return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "image/png" }, body: PNG });
    sent.push(request.postDataJSON());
    return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify({ documentId: "DOC2", ownerId: "D1001", type: "driving_license", status: "approved", version: 2 }) });
  });
  return sent;
}

test("iPhone: open the licence, type issue and expiry dates as digits on the number pad, approve; both dates are sent", async ({ page }) => {
  const sent = await licenceInReview(page);
  await signIn(page);
  await page.goto("/drivers/D1001?tab=documents");
  await page.locator('tr[data-document-type="driving_license"]').getByRole("button", { name: "Open" }).tap();
  await page.getByRole("dialog").getByRole("button", { name: "Approve" }).tap();
  const issued = page.getByTestId("issued-at");
  await issued.tap();
  await page.keyboard.type("01022024");
  await expect(issued).toHaveValue("01/02/2024");
  const expires = page.getByTestId("expires-at");
  await expires.tap();
  await page.keyboard.type("01022030");
  await expect(expires).toHaveValue("01/02/2030");
  await page.getByRole("button", { name: "Approve", exact: true }).last().tap();
  await expect.poll(() => sent.at(-1)).toEqual({ decision: "approved", issuedAt: "2024-02-01T00:00:00.000Z", expiresAt: "2030-02-01T00:00:00.000Z" });
});

test("iPhone: a date that is not a day stays in the box, is said, and Approve waits", async ({ page }) => {
  const sent = await licenceInReview(page);
  await signIn(page);
  await page.goto("/drivers/D1001?tab=documents");
  await page.locator('tr[data-document-type="driving_license"]').getByRole("button", { name: "Approve" }).tap();
  const expires = page.getByTestId("expires-at");
  await expires.tap();
  await page.keyboard.type("3102");
  await page.getByTestId("issued-at").tap();
  await expect(expires).toHaveValue("3102");
  await expect(page.getByTestId("date-input-bad")).toContainText("Not a date");
  await expect(page.getByRole("button", { name: "Approve", exact: true }).last()).toBeDisabled();
  expect(sent).toEqual([]);
});
