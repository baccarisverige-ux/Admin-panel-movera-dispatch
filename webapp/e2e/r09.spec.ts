import { expect, test, type Page } from "@playwright/test";

async function session(page: Page, agentId = "nora") {
  await page.addInitScript((id) => {
    localStorage.setItem("movera-admin-session", id);
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  }, agentId);
}

async function confirm(page: Page) {
  await page.locator(".modal.open").last().getByRole("button", { name: "Confirm" }).click();
}

async function publish(page: Page) {
  await page.getByRole("region", { name: "Unpublished changes" }).getByRole("button", { name: "Publish changes" }).click();
  await confirm(page);
}

test("R9 prices, fees and commission are drafted, published per zone and persist", async ({ page }) => {
  test.setTimeout(90_000);
  await session(page);
  await page.goto("/pricing?zone=Z002");
  await expect(page.getByRole("heading", { level: 2, name: "Pricing" })).toBeVisible();

  await page.getByLabel("Södermalm Movera Price per km").fill("20");
  await page.getByLabel("Södermalm Movera Free waiting at pickup").fill("3");
  const bar = page.getByRole("region", { name: "Unpublished changes" });
  await expect(bar).toContainText("Unpublished changes in Södermalm");
  await expect(bar).toContainText("2 changes");
  await publish(page);
  await expect(page.getByText("Published as pricing revision 2.")).toBeVisible();
  await expect(bar).toHaveCount(0);

  await page.getByRole("tab", { name: "Fees" }).click();
  await page.getByLabel("Reservation fee").fill("30");
  await page.getByLabel("Tip presets").fill("10, 25, 40");
  await publish(page);
  await expect(page.getByText("Published as pricing revision 3.")).toBeVisible();

  await page.getByRole("button", { name: /^Test a ride/ }).click();
  const quote = page.getByTestId("quote-preview");
  await quote.getByLabel("Quote surge").fill("1");
  // 29 + 8 × 20 + 18 × 4 = 261, + 10% app fee = 287.10 → 287
  await expect(page.getByTestId("quote-total")).toHaveText("287,00 kr");
  await quote.getByLabel("Quote Reservation").check();
  await expect(page.getByTestId("quote-total")).toHaveText("320,00 kr");

  await page.getByRole("tab", { name: "Commission" }).click();
  await page.getByLabel("Movera commission").fill("18");
  await publish(page);
  await expect(page.getByText("Published as pricing revision 4.")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Movera commission")).toHaveValue("18");
  await page.getByRole("tab", { name: "Fees" }).click();
  await expect(page.getByLabel("Reservation fee")).toHaveValue("30");
  await expect(page.getByLabel("Tip presets")).toHaveValue("10, 25, 40");
  await page.getByRole("tab", { name: "Prices" }).click();
  await expect(page.getByLabel("Södermalm Movera Price per km")).toHaveValue("20");
  await expect(page.getByLabel("Norrmalm Movera Price per km")).toHaveCount(0);
  await page.getByRole("button", { name: /^Norrmalm/ }).click();
  await expect(page.getByLabel("Norrmalm Movera Price per km")).toHaveValue("12");
});

test("R9 a wrong value blocks publishing and points at the field", async ({ page }) => {
  await session(page);
  await page.goto("/pricing?zone=Z001");
  await page.getByLabel("Norrmalm Premium Maximum fare").fill("50");
  const bar = page.getByRole("region", { name: "Unpublished changes" });
  await expect(bar).toContainText("Premium: minimum fare is higher than the maximum fare.");
  await expect(bar.getByRole("button", { name: "Publish changes" })).toBeDisabled();
  await expect(page.getByLabel("Norrmalm Premium Minimum fare")).toHaveAttribute("aria-invalid", "true");
  // A value over the field's maximum stays in the box, marked, and also blocks publishing (UI-05).
  await page.getByLabel("Norrmalm Premium Minimum fare").fill("9000");
  await expect(bar).toContainText("Max 2000 kr.");
  await expect(bar.getByRole("button", { name: "Publish changes" })).toBeDisabled();
  await bar.getByRole("button", { name: "Discard" }).click();
  await expect(page.getByLabel("Norrmalm Premium Maximum fare")).toHaveValue("2700");
  await expect(page.getByLabel("Norrmalm Premium Minimum fare")).toHaveValue("88");
});

test("R9 manual surge starts with a slider, asks above ×3, wins over smart and stops", async ({ page }) => {
  test.setTimeout(60_000);
  await session(page);
  await page.goto("/pricing?zone=Z003&tab=surge");
  const slider = page.getByRole("slider", { name: "Manual surge" });
  await slider.fill("3");
  await slider.press("ArrowRight");
  await expect(page.getByText("×3.1 is a high surge.")).toBeVisible();
  await page.getByRole("button", { name: "Back to ×3.0" }).click();
  await slider.fill("2.2");
  await page.getByLabel("Manual surge duration").selectOption("30");
  await page.getByRole("button", { name: "Start surge ×2.2" }).click();
  await confirm(page);
  await expect(page.getByText(/Manual surge ×2.2 started in Östermalm for 30 min. Drivers were told./)).toBeVisible();
  await expect(page.getByTestId("surge-now")).toHaveText("×2.2");
  await expect(page.getByRole("region", { name: "Surge now in Östermalm" })).toContainText("Manual");
  await expect(page.getByRole("list", { name: "Surge timeline" })).toContainText("Manual surge ×2.2 started");
  await expect(page.getByRole("button", { name: /^Östermalm/ }).first()).toContainText("×2.2");

  await page.reload();
  await expect(page.getByTestId("surge-now")).toHaveText("×2.2");
  await page.getByRole("button", { name: "Stop surge" }).click();
  await confirm(page);
  await expect(page.getByText("Manual surge in Östermalm stopped.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Surge now in Östermalm" })).not.toContainText("Manual");
});

