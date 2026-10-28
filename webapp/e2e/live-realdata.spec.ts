import { expect, test } from "@playwright/test";
import { ADMIN, fakeTripServer, signIn } from "./live-fake";

const ALL = { admin: { permissions: [...ADMIN.permissions, "support.reply", "settings.read", "settings.publish", "safety.edit", "incidents.read", "audit.read", "finance.edit"] } };

/**
 * Owner rule, part 3: the live build never shows an invented value. Every page is opened against the faked server;
 * no page may show "NaN", a demo street, a demo car or a demo person's name, and no number may come from a seed.
 */
const PAGES = ["/", "/?tab=live", "/?tab=insights", "/alerts", "/audit", "/dispatch", "/drivers", "/fleets", "/incidents", "/live", "/offers", "/onboarding", "/payments", "/payouts", "/reports", "/reservations", "/reviews", "/riders", "/risk", "/support", "/trips", "/trips/T2001", "/trips/T2002", "/vehicles", "/drivers/D1001", "/riders/R501"];
const DEMO_WORDS = ["NaN", "Drottninggatan", "Sveavägen", "Volvo XC40", "Götgatan", "Erik ", "Sara ", "Maja ", "Ingrid ", "Linnea ", "Freja ", "Astrid "];

for (const path of PAGES) {
  test(`no invented value on ${path}`, async ({ page }) => {
    await fakeTripServer(page);
    await signIn(page);
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);
    // The phone previews in Dispatch settings are pictures of the apps, not data.
    const text = await page.evaluate(() => { const body = document.body.cloneNode(true) as HTMLElement; body.querySelectorAll("aside.dx-zone-side").forEach((node) => node.remove()); return body.innerText; });
    for (const word of DEMO_WORDS) expect(text, `${path} shows "${word.trim()}"`).not.toContain(word);
  });
}

test("payouts: the server's payout with its lines, Mark as paid, Create payout, refunds to send by hand", async ({ page }) => {
  const state = await fakeTripServer(page, ALL);
  await signIn(page);
  await page.goto("/payouts");
  const detail = page.getByTestId("live-payout-detail");
  await expect(detail).toContainText("Anna Berg");
  const lines = page.getByTestId("live-payout-lines");
  await expect(lines.locator('[data-line="trips"]')).toContainText("394,00 kr");
  await expect(lines.locator('[data-line="trips"]')).toContainText("(2)");
  await expect(lines.locator('[data-line="cash_collected"]')).toContainText("-500,00 kr");
  await expect(lines).toContainText("The driver owes Movera");
  await expect(lines).toContainText("-65,00 kr");
  await detail.getByRole("button", { name: "Mark as paid" }).click();
  await expect.poll(() => state.calls.some((call) => call.method === "POST" && call.path === "/api/v1/admin/payouts/PY1/paid")).toBe(true);
  await expect(page.getByTestId("live-payout-list")).toContainText("Paid");
  const create = page.getByTestId("live-payout-create");
  await expect(create.getByRole("button", { name: "Create payout" })).toBeDisabled();
  await create.getByLabel("Payout driver").selectOption("D1001");
  await create.getByLabel("First day").fill("2026-10-26");
  await create.getByLabel("Up to (not included)").fill("2026-10-27");
  await create.getByRole("button", { name: "Create payout" }).click();
  await expect.poll(() => state.calls.find((call) => call.method === "POST" && call.path === "/api/v1/admin/payouts")?.body).toMatchObject({ driverId: "D1001" });
  const refunds = page.getByTestId("live-refunds-to-send");
  await expect(refunds).toContainText("Lea");
  await expect(refunds).toContainText("45,00 kr");
  await refunds.getByRole("button", { name: "Mark as paid" }).click();
  await expect.poll(() => state.calls.some((call) => call.path === "/api/v1/admin/refunds/RF9/paid")).toBe(true);
  await expect(refunds).toContainText("No refund waits to be sent.");
});

test("support: the rider's ticket and messages from the server; the answer goes to the server", async ({ page }) => {
  const state = await fakeTripServer(page, ALL);
  await signIn(page);
  await page.goto("/support");
  const ticket = page.getByTestId("live-ticket");
  await expect(ticket).toContainText("Charged too much");
  await expect(ticket).toContainText("Ride dispute");
  await expect(ticket).toContainText("The driver took a long way.");
  await ticket.getByLabel("Answer", { exact: true }).fill("We refunded 50 kr.");
  await ticket.getByLabel("Ticket status after the answer").selectOption("resolved");
  await ticket.getByRole("button", { name: "Send answer" }).click();
  await expect.poll(() => state.calls.find((call) => call.path === "/api/v1/admin/tickets/TK1/reply")?.body).toEqual({ text: "We refunded 50 kr.", status: "resolved" });
  await expect(ticket).toContainText("We refunded 50 kr.");
});

test("reviews: the server's ratings with tags; Hide goes to the server", async ({ page }) => {
  const state = await fakeTripServer(page, ALL);
  await signIn(page);
  await page.goto("/reviews");
  const list = page.getByRole("list", { name: "Reviews" });
  await expect(list).toContainText("Late and rude");
  await expect(list).toContainText("Clean car");
  await expect(list).toContainText("Polite");
  const row = list.locator("li").filter({ hasText: "Late and rude" });
  await row.getByRole("button", { name: "Hide" }).click();
  const dialog = page.locator(".modal.open");
  if (await dialog.count()) {
    const reason = dialog.getByRole("textbox").first();
    if (await reason.count()) await reason.fill("Insult");
    await dialog.getByRole("button", { name: /Confirm|Hide|Save|Yes/ }).last().click();
  }
  await expect.poll(() => state.calls.some((call) => call.method === "POST" && call.path === "/api/v1/admin/ratings/T2001/rider/hide")).toBe(true);
  await page.goto("/reviews?tab=rules");
  await expect(page.getByTestId("live-review-rules")).toContainText("Knew the way");
});

test("risk: the three server signals flag people; the later rules say Not connected yet", async ({ page }) => {
  await fakeTripServer(page, ALL);
  await signIn(page);
  await page.goto("/risk?tab=flagged");
  const flagged = page.getByRole("list", { name: "Flagged people" });
  await expect(flagged).toContainText("Anna Berg");
  await expect(flagged).toContainText("40");
  await expect(flagged).toContainText("Omar");
  await page.goto("/risk?tab=rules");
  await expect(page.getByText("Not connected yet").first()).toBeVisible();
});

test("dashboard and Reports › Money: the server's KPI days, no modelled numbers", async ({ page }) => {
  const state = await fakeTripServer(page, ALL);
  await signIn(page);
  await expect.poll(() => state.calls.some((call) => call.path.startsWith("/api/v1/admin/kpis?"))).toBe(true);
  await expect(page.getByTestId("gross-bookings")).toContainText("kr");
  await expect(page.getByTestId("gross-bookings")).not.toContainText("Not connected");
  await page.goto("/reports?tab=money");
  const report = page.getByTestId("live-money-report");
  await expect(report).toContainText("1 234,00 kr");
  await expect(report).toContainText("Live today");
});
