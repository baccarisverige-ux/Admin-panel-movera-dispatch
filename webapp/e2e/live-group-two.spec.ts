import { expect, test, type Page } from "@playwright/test";
import { DRIVER, FLEET, OWNER, VEHICLE, fakeTripServer, signIn } from "./live-fake";

/**
 * Owner decisions of 2026-10-30 (driver group 2 re-check, contract 0.18.3), admin parts: real car ids (ULID) open the
 * Vehicles and driver pages (R1), a car breaking the rules is red and cannot be approved (R2), Fleet owners show only
 * the server's facts (R3) in the admin's language (R10).
 */
const CAR_ID = "01JBXK7Q2M9V4T8RZ5N3W6Y1CD";
const ULID_CAR = {
  ...VEHICLE, vehicleId: CAR_ID, plate: "TST G2A", make: "Toyota", model: "Prius", year: 2012, categoryIds: ["economy", "child_seat"], status: "pending",
  ruleProblems: ["economy:year_too_old", "child_seat:year_too_old"],
  documents: [{ documentId: "VD1", type: "vehicle_registration", status: "approved", expiresAt: "2027-05-31T00:00:00Z" }, { documentId: "VD2", type: "insurance", status: "in_review" }],
};
const PERMS = ["overview.read", "drivers.read", "drivers.activate", "documents.approve", "vehicles.edit", "trips.read", "zones.read", "settings.read"];
const SHOTS = process.env.G2B_SHOTS;
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }); };

async function start(page: Page, language = "en") {
  await page.setViewportSize({ width: 1280, height: 800 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await fakeTripServer(page, {
    drivers: [{ ...DRIVER, vehicleId: CAR_ID } as typeof DRIVER, { ...OWNER }],
    fleets: [{ ...FLEET }],
    vehicles: [ULID_CAR as unknown as typeof VEHICLE],
    admin: { permissions: PERMS, language },
  });
  await signIn(page, language === "sv" ? "Kontrollpanel" : "Dashboard");
  return errors;
}

test("R1: the Vehicles page and the car page open with a real (ULID) car id; real end dates or —", async ({ page }) => {
  const errors = await start(page);
  await page.goto("/vehicles");
  await expect(page.getByRole("cell", { name: "TST G2A" })).toBeVisible();
  await shot(page, "after-vehicles");
  await page.goto(`/vehicles/${CAR_ID}`);
  const dates = page.getByTestId("vehicle-end-dates");
  await expect(dates).toContainText("2027-05-31");
  await expect(dates).toContainText("—");
  // R2: the server's rule problems in red, Return to service disabled, no simulated text.
  await expect(page.getByTestId("vehicle-rule-problems")).toContainText("Movera: the car is too old");
  await expect(page.getByRole("button", { name: "Return to service" })).toBeDisabled();
  await expect(page.getByText(/simulated vehicle state/)).toHaveCount(0);
  await expect(page.getByText(/should be on hold/)).toHaveCount(0);
  await shot(page, "after-vehicle-detail");
  expect(errors).toEqual([]);
});

test("R1: the driver page opens when the driver picked a car with a real id", async ({ page }) => {
  const errors = await start(page);
  await page.goto("/drivers/D1001");
  await expect(page.getByRole("heading", { level: 2, name: /Anna/ })).toBeVisible();
  await shot(page, "after-driver");
  expect(errors).toEqual([]);
});

test("R3, R10: Fleet owners in Swedish, only the server's facts (fleet code, 4 company documents in SE)", async ({ page }) => {
  await start(page, "sv");
  await page.goto("/fleets");
  for (const text of ["Alla", "Aktiv", "Pausad"]) await expect(page.locator(".fd-views")).toContainText(text);
  await expect(page.locator(".fd-views")).not.toContainText("On hold");
  await expect(page.getByRole("cell", { name: "Sverige" })).toBeVisible();
  await expect(page.getByText("/4", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("/7")).toHaveCount(0);
  await expect(page.getByTestId("not-connected")).toHaveCount(0);
  await shot(page, "after-fleet-owners-sv");
  await page.goto("/fleets/D1000");
  await expect(page.getByRole("button", { name: "Aktivera" })).toBeVisible();
  await expect(page.getByText("FO-SE-")).toHaveCount(0);
  await shot(page, "after-fleet-owner-sv");
});

test("R9: approving a document takes its issue date; a date in the future is refused before sending", async ({ page }) => {
  await start(page);
  await page.goto("/drivers/D1001?tab=documents");
  await page.getByTestId("live-documents").locator('[data-document-type="driving_license"]').getByRole("button", { name: "Approve" }).click();
  const dialog = page.getByRole("dialog", { name: "Approve document" });
  const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  await dialog.getByLabel("Issue date (on the document)").fill(tomorrow);
  await expect(dialog.getByTestId("issued-in-future")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Approve" })).toBeDisabled();
  await dialog.getByLabel("Issue date (on the document)").fill("2024-03-01");
  await dialog.getByLabel("Valid until (required)").fill(new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10));
  await shot(page, "after-approve-dialog");
  await expect(dialog.getByRole("button", { name: "Approve" })).toBeEnabled();
});

test("R8: the onboarding settings edit a document's upload guide (sv/fr/en lines) and its valid months", async ({ page }) => {
  await start(page);
  await page.goto("/onboarding?view=steps");
  await page.getByRole("button", { name: /^Edit Driving licence/ }).click();
  const dialog = page.getByTestId("type-dialog");
  await expect(dialog.getByTestId("guide-checklist")).toBeVisible();
  await dialog.getByTestId("guide-checklist").getByRole("button", { name: "Add a line" }).click();
  await expect(dialog.getByLabel("Line 1 (Swedish)")).toBeVisible();
  await expect(dialog.getByTestId("valid-months")).toBeVisible();
  await shot(page, "after-guide-editor");
});
