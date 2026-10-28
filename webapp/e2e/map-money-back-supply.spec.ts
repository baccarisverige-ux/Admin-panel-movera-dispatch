import { expect, test, type Page } from "@playwright/test";

async function session(page: Page, agentId = "nora") {
  await page.addInitScript((id) => {
    if (!sessionStorage.getItem("dx-test-session")) {
      localStorage.setItem("movera-admin-session", id);
      sessionStorage.setItem("dx-test-session", "1");
    }
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  }, agentId);
}

for (const where of [{ name: "Dispatch", url: "/dispatch?view=live", back: "Back to Dispatch" }, { name: "Dashboard", url: "/?tab=live", back: "Back to Dashboard" }]) {
  test(`${where.name}: supply vs demand opens a zone's drivers, a pin opens the driver, the Money tab splits the ride, and Back returns to the same pop-up`, async ({ page }) => {
    test.setTimeout(60_000);
    await session(page);
    await page.goto(where.url);
    const card = page.getByTestId("supply-demand");
    await expect(card).toBeVisible({ timeout: 20_000 });
    // A zone opens: no radar zone yet in the demo, so its drivers show directly.
    await card.getByRole("button", { name: /^Open / }).first().click();
    await expect(card.getByRole("navigation", { name: "Supply vs demand path" })).toContainText("All zones");
    await expect(card.getByText("No radar zone yet in this zone.")).toBeVisible();
    await card.getByRole("button", { name: "Back" }).click();
    await expect(card.getByRole("list", { name: "Zones by drivers needed" })).toBeVisible();

    // Find a zone with a driver on a trip, then open that driver from the list.
    const rows = card.getByRole("list", { name: "Zones by drivers needed" }).getByRole("button", { name: /^Open / });
    const count = await rows.count();
    let opened = false;
    for (let index = 0; index < count && !opened; index += 1) {
      await card.getByRole("list", { name: "Zones by drivers needed" }).getByRole("button", { name: /^Open / }).nth(index).click();
      const onTrip = card.getByRole("list", { name: "Drivers here" }).getByRole("listitem").filter({ hasText: /On trip|To pickup/ });
      if (await onTrip.count()) {
        await onTrip.first().locator(".sd-driver").click();
        opened = true;
      } else {
        await card.getByRole("button", { name: "Back" }).click();
      }
    }
    expect(opened).toBe(true);
    const panel = page.getByRole("dialog", { name: /^Driver / });
    await expect(panel).toBeVisible();
    await panel.getByTestId("driver-money-tab").click();
    // The split when the ride has a trip record, otherwise a short note that it is not known yet.
    await expect(panel.getByTestId(/^trip-money(-unknown)?$/)).toBeVisible();
    if (await panel.getByTestId("trip-money").count()) {
      await expect(panel.getByText("Rider pays")).toBeVisible();
      await expect(panel.getByTestId("trip-money-movera")).toContainText(/Movera (keeps|covers)/);
    }

    // The map keeps the open pop-up in its address; a link from the pop-up carries ?back=.
    await expect.poll(() => new URL(page.url()).searchParams.get("mapOpen") ?? "").toMatch(/^driver:/);
    const driverName = await panel.locator(".driver-panel-title strong").innerText();
    await panel.getByRole("link", { name: "Open driver" }).click();
    await expect(page).toHaveURL(/\/drivers\/.*[?&]back=/);
    // The driver page loads on demand; on a cold dev server that can take a while.
    await expect(page.getByTestId("back-to-map")).toHaveText(where.back, { timeout: 20_000 });
    await page.getByTestId("back-to-map").click();
    await expect(page.getByTestId("back-to-map")).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(where.url === "/?tab=live" ? "/\\?.*tab=live" : "/dispatch/rules\\?.*view=live"));
    await expect(page.getByRole("dialog", { name: `Driver ${driverName}` })).toBeVisible({ timeout: 15_000 });
    expect(await page.getByTestId("back-to-map").count()).toBe(0);
  });
}

test("Back to … only trusts a path on this site", async ({ page }) => {
  await session(page);
  await page.goto("/trips?back=https%3A%2F%2Fevil.example%2F");
  await expect(page.getByTestId("back-to-map")).toHaveCount(0);
  await page.goto("/trips?back=%2Fdispatch%3Fview%3Dlive");
  await expect(page.getByTestId("back-to-map")).toHaveText("Back to Dispatch");
});
