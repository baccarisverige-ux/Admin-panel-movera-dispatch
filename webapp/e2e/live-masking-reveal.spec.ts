import { expect, test, type Page } from "@playwright/test";
import { API, DRIVER, FLEET, RIDERS, SOS_INCIDENT, fakeTripServer, signIn, type Incident } from "./live-fake";

/**
 * Step 36 (contract v0.18.54 §76, contract.json#adminMasking; owner 2026-11-09 Q40 yes, Q41 yes): the server masks a
 * rider's / driver's phone, e-mail and date of birth (and a fleet's owner e-mail) for admins without the matching
 * viewSensitive right and flags the record `sensitiveMasked: true`. The panel accepts both shapes (a masked phone is
 * plain text, never a tel: link; a year-only date of birth shows the year), shows Reveal with a reason dialog on a
 * masked record (POST …/reveal { reason }, shown for this page view only), and one click on an OPEN SOS case reveals
 * both phones (POST /admin/incidents/{incidentId}/reveal-contacts). Built before the server masks (expand-then-contract).
 */
const MASKED_RIDER = { ...RIDERS[0], phone: "+46•••••01", email: "i•••@example.se", sensitiveMasked: true };
const FULL_RIDER = { ...RIDERS[1] };
const MASKED_DRIVER = { ...DRIVER, email: "a•••@example.se", dateOfBirth: "1990", sensitiveMasked: true } as typeof DRIVER;
const MASKED_FLEET = { ...FLEET, ownerEmail: "b•••@example.se", sensitiveMasked: true } as typeof FLEET;
const SAFETY = ["overview.read", "trips.read", "riders.read", "drivers.read", "zones.read", "incidents.read", "safety.edit"];

/** A cold preview server compiles the lazy pages on first use: wait for the Dashboard longer the first time. */
async function signInWarm(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email").waitFor({ timeout: 60_000 });
  await signIn(page).catch(async () => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 2, name: "Dashboard" })).toBeVisible({ timeout: 60_000 });
  });
}

test.setTimeout(120_000);

test("rider page: a masked phone is text without a tel: link, Reveal with a reason calls the server and shows the full values once", async ({ page }) => {
  const state = await fakeTripServer(page, { riders: [{ ...MASKED_RIDER }, { ...FULL_RIDER }] });
  await signInWarm(page);
  await page.goto("/riders/R501");
  await expect(page.getByRole("heading", { level: 2, name: "Ida" })).toBeVisible();
  // Rule 45 evidence: SHOT_DIR=<dir> SHOT_TAG=before|after saves the rider page as seen with a masked record.
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/rider-page-${process.env.SHOT_TAG ?? "shot"}.png`, fullPage: true });
  const phone = page.getByTestId("masked-phone");
  await expect(phone).toHaveText(/\+46•••••01/);
  await expect(phone.locator("a[href^='tel:']")).toHaveCount(0);
  await expect(page.locator("a[href^='tel:']")).toHaveCount(0);
  await expect(page.getByTestId("masked-email")).toHaveText(/i•••@example\.se/);
  // G30 (v0.18.76): emailVerifiedAt is never masked, so the masked row shows Verified (title: the date).
  await expect(page.getByTestId("email-verified")).toHaveText("Verified");
  await expect(page.getByTestId("email-verified")).toHaveAttribute("title", /^E-mail verified .*2026/);

  const reveal = page.getByTestId("reveal-sensitive");
  await expect(reveal).toBeVisible();
  await reveal.click();
  const dialog = page.locator(".modal.open").last();
  await expect(dialog.getByText("Why do you need the full value?")).toBeVisible();
  const why = dialog.getByLabel("Why do you need the full value?");
  // Too short: Confirm waits for 3 characters.
  await why.fill("Hi");
  await expect(dialog.getByRole("button", { name: "Confirm" })).toBeDisabled();
  await why.fill("Rider asked for a callback");
  await dialog.getByRole("button", { name: "Confirm" }).click();

  await expect.poll(() => state.calls.find((call) => call.method === "POST" && call.path === "/api/v1/admin/riders/R501/reveal")?.body).toEqual({ reason: "Rider asked for a callback" });
  await expect(page.getByTestId("revealed-phone")).toHaveText(/\+46700000501/);
  await expect(page.getByTestId("revealed-email")).toHaveText(/ida@example\.se/);
  await expect(page.getByTestId("email-verified")).toHaveText("Verified");
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/rider-page-${process.env.SHOT_TAG ?? "shot"}-revealed.png`, fullPage: true });
  // Shown for this page view only: nothing is written to the browser's storage.
  const stored = await page.evaluate(() => JSON.stringify([...Object.values(localStorage), ...Object.values(sessionStorage)]));
  expect(stored).not.toContain("+46700000501");
});

test("rider page: a rider without the masked flag shows no server Reveal button", async ({ page }) => {
  await fakeTripServer(page, { riders: [{ ...MASKED_RIDER }, { ...FULL_RIDER }] });
  await signInWarm(page);
  await page.goto("/riders/R502");
  await expect(page.getByRole("heading", { level: 2, name: "Omar" })).toBeVisible();
  await expect(page.getByTestId("reveal-sensitive")).toHaveCount(0);
  await expect(page.getByTestId("masked-phone")).toHaveCount(0);
  // G30: Omar has no e-mail, so no Verified / Not verified badge.
  await expect(page.getByTestId("email-verified")).toHaveCount(0);
});

