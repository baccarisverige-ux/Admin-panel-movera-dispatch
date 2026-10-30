import { expect, test, type Page } from "@playwright/test";
import { DRIVER, fakeSettings, fakeTripServer, signIn, type TripState } from "./live-fake";

/**
 * Driver group 3 deep audit (owner 2026-10-30, Rules decisions/driver-g3.md, contract v0.18.4 extended), the admin parts:
 * G3-D5 supply/demand rows and the shortage alert from the server's zoneSupply, G3-D2 the driver's real performance,
 * driver app settings that are saved but not live shown clearly, and the Audit "Admins" count without "system".
 */
const SHOTS = process.env.G3_SHOTS;
const PREFIX = process.env.G3_PREFIX ?? "after";
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${PREFIX}-${name}.png`, fullPage: false }); };
const PERMS = ["overview.read", "drivers.read", "trips.read", "trips.intervene", "riders.read", "zones.read", "settings.read", "settings.edit", "settings.publish", "dispatch.edit", "audit.read", "finance.read"];

async function start(page: Page, init: Partial<TripState> = {}, landing = "Dashboard"): Promise<TripState> {
  await page.setViewportSize({ width: 1280, height: 800 });
  const state = await fakeTripServer(page, { admin: { permissions: PERMS }, ...init });
  await signIn(page, landing);
  return state;
}

// Anna is on a trip in Z001 (LIVE_DRIVERS); the server also counts Bo, online without a fresh position.
const SUPPLY = [
  { zoneId: "Z001", online: 2, free: 1, busy: 1, waiting: 3, level: "short" as const, shortage: true },
  { zoneId: "Z002", online: 1, free: 1, busy: 0, waiting: 1, level: "tight" as const, shortage: false },
];

test("G3-D5: the Dashboard rows and the shortage alert show the server's zoneSupply, same numbers", async ({ page }) => {
  await start(page, { zoneSupply: SUPPLY });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 2, name: "Dashboard" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await shot(page, "dashboard-alert");
  // The Alerts strip: "few free drivers" only where riders wait and free drivers are short, with the server's numbers.
  const strip = page.getByRole("region", { name: "Urgent" });
  await expect(strip).toContainText("Only 1 free driver in");
  await expect(strip).not.toContainText("Only 0 free drivers");
  await page.getByRole("tab", { name: "Live", exact: true }).click();
  const rows = page.getByRole("list", { name: "Zones by drivers needed" });
  await rows.scrollIntoViewIfNeeded();
  await shot(page, "dashboard-supply");
  await expect(rows.locator("li").filter({ hasText: "Stockholm County" })).toContainText("3 waiting · 1 free");
  await expect(rows.locator("li").filter({ hasText: "Södermalm" })).toContainText("1 waiting · 1 free");
});

test("G3-D5: no shortage on the server, no shortage alert", async ({ page }) => {
  await start(page, { zoneSupply: [{ ...SUPPLY[1] }] });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/short of free drivers/)).toHaveCount(0);
});

test("G3-D2: the driver page shows the server's rating, acceptance and cancel rate; null is —", async ({ page }) => {
  const performance = { windowDays: 30, from: "2026-09-30T10:00:00Z", offersAnswerable: 40, offersAccepted: 36, tripsCancelled: 2, ratingCount: 4, acceptancePct: 90, cancellationPct: 6, rating: null };
  await start(page, { drivers: [{ ...DRIVER, rating: 4.4, performance }] as never });
  await page.goto("/drivers/D1001");
  const month = page.getByTestId("live-driver-month").first();
  await expect(month).toBeVisible();
  await month.scrollIntoViewIfNeeded();
  await shot(page, "driver-performance");
  await expect(month).toContainText("90%");
  await expect(month).toContainText("6%");
  await expect(month.locator(".fd-stat, div").filter({ hasText: /^Rating/ }).first()).toContainText("—");
});

test("G3: Dispatch says when a zone's driver app settings are saved but not live", async ({ page }) => {
  await start(page);
  const settings = await fakeSettings(page);
  const entry = settings.docs.get("driver_app_config:Z002")!;
  settings.docs.set("driver_app_config:Z002", { ...entry, live: { ...entry.document, offers: { old: true } } });
  await page.goto("/dispatch/radar?zone=Z002");
  const line = page.getByTestId("unpublished-driver-app");
  await expect(line).toBeVisible();
  await line.scrollIntoViewIfNeeded();
  await shot(page, "dispatch-unpublished");
  await expect(line).toContainText("not live yet (offers)");
  // Publish to drivers: the server's saved draft goes live (confirm step), then the line says everything is live.
  await line.getByRole("button", { name: "Publish to drivers" }).click();
  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible().catch(() => false)) {
    const reason = dialog.getByRole("textbox").first();
    if (await reason.isVisible().catch(() => false)) await reason.fill("Owner decided to publish");
    await dialog.getByRole("button", { name: /Confirm|Publish/ }).last().click();
  }
  await expect(page.getByTestId("unpublished-driver-app")).toContainText("everything saved is live");
  expect(settings.sent.some((call) => call.method === "POST" && call.path.endsWith("/driver_app_config/publish") && call.body?.["zoneId"] === "Z002")).toBe(true);
  await shot(page, "dispatch-published");
});

test("G3: the Audit Admins count does not count the server (system)", async ({ page }) => {
  await start(page, { audit: [{ auditId: "77", at: "2026-10-30T10:00:00Z", actor: "system", actorId: "system", action: "driver.auto_offline", targetType: "driver", targetId: "D1001", reason: "no_position", result: "committed", after: { reason: "no_position", minutes: 5 }, requestId: "77" }] });
  await page.goto("/audit");
  await expect(page.getByRole("list", { name: "Audit log" })).toBeVisible();
  await shot(page, "audit-admins");
  const card = page.getByRole("region", { name: "Numbers" }).locator(".rp-card").filter({ has: page.getByRole("button", { name: "What is Admins?" }) });
  await expect(card).toHaveText(/^Admins\s*1\b/);
});

test("G3-D8: Dispatch has Copy to all zones; the confirm lists the zones; each gets the settings and a publish", async ({ page }) => {
  await start(page);
  const settings = await fakeSettings(page);
  await page.goto("/dispatch/radar?zone=Z002");
  const copy = page.getByTestId("copy-all-zones");
  await expect(copy).toBeVisible();
  await copy.scrollIntoViewIfNeeded();
  await shot(page, "copy-all-zones");
  await copy.getByRole("button", { name: "Copy to all zones" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Stockholm County");
  await shot(page, "copy-all-zones-confirm");
  const reason = dialog.getByRole("textbox").first();
  if (await reason.isVisible().catch(() => false)) await reason.fill("Same settings everywhere");
  await dialog.getByRole("button", { name: /Confirm|Copy/ }).last().click();
  await expect.poll(() => settings.sent.some((call) => call.method === "POST" && call.path.endsWith("/driver_app_config/publish") && call.body?.["zoneId"] === "Z001")).toBe(true);
  expect(settings.sent.some((call) => call.path.includes("use-standard"))).toBe(false);
});

// Owner G3-D9 (2026-10-30): "So add are u sure popup and explain before set standard or copy to all zone".
test("G3-D9: Go back to Standard and Copy to all zones explain what happens and list the zones; Cancel changes nothing", async ({ page }) => {
  await start(page);
  const settings = await fakeSettings(page);
  await page.goto("/dispatch/radar?zone=Z002");
  await page.getByRole("button", { name: "Go back to Standard" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("sure-standard")).toContainText("Are you sure? Södermalm will stop using its own settings and follow the Sweden Standard. Its own values will be deleted");
  await expect(dialog).toContainText("Zones affected: Södermalm.");
  await shot(page, "sure-go-back-to-standard");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await page.getByTestId("copy-all-zones").getByRole("button", { name: "Copy to all zones" }).click();
  await expect(dialog.getByTestId("sure-copy")).toContainText("will be copied into every zone of Sweden and sent to their drivers. Each zone's current values are replaced. Zones affected: Stockholm County");
  await shot(page, "sure-copy-all-zones");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(settings.sent.filter((call) => call.method !== "GET")).toEqual([]);
});

// Driver 03c (live test 2026-10-30): "Inte kopplad än" on the live Dispatch header and zone panel; the "Are you sure?"
// heading squeezed into a narrow left column of the popup.
test("03c: live Dispatch shows no Not connected yet (header, zone panel); Are you sure? flows with its text across the popup", async ({ page }) => {
  await start(page);
  await fakeSettings(page);
  await page.goto("/dispatch/radar?zone=Z002");
  await expect(page.getByTestId("copy-all-zones")).toBeVisible();
  await expect(page.getByTestId("not-connected")).toHaveCount(0);
  await expect(page.getByTestId("value-not-connected")).toHaveCount(0);
  await expect(page.getByText("Not connected yet")).toHaveCount(0);
  for (const [open, id] of [[() => page.getByRole("button", { name: "Go back to Standard" }).click(), "sure-standard"], [() => page.getByTestId("copy-all-zones").getByRole("button", { name: "Copy to all zones" }).click(), "sure-copy"]] as const) {
    await open();
    const dialog = page.getByRole("dialog");
    const summary = dialog.getByTestId(id);
    await expect(summary).toHaveCSS("display", "inline");
    const heading = await summary.locator("strong").first().boundingBox();
    const text = await summary.boundingBox();
    const card = await dialog.locator("form").first().boundingBox();
    // One paragraph: the text starts on the heading's line and uses the popup's width, not a column beside it.
    expect(heading && text && Math.abs(heading.y - text.y)).toBeLessThan(4);
    expect(text && card && text.width).toBeGreaterThan(card!.width * 0.6);
    await shot(page, `${id}-layout`);
    await dialog.getByRole("button", { name: "Cancel" }).click();
  }
});

test("G3-D9: publishing the country Standard says who gets it and names the zones with their own settings", async ({ page }) => {
  await start(page, {}, "Dashboard");
  await fakeSettings(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/settings?scope=standard-SE");
  await page.locator("article.panel", { has: page.getByRole("heading", { name: "Features", exact: true }) }).locator("label.check-row input[type=checkbox]").first().click();
  await page.getByRole("button", { name: "Save draft" }).first().click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const note = page.getByRole("dialog").getByTestId("sure-standard-publish");
  await expect(note).toContainText("Are you sure? Drivers in all Sweden zones that follow the Standard get this change now.");
  await expect(note).toContainText("Zones with their own settings are NOT changed: Södermalm.");
  await shot(page, "sure-standard-publish");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
});

test("G3-D9: Copy to all zones warns when the zone has changes not yet sent to drivers", async ({ page }) => {
  await start(page);
  const settings = await fakeSettings(page);
  const entry = settings.docs.get("driver_app_config:Z002")!;
  settings.docs.set("driver_app_config:Z002", { ...entry, live: { ...entry.document, offers: { old: true } } });
  await page.goto("/dispatch/radar?zone=Z002");
  await expect(page.getByTestId("unpublished-driver-app")).toContainText("not live yet");
  await page.getByTestId("copy-all-zones").getByRole("button", { name: "Copy to all zones" }).click();
  await expect(page.getByRole("dialog").getByTestId("sure-copy-pending")).toHaveText("This zone has changes not yet sent to drivers; they will be copied and sent to all zones too.");
  await shot(page, "sure-copy-pending");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
});
