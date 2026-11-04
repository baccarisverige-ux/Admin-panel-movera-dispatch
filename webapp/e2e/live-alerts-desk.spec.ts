import { expect, test } from "@playwright/test";
import { ADMIN, fakeTripServer, signIn } from "./live-fake";

/**
 * Alerts full flow on live (contract v0.18.15 §38, owner 2026-11-02 Q5 "FULL FLOW"): the Alerts page reads who works
 * on each alert from the server and its buttons go to the server. Fails before: the buttons were hidden on live and
 * the page's book was empty.
 */
const ALL = { admin: { permissions: [...ADMIN.permissions, "alerts.manage"] } };

test("alerts: another admin's alert shows who has it; my quiet hours and the settings save on the server", async ({ page }) => {
  const state = await fakeTripServer(page, ALL);
  await signIn(page);
  await page.goto("/alerts");
  await page.waitForLoadState("networkidle");
  await expect.poll(() => state.calls.some((call) => call.method === "GET" && call.path.startsWith("/api/v1/admin/alerts/book"))).toBe(true);
  // Open: take the first alert; the server gets it and the line says I work on it.
  const take = page.getByRole("button", { name: "Take it" }).first();
  await expect(take).toBeVisible();
  await take.click();
  await expect.poll(() => state.calls.find((call) => call.method === "POST" && /\/admin\/alerts\/[^/]+\/take$/.test(call.path))?.body).toMatchObject({ kind: expect.any(String), level: expect.any(String), title: expect.any(String), since: expect.any(String) });
  await expect(page.getByText("Nora Lind is working on it").first()).toBeVisible();
  // Settings: shared for every admin; quiet hours only mine.
  await page.getByRole("tab", { name: "Settings" }).click();
  await page.getByRole("switch", { name: "Snooze" }).click();
  await page.getByRole("button", { name: "Save settings" }).click();
  await page.getByRole("dialog", { name: "Save alert settings" }).getByRole("button", { name: "Confirm" }).click();
  await expect.poll(() => state.calls.find((call) => call.method === "PUT" && call.path === "/api/v1/admin/alerts/settings")?.body).toMatchObject({ expectedRev: 1, settings: { extras: { snooze: true } } });
  await page.getByRole("switch", { name: "Quiet hours" }).click();
  await page.getByRole("button", { name: "Save my quiet hours" }).click();
  await expect.poll(() => state.calls.find((call) => call.method === "PUT" && call.path.startsWith("/api/v1/admin/alerts/quiet"))?.body).toEqual({ on: true, from: "22:00", to: "07:00" });
});

/**
 * v0.18.20 server-side alerts (contract.json#alertDesk.serverDetection, owner 2026-11-04 A1–A3): the page shows the
 * alerts the server found (never its own), a solved one green with what happened (A2), and the per-zone at-risk
 * minutes (A1) save with the alert settings. Fails before: the page worked the alerts out itself.
 */
test("alerts: the server's alerts show; solved by itself is green with the new info; zone limits save on the server", async ({ page }) => {
  const state = await fakeTripServer(page, ALL);
  await signIn(page);
  await page.goto("/alerts");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Sara has waited 16 min").first()).toBeVisible();
  const green = page.locator(".al-row.solved").first();
  await expect(green).toBeVisible();
  await expect(green).toContainText("Driver Ali took it 10:48");
  await expect(green).toHaveCSS("background-color", "rgb(238, 250, 242)");
  // Owner A2: an admin can still take it and mark it done; done closes it on the server.
  await green.getByRole("button", { name: "Take it" }).click();
  await expect.poll(() => state.calls.some((call) => call.method === "POST" && /\/admin\/alerts\/booked_at_risk(%3A|:)T2003\.k1\/take$/.test(call.path))).toBe(true);
  await page.getByRole("tab", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Zone limits" }).or(page.getByText("Zone limits").first())).toBeVisible();
  const booked = page.getByRole("textbox", { name: /Booked ride at risk \(minutes before pickup\)/ }).first();
  await booked.fill("20");
  await page.getByRole("button", { name: "Save settings" }).click();
  await page.getByRole("dialog", { name: "Save alert settings" }).getByRole("button", { name: "Confirm" }).click();
  await expect.poll(() => (state.calls.find((call) => call.method === "PUT" && call.path === "/api/v1/admin/alerts/settings")?.body as { settings?: { zones?: Record<string, { bookedAtRiskMin?: number }> } } | undefined)?.settings?.zones?.["Z001"]?.bookedAtRiskMin).toBe(20);
});
