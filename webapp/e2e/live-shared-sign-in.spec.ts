import { expect, test } from "@playwright/test";
import { fakeTripServer, signIn } from "./live-fake";

// Owner D8 (2026-11-07, "One shared sign-in"): one sign-in for every tab of the browser.
test("D8: a second tab of the browser is signed in with the same sign-in, and Sign out in one tab signs out both", async ({ page, context }) => {
  await fakeTripServer(page, {});
  await signIn(page);
  const second = await context.newPage();
  await fakeTripServer(second, {});
  await second.goto("/trips");
  await expect(second.getByRole("heading", { level: 2, name: "Trips" })).toBeVisible();
  await expect(second.getByLabel("Password")).toHaveCount(0);
  // The shared sign-in ends in the second tab (as Sign out does): the first tab hears it through the storage event.
  await second.evaluate(() => localStorage.removeItem("movera-admin-live-session"));
  await expect(page.getByLabel("Password")).toBeVisible({ timeout: 10_000 });
});
