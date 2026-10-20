import { expect, test, type Page } from "@playwright/test";

/** Wave A: the owner's round-2 answers (Q22–Q40) and C-14, C-16, C-17, C-18, C-22, C-26, UI-16. */

async function session(page: Page, agentId = "nora") {
  await page.addInitScript((id) => {
    localStorage.setItem("movera-admin-session", id);
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  }, agentId);
}

const dialog = (page: Page) => page.locator(".modal.open");
const storedDb = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("movera-demo-v5") ?? "null") as { rev: number; audits: { action: string; actorId: string }[]; slices: Record<string, unknown> } | null);

test("Q22: the ticket header says who opened it and when, in local time; the owner matches the list", async ({ page }) => {
  await session(page);
  await page.goto("/tickets/S002");
  const opened = page.getByTestId("ticket-opened");
  await expect(opened).toHaveText(/^(Rider|Driver) .+ · \d{1,2} [A-Z][a-z]{2} \d{2}:\d{2}$/);
  await expect(page.getByTestId("ticket-owner")).not.toContainText(/\d{4}-\d{2}-\d{2}T/);
  const side = await page.getByRole("complementary", { name: "About this ticket" }).locator(".sp-card h4").last().innerText();
  const owner = await page.getByTestId("ticket-owner").innerText();
  if (/is working on it/.test(side)) expect(owner).toContain(side.replace(/^\W*/, "").replace(" is working on it", ""));
  else expect(owner).toContain("Nobody is working on it");
});

test("Q23: every detail address has the same Not found page: title, search and back to the list", async ({ page }) => {
  await session(page);
  for (const [path, title, back] of [
    ["/trips/NOPE", "Trip not found", "Back to trips"],
    ["/tickets/NOPE", "Ticket not found", "Back to support"],
    ["/zones/NOPE", "Zone not found", "Back to zones"],
    ["/team/NOPE", "Admin not found", "Back to the team"],
    ["/drivers/NOPE", "Driver not found", "Back to drivers"],
    ["/riders/NOPE", "Rider not found", "Back to riders"],
    ["/payments/NOPE", "Payment not found", "Back to payments"],
    ["/payouts/NOPE", "Payout not found", "Back to payouts"],
    ["/vehicles/NOPE", "Vehicle not found", "Back to vehicles"],
    ["/reservations/NOPE", "Reservation not found", "Back to reservations"],
  ] as const) {
    await page.goto(path);
    const missing = page.getByTestId("record-missing");
    await expect(missing.getByRole("heading", { level: 2 })).toHaveText(title);
    await expect(missing.getByLabel("Search the admin")).toBeVisible();
    await expect(missing.getByRole("link", { name: back })).toBeVisible();
  }
  // The ticket address no longer quietly opens the first ticket.
  await page.goto("/tickets/NOPE");
  await expect(page.getByRole("article", { name: /^Ticket / })).toHaveCount(0);
  // The search finds records to open instead.
  await page.goto("/trips/NOPE");
  await page.getByLabel("Search the admin").fill("D0002");
  await page.getByRole("list", { name: "Search results" }).getByRole("listitem").filter({ hasText: "driver · D0002" }).getByRole("link").click();
  await expect(page).toHaveURL(/\/drivers\/D0002/);
  await page.goto("/trips/NOPE");
  await page.getByRole("link", { name: "Back to trips" }).click();
  await expect(page).toHaveURL(/\/trips$/);
});

