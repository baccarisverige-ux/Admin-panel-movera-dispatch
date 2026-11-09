import { expect, test } from "@playwright/test";
import { DRIVER, OWNER, TICKETS, fakeTripServer, signIn } from "./live-fake";

/**
 * Step 34b (2026-11-09, plan U3 prep): the driver page joins tickets to the driver by driver id, never by name.
 * Two drivers called Anna Berg each see their own ticket only. Before: both tickets sat with both Annas (name === name).
 */
const ANNA_1 = { ...DRIVER, driverId: "D601", accountStatus: "active" };
const ANNA_2 = { ...DRIVER, driverId: "D602", accountStatus: "active" };
const TICKET_1 = { ...TICKETS[0]!, ticketId: "TK601", tripId: undefined, riderId: undefined, openedBy: "driver", driverId: "D601", subject: "First Anna" };
const TICKET_2 = { ...TICKETS[0]!, ticketId: "TK602", tripId: undefined, riderId: undefined, openedBy: "driver", driverId: "D602", subject: "Second Anna" };

test("two drivers called Anna keep their own tickets", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fakeTripServer(page, { drivers: [{ ...DRIVER }, { ...OWNER }, ANNA_1, ANNA_2], tickets: [...TICKETS, TICKET_1, TICKET_2] });
  await signIn(page);
  await page.goto("/drivers/D601?tab=activity");
  await expect(page.getByRole("link", { name: "TK601" })).toBeVisible();
  await expect(page.getByRole("link", { name: "TK602" })).toHaveCount(0);
  await page.goto("/drivers/D602?tab=activity");
  await expect(page.getByRole("link", { name: "TK602" })).toBeVisible();
  await expect(page.getByRole("link", { name: "TK601" })).toHaveCount(0);
});
