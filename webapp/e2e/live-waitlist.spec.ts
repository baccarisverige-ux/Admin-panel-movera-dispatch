import { expect, test } from "@playwright/test";
import { fakeTripServer, signIn } from "./live-fake";

/** Contract v0.15.0 §24 (owner 2026-10-29, decision 5): the admin sees the sign-in waiting list, live. */
test("Waiting list: the numbers from both apps, a filter per app, new ones appear without a reload", async ({ page }) => {
  test.setTimeout(60_000);
  const at = "2026-10-29T10:00:00Z";
  const state = await fakeTripServer(page, {
    waitlist: [
      { phone: "+46705551234", app: "driver", locale: "sv", firstAt: at, lastAt: at, count: 2 },
      { phone: "+33612345678", app: "rider", locale: "fr", firstAt: at, lastAt: at, count: 1 },
    ],
  });
  await signIn(page);
  await page.goto("/waitlist");
  await expect(page.getByRole("heading", { name: "Waiting list" })).toBeVisible();
  await expect(page.getByText("+46 70 555 12 34")).toBeVisible();
  await expect(page.getByText("+33 6 12 34 56 78")).toBeVisible();
  await expect(page.getByText("2 times")).toBeVisible();
  // Owner G1-B6: one ask reads "1 time", never "1 times".
  await expect(page.getByText("1 time", { exact: true })).toBeVisible();
  await expect(page.getByText("1 times")).toHaveCount(0);
  await page.getByRole("button", { name: "Driver", exact: true }).click();
  await expect.poll(() => state.calls.some((call) => call.path === "/api/v1/admin/waitlist?limit=200&app=driver")).toBe(true);
  await expect(page.getByText("+33 6 12 34 56 78")).toHaveCount(0);
  await page.getByRole("button", { name: "All", exact: true }).click();
  state.waitlist!.unshift({ phone: "+46701112233", app: "rider", firstAt: at, lastAt: at, count: 1 });
  await expect(page.getByText("+46 70 111 22 33")).toBeVisible({ timeout: 20_000 });
});