test("Q24: at 1280 px and on phones the top bar keeps Search, the bell and the profile; the rest is in ⋯", async ({ page }) => {
  await session(page);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dispatch");
    const bar = page.locator("header.topbar");
    await expect(bar.getByRole("button", { name: "Search", exact: true })).toBeVisible();
    await expect(bar.getByRole("button", { name: /^Alerts, \d+ open$/ })).toBeVisible();
    await expect(bar.locator(".admin-profile .avatar")).toBeVisible();
    await expect(bar.getByRole("radiogroup", { name: "Country" })).toBeHidden();
    await expect(bar.getByRole("button", { name: "Sign out" })).toBeHidden();
    // One row, no overlapping name and meta line.
    expect((await bar.boundingBox())!.height).toBeLessThan(90);
    const more = bar.getByRole("button", { name: "More options", exact: true });
    await more.click();
    const menu = page.getByRole("group", { name: "More options" });
    await expect(menu.getByRole("radiogroup", { name: "Country" })).toBeVisible();
    await expect(menu.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(menu).toContainText("super");
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(more).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dispatch");
  await expect(page.locator("header.topbar").getByRole("button", { name: "More options", exact: true })).toBeHidden();
  await expect(page.locator("header.topbar").getByRole("radiogroup", { name: "Country" })).toBeVisible();
});

test("Q33 / C-17: opening Settings saves nothing, a due schedule waits for Save, and leaving asks first", async ({ page }) => {
  await session(page);
  await page.goto("/settings");
  await page.getByRole("checkbox", { name: "Wallet", exact: true }).uncheck();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved through AdminApi.")).toBeVisible();
  // A scheduled publication that is already due, as another admin left it.
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("movera-demo-v5")!);
    const config = db.slices.config;
    config.scheduled = [{ rev: config.rev + 1, actorId: "lena", effectiveAt: "2020-01-01T00:00:00.000Z", expiresAt: null, snapshot: config.draft, diff: ["Wallet on → off"] }];
    localStorage.setItem("movera-demo-v5", JSON.stringify(db));
  });
  const before = (await storedDb(page))!;
  await page.reload();
  await expect(page.getByRole("heading", { name: "Configuration" })).toBeVisible();
  // Still due (not applied behind the admin's back), and nothing was written.
  await expect(page.getByRole("button", { name: "Apply due schedule / expiry" })).toBeEnabled();
  const after = (await storedDb(page))!;
  expect(after.audits.filter((row) => row.action === "admin.config.save").length).toBe(before.audits.filter((row) => row.action === "admin.config.save").length);
  expect(after.rev).toBe(before.rev);
  await expect(page.getByText(/A scheduled change is due/)).toBeVisible();
  // Unsaved changes: a link away asks first; Cancel keeps the page.
  await page.getByRole("checkbox", { name: "Wallet", exact: true }).check();
  let asked = "";
  page.once("dialog", (prompt) => { asked = prompt.message(); void prompt.dismiss(); });
  await page.getByRole("link", { name: "Dispatch", exact: true }).click();
  expect(asked).toContain("unsaved changes");
  await expect(page).toHaveURL(/\/settings/);
});

test("Q31 / C-16: while a command runs, the other command buttons wait with a spinner and Please wait", async ({ page }) => {
  await session(page);
  await page.goto("/system");
  await page.getByLabel("Simulate errors").selectOption("slow");
  await page.goto("/settings");
  await page.getByRole("checkbox", { name: "Wallet", exact: true }).uncheck();
  await page.getByRole("button", { name: "Save draft" }).click();
  const search = page.locator("header.topbar").getByRole("button", { name: /^Search/ });
  await expect(search).toBeDisabled();
  await expect(search).toContainText("Please wait");
  await expect(page.getByText(/Draft saved through AdminApi|Done\. Saved in demo/).first()).toBeVisible();
  await expect(search).toBeEnabled();
  await expect(search).not.toContainText("Please wait");
  await page.goto("/system");
  await page.getByLabel("Simulate errors").selectOption("none");
});

test("Q31 / Q32: My activity in Dispatch lists what this admin did; the super admin sees everyone and exports CSV", async ({ page, context }) => {
  await session(page, "lena");
  await page.goto("/trips/T0004");
  await page.getByRole("button", { name: "Cancel trip" }).click();
  await dialog(page).getByLabel("Cancel reason").selectOption({ index: 1 });
  await dialog(page).getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByTestId("trip-waybill")).toContainText("Cancelled by admin");
  await page.goto("/dispatch");
  await page.getByRole("button", { name: "My activity" }).click();
  const list = page.getByRole("list", { name: "Activity list" });
  const row = list.getByRole("listitem").filter({ hasText: "Cancel trip" }).first();
  await expect(row).toContainText("Done");
  await row.getByRole("button").click();
  await expect(row).toContainText("T0004");
  await expect(row).toContainText("cancelled_by_admin");
  // Only their own activity, and no export for a non-super admin.
  await expect(page.getByRole("region", { name: "My activity" }).getByLabel("Admin")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Export CSV/ })).toHaveCount(0);

  const nora = await context.newPage();
  await session(nora, "nora");
  await nora.goto("/dispatch?view=activity");
  await expect(nora.getByRole("heading", { name: "Activity of every admin" })).toBeVisible();
  await nora.getByRole("region", { name: "My activity" }).getByLabel("Admin").selectOption("lena");
  await expect(nora.getByRole("list", { name: "Activity list" })).toContainText("Cancel trip");
  const download = nora.waitForEvent("download");
  await nora.getByRole("button", { name: /Export CSV/ }).click();
  expect((await download).suggestedFilename()).toMatch(/^movera-activity-last-120-days-.*\.csv$/);
});

