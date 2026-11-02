import { expect, test } from "@playwright/test";
import { ADMIN, fakeTripServer, signIn } from "./live-fake";

/**
 * Review rules on live (contract v0.18.15 §40, owner G14 Q6 "Make them real"): the warning / review / block lines and
 * the bad words are saved on the server per country; the admin review list comes from the server. Fails before: the
 * rules tab said "Not connected yet" and Save was hidden.
 */
test("reviews: rules saved on the server; the admin review list and Done", async ({ page }) => {
  const state = await fakeTripServer(page, {
    admin: { permissions: [...ADMIN.permissions, "settings.read", "settings.edit", "settings.publish", "riders.block"] },
    reviewQueue: [{ who: "driver", personId: "D1001", name: "Anna Berg", country: "SE", level: "review", average: 4.1, count: 6, since: "2026-10-26T09:00:00Z" }],
  });
  await signIn(page);
  await page.goto("/reviews?tab=rules");
  const box = page.getByTestId("live-review-rules");
  await expect(box).not.toContainText("Not connected yet");
  await box.getByRole("textbox", { name: "Bad words" }).fill("idiot\nscam\nloser");
  await box.getByRole("button", { name: "Save review rules" }).click();
  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible().catch(() => false)) await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect.poll(() => state.calls.find((call) => call.method === "PUT" && call.path === "/api/v1/admin/reviews/rules")?.body).toMatchObject({ country: "SE", warn: { on: true, below: 4.5 }, badWords: { on: true, words: ["idiot", "scam", "loser"] } });
  const queue = page.getByTestId("live-review-queue");
  await expect(queue).toContainText("Anna Berg");
  await queue.getByLabel("What was done").fill("Called the driver");
  await queue.getByRole("button", { name: "Done" }).click();
  await expect.poll(() => state.calls.find((call) => call.path === "/api/v1/admin/reviews/queue/driver/D1001/done")?.body).toEqual({ note: "Called the driver" });
  await expect(queue).toContainText("Nobody to review.");
});
