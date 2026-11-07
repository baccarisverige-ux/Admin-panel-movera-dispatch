import { expect, test, type Page } from "@playwright/test";
import { API, ACTIVE_TRIP, fakeTripServer, signIn } from "./live-fake";

// Supervisor S7 R1–R3: Reservations shows the contract's status words while the rider is on board, and for failed.
const BOOKED = { ...ACTIVE_TRIP, tripId: "T3001", kind: "scheduled", status: "accepted", version: 5, scheduledAt: "2099-01-01T08:00:00Z", reservation: { mode: "list", dispatchAt: "2099-01-01T07:40:00Z", freeChangeUntil: "2099-01-01T07:00:00Z", noDriver: false }, driverLocation: { lat: 59.3345, lng: 18.0632, accuracy: 6, measuredAt: "2026-10-26T09:20:40Z" } };

async function stream(page: Page) {
  const events: { sequence: number; type: string; entityId: string; zoneId: string; occurredAt: string; serverTime: string }[] = [];
  const opens: (string | null)[] = [];
  await page.route(`${API}/api/v1/admin/events**`, async (route) => {
    const last = route.request().headers()["last-event-id"] ?? null;
    opens.push(last);
    const after = Number(last ?? 0);
    const items = events.filter((e) => e.sequence > after);
    // Keep the answer open a little, then end it (the client reconnects with Last-Event-ID).
    await new Promise((r) => setTimeout(r, 300));
    await route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-expose-headers": "*", "content-type": "text/event-stream" }, body: `: open\n\n${items.map((e) => `id: ${e.sequence}\ndata: ${JSON.stringify(e)}\n\n`).join("")}` });
  });
  return { opens, push: (entityId: string) => events.push({ sequence: events.length + 1, type: "trip.changed", entityId, zoneId: "Z001", occurredAt: new Date().toISOString(), serverTime: new Date().toISOString() }) };
}

test("S7 R1-R3: Reservations row says the contract words with the rider on board and after a failure; views Assigned and Failed", async ({ page }) => {
  const state = await fakeTripServer(page, { trips: [{ ...BOOKED }] });
  const sse = await stream(page);
  await signIn(page);
  await page.goto("/reservations");
  const row = page.getByTestId("resv-T3001");
  await expect(row).toContainText("Driver holds it");
  Object.assign(state.trips[0]!, { status: "in_trip", version: 9 });
  sse.push("T3001");
  await expect(row).toContainText("In trip", { timeout: 8000 });
  await expect(row).not.toContainText("On the way");
  await page.getByRole("button", { name: "Assigned", exact: true }).click();
  await expect(row).toBeVisible();
  Object.assign(state.trips[0]!, { status: "failed", version: 10 });
  sse.push("T3001");
  await page.getByRole("button", { name: "Failed", exact: true }).click();
  await expect(row).toContainText("Failed", { timeout: 8000 });
  await expect(row).not.toContainText("Cancelled");
});
