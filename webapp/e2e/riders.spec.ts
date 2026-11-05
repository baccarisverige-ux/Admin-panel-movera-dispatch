import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email").fill("nora@movera.se");
  await page.getByLabel("Password").fill("movera");
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("link", { name: "Riders", exact: true })).toBeVisible();
}

async function session(page: Page, agentId = "nora") {
  await page.addInitScript((id) => {
    localStorage.setItem("movera-admin-session", id);
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  }, agentId);
}

async function confirm(page: Page, target?: string) {
  const modal = page.locator(".modal.open").last();
  if (target) await modal.getByLabel(`Type ${target} to confirm`).fill(target);
  await modal.getByRole("button", { name: "Confirm" }).click();
}

test("a rider is found by code and the booking history shows every outcome", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page);
  await page.getByRole("link", { name: "Riders", exact: true }).click();
  await expect(page.getByRole("button", { name: /New riders/ })).toBeVisible();
  await page.getByLabel("Find rider").fill("RD-SE-0001");
  const list = page.getByRole("list", { name: "Riders" });
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await list.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/riders\/R0001/);
  await expect(page.getByText("RD-SE-0001")).toBeVisible();

  await page.getByRole("tab", { name: "Bookings" }).click();
  const outcomes = page.getByRole("group", { name: "Booking outcome" });
  for (const label of ["Completed", "Cancelled by rider", "Cancelled by driver", "No-show", "Interrupted", "In progress", "Scheduled"]) await expect(outcomes.getByRole("button", { name: new RegExp(`^${label}`) })).toBeVisible();
  await outcomes.getByRole("button", { name: /^Completed/ }).click();
  const history = page.getByRole("list", { name: "Booking history" });
  await expect(history.getByText("Cancelled by rider")).toHaveCount(0);
  await history.getByRole("button").first().click();
  await expect(page.locator(".rd-booking-more").first()).toContainText("Outcome");

  await page.getByRole("button", { name: "Unblock" }).click();
  await confirm(page, "R0001");
  await expect(page.getByRole("button", { name: "Block", exact: true })).toBeVisible();
});

test("categories, top bookers and a group promotion with a ticket", async ({ page }) => {
  test.setTimeout(60_000);
  await session(page);
  await page.goto("/riders");
  await page.getByRole("button", { name: /New riders/ }).click();
  await expect(page).toHaveURL(/seg=new/);
  await expect(page.getByRole("list", { name: "Riders" }).getByText("New").first()).toBeVisible();

  await page.getByRole("button", { name: /Top riders/ }).click();
  await expect(page.getByText(/Top bookers/)).toBeVisible();
  await page.getByRole("button", { name: "Select top 10" }).click();
  const bulk = page.getByRole("region", { name: "Selected riders" });
  await expect(bulk).toContainText("10 selected");
  await bulk.getByRole("button", { name: "Add promotion" }).click();

  await expect(page).toHaveURL(/view=promotions/);
  await expect(page.getByText("Who gets it · 10 selected")).toBeVisible();
  await page.getByLabel("Promotion code").fill("TOPWEEK30");
  await page.getByLabel("Promotion title").fill("Thanks for riding with us");
  await page.getByLabel("Promotion rides").fill("10");
  await page.getByLabel("Promotion max per ride").fill("50");
  await expect(page.getByLabel("Promotion TOPWEEK30").first()).toContainText("30% off your next 10 rides · max 50 kr per ride");
  await expect(page.locator(".rd-cost")).toContainText("5 000,00 kr");
  await page.getByRole("button", { name: "Give promotion" }).click();
  await confirm(page);
  await expect(page.getByText("Promotion TOPWEEK30 given to 10 riders.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Promotions" })).toContainText("TOPWEEK30");
  await page.reload();
  await expect(page.getByRole("list", { name: "Promotions" })).toContainText("TOPWEEK30");
});

test("a group message, CSV export and insights", async ({ page }) => {
  await session(page);
  await page.goto("/riders");
  const rows = page.getByRole("list", { name: "Riders" }).getByRole("listitem");
  await rows.nth(0).getByRole("checkbox").check();
  await rows.nth(1).getByRole("checkbox").check();
  await page.getByRole("region", { name: "Selected riders" }).getByRole("button", { name: "Message" }).click();
  await page.getByLabel("Group message").fill("Winter tyres are on all Movera cars from today.");
  await page.getByRole("button", { name: "Send to 2" }).click();
  await confirm(page);
  await expect(page.getByText("Message sent to 2 riders.")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).first().click();
  expect((await download).suggestedFilename()).toMatch(/^movera-riders-SE-/);

  await page.getByRole("tab", { name: "Insights" }).click();
  await expect(page.getByRole("heading", { name: "New riders per day" })).toBeVisible();
  await expect(page.getByText("Came back for a 2nd ride")).toBeVisible();
});

