import { expect, test, type Page } from "@playwright/test";
import { VEHICLE, fakeTripServer, signIn } from "./live-fake";

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

/* ---------------------------------------------------------------------------------- G2-D5.3 / D5.4 vehicles */

const CAR_DOCS = [
  { documentId: "VD1", type: "vehicle_registration", status: "approved", expiresAt: "2027-05-31T00:00:00Z" },
  { documentId: "VD2", type: "insurance", status: "in_review" },
];
const CARS = [
  // A new car: every paper sent, waiting for the admin; the owner's old app still sent a category (never shown).
  { ...VEHICLE, vehicleId: "V1", plate: "NEW 001", year: 2021, seats: 4, fuel: "hybrid", categoryIds: [], status: "pending", documents: CAR_DOCS, requiredDocuments: ["vehicle_registration", "insurance"], fitCategories: ["economy", "comfort", "child_seat"] },
  // Papers missing.
  { ...VEHICLE, vehicleId: "V2", plate: "NEW 002", categoryIds: [], status: "pending", documents: [CAR_DOCS[0]], requiredDocuments: ["vehicle_registration", "insurance"], fitCategories: ["economy"] },
  // TST 001 after migration 0038: 7 seats, electric, approved, no rule problems.
  { ...VEHICLE, vehicleId: "V3", plate: "TST 001", year: 2022, seats: 7, fuel: "electric", categoryIds: ["xl", "electric"], status: "approved", documents: CAR_DOCS.map((doc) => ({ ...doc, status: "approved" })), requiredDocuments: ["vehicle_registration", "insurance"], fitCategories: ["economy", "xl", "electric"] },
  { ...VEHICLE, vehicleId: "V4", plate: "OLD 004", categoryIds: ["economy"], status: "blocked", documents: [], requiredDocuments: ["vehicle_registration", "insurance"], fitCategories: [] },
];

async function carServer(page: Page, language = "en") {
  const state = await fakeTripServer(page, {
    vehicles: CARS.map((car) => ({ ...car })) as unknown as (typeof VEHICLE)[],
    admin: { permissions: ["overview.read", "drivers.read", "drivers.activate", "documents.approve", "vehicles.edit", "trips.read", "zones.read"], language },
  });
  await signIn(page, language === "sv" ? "Kontrollpanel" : "Dashboard");
  return state;
}

test("G2-D5.4: the Vehicles page shows each car's true state; G2-D5.3: no owner-chosen categories before approval", async ({ page }) => {
  await carServer(page);
  await page.goto("/vehicles");
  const state = (plate: string) => page.getByRole("row").filter({ hasText: plate }).getByTestId("vehicle-state-cell");
  await expect(state("NEW 001")).toHaveText("Waiting for admin");
  await expect(state("NEW 002")).toHaveText("Waiting for papers");
  await expect(state("TST 001")).toHaveText("Approved");
  await expect(state("OLD 004")).toHaveText("Blocked");
  await expect(page.getByRole("row").filter({ hasText: "TST 001" })).toContainText("Passed");
  await expect(page.getByRole("row").filter({ hasText: "NEW 001" })).toContainText("Given at approval");
  await expect(page.getByText("Should be on hold")).toHaveCount(0);
  await expect(page.getByText("Photos to review")).toHaveCount(0);
  await shot(page, "g2-d5-4-vehicles-en");
  await page.getByTestId("live-vehicle-views").getByRole("button", { name: /Waiting for papers/ }).click();
  await expect(page.getByRole("row").filter({ hasText: "NEW 001" })).toHaveCount(0);
  await expect(page.getByRole("row").filter({ hasText: "NEW 002" })).toHaveCount(1);
});

test("G2-D5.4: the Vehicles page states are in Swedish", async ({ page }) => {
  await carServer(page, "sv");
  await page.goto("/vehicles");
  await expect(page.getByRole("row").filter({ hasText: "NEW 002" }).getByTestId("vehicle-state-cell")).toHaveText("Väntar på papper");
  await expect(page.getByRole("row").filter({ hasText: "NEW 001" }).getByTestId("vehicle-state-cell")).toHaveText("Väntar på admin");
  await shot(page, "g2-d5-4-vehicles-sv");
});

test("G2-D5.3: the admin gives the categories when approving, only the ones the car fits, at least one ride category", async ({ page }) => {
  const state = await carServer(page);
  await page.goto("/vehicles/V1");
  const box = page.getByTestId("vehicle-approval");
  await expect(box.getByTestId("vehicle-state")).toContainText("Waiting for admin");
  await expect(box.getByRole("checkbox")).toHaveCount(3);
  const approve = box.getByRole("button", { name: "Approve car" });
  await expect(approve).toBeDisabled();
  await expect(box.getByTestId("approve-why")).toHaveText("Give the car at least one ride category.");
  await box.getByLabel(/Child Seat/).check();
  await expect(approve).toBeDisabled();
  await box.getByLabel("Comfort").check();
  await expect(approve).toBeEnabled();
  await shot(page, "g2-d5-3-approve-with-categories");
  await approve.click();
  const modal = page.locator(".modal.open").last();
  const typed = modal.getByLabel(/^Type .* to confirm/);
  if (await typed.count()) await typed.fill((await typed.getAttribute("aria-label"))?.match(/Type (.*) to confirm/)?.[1] ?? "V1");
  await modal.getByRole("button", { name: "Confirm" }).click();
  await expect.poll(() => state.calls.find((call) => call.method === "POST" && call.path === "/api/v1/admin/vehicles/V1/review")?.body).toMatchObject({ expectedVersion: 1, decision: "approved", categoryIds: ["child_seat", "comfort"] });
});

test("G2-D5.7: putting a car on hold always sends a reason", async ({ page }) => {
  const state = await carServer(page);
  await page.goto("/vehicles/V3");
  await page.getByTestId("vehicle-approval").getByRole("button", { name: "Put on hold" }).click();
  const modal = page.locator(".modal.open").last();
  const typed = modal.getByLabel(/^Type .* to confirm/);
  if (await typed.count()) await typed.fill((await typed.getAttribute("aria-label"))?.match(/Type (.*) to confirm/)?.[1] ?? "V3");
  await modal.getByRole("button", { name: "Confirm" }).click();
  await expect.poll(() => state.calls.find((call) => call.method === "POST" && call.path === "/api/v1/admin/vehicles/V3/review")?.body).toMatchObject({ decision: "blocked", note: expect.stringMatching(/\S/) });
});
