import { expect, test } from "@playwright/test";
import { MENU } from "../src/nav";
import { DEV_PAGES } from "../src/platform/panel";
import { fakeTripServer, signIn } from "./live-fake";

/**
 * The live build is the demo admin: the demo people pages (Drivers, Fleet owners, Vehicles, Onboarding) read the
 * faked Movera server (e2e/live-fake.ts) and send the account and vehicle decisions to it.
 */

const dialog = (page: import("@playwright/test").Page) => page.locator(".modal.open");

test("forgot password: the sign-in page says how to get a new password link", async ({ page }) => {
  await fakeTripServer(page);
  await page.goto("/");
  await expect(page.getByLabel("6-digit code")).toHaveCount(0);
  await page.getByText("Forgot your password?").click();
  await expect(page.getByText("Ask a Super admin for a new password link.", { exact: false })).toBeVisible();
});

test("wrong password gives one plain message; the tokens never reach localStorage", async ({ page }) => {
  await fakeTripServer(page);
  await page.goto("/");
  await page.getByLabel("Email").fill("owner@movera.se");
  await page.getByLabel("Password").fill("nope");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Wrong e-mail or password.")).toBeVisible();
  await page.getByLabel("Password").fill("correct-horse");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Dashboard" })).toBeVisible();
  const stored = await page.evaluate(() => ({ local: Object.keys(localStorage).join(","), session: sessionStorage.getItem("movera-admin-live-session") }));
  expect(stored.local).not.toContain("live-session");
  expect(stored.session).toContain("access-1");
});

test("the live menu is the whole demo menu; no demo banner, a Not connected yet marker instead", async ({ page }) => {
  await fakeTripServer(page, { admin: { role: "super", permissions: [...new Set(MENU.map((item) => item.permission))] } });
  await signIn(page);
  const nav = page.locator("nav");
  // System, Release gates and Design stay hidden until Super admin turns on developer pages, as in the demo.
  for (const item of MENU.filter((row) => !(DEV_PAGES as readonly string[]).includes(row.id))) await expect(nav.locator(`a[href="${item.path}"]`).first()).toBeVisible();
  await expect(page.getByTestId("demo-banner")).toHaveCount(0);
  for (const path of ["/payments", "/zones", "/riders", "/drivers"]) {
    await page.goto(path);
    await expect(page.getByTestId("not-connected")).toHaveText("Not connected yet");
    await expect(page.getByTestId("demo-banner")).toHaveCount(0);
  }
});