test("a rider waiting for a reply gets an answer and the badge clears", async ({ page }) => {
  await session(page);
  await page.goto("/riders?seg=reply");
  await page.getByRole("list", { name: "Riders" }).getByRole("link").first().click();
  await expect(page.getByText(/Waiting for a reply for/)).toBeVisible();
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(page).toHaveURL(/tab=messages/);
  await page.getByRole("button", { name: "Assign to me" }).click();
  await expect(page.getByText("Assigned to nora")).toBeVisible();
  await page.getByRole("button", { name: /We found your item/ }).click();
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("All answered")).toBeVisible();
  await expect(page.getByText(/Waiting for a reply for/)).toHaveCount(0);
});

test("riders page and rider page stay usable at 390px", async ({ page }) => {
  await session(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/riders", "/riders?view=promotions", "/riders?view=insights", "/riders/R0002", "/riders/R0002?tab=bookings", "/riders/R0002?tab=wallet"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(2);
  }
});

test("existing promotions switch off and on, and their discount, max per ride and rides can change", async ({ page }) => {
  await session(page);
  await page.goto("/riders?view=promotions");
  const list = page.getByRole("list", { name: "Promotions" });
  await page.getByRole("button", { name: "WELCOME30 on" }).click();
  await confirm(page);
  await expect(page.getByText("Promotion WELCOME30 switched off.")).toBeVisible();
  await expect(list).toContainText("Off: riders cannot use it now");
  await page.getByRole("button", { name: "WELCOME30 off" }).click();
  await confirm(page);
  await expect(page.getByText("Promotion WELCOME30 switched on.")).toBeVisible();

  const thanks = list.getByRole("listitem").filter({ hasText: "THANKYOU20" });
  await thanks.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("THANKYOU20 discount").fill("25");
  await page.getByLabel("THANKYOU20 max per ride").fill("60");
  await page.getByLabel("THANKYOU20 rides").fill("6");
  await expect(thanks.getByLabel("Promotion THANKYOU20")).toContainText("25% off your next 6 rides · max 60 kr per ride");
  await page.getByRole("button", { name: "Save changes" }).click();
  await confirm(page);
  await expect(page.getByText("Promotion THANKYOU20 changed.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("list", { name: "Promotions" }).getByLabel("Promotion THANKYOU20")).toContainText("25% off your next 6 rides · max 60 kr per ride");

  await page.getByRole("tab", { name: /Automatic/ }).click();
  await page.getByLabel("Come back rides").fill("5");
  await page.getByRole("button", { name: "Save automatic promotions" }).click();
  await confirm(page);
  await expect(page.getByText("Automatic promotions saved.")).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: /Automatic/ }).click();
  await expect(page.getByLabel("Come back rides")).toHaveValue("5");
});

test("a new promotion shows the real rider app preview, and automatic promotions save", async ({ page }) => {
  await session(page);
  await page.goto("/riders?view=promotions");
  await page.getByRole("button", { name: "New promotion" }).last().click();
  await page.getByLabel("Promotion title").fill("Autumn offer");
  // B7b: the real rider app only (demo build: sign-in note); the drawn-sample price checks are archived in the Rules repo.
  await expect(page.getByLabel("Rider app preview")).toHaveText("Sign in to the live server to see the real app.");

  await page.getByRole("button", { name: "Close promotion" }).click();
  await page.getByRole("tab", { name: /Automatic/ }).click();
  await page.getByLabel("Come back audience").selectOption("top");
  await page.getByLabel("Come back Comfort").check();
  await page.getByRole("button", { name: "Save automatic promotions" }).click();
  await page.locator(".modal.open").last().getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Automatic promotions saved.")).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: /Automatic/ }).click();
  await expect(page.getByLabel("Come back audience")).toHaveValue("top");
  await expect(page.getByLabel("Come back Comfort")).toBeChecked();
});

