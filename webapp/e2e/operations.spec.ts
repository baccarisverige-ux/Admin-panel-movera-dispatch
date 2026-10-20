import { expect, test, type Page } from "@playwright/test";

async function session(page: Page, agentId = "nora") {
  await page.addInitScript((id) => {
    if (!sessionStorage.getItem("op-test-session")) {
      localStorage.setItem("movera-admin-session", id);
      sessionStorage.setItem("op-test-session", "1");
    }
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  }, agentId);
}

async function confirm(page: Page) {
  const modal = page.locator(".modal.open").last();
  // Cancel and refund dialogs start with no reason (A-O1): pick the first one when none is chosen.
  const reason = modal.getByLabel("Reason", { exact: true });
  if ((await reason.count()) && (await reason.inputValue()) === "") await reason.selectOption({ index: 1 });
  await modal.getByRole("button", { name: "Confirm" }).click();
}

async function switchTo(page: Page, agentId: string) {
  await page.evaluate((id) => localStorage.setItem("movera-admin-session", id), agentId);
  await page.reload();
}

test("trips: colourful groups, a quick look with the route, and a shared saved view", async ({ page }) => {
  await session(page);
  await page.goto("/trips");
  const groups = page.getByRole("navigation", { name: "Trip groups" });
  await groups.getByRole("button", { name: /Completed/ }).click();
  await expect(page.getByTestId("trip-count")).toContainText("33 match");
  await page.getByRole("button", { name: "Quick look at T0012" }).click();
  const peek = page.getByRole("complementary", { name: "Quick look at T0012" });
  await expect(peek).toContainText("Completed");
  await expect(peek.getByRole("img", { name: "Route of T0012" })).toBeVisible();
  await peek.getByRole("link", { name: "Open the full trip" }).click();
  await expect(page).toHaveURL(/\/trips\/T0012/);
  await page.goBack();
  await page.getByRole("button", { name: "Save view" }).click();
  await page.getByLabel("View name").fill("Completed trips");
  await page.getByText("Share with other admins").click();
  await page.locator(".modal.open").getByRole("button", { name: "Save view" }).click();
  await expect(page.getByText("View Completed trips saved.")).toBeVisible();
  await page.goto("/trips");
  await page.getByLabel("Saved trip views").selectOption({ label: "Completed trips" });
  await expect(page.getByTestId("trip-count")).toContainText("33 match");
});

test("trip page: who gets what, calls, and private numbers and messages behind Show", async ({ page }) => {
  await session(page);
  await page.goto("/trips/T0012");
  const split = page.getByRole("region", { name: "Who gets what" });
  await expect(split).toContainText("Rider paid");
  await expect(split).toContainText("Driver gets");
  await expect(split).toContainText("Movera keeps");
  await expect(page.getByTestId("trip-calls")).toContainText(/Driver (called|did not call) the rider/);
  const people = page.getByRole("region", { name: "People and car" });
  await expect(people).toContainText("••••");
  await expect(page.getByRole("list", { name: "Messages between rider and driver" })).toHaveCount(0);
  await people.getByRole("button", { name: "Show numbers and messages" }).click();
  await confirm(page);
  await expect(page.getByRole("list", { name: "Messages between rider and driver" })).toBeVisible();
  await expect(people).not.toContainText("••••");
  await expect(people).toContainText("+46");
  await page.goto("/reports?tab=work&admin=nora");
  await expect(page.getByLabel("Day by day")).toContainText("Show trip phone numbers and chat");
});

test("trip page: a viewer cannot see private data; super admin can turn actions off", async ({ page }) => {
  await session(page, "anna");
  await page.goto("/trips/T0012");
  await expect(page.getByText("Your role cannot see messages between riders and drivers.")).toBeVisible();
  await expect(page.getByRole("region", { name: "People and car" })).toContainText("Number hidden");
  await switchTo(page, "nora");
  await page.goto("/trips?view=settings");
  await page.getByLabel("Flag the trip on").uncheck();
  await page.getByRole("button", { name: "Save settings" }).click();
  await confirm(page);
  await expect(page.getByText("Everything is saved")).toBeVisible();
  await page.goto("/trips/T0012");
  await expect(page.getByTestId("trip-admin-actions")).toBeVisible();
  await expect(page.getByRole("button", { name: "Flag trip" })).toHaveCount(0);
});

test("trip page: refund part, flag, note, and a big pay change waits for a second admin", async ({ page }) => {
  await session(page);
  await page.goto("/trips/T0012");
  await page.getByLabel("Refund amount").fill("10");
  await page.getByRole("button", { name: "Give money back" }).click();
  await confirm(page);
  await expect(page.getByRole("status")).toContainText("refunded to");
  await expect(page.getByRole("region", { name: "Who gets what" })).toContainText("Refunded to the rider");
  await page.getByLabel("Why flag").fill("Route looked long");
  await page.getByRole("button", { name: "Flag trip" }).click();
  await confirm(page);
  await expect(page.getByRole("heading", { level: 2, name: "Trip T0012" })).toBeVisible();
  await expect(page.getByText("Flagged", { exact: true }).first()).toBeVisible();
  await page.getByLabel("Trip note").fill("Called the rider, all fine");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByRole("list", { name: "Admin work on this trip" })).toContainText("Note: Called the rider, all fine");
  await page.getByLabel("Driver pay change").fill("600");
  await page.getByRole("button", { name: "Ask a second admin" }).click();
  await confirm(page);
  const waiting = page.getByRole("region", { name: "Waiting for a second admin" });
  await expect(waiting).toContainText("Asked by Nora Lind (you)");
  await expect(waiting.getByRole("button", { name: "Approve" })).toBeDisabled();
  await switchTo(page, "lena");
  await page.goto("/trips/T0012");
  await page.getByRole("region", { name: "Waiting for a second admin" }).getByRole("button", { name: "Approve" }).click();
  await confirm(page);
  await expect(page.getByRole("list", { name: "Admin work on this trip" })).toContainText("approved by Lena Berg");
  await page.goto("/trips?group=flagged");
  await expect(page.getByTestId("trip-count")).toContainText("1 match");
});

