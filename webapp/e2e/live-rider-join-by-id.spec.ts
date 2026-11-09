import { expect, test } from "@playwright/test";
import { RIDERS, TICKETS, fakeTripServer, signIn } from "./live-fake";

/**
 * Step 34 (2026-11-09, plan U3 prep): the rider page joins tickets to the rider by rider id, never by phone or first name.
 * Two riders called Anna with the same (masked-looking) phone each see their own ticket only. Before: both tickets sat with
 * both Annas (phone === phone || name === name).
 */
const ANNA_1 = { ...RIDERS[1]!, riderId: "R601", firstName: "Anna", phone: "+46•••••12", outstanding: null };
const ANNA_2 = { ...RIDERS[1]!, riderId: "R602", firstName: "Anna", phone: "+46•••••12", outstanding: null };
const TICKET_1 = { ...TICKETS[0]!, ticketId: "TK601", tripId: undefined, riderId: "R601", subject: "First Anna" };
const TICKET_2 = { ...TICKETS[0]!, ticketId: "TK602", tripId: undefined, riderId: "R602", subject: "Second Anna" };

test("two Annas with the same phone keep their own tickets", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fakeTripServer(page, { riders: [...RIDERS, ANNA_1, ANNA_2], tickets: [...TICKETS, TICKET_1, TICKET_2] });
  await signIn(page);
  await page.goto("/riders/R601?tab=support");
  await expect(page.getByRole("link", { name: "TK601" })).toBeVisible();
  await expect(page.getByRole("link", { name: "TK602" })).toHaveCount(0);
  await page.goto("/riders/R602?tab=support");
  await expect(page.getByRole("link", { name: "TK602" })).toBeVisible();
  await expect(page.getByRole("link", { name: "TK601" })).toHaveCount(0);
});