test("a code anyone can use, sent by push, app message, popup and email, with a flyer", async ({ page }) => {
  test.setTimeout(60_000);
  await session(page);
  await page.goto("/riders?view=promotions");
  await page.getByRole("button", { name: "New promotion" }).last().click();
  await page.getByLabel("Promotion code").fill("CITY25");
  await page.getByLabel("Promotion title").fill("City week");

  const modes = page.getByRole("radiogroup", { name: "Who gets it" });
  await modes.getByRole("radio", { name: /Random riders/ }).click();
  await page.getByLabel("How many riders").fill("15");
  await expect(page.getByText("Who gets it · 15 selected")).toBeVisible();
  await modes.getByRole("radio", { name: /Newest riders/ }).click();
  await expect(page.getByText("Who gets it · 15 selected")).toBeVisible();
  await modes.getByRole("radio", { name: /Anyone with the code/ }).click();
  await page.getByLabel("Code uses").fill("300");
  await expect(page.locator(".rd-cost")).toContainText("Can use it300");
  await page.getByRole("button", { name: "Give promotion" }).click();
  await confirm(page);
  await expect(page.getByText("Promotion CITY25 ready: up to 300 riders can use the code.")).toBeVisible();

  const share = page.getByRole("dialog", { name: "Send and share CITY25" });
  await expect(share).toBeVisible();
  await share.getByLabel("Send to").selectOption("newest");
  await share.getByLabel("Number of riders").fill("12");
  await share.getByText("Popup in the app", { exact: true }).click();
  await share.getByText("Email", { exact: true }).click();
  await share.getByLabel("Email addresses").fill("anna@mail.com, omar@mail.com, wrong");
  await expect(share).toContainText("2 valid · 1 not valid: wrong");
  await expect(share.getByLabel("Rider app preview")).toHaveText("Sign in to the live server to see the real app.");
  await share.getByRole("button", { name: "Send to 14" }).click();
  await confirm(page);
  await expect(page.getByText(/CITY25 sent to 14 by push notification, message in the app, popup in the app, email/)).toBeVisible();

  const card = page.getByRole("list", { name: "Promotions" }).getByRole("listitem").filter({ hasText: "CITY25" });
  await expect(card).toContainText("Popup on");
  await expect(card).toContainText("Sent 1 time · 14 people");
  await expect(card).toContainText("Code can be used by300");
  await page.reload();
  await expect(page.getByRole("list", { name: "Promotions" }).getByRole("listitem").filter({ hasText: "CITY25" })).toContainText("Sent 1 time");

  await page.getByRole("list", { name: "Promotions" }).getByRole("listitem").filter({ hasText: "CITY25" }).getByRole("button", { name: "Send and share" }).click();
  await share.getByRole("tab", { name: "Flyer" }).click();
  await expect(share.getByRole("img", { name: "Flyer for CITY25" })).toBeVisible();
  const download = page.waitForEvent("download");
  await share.getByRole("button", { name: "Download picture" }).click();
  expect((await download).suggestedFilename()).toBe("movera-city25-flyer.svg");
});

test("automatic promotions have start and end days", async ({ page }) => {
  await session(page);
  await page.goto("/riders?view=promotions");
  await page.getByRole("tab", { name: /Automatic/ }).click();
  const birthday = page.locator(".rd-auto-card").filter({ hasText: "Birthday" });
  await birthday.locator(".mini-switch b").click();
  await expect(page.getByLabel("Birthday promotion on")).toBeChecked();
  await expect(birthday.locator(".rd-auto-state")).toHaveText("Running now");
  await page.getByLabel("Birthday starts").fill("2099-12-01");
  await expect(birthday.locator(".rd-auto-state")).toHaveText("Starts later");
  await page.getByLabel("Birthday ends").fill("2099-11-01");
  await expect(page.getByRole("alert")).toHaveText("The end day must be after the start day.");
  await page.getByLabel("Birthday ends").fill("2099-12-31");
  await page.getByRole("button", { name: "Save automatic promotions" }).click();
  await confirm(page);
  await expect(page.getByText("Automatic promotions saved.")).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: /Automatic/ }).click();
  await expect(page.getByLabel("Birthday ends")).toHaveValue("2099-12-31");
});

test("automatic promotions can go to random riders or riders I pick", async ({ page }) => {
  await session(page);
  await page.goto("/riders?view=promotions");
  await page.getByRole("tab", { name: /Automatic/ }).click();
  await page.getByLabel("Come back audience").selectOption("random");
  await page.getByLabel("Come back how many riders").fill("8");
  await expect(page.getByLabel("Come back riders")).toContainText("8 riders");

  const birthday = page.locator(".rd-auto-card").filter({ hasText: "Birthday" });
  await birthday.locator(".mini-switch b").click();
  await page.getByLabel("Birthday audience").selectOption("picked");
  await expect(page.getByRole("alert")).toHaveText("Pick at least one rider.");
  await birthday.getByRole("button", { name: "Choose riders" }).click();
  const picker = page.getByRole("dialog", { name: "Who gets Birthday" });
  await picker.getByLabel("Find riders").fill("RD-SE-0003");
  await picker.getByRole("checkbox").first().check();
  await picker.getByLabel("Find riders").fill("RD-SE-0004");
  await picker.getByRole("checkbox").first().check();
  await picker.getByRole("button", { name: "Use 2 riders" }).click();
  await expect(page.getByLabel("Birthday riders")).toContainText("2 riders");

  await page.getByRole("button", { name: "Save automatic promotions" }).click();
  await confirm(page);
  await expect(page.getByText("Automatic promotions saved.")).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: /Automatic/ }).click();
  await expect(page.getByLabel("Birthday audience")).toHaveValue("picked");
  await expect(page.getByLabel("Birthday riders")).toContainText("2 riders");
  await expect(page.getByLabel("Come back riders")).toContainText("8 riders");
});