test("incidents: take a case, change its level, late cases, and settings", async ({ page }) => {
  await session(page);
  await page.goto("/incidents");
  await expect(page.getByRole("heading", { name: "Incidents in Sweden" })).toBeVisible();
  const view = page.getByRole("article", { name: "Case INC-1" });
  await expect(view).toContainText("Late: not taken after");
  await view.getByRole("button", { name: "Take", exact: true }).click();
  await confirm(page);
  await expect(page.getByRole("heading", { name: "INC-1 · taken" })).toBeVisible();
  await expect(view).toContainText("Owner Nora Lind (you)");
  await view.getByRole("radiogroup", { name: "Case level" }).getByText("High").click();
  await view.getByRole("button", { name: "Change level" }).click();
  await confirm(page);
  await expect(page.getByRole("list").filter({ hasText: "INC-1" }).first()).toContainText("High");
  await expect(view.getByRole("region", { name: "What happened" })).toContainText("Level set to High");
  await expect(view.getByRole("img", { name: "Where the people of INC-1 are" })).toBeVisible();
  await expect(view.getByRole("region", { name: "Call" })).toContainText("112");
  await page.getByRole("radiogroup", { name: "Show" }).getByText("Solved").click();
  await expect(page.getByRole("complementary", { name: "Cases" })).not.toContainText("INC-1");
  await page.goto("/incidents?view=settings");
  await page.getByLabel("Live map on the case on").uncheck();
  await page.getByRole("button", { name: "Save settings" }).click();
  await confirm(page);
  await page.goto("/incidents");
  await expect(page.getByRole("img", { name: "Where the people of INC-1 are" })).toHaveCount(0);
});

test("risk: safety rules keep working, fraud rules preview before saving, and flagged people are reviewed", async ({ page }) => {
  await session(page);
  await page.goto("/risk");
  await expect(page.getByRole("heading", { name: "Risk in Sweden" })).toBeVisible();
  await expect(page.getByText("After 12 h of work, 6 h rest")).toBeVisible();
  await page.getByRole("tab", { name: "Fraud rules" }).click();
  const preview = page.getByRole("region", { name: "Test before saving" });
  await page.getByLabel("Promotion abuse on").check();
  await expect(preview).toContainText(/\(now [1-9]\d*\)/);
  const now = (await preview.innerText()).match(/\(now (\d+)\)/)?.[1];
  await page.getByLabel("Promotion abuse on").uncheck();
  await expect(preview).toContainText(`${now} people flagged`);
  await page.getByLabel("Promotion abuse on").check();
  await expect(preview).toContainText(`(now ${now})`);
  await page.getByRole("button", { name: "Save fraud rules" }).click();
  await confirm(page);
  await expect(page.getByText("Everything is saved")).toBeVisible();
  await expect(page.getByRole("region", { name: "Rule changes" })).toContainText("Promotion abuse: on");
  await page.getByRole("tab", { name: "Flagged people" }).click();
  const first = page.getByRole("list", { name: "Flagged people" }).getByRole("listitem").first();
  const name = (await first.getByRole("link").innerText()).trim();
  await first.getByRole("button", { name: "All fine" }).click();
  await confirm(page);
  await expect(page.getByRole("list", { name: "Flagged people" })).not.toContainText(name);
  await page.getByLabel("Show people already checked on").check();
  await expect(page.getByRole("list", { name: "Flagged people" })).toContainText(`All fine by Nora Lind`);
});

test("handover: the shift fills itself in, the next admin reads it, past handovers show who read them", async ({ page }) => {
  await session(page);
  await page.goto("/handover");
  const shift = page.getByRole("region", { name: "Your shift so far" });
  await expect(shift).toContainText("Open incidents");
  await expect(shift).toContainText("Nobody has taken these yet");
  await page.getByLabel("Handover note").fill("Arlanda busy until 22:00.");
  await page.getByLabel("New to-do").fill("Call driver about the late document");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel("Next admin").selectOption({ label: "Lena Berg" });
  await page.getByRole("button", { name: "Hand over" }).click();
  await expect(page.getByText("Handed over.")).toBeVisible();
  await switchTo(page, "lena");
  await page.goto("/handover");
  const note = page.getByRole("article", { name: "Handover from Nora Lind" });
  await expect(note).toContainText("Arlanda busy until 22:00.");
  await expect(note).toContainText("Call driver about the late document");
  await note.getByRole("button", { name: "I read it" }).click();
  await expect(note).toHaveCount(0);
  await page.getByRole("tab", { name: "Past handovers" }).click();
  await expect(page.getByRole("list", { name: "Past handovers" })).toContainText("Read by Lena Berg");
  await page.getByRole("tab", { name: "Runbooks and drills" }).click();
  await page.getByRole("button", { name: "Run drills" }).click();
  await expect(page.getByText(/SOS · (pass|not passed)/)).toBeVisible();
});

test("live map says where the dispatch rules are; operations pages fit a phone", async ({ page }) => {
  await session(page);
  await page.goto("/live");
  await expect(page.getByTestId("dispatch-link").getByRole("link", { name: "Open Dispatch" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 860 });
  for (const path of ["/trips", "/trips/T0012", "/incidents", "/risk?tab=flagged", "/handover"]) {
    await page.goto(path);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(392);
  }
});
