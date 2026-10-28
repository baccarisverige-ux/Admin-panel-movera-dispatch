import { expect, test, type Page } from "@playwright/test";
import { DRIVER, OWNER, fakeTripServer, signIn } from "./live-fake";

/**
 * Contract v0.10.1 (owner 2026-10-28) in the live admin: Activate is refused with 409 documents_not_approved until
 * every required document is approved (a fleet member his own; a fleet owner also the company's; no car needed). The
 * page lists what is missing as Driver / Company / Car. A car whose documents are not approved can't be driven.
 * Onboarding shows only the server's drivers. Screenshots (sv, 1440) go to SHOTS.
 */

const SHOTS = process.env.SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};
const modal = (page: Page) => page.locator(".modal.open").last();

async function press(page: Page, button: RegExp, id: string) {
  await page.getByRole("button", { name: button }).first().click();
  await modal(page).locator("label input").first().fill(id);
  const reason = modal(page).getByLabel(/^(Reason|Skäl)$/);
  if ((await reason.count()) && (await reason.inputValue()) === "") await reason.selectOption({ index: 1 });
  await modal(page).getByRole("button", { name: /^(Confirm|Bekräfta)$/ }).click();
}

const PENDING_OWNER = { ...OWNER, accountStatus: "pending", requiredFleetDocuments: undefined } as unknown as typeof OWNER;

test.use({ viewport: { width: 1440, height: 1000 } });

test("a fleet member: Activate refused lists the driver's documents; after Approve the account activates", async ({ page }) => {
  const state = await fakeTripServer(page, { drivers: [{ ...DRIVER }, PENDING_OWNER], admin: { permissions: ["overview.read", "drivers.read", "drivers.activate", "documents.approve", "vehicles.edit", "trips.read"] } });
  await signIn(page);
  await page.goto("/drivers/D1001");
  await expect(page.getByRole("heading", { level: 2, name: "Anna Berg" })).toBeVisible();
  await press(page, /^Activate$/, "D1001");
  const refused = page.getByTestId("activation-refused");
  await expect(refused).toContainText("The account can't be activated yet.");
  await expect(refused.locator('[data-missing-scope="driver"]')).toContainText("Driving licence");
  await expect(refused.locator('[data-missing-scope="fleet"]')).toHaveCount(0);
  await expect(page.getByText("Not all required documents are approved.").first()).toBeVisible();
  expect(state.drivers[0]!.accountStatus).toBe("on_hold");

  await page.getByRole("tab", { name: "Vehicles" }).click();
  await expect(page.getByTestId("vehicle-blocked")).toContainText("Can't be driven – documents missing");
  await expect(page.getByTestId("vehicle-blocked")).toContainText("Registration certificate");

  await page.getByRole("tab", { name: "Documents" }).click();
  const row = page.getByTestId("live-documents").locator('[data-document-type="driving_license"]');
  await row.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("dialog", { name: "Approve document" }).getByRole("button", { name: "Approve" }).click();
  await expect.poll(() => state.drivers[0]!.documents.find((doc) => doc.documentId === "DOC2")?.status).toBe("approved");
  await page.reload();
  await expect(page.getByRole("heading", { level: 2, name: "Anna Berg" })).toBeVisible();
  await press(page, /^Activate$/, "D1001");
  await expect(page.getByTestId("activation-refused")).toHaveCount(0);
  await expect.poll(() => state.drivers[0]!.accountStatus).toBe("active");
});

test("a fleet owner needs the company documents; Onboarding is the server's queue (sv screenshots)", async ({ page }) => {
  await fakeTripServer(page, { drivers: [{ ...DRIVER }, PENDING_OWNER], admin: { language: "sv" } });
  await signIn(page, "Kontrollpanel");

  await page.goto("/onboarding");
  const board = page.getByTestId("live-onboarding");
  await expect(board.getByRole("heading", { level: 2, name: "Introduktionskö" })).toBeVisible();
  await expect(board.getByRole("button", { name: "Anna Berg" })).toBeVisible();
  await expect(board.getByRole("button", { name: "Bo Nord" })).toBeVisible();
  await expect(board.locator('[data-step="signed_up"]')).toContainText("2");
  await expect(board.locator('[data-step="active"]')).toHaveCount(0);
  await board.getByRole("button", { name: "Anna Berg" }).click();
  const selected = page.getByTestId("onboarding-selected");
  await expect(selected).toContainText("Körkort");
  await expect(selected.getByTestId("vehicle-blocked")).toContainText("Kan inte köras – dokument saknas");
  await expect(selected.getByTestId("live-documents")).toBeVisible();
  await shot(page, "admin-onboarding-live-sv");
  await selected.getByTestId("vehicle-blocked").scrollIntoViewIfNeeded();
  if (SHOTS) await selected.screenshot({ path: `${SHOTS}/admin-vehicle-blocked-onboarding-sv.png` });

  await page.goto("/drivers/D1001");
  await expect(page.getByRole("heading", { level: 2, name: "Anna Berg" })).toBeVisible();
  await press(page, /^Aktivera$/, "D1001");
  await expect(page.getByTestId("activation-refused")).toContainText("Kontot kan inte aktiveras än.");
  await expect(page.getByTestId("activation-refused").locator('[data-missing-scope="driver"]')).toContainText("Körkort");
  await shot(page, "admin-activation-refused-member-sv");
  await page.getByRole("tab", { name: "Fordon" }).click();
  await expect(page.getByTestId("vehicle-blocked")).toContainText("Kan inte köras – dokument saknas");
  await shot(page, "admin-vehicle-blocked-sv");

  await page.goto("/drivers/D1000");
  await expect(page.getByRole("heading", { level: 2, name: "Bo Nord" })).toBeVisible();
  await press(page, /^Aktivera$/, "D1000");
  const refused = page.getByTestId("activation-refused");
  await expect(refused.locator('[data-missing-scope="fleet"]')).toContainText("Registreringsbevis (Bolagsverket)");
  await expect(refused.locator('[data-missing-scope="fleet"]')).toContainText("Taxitrafiktillstånd (Transportstyrelsen)");
  await expect(refused.locator('[data-missing-scope="driver"]')).toHaveCount(0);
  await expect(refused).toContainText("Företag");
  await shot(page, "admin-activation-refused-fleet-owner-sv");
});
