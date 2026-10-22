import { expect, test, type Page } from "@playwright/test";

async function session(page: Page, agentId = "nora") {
  await page.addInitScript((id) => {
    localStorage.setItem("movera-admin-session", id);
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  }, agentId);
}

async function confirm(page: Page) {
  const modal = page.locator(".modal.open").last();
  const sure = modal.getByLabel("Yes, I'm sure");
  if (await sure.count()) await sure.check();
  await modal.getByRole("button", { name: "Confirm" }).click();
}

test("N5: a surge zone on the Dashboard map opens a quick pop-up: level, time, curve, OK", async ({ page }) => {
  test.setTimeout(90_000);
  await session(page);
  await page.goto("/?tab=live");
  const layer = page.getByRole("button", { name: "Surge layer" });
  if ((await layer.getAttribute("aria-pressed")) !== "true") await layer.click();
  // Map pills are redrawn as drivers move, so they are clicked with a plain click event.
  await page.getByRole("button", { name: /^Östermalm: / }).first().dispatchEvent("click");

  const pop = page.getByTestId("surge-quick-popup");
  await expect(pop).toBeVisible();
  await expect(pop.getByRole("link", { name: /Open full screen/ })).toHaveAttribute("href", /\/pricing\?zone=Z003&tab=surge/);
  // The demo's surge follows the time of day, so the test starts from whatever level the zone has now.
  const start = Number((await pop.locator("output").innerText()).replace("×", ""));
  const raised = (start + 0.1).toFixed(1);
  const peak = (start + 0.2).toFixed(1);
  await pop.getByRole("button", { name: "Raise the surge" }).click();
  await expect(pop.locator("output")).toHaveText(`×${raised}`);
  await pop.getByRole("button", { name: "10 min", exact: true }).click();
  await expect(pop).toContainText("Ends by itself at");

  await pop.getByRole("button", { name: /Shape it over time/ }).click();
  const first = pop.getByRole("slider", { name: /^Point 1:/ });
  await first.focus();
  await page.keyboard.press("ArrowUp");
  await expect(pop.getByRole("slider", { name: /^Point 1:/ })).toHaveAttribute("aria-valuenow", peak);

  await pop.getByRole("button", { name: "OK", exact: true }).click();
  await confirm(page);
  await expect(page.getByText(`Surge in Östermalm set: curve up to ×${peak} for 10 min.`)).toBeVisible();
  await expect(pop).toBeHidden();
});

test("N5/N8: Dispatch's live map has the surge layer, its new styles, bonus areas and the same pop-up", async ({ page }) => {
  test.setTimeout(90_000);
  await session(page);
  await page.goto("/dispatch?view=live");
  const layers = page.getByRole("toolbar", { name: "Map layers" });
  await expect(layers.getByRole("button", { name: /Driver bonus areas/ })).toBeVisible();
  const layer = layers.getByRole("button", { name: "Surge layer" });
  if ((await layer.getAttribute("aria-pressed")) !== "true") await layer.click();
  const styles = layers.getByRole("radiogroup", { name: "Surge map style" });
  for (const name of ["Heatmap", "Flat hexagons", "Label only", "Pulse rings", "Bubbles", "Density dots", "Soft outline"]) await expect(styles.getByRole("radio", { name })).toBeVisible();
  await styles.getByRole("radio", { name: "Label only" }).click();
  await expect(styles.getByRole("radio", { name: "Label only" })).toHaveAttribute("aria-checked", "true");
  // With map fonts, Label only writes "×1.4" on the map itself (no pills); the zone pills are clicked in the Zones style.
  await styles.getByRole("radio", { name: "Zones", exact: true }).click();
  await expect(styles.getByRole("radio", { name: "Zones", exact: true })).toHaveAttribute("aria-checked", "true");

  await page.getByRole("button", { name: /^Södermalm: / }).first().dispatchEvent("click");
  const pop = page.getByTestId("surge-quick-popup");
  await expect(pop).toBeVisible();
  await pop.getByRole("button", { name: "30 min", exact: true }).click();
  await pop.getByRole("button", { name: "OK", exact: true }).click();
  await confirm(page);
  await expect(page.getByText(/Surge in Södermalm set: ×\d+\.\d for 30 min\./)).toBeVisible();

  // Open it again and switch the manual surge off.
  await page.getByRole("button", { name: /^Södermalm: / }).first().dispatchEvent("click");
  await expect(pop).toContainText("Manual");
  await pop.getByRole("button", { name: /^Manual surge/ }).click();
  await pop.getByRole("button", { name: "OK", exact: true }).click();
  await confirm(page);
  // The demo moves on its own; a save one step behind is refused and simply sent again, as an admin would.
  const stale = pop.getByText(/Someone else changed this/);
  if (await stale.isVisible().catch(() => false)) {
    await pop.getByRole("button", { name: "OK", exact: true }).click();
    await confirm(page);
  }
  await expect(page.getByText("Manual surge in Södermalm stopped.")).toBeVisible();
});
