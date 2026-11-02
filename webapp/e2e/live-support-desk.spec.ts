import { expect, test } from "@playwright/test";
import { ADMIN, fakeTripServer, signIn } from "./live-fake";

/**
 * Build-all A1 (contract v0.18.15 §37, owner 2026-11-02 decisions/other-support-promos.md QO-5 claim / assign now;
 * rule 16 settings with defaults): the live Support desk buttons call the server. Fails before: no Claim, Topic,
 * Waiting, Solve, Reopen, Safety case or Settings on the live page.
 */
const ALL = { admin: { permissions: [...ADMIN.permissions, "support.reply", "settings.read", "settings.edit"] } };

test("support desk: claim, topic, waiting, solve, reopen and safety case go to the server", async ({ page }) => {
  const state = await fakeTripServer(page, ALL);
  await signIn(page);
  await page.goto("/support");
  const ticket = page.getByTestId("live-ticket");
  await expect(ticket).toContainText("Nobody works on it yet.");
  await ticket.getByRole("button", { name: "Claim" }).click();
  await expect.poll(() => state.calls.some((call) => call.method === "POST" && call.path === "/api/v1/admin/tickets/TK1/claim")).toBe(true);
  await expect(ticket).toContainText(`Works on it: ${ADMIN.name}`);
  await ticket.getByLabel("Ticket topic").selectOption("payment");
  await expect.poll(() => state.calls.find((call) => call.path === "/api/v1/admin/tickets/TK1/topic")?.body).toEqual({ category: "payment" });
  await ticket.getByRole("button", { name: "Waiting for them" }).click();
  await expect.poll(() => state.calls.find((call) => call.path === "/api/v1/admin/tickets/TK1/waiting")?.body).toEqual({ waiting: true });
  await ticket.getByLabel("Private note").fill("Refund given");
  await ticket.getByRole("button", { name: "Mark solved" }).click();
  await expect.poll(() => state.calls.find((call) => call.path === "/api/v1/admin/tickets/TK1/solve")?.body).toEqual({ note: "Refund given" });
  await expect(ticket.getByRole("button", { name: "Reopen" })).toBeDisabled();
  await ticket.getByLabel("Reason").fill("Rider wrote again");
  await ticket.getByRole("button", { name: "Open a safety case" }).click();
  await expect.poll(() => state.calls.find((call) => call.path === "/api/v1/admin/tickets/TK1/case")?.body).toEqual({ reason: "Rider wrote again" });
  await ticket.getByRole("button", { name: "Reopen" }).click();
  await expect.poll(() => state.calls.find((call) => call.path === "/api/v1/admin/tickets/TK1/reopen")?.body).toEqual({ reason: "Rider wrote again" });
});

test("support settings: topics and time limits per country are saved on the server", async ({ page }) => {
  const state = await fakeTripServer(page, ALL);
  await signIn(page);
  await page.goto("/support");
  await page.getByRole("button", { name: "Settings" }).first().click();
  const box = page.getByTestId("live-support-settings");
  await expect(box).toContainText("Lost item");
  await box.getByLabel("Lost item on").uncheck();
  await box.getByRole("button", { name: "Save settings" }).click();
  await expect.poll(() => state.calls.find((call) => call.method === "PUT" && call.path === "/api/v1/admin/support/settings")?.body).toMatchObject({ country: "SE", topics: expect.arrayContaining([expect.objectContaining({ code: "lost_item", on: false })]) });
  await expect(box).toContainText("Support settings saved.");
});
