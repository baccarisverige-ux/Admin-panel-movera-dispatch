import { expect, test } from "@playwright/test";
import { fakeTripServer, signIn } from "./live-fake";

/** Contract v0.16.0 §11 (owner 2026-10-29): the live Crashes & errors list, for an admin with no System permission. */
test("Crashes & errors (live): a viewer reads GET /admin/errors, filters, marks fixed with an Idempotency-Key", async ({ page }) => {
  const state = await fakeTripServer(page, {
    admin: { role: "viewer", permissions: ["overview.read"] },
    errors: [
      { id: "E1", app: "rider", platform: "ios", appVersions: ["2.1.0"], message: "Old rider error", kind: "error", count: 2, devices: 2, firstSeen: "2026-10-20T10:00:00Z", lastSeen: "2026-10-27T10:00:00Z", status: "open" },
      { id: "E2", app: "server", platform: "server", appVersions: ["0.16.0"], message: "Server timeout", kind: "error", count: 5, devices: 0, firstSeen: "2026-10-28T10:00:00Z", lastSeen: "2026-10-29T10:00:00Z", status: "open" },
    ],
  });
  await signIn(page);
  await page.getByRole("link", { name: "Crashes & errors", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Crashes & errors" })).toBeVisible();
  const table = page.locator(".errors-page table");
  await expect(table.getByRole("row").nth(1)).toContainText("Server timeout");
  await expect(table.getByRole("row").nth(2)).toContainText("Old rider error");
  await page.getByLabel("App", { exact: true }).selectOption("rider");
  await expect.poll(() => state.calls.some((call) => call.method === "GET" && call.path === "/api/v1/admin/errors?limit=200&app=rider")).toBe(true);
  await expect(table).not.toContainText("Server timeout");
  await table.getByRole("row").nth(1).getByRole("button", { name: "Mark fixed" }).click();
  await expect(table.getByRole("row").nth(1).locator(".errors-pill")).toHaveText("Fixed");
  const patch = state.calls.find((call) => call.method === "PATCH");
  expect(patch?.path).toBe("/api/v1/admin/errors/E1");
  expect(patch?.body).toEqual({ status: "fixed" });
  expect(patch?.headers["idempotency-key"]).toBeTruthy();
});
