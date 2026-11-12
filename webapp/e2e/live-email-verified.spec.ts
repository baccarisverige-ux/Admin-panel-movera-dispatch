import { expect, test } from "@playwright/test";
import { DRIVER, fakeTripServer, signIn } from "./live-fake";

/**
 * G30 (contract v0.18.76, contract.json#emailVerified.approvalSetting; owner 2026-11-12 Q6 "Add the setting, off"):
 * with the country's switch on, Activate of a driver never active before and without emailVerifiedAt is refused with
 * 409 invalid_transition, reason email_not_verified; the page says texts.approvalRefused in the admin's language (not
 * the server's message) and nothing changes.
 */
const modal = (page: import("@playwright/test").Page) => page.locator(".modal.open").last();
const { emailVerifiedAt: _drop, ...UNVERIFIED } = DRIVER as typeof DRIVER & { emailVerifiedAt?: string };
void _drop;
const READY = { ...UNVERIFIED, accountStatus: "pending", documents: [{ documentId: "DOC1", type: "terms", status: "approved" }, { documentId: "DOC2", type: "driving_license", status: "approved" }] } as typeof DRIVER;

test("G30: Activate refused with 409 email_not_verified says the driver's e-mail is not verified yet; the driver shows Not verified", async ({ page }) => {
  test.setTimeout(120_000);
  const state = await fakeTripServer(page, { drivers: [{ ...READY }], emailCheckForApproval: true, admin: { permissions: ["overview.read", "drivers.read", "drivers.activate", "documents.approve", "vehicles.edit", "trips.read"] } });
  await signIn(page);
  await page.goto("/drivers/D1001");
  await expect(page.getByRole("heading", { level: 2, name: "Anna Berg" })).toBeVisible();
  await expect(page.getByTestId("email-verified")).toHaveText("Not verified");
  await page.getByRole("button", { name: /^Activate$/ }).first().click();
  await modal(page).locator("label input").first().fill("D1001");
  const reason = modal(page).getByLabel(/^Reason$/);
  if ((await reason.count()) && (await reason.inputValue()) === "") await reason.selectOption({ index: 1 });
  await modal(page).getByRole("button", { name: /^Confirm$/ }).click();
  await expect(page.getByText("The driver's e-mail is not verified yet.").first()).toBeVisible();
  await expect(page.getByText("Conflict", { exact: true })).toHaveCount(0);
  expect(state.drivers[0]!.accountStatus).toBe("pending");
  expect(state.calls.some((call) => call.method === "POST" && call.path === "/api/v1/admin/drivers/D1001/status")).toBe(true);
});