test("Q28: Undo of a big price change asks Are you sure, like Publish", async ({ page }) => {
  await session(page);
  await page.goto("/pricing");
  const base = page.getByLabel("Norrmalm Movera Base fare");
  const published = Number(await base.inputValue());
  await base.fill(String(published * 3));
  await page.getByRole("button", { name: "Publish changes" }).click();
  await dialog(page).getByLabel("Yes, I'm sure").check();
  await dialog(page).getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(/Published as pricing revision/)).toBeVisible();
  await page.getByRole("button", { name: /^Undo last publish/ }).click();
  const warning = dialog(page).getByTestId("large-change-warning");
  await expect(warning).toContainText("Are you sure?");
  await expect(warning).toContainText("Norrmalm · Movera Base fare");
  await expect(dialog(page).getByRole("button", { name: "Confirm" })).toBeDisabled();
  await dialog(page).getByLabel("Yes, I'm sure").check();
  await dialog(page).getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(/undone/)).toBeVisible();
});

test("Q29: commission moved more than 50% asks Are you sure", async ({ page }) => {
  await session(page);
  await page.goto("/pricing?tab=commission");
  const commission = page.getByLabel("Movera commission");
  const now = Number(await commission.inputValue());
  await commission.fill(String(now * 2));
  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect(dialog(page).getByTestId("large-change-warning")).toContainText("Movera commission");
  await dialog(page).getByRole("button", { name: "Cancel" }).click();
});

test("Q25 / C-22: one second-admin limit per country, set in Settings, used by the payment page and the server", async ({ page }) => {
  await session(page);
  await page.goto("/payments/PAY0005");
  await expect(page.getByRole("button", { name: "Refund payment" })).toBeVisible();
  await expect(page.getByText(/Refunds above 500,00 kr also need a second admin/)).toBeVisible();
  await page.goto("/settings");
  const panel = page.getByTestId("refund-policy");
  await expect(panel.getByLabel("Sweden second admin above")).toHaveValue("500");
  await expect(panel.getByLabel("France second admin above")).toHaveValue("50");
  await expect(panel.getByLabel("Tunisia second admin above")).toHaveValue("150");
  await panel.getByLabel("Sweden second admin above").fill("50");
  await panel.getByRole("button", { name: "Save refund limits" }).click();
  await expect(dialog(page).getByTestId("large-change-warning")).toContainText("Sweden");
  await dialog(page).getByLabel("Yes, I'm sure").check();
  await dialog(page).getByRole("button", { name: "Confirm" }).click();
  await expect(panel.getByText("Refund limits saved.")).toBeVisible();
  await page.goto("/payments/PAY0005");
  await expect(page.getByRole("button", { name: "Request refund approval" })).toBeVisible();
  await page.getByRole("button", { name: "Request refund approval" }).click();
  await dialog(page).getByLabel("Type PAY0005 to confirm").fill("PAY0005");
  await dialog(page).getByLabel("Reason", { exact: true }).selectOption("Charged twice");
  await dialog(page).getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(/Pending approval/).first()).toBeVisible();
  // Trip settings and Team show the same rule read-only, with a link to Settings.
  await page.goto("/team?tab=limits");
  await expect(page.getByRole("link", { name: "Edit in Settings" })).toHaveAttribute("href", "/settings#refunds");
});

test("Q40: All features lists every setting, filters with a search box and opens its section", async ({ page }) => {
  await session(page);
  await page.goto("/dispatch");
  await page.getByRole("button", { name: "All features" }).click();
  const list = page.getByRole("list", { name: "Features" });
  await expect(list.getByRole("listitem").nth(40)).toBeVisible();
  await page.getByLabel("Find a setting").fill("max stops");
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await list.getByRole("link", { name: /Stops and max stops/ }).click();
  await expect(page).toHaveURL(/tab=rides/);
  await expect(page).toHaveURL(/card=Stops/);
  await expect(page.getByRole("region", { name: "Stops", exact: true })).toBeInViewport();
  await page.goto("/dispatch?view=features");
  await page.getByLabel("Find a setting").fill("second admin");
  await list.getByRole("link", { name: /Refunds: when a second admin/ }).click();
  await expect(page).toHaveURL(/\/settings#refunds/);
  await expect(page.getByTestId("refund-policy")).toBeVisible();
});

test("UI-16: no audio warning in the console before a click, and the favicon loads", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (message) => { if (/AudioContext/.test(message.text())) problems.push(message.text()); });
  page.on("response", (response) => { if (/favicon/.test(response.url()) && response.status() >= 400) problems.push(`${response.status()} ${response.url()}`); });
  await session(page);
  for (const path of ["/onboarding", "/payouts", "/team", "/"]) {
    await page.goto(path);
    await expect(page.locator("main#content h2").first()).toBeVisible();
  }
  expect(problems).toEqual([]);
  const icon = await page.evaluate(() => document.querySelector<HTMLLinkElement>("link[rel=icon]")?.href ?? "");
  expect(icon).toMatch(/favicon\.svg$/);
  expect((await page.request.get(icon)).status()).toBe(200);
});