test("driver page: a year-only date of birth shows the year, Reveal shows the e-mail and the full date", async ({ page }) => {
  const state = await fakeTripServer(page, { drivers: [{ ...MASKED_DRIVER }] });
  await signInWarm(page);
  await page.goto("/drivers/D1001");
  await expect(page.getByRole("heading", { level: 2, name: "Anna Berg" })).toBeVisible();
  await expect(page.getByTestId("masked-email")).toHaveText(/a•••@example\.se/);
  await expect(page.getByTestId("email-verified")).toHaveText("Verified");
  const dob = page.getByTestId("masked-dob");
  await expect(dob).toHaveText(/1990/);
  await expect(dob).not.toHaveText(/Invalid|NaN/);
  await page.getByTestId("reveal-sensitive").click();
  const dialog = page.locator(".modal.open").last();
  await dialog.getByLabel("Why do you need the full value?").fill("Document check with the driver");
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect.poll(() => state.calls.find((call) => call.method === "POST" && call.path === "/api/v1/admin/drivers/D1001/reveal")?.body).toEqual({ reason: "Document check with the driver" });
  await expect(page.getByTestId("revealed-email")).toHaveText(/anna@example\.se/);
  await expect(page.getByTestId("email-verified")).toHaveText("Verified");
  await expect(page.getByTestId("revealed-dob")).toHaveText(/1990/);
  await expect(page.getByTestId("revealed-dob")).toHaveText(/17/);
});

test("G30: a driver without emailVerifiedAt shows Not verified, masked or full; the full rider shows Verified", async ({ page }) => {
  const { emailVerifiedAt: _drop, ...unverified } = MASKED_DRIVER as typeof MASKED_DRIVER & { emailVerifiedAt?: string };
  void _drop;
  await fakeTripServer(page, { drivers: [{ ...unverified } as typeof DRIVER], riders: [{ ...RIDERS[0] }, { ...FULL_RIDER }] });
  await signInWarm(page);
  await page.goto("/drivers/D1001");
  await expect(page.getByRole("heading", { level: 2, name: "Anna Berg" })).toBeVisible();
  await expect(page.getByTestId("email-verified")).toHaveText("Not verified");
  await expect(page.getByTestId("email-verified")).not.toHaveAttribute("title", /.+/);
  await page.goto("/riders/R501");
  await expect(page.getByRole("heading", { level: 2, name: "Ida" })).toBeVisible();
  await expect(page.getByTestId("masked-email")).toHaveCount(0);
  await expect(page.getByTestId("email-verified")).toHaveText("Verified");
});

test("fleet owner page: a masked owner e-mail shows Reveal, the fleet route answers the full e-mail", async ({ page }) => {
  const state = await fakeTripServer(page, { fleets: [{ ...MASKED_FLEET }] });
  await signInWarm(page);
  await page.goto("/fleets/D1000");
  await expect(page.getByRole("heading", { level: 2, name: "Bo Nord" })).toBeVisible();
  await expect(page.getByTestId("masked-email")).toHaveText(/b•••@example\.se/);
  await page.getByTestId("reveal-sensitive").click();
  const dialog = page.locator(".modal.open").last();
  await dialog.getByLabel("Why do you need the full value?").fill("Invoice question from the owner");
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect.poll(() => state.calls.find((call) => call.method === "POST" && call.path === "/api/v1/admin/fleets/F1/reveal")?.body).toEqual({ reason: "Invoice question from the owner" });
  await expect(page.getByTestId("revealed-email")).toHaveText(/bo@example\.se/);
});

test("SOS: an open case has one button that reveals both phones; a closed case has none", async ({ page }) => {
  const closed = { ...SOS_INCIDENT, incidentId: "inc_9", status: "resolved", resolvedAt: "2026-10-26T09:50:00Z", resolvedBy: "A1" };
  const state = await fakeTripServer(page, { admin: { permissions: SAFETY }, incidents: [{ ...SOS_INCIDENT }, closed] as Incident[] });
  await signInWarm(page);
  await page.goto("/incidents?case=inc_1");
  const button = page.getByRole("button", { name: "Reveal both phones (SOS)" });
  await expect(button).toBeVisible();
  await button.click();
  await expect.poll(() => state.calls.some((call) => call.method === "POST" && call.path === "/api/v1/admin/incidents/inc_1/reveal-contacts")).toBe(true);
  const contacts = page.getByTestId("incident-revealed-contacts");
  await expect(contacts).toHaveText(/\+46700000502/);
  await expect(contacts).toHaveText(/\+46701110001/);

  await page.goto("/incidents?case=inc_9&show=all");
  await expect(page.getByRole("button", { name: "Reveal both phones (SOS)" })).toHaveCount(0);
});

test.afterEach(async ({ page }) => {
  await page.unroute(`${API}/**`).catch(() => undefined);
});