test("drivers: the demo list shows the server's drivers; the demo driver page puts one on hold through the server", async ({ page }) => {
  const state = await fakeTripServer(page);
  await signIn(page);
  await page.goto("/drivers");
  await expect(page.getByRole("heading", { level: 2, name: "Drivers" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Anna Berg", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "Bo Nord", exact: true }).first()).toBeVisible();
  await expect(page.getByText(/^2 in All\./)).toBeVisible();
  expect(state.calls.some((call) => call.path.startsWith("/api/v1/admin/drivers?") && call.headers.authorization === "Bearer access-1")).toBe(true);

  await page.goto("/drivers/D1000");
  await expect(page.getByRole("heading", { level: 2, name: "Bo Nord" })).toBeVisible();
  await page.getByRole("button", { name: "Put on hold" }).first().click();
  await dialog(page).getByLabel("Type D1000 to confirm").fill("D1000");
  await dialog(page).getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Driver account is now on hold.")).toBeVisible();
  const posts = state.calls.filter((call) => call.method === "POST" && call.path === "/api/v1/admin/drivers/D1000/status");
  expect(posts).toHaveLength(1);
  expect(posts[0]!.body).toMatchObject({ expectedVersion: 5, accountStatus: "on_hold" });
  expect(String((posts[0]!.body as { note: string }).note).length).toBeGreaterThan(0);
  expect(posts[0]!.headers["idempotency-key"]?.length).toBeGreaterThan(15);
  expect(state.drivers.find((item) => item.driverId === "D1000")!.accountStatus).toBe("on_hold");
});

test("a stale version is refused by the server and the page says so", async ({ page }) => {
  const state = await fakeTripServer(page);
  await signIn(page);
  await page.goto("/drivers/D1000");
  await expect(page.getByRole("heading", { level: 2, name: "Bo Nord" })).toBeVisible();
  // Someone else changed the driver after this page read it: the server refuses the old version.
  await page.route("**/api/v1/admin/drivers/D1000/status", (route) => route.request().method() === "OPTIONS" ? route.fallback() : route.fulfill({ status: 409, headers: { "access-control-allow-origin": "*", "content-type": "application/json" }, body: JSON.stringify({ code: "version_mismatch", message: "Stale version", requestId: "r-409", retryable: false }) }));
  await page.getByRole("button", { name: "Put on hold" }).first().click();
  await dialog(page).getByLabel("Type D1000 to confirm").fill("D1000");
  await dialog(page).getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Stale version").first()).toBeVisible();
  expect(state.drivers[1]!.accountStatus).toBe("active");
});

test("fleet owners: the demo list and owner page show the server's fleet", async ({ page }) => {
  await fakeTripServer(page);
  await signIn(page);
  await page.goto("/fleets");
  await expect(page.getByRole("heading", { level: 2, name: "Fleet owners" })).toBeVisible();
  await expect(page.getByText("Taxi Nord AB").first()).toBeVisible();
  await expect(page.getByText("Bo Nord").first()).toBeVisible();
  await page.goto("/fleets/D1000");
  await expect(page.getByRole("heading", { level: 2, name: "Bo Nord" })).toBeVisible();
});

test("vehicles: the demo list shows the server's car; the demo vehicle page puts it on hold through the server; sign-out revokes", async ({ page }) => {
  const state = await fakeTripServer(page);
  await signIn(page);
  await page.goto("/vehicles");
  await expect(page.getByRole("heading", { level: 2, name: "Vehicles" })).toBeVisible();
  await expect(page.getByText("ABC 123").first()).toBeVisible();
  await page.goto("/vehicles/V1");
  await expect(page.getByText("ABC 123").first()).toBeVisible();
  await page.getByRole("button", { name: "Put on hold" }).click();
  const typed = dialog(page).getByLabel(/^Type .* to confirm/);
  if (await typed.count()) await typed.fill((await typed.getAttribute("aria-label"))?.match(/Type (.*) to confirm/)?.[1] ?? "V1");
  await dialog(page).getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Vehicle placed on hold.")).toBeVisible();
  const review = state.calls.find((call) => call.method === "POST" && call.path === "/api/v1/admin/vehicles/V1/review")!;
  expect(review.body).toMatchObject({ expectedVersion: 1, decision: "blocked" });

  const more = page.getByRole("button", { name: "More options", exact: true });
  if ((await more.isVisible()) && (await more.getAttribute("aria-expanded")) !== "true") await more.click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect.poll(() => state.calls.some((call) => call.path.endsWith("/admin/auth/sign-out"))).toBe(true);
  expect(await page.evaluate(() => sessionStorage.getItem("movera-admin-live-session"))).toBeNull();
});

test("a command the server does not have yet is refused with Not connected yet, nothing is faked", async ({ page }) => {
  await fakeTripServer(page);
  await signIn(page);
  await page.goto("/drivers/D1000");
  await page.getByRole("tab", { name: "Notes" }).click();
  await page.getByLabel(/Private internal note/).fill("Checked");
  await page.getByRole("button", { name: "Save private note" }).click();
  if (await dialog(page).count()) await dialog(page).getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Not connected yet.").first()).toBeVisible();
  await expect(page.getByText("Private driver note saved.")).toHaveCount(0);
});

test("driver documents: the demo Documents tab opens an uploaded file and approves it on the server", async ({ page }) => {
  const state = await fakeTripServer(page, { admin: { permissions: ["overview.read", "drivers.read", "drivers.activate", "documents.approve", "vehicles.edit", "trips.read"] } });
  await signIn(page);
  await page.goto("/drivers/D1001?tab=documents");
  const files = page.getByTestId("live-documents");
  const rows = files.locator("tr[data-document-type]");
  await expect(rows).toHaveCount(2);
  await expect(files.locator('tr[data-document-type="driving_license"]')).toContainText("In review");
  await files.locator('tr[data-document-type="driving_license"]').getByRole("button", { name: "Open" }).click();
  const viewer = page.getByRole("dialog");
  await expect(viewer.locator("img.live-file")).toBeVisible();
  expect(state.calls.find((call) => call.path.endsWith("/documents/DOC2/file"))!.headers.authorization).toBe("Bearer access-1");
  await viewer.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("dialog", { name: "Approve document" }).getByRole("button", { name: "Approve" }).click();
  await expect(files.locator('tr[data-document-type="driving_license"]')).toContainText("Approved");
  const review = state.calls.find((call) => call.path.endsWith("/documents/DOC2/review"))!;
  expect(review.body).toEqual({ decision: "approved" });
  expect(review.headers["idempotency-key"]?.length).toBeGreaterThan(15);
});

test("driver documents: Reject needs a note", async ({ page }) => {
  const state = await fakeTripServer(page, { admin: { permissions: ["overview.read", "drivers.read", "documents.approve"] } });
  await signIn(page);
  await page.goto("/drivers/D1001?tab=documents");
  await page.getByTestId("live-documents").locator('tr[data-document-type="driving_license"]').getByRole("button", { name: "Reject" }).click();
  const reject = page.getByRole("dialog", { name: "Reject document" });
  await expect(reject.getByRole("button", { name: "Reject" })).toBeDisabled();
  await reject.getByLabel("Note (required)").fill("Blurry photo");
  await reject.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByTestId("live-documents").locator('tr[data-document-type="driving_license"]')).toContainText("Rejected");
  expect(state.calls.find((call) => call.path.endsWith("/documents/DOC2/review"))!.body).toEqual({ decision: "rejected", note: "Blurry photo" });
});

test("fleet: join code with copy and a new code; remove from fleet refused on a trip", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const state = await fakeTripServer(page, { admin: { permissions: ["overview.read", "drivers.read", "drivers.activate"] } });
  await signIn(page);
  await page.goto("/fleets/D1000?tab=fleets");
  const fleet = page.getByTestId("live-fleet");
  await expect(page.getByTestId("fleet-code")).toHaveText("MV-AAAA1");
  await fleet.getByRole("button", { name: "Copy code" }).click();
  await expect(fleet.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("MV-AAAA1");
  await fleet.getByRole("button", { name: "New code" }).click();
  await page.getByRole("dialog", { name: "New join code" }).getByRole("button", { name: "Make a new code" }).click();
  await expect(page.getByTestId("fleet-code")).toHaveText("MV-BBBB2");
  expect(state.calls.find((call) => call.path.endsWith("/fleets/F1/code"))!.body).toEqual({ expectedVersion: 3 });

  await page.locator('tr[data-driver-id="D1001"]').getByRole("button", { name: "Remove from fleet" }).click();
  const remove = page.getByRole("dialog", { name: "Remove from fleet" });
  await remove.getByRole("button", { name: "Remove from fleet" }).click();
  await expect(remove).toContainText("The driver is on a trip.");
  expect(state.calls.some((call) => call.method === "POST" && call.path.endsWith("/fleets/F1/drivers/D1001/remove"))).toBe(true);
});

test("fleet invitations: Accept (disabled for a number without an account) and Cancel; an expired one says so", async ({ page }) => {
  const state = await fakeTripServer(page, { admin: { permissions: ["overview.read", "drivers.read", "drivers.activate"] } });
  await signIn(page);
  await page.goto("/fleets/D1000?tab=fleets");
  const section = page.getByTestId("fleet-invitations");
  await expect(section).toContainText("3 pending");
  const request = section.locator('tr[data-invitation-id="INV1"]');
  await expect(request).toContainText("The driver asked to join");
  await expect(request.getByRole("link", { name: "Carl Ek" })).toHaveAttribute("href", "/drivers/D1002");
  const invite = section.locator('tr[data-invitation-id="INV2"]');
  await expect(invite).toContainText("+46700000002");
  await expect(invite).toContainText("not signed up yet");
  await expect(invite.getByRole("button", { name: "Accept", exact: true })).toBeDisabled();
  await expect(invite.getByRole("button", { name: "Cancel invitation" })).toBeEnabled();
  await request.getByRole("button", { name: "Accept", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Accept invitation" });
  await expect(dialog).toContainText("Carl Ek");
  await dialog.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(request).toHaveCount(0);
  await expect(section).toContainText("2 pending");
  const accept = state.calls.find((call) => call.path.endsWith("/fleets/F1/invitations/INV1/accept"))!;
  expect(accept.headers["idempotency-key"]?.length).toBeGreaterThan(15);
  await section.locator('tr[data-invitation-id="INV3"]').getByRole("button", { name: "Cancel invitation" }).click();
  const cancel = page.getByRole("dialog", { name: "Cancel invitation" });
  await cancel.getByRole("button", { name: "Cancel invitation" }).click();
  await expect(cancel).toContainText("This invitation has expired.");
});

test("drivers, fleets and vehicles lists: server search and status filter; a failure shows Try again", async ({ page }) => {
  const state = await fakeTripServer(page);
  await signIn(page);
  await page.goto("/drivers");
  const bar = page.getByTestId("live-list-drivers");
  await bar.getByLabel("Status on the server").selectOption("active");
  await expect.poll(() => state.calls.some((call) => call.path.includes("accountStatus=active"))).toBe(true);
  await expect(page.getByRole("cell", { name: "Bo Nord", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "Anna Berg", exact: true })).toHaveCount(0);
  await bar.getByLabel("Status on the server").selectOption("");
  await bar.getByLabel("Search by name, e-mail or id").fill("anna");
  await bar.getByRole("button", { name: "Search" }).click();
  await expect.poll(() => state.calls.some((call) => call.path.includes("q=anna"))).toBe(true);
  await expect(page.getByRole("cell", { name: "Bo Nord", exact: true })).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "Anna Berg", exact: true }).first()).toBeVisible();

  await page.goto("/fleets");
  await page.getByTestId("live-list-fleets").getByLabel("Status on the server").selectOption("pending");
  await expect.poll(() => state.calls.some((call) => call.path.startsWith("/api/v1/admin/fleets?") && call.path.includes("status=pending"))).toBe(true);
  await expect(page.getByText("Taxi Nord AB")).toHaveCount(0);

  await page.goto("/vehicles");
  const vehicles = page.getByTestId("live-list-vehicles");
  await vehicles.getByLabel("Search by plate, make or model").fill("ABC");
  await vehicles.getByRole("button", { name: "Search" }).click();
  await expect.poll(() => state.calls.some((call) => call.path.startsWith("/api/v1/admin/vehicles?") && call.path.includes("q=ABC"))).toBe(true);
  await expect(page.getByText("ABC 123").first()).toBeVisible();

  state.driversFail = 500;
  await page.goto("/onboarding");
  const onboarding = page.getByTestId("live-list-drivers");
  await expect(onboarding.getByRole("alert")).toContainText("The server is busy.", { timeout: 15_000 });
  state.driversFail = undefined;
  await onboarding.getByRole("button", { name: "Try again" }).click();
  await expect(onboarding.getByRole("alert")).toHaveCount(0);
});