test("R9 smart surge profiles and a scheduled surge are saved with the draft", async ({ page }) => {
  test.setTimeout(60_000);
  await session(page);
  await page.goto("/pricing?zone=Z002&tab=surge");
  await page.locator("label.mini-switch", { has: page.getByRole("checkbox", { name: "Smart surge on" }) }).click();
  await expect(page.getByRole("checkbox", { name: "Smart surge on" })).not.toBeChecked();
  await page.getByRole("button", { name: "Plan a surge" }).click();
  await page.getByLabel("Scheduled surge name").fill("Concert");
  await page.getByLabel("Scheduled surge start").fill("2026-12-31T20:00");
  await page.getByLabel("Scheduled surge end").fill("2027-01-01T03:00");
  await page.getByRole("button", { name: "Add time profile" }).click();
  await publish(page);
  await expect(page.getByText(/Published as pricing revision 2/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Smart surge on" })).not.toBeChecked();
  await expect(page.getByLabel("Scheduled surge name")).toHaveValue("Concert");
  await expect(page.getByRole("article", { name: "Time profile New profile" })).toBeVisible();
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByRole("list", { name: "Pricing history" })).toContainText("Smart surge turned off");
});

test("R9 history restores an older revision as a new one, and undo goes back one publish", async ({ page }) => {
  await session(page);
  await page.goto("/pricing?zone=Z002");
  await page.getByLabel("Södermalm Movera Price per km").fill("20");
  await publish(page);
  await expect(page.getByText(/pricing revision 2/)).toBeVisible();
  await page.getByLabel("Södermalm Movera Price per km").fill("25");
  await publish(page);
  await expect(page.getByText(/pricing revision 3/)).toBeVisible();

  await page.getByRole("tab", { name: "History" }).click();
  const rev2 = page.getByRole("list", { name: "Pricing history" }).getByRole("listitem").filter({ hasText: "Revision 2" }).first();
  await expect(rev2).toContainText("Södermalm · Movera · Price per km 12 → 20");
  await rev2.getByRole("button", { name: "Restore" }).click();
  await confirm(page);
  await expect(page.getByText("Pricing revision 2 restored as revision 4.")).toBeVisible();
  await page.getByRole("tab", { name: "Prices" }).click();
  await expect(page.getByLabel("Södermalm Movera Price per km")).toHaveValue("20");

  await page.getByRole("button", { name: /^Undo last publish/ }).click();
  await confirm(page);
  await expect(page.getByText("Revision 4 undone.")).toBeVisible();
  await expect(page.getByLabel("Södermalm Movera Price per km")).toHaveValue("25");
});

test("R9 categories can be added and deleted only through the safety check", async ({ page }) => {
  await session(page);
  await page.goto("/pricing");
  await page.getByRole("button", { name: /^Categories/ }).click();
  const dialog = page.getByRole("dialog", { name: "Manage categories" });
  await dialog.getByRole("button", { name: "Delete Movera" }).click();
  await expect(dialog.getByRole("region", { name: "Delete Movera" })).toContainText("cannot be deleted now");

  await dialog.getByRole("button", { name: "New category" }).click();
  await dialog.getByLabel("New category name").fill("Women Driver");
  await dialog.getByLabel("New category line").fill("A woman drives you");
  await dialog.getByRole("button", { name: "Add category" }).click();
  await confirm(page);
  await expect(page.getByText(/Women Driver added/)).toBeVisible();

  await dialog.getByRole("button", { name: "Delete Women Driver" }).click();
  await dialog.getByRole("button", { name: "Delete safely" }).click();
  const check = page.locator(".modal.open").last();
  await expect(check.getByRole("button", { name: "Confirm" })).toBeDisabled();
  await check.getByLabel("Type Women Driver to confirm").fill("Women Driver");
  await confirm(page);
  await expect(page.getByText("Women Driver deleted. You can restore it for 30 days.")).toBeVisible();
  await expect(dialog.getByText("Deleted (can be restored for 30 days)")).toBeVisible();
  await dialog.getByRole("button", { name: "Restore" }).click();
  await confirm(page);
  await expect(page.getByText("Women Driver restored.")).toBeVisible();
  await dialog.getByRole("button", { name: "Close categories" }).click();
  await expect(page.getByRole("checkbox", { name: "Women Driver available in Norrmalm" })).not.toBeChecked();
});

test("R9 copy to zones fills drafts for review before publishing", async ({ page }) => {
  await session(page);
  await page.goto("/pricing?zone=Z001");
  await page.getByLabel("Norrmalm Movera Price per km").fill("14");
  await page.getByRole("button", { name: /^Copy to zones/ }).click();
  await page.getByRole("checkbox", { name: "Copy to Södermalm" }).check();
  await page.getByRole("checkbox", { name: "Copy to Paris Centre" }).check();
  await page.getByRole("button", { name: "Copy to 2 zones" }).click();
  await expect(page.getByText(/Copied Norrmalm to 2 zones as drafts/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Unpublished changes" })).toContainText("Norrmalm, Södermalm, Paris Centre");
  await page.getByRole("button", { name: /^Södermalm/ }).click();
  await expect(page.getByLabel("Södermalm Movera Price per km")).toHaveValue("14");
});

test("R9 content role can look at pricing but cannot change it", async ({ page }) => {
  await session(page, "elsa");
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { level: 2, name: "Pricing" })).toBeVisible();
  await expect(page.getByText(/read-only for pricing/)).toBeVisible();
  await expect(page.getByLabel("Norrmalm Movera Price per km")).toBeDisabled();
  await expect(page.getByRole("button", { name: /^Start surge/ })).toBeDisabled();
  await page.getByRole("tab", { name: "Fees" }).click();
  await expect(page.getByLabel("Reservation fee")).toBeDisabled();
  await page.getByRole("button", { name: /^Test a ride/ }).click();
  await expect(page.getByTestId("quote-total")).toBeVisible();
});

test("R9 pricing remains usable at 390px", async ({ page }) => {
  await session(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const tab of ["prices", "fees", "surge", "commission", "pickup", "history"]) {
    await page.goto(`/pricing?tab=${tab}`);
    await expect(page.getByRole("tab", { name: new RegExp(tab, "i") })).toHaveAttribute("aria-selected", "true");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, tab).toBeLessThanOrEqual(2);
  }
  await page.getByRole("button", { name: /^Test a ride/ }).click();
  await expect(page.getByTestId("quote-preview")).toBeVisible();
});

test("R9 surge map style and layer switch, and the dashboard shows the surge layer", async ({ page }) => {
  await session(page);
  await page.goto("/pricing?tab=surge");
  const styles = page.getByRole("radiogroup", { name: "Surge map style" });
  await styles.getByRole("radio", { name: "Hexagons" }).click();
  await expect(styles.getByRole("radio", { name: "Hexagons" })).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(page.getByRole("radio", { name: "Hexagons" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Surge layer" }).click();
  await expect(page.getByRole("radiogroup", { name: "Surge map style" })).toHaveCount(0);

  await page.goto("/?tab=live");
  await page.getByRole("button", { name: "Surge layer" }).click();
  await expect(page.getByLabel("Surge colours")).toBeVisible();
  await page.getByRole("radio", { name: "Glow" }).click();
  await expect(page.getByRole("radio", { name: "Glow" })).toHaveAttribute("aria-checked", "true");
});
