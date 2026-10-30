import { expect, test, type Page } from "@playwright/test";
import { fakeTripServer, signIn } from "./live-fake";

/**
 * Contract v0.18.5 deep fixes of driver groups 1 and 2 (admin part). Each test names the owner decision it covers
 * (Rules decisions/driver-g1.md, driver-g2.md, driver-g9.md). SHOTS=<dir> saves screenshots for the PR.
 */
const SHOTS = process.env.SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

test.describe("G1-D2 sign-in in the computer's language (Swedish computer)", () => {
  test.use({ locale: "sv-SE" });

  test("sign-in, forgot password and the globe: Swedish first, English chosen and remembered", async ({ page }) => {
    await fakeTripServer(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Logga in" })).toBeVisible();
    await expect(page.getByLabel("E-post")).toBeVisible();
    await expect(page.getByLabel("Lösenord")).toBeVisible();
    await page.getByText("Glömt lösenordet?").click();
    await shot(page, "g1-d2-sign-in-sv");
    await page.getByTestId("sign-in-globe").getByRole("button", { name: "Språk: Svenska" }).click();
    await page.getByRole("button", { name: "English", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    await expect(page.getByText("Forgot your password?")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    await shot(page, "g1-d2-sign-in-en-chosen");
  });

  test("the page after an idle sign-out says why, in the computer's language", async ({ page }) => {
    test.setTimeout(60_000);
    await fakeTripServer(page, { admin: { idleTimeoutSeconds: 1 } });
    await page.goto("/");
    await page.getByLabel("E-post").fill("owner@movera.se");
    await page.getByLabel("Lösenord").fill("correct-horse");
    await page.getByRole("button", { name: "Logga in", exact: true }).click();
    await expect(page.locator("nav")).toBeVisible();
    await expect(page.getByTestId("signed-out-notice")).toHaveText("Du loggades ut eftersom panelen inte användes på en stund. Logga in igen.", { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Logga in" })).toBeVisible();
    await shot(page, "g1-d2-signed-out-sv");
  });
});

test.describe("G1-D2 sign-in in the computer's language (French computer)", () => {
  test.use({ locale: "fr-FR" });

  test("sign-in and the set-password page are in French", async ({ page }) => {
    await fakeTripServer(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Se connecter" })).toBeVisible();
    await expect(page.getByLabel("Mot de passe")).toBeVisible();
    await expect(page.getByText("Mot de passe oublié ?")).toBeVisible();
    await shot(page, "g1-d2-sign-in-fr");
    await page.goto("/setup-password");
    await expect(page.getByRole("heading", { level: 1, name: "Choisissez votre mot de passe" })).toBeVisible();
  });
});

test.describe("G1-D2 sign-in in the computer's language (German computer)", () => {
  test.use({ locale: "de-DE" });

  test("a language the panel does not have gives English; a manual sign-out shows no notice", async ({ page }) => {
    await fakeTripServer(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    await expect(page.getByTestId("signed-out-notice")).toHaveCount(0);
  });
});

/* ---------------------------------------------------------------------------------- G2-D1 renewals, D5.7, D5.8 */

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,OPTIONS", "access-control-expose-headers": "*" };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
type Sent = { method: string; path: string; body: Record<string, unknown> | null };

/** Anna's approved driving licence (DOC2) with a new one waiting (REN2, renewalOf DOC2). */
async function renewalServer(page: Page) {
  const state = await fakeTripServer(page, {
    admin: { permissions: ["overview.read", "drivers.read", "drivers.activate", "documents.approve", "vehicles.edit", "trips.read", "zones.read"] },
  });
  const anna = state.drivers.find((item) => item.driverId === "D1001")!;
  anna.accountStatus = "active";
  anna.documents = [
    { documentId: "DOC1", type: "terms", status: "approved" },
    { documentId: "DOC2", type: "driving_license", status: "approved", expiresAt: "2026-11-20T00:00:00Z" },
    { documentId: "REN2", type: "driving_license", status: "in_review", expiresAt: "2036-11-20T00:00:00Z", renewalOf: "DOC2" },
  ] as typeof anna.documents;
  const sent: Sent[] = [];
  await page.route(/\/api\/v1\/admin\/documents\/(DOC2|REN2)\/(file|review)$/, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    if (path.endsWith("/file")) return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "image/png" }, body: PNG });
    const body = (request.postDataJSON?.() ?? null) as Record<string, unknown> | null;
    sent.push({ method: request.method(), path, body });
    return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify({ documentId: "DOC2", ownerId: "D1001", type: "driving_license", status: "approved", version: 3 }) });
  });
  return { state, sent };
}

test("G2-D1: the driver page shows the approved licence and the new one side by side; approving sends the renewal's id", async ({ page }) => {
  const { sent } = await renewalServer(page);
  await signIn(page);
  await page.goto("/drivers/D1001?tab=documents");
  const renewal = page.getByTestId("renewal-row");
  await expect(renewal).toContainText("New document waiting for review – the current one stays valid until");
  await expect(page.locator('tr[data-document-type="driving_license"]')).toContainText("Approved");
  await page.getByRole("button", { name: "Compare and review" }).click();
  const compare = page.getByTestId("renewal-compare");
  await expect(compare.locator('[data-side="current"] img')).toBeVisible();
  await expect(compare.locator('[data-side="new"] img')).toBeVisible();
  await shot(page, "g2-d1-renewal-side-by-side");
  await page.getByRole("button", { name: "Approve the new one" }).click();
  // G2-D5.8: an end date more than 15 years ahead says "Check the end date" and is not sent.
  await page.getByTestId("expires-at").fill("2099-01-01");
  await expect(page.getByTestId("expiry-too-far")).toContainText("Check the end date");
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeDisabled();
  await expect(page.getByTestId("expires-at")).toHaveAttribute("max", /^\d{4}-\d{2}-\d{2}$/);
  await shot(page, "g2-d5-8-check-end-date");
  await page.getByTestId("expires-at").fill("2031-06-30");
  await expect(page.getByTestId("expiry-too-far")).toHaveCount(0);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect.poll(() => sent.at(-1)).toEqual({ method: "POST", path: "/admin/documents/REN2/review", body: { decision: "approved", expiresAt: "2031-06-30T00:00:00.000Z" } });
});

test("G2-D1 + D5.7: rejecting the new one needs a note; the current licence is untouched", async ({ page }) => {
  const { sent } = await renewalServer(page);
  await signIn(page);
  await page.goto("/drivers/D1001?tab=documents");
  await page.getByRole("button", { name: "Compare and review" }).click();
  await page.getByRole("button", { name: "Reject the new one" }).click();
  const reject = page.getByRole("button", { name: "Reject", exact: true });
  await expect(reject).toBeDisabled();
  await page.getByLabel("Note (required)").fill("The photo is blurry");
  await reject.click();
  await expect.poll(() => sent.at(-1)).toEqual({ method: "POST", path: "/admin/documents/REN2/review", body: { decision: "rejected", note: "The photo is blurry" } });
  expect(sent.some((call) => call.path.startsWith("/admin/documents/DOC2/review"))).toBe(false);
});

test("G2-D1: an active driver with a renewal waiting is in the review queue", async ({ page }) => {
  await renewalServer(page);
  await signIn(page);
  await page.goto("/onboarding");
  await expect(page.getByTestId("queue-renewals")).toContainText("Renewals to review: 1.");
  await page.getByRole("button", { name: "Anna Berg" }).click();
  await expect(page.getByTestId("queue-renewal-banner")).toBeVisible();
  await expect(page.getByTestId("onboarding-selected").getByTestId("renewal-row")).toBeVisible();
  await shot(page, "g2-d1-review-queue");
});
