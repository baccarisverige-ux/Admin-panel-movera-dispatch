import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * The live people area against a faked Movera server (playwright.live.config.ts starts the app with
 * VITE_ADMIN_API=http://127.0.0.1:4310; every call to that origin is answered here with page.route).
 */
const API = "http://127.0.0.1:4310";

const ADMIN = {
  adminId: "A1",
  email: "owner@movera.se",
  name: "Nora Lind",
  role: "super",
  permissions: ["overview.read", "drivers.read", "drivers.activate", "documents.approve", "vehicles.edit", "trips.read", "riders.read", "zones.read"],
  scope: { zones: "all" },
  idleTimeoutSeconds: 900,
  approvalExempt: true,
};

const DRIVER = {
  driverId: "D1001",
  accountStatus: "on_hold",
  onlineStatus: "offline",
  firstName: "Anna",
  lastName: "Berg",
  dateOfBirth: "1990-05-17",
  email: "anna@example.se",
  country: "SE",
  cityId: "stockholm_lan",
  language: "sv",
  accountType: "driver",
  zoneIds: ["Z001"],
  categoryIds: ["standard"],
  fleet: { fleetId: "F1", name: "Taxi Nord AB", role: "member", status: "approved", linkedAt: "2026-10-20T10:00:00Z" },
  payoutTo: "fleet",
  documents: [
    { documentId: "DOC1", type: "terms", status: "approved" },
    { documentId: "DOC2", type: "driving_license", status: "in_review" },
    { documentId: "DOC3", type: "profile_photo", status: "approved", expiresAt: "2027-01-01T00:00:00Z" },
  ],
  requiredDocuments: ["terms", "info_session", "driving_license", "profile_photo", "taxi_driver_license"],
  version: 2,
};

const OWNER = { ...DRIVER, driverId: "D1000", firstName: "Bo", lastName: "Nord", accountStatus: "active", accountType: "fleet", fleet: { ...DRIVER.fleet, role: "owner" }, payoutTo: "self", requiredFleetDocuments: ["company_registration", "bank_statement"], pendingFleetInvitations: 2, version: 5 };

const VEHICLE = {
  vehicleId: "V1",
  make: "Volvo",
  model: "V90",
  year: 2022,
  color: "black",
  plate: "ABC 123",
  seats: 4,
  categoryIds: ["standard"],
  status: "pending",
  version: 1,
  fleetId: "F1",
  documents: [{ documentId: "DOC9", type: "insurance", status: "in_review" }],
  requiredDocuments: ["vehicle_registration", "insurance"],
};

const FLEET = {
  fleetId: "F1",
  name: "Taxi Nord AB",
  orgNumber: "556000-0001",
  address: "Storgatan 1, Stockholm",
  country: "SE",
  cityId: "stockholm_lan",
  ownerDriverId: "D1000",
  ownerName: "Bo Nord",
  ownerEmail: "bo@taxinord.se",
  status: "approved",
  code: "MV-7KQ2X",
  driverCount: 2,
  vehicleCount: 1,
  createdAt: "2026-10-18T09:00:00Z",
  version: 3,
};

/** v0.5.3: a driver's request (he asked with the code), an owner's invite to a number without an account, and one that expired. */
const INVITATIONS = [
  { invitationId: "INV1", fleetId: "F1", fleetName: "Taxi Nord AB", direction: "driver_request", driverId: "D1002", driverName: "Carl Ek", status: "pending", createdAt: "2026-10-24T08:00:00Z", expiresAt: "2026-10-31T08:00:00Z", version: 1 },
  { invitationId: "INV2", fleetId: "F1", fleetName: "Taxi Nord AB", direction: "owner_invite", phone: "+46701740609", status: "pending", createdAt: "2026-10-25T09:30:00Z", expiresAt: "2026-11-01T09:30:00Z", version: 1 },
  { invitationId: "INV3", fleetId: "F1", fleetName: "Taxi Nord AB", direction: "owner_invite", driverId: "D1003", driverName: "Eva Lund", phone: "+46701740610", status: "pending", createdAt: "2026-10-10T09:30:00Z", expiresAt: "2026-10-17T09:30:00Z", version: 1 },
];

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-expose-headers": "*" };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

type State = { driver: typeof DRIVER; fleet: typeof FLEET; vehicle: typeof VEHICLE; invitations: typeof INVITATIONS; calls: { method: string; path: string; headers: Record<string, string>; body: unknown }[] };

async function fakeServer(page: Page): Promise<State> {
  const state: State = { driver: { ...DRIVER }, fleet: { ...FLEET }, vehicle: { ...VEHICLE }, invitations: INVITATIONS.map((item) => ({ ...item })), calls: [] };
  const json = (route: Route, status: number, body: unknown, headers: Record<string, string> = {}) =>
    route.fulfill({ status, headers: { ...CORS, "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  await page.route(`${API}/**`, async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname + url.search;
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const body = request.postDataJSON?.() ?? null;
    state.calls.push({ method, path, headers: request.headers(), body });
    const auth = request.headers().authorization;
    const p = url.pathname;

    if (p === "/api/v1/admin/auth/sign-in") {
      if (body?.password !== "correct-horse") return json(route, 401, { code: "unauthenticated", message: "Unauthenticated", requestId: "r-401", retryable: false, reason: "invalid_credentials" });
      return json(route, 200, { accessToken: "access-1", refreshToken: "refresh-1", expiresIn: 900, actor: "admin", admin: ADMIN });
    }
    if (p === "/api/v1/admin/auth/sign-out") return route.fulfill({ status: 204, headers: CORS });
    if (auth !== "Bearer access-1") return json(route, 401, { code: "unauthenticated", message: "Sign in again.", requestId: "r-401b", retryable: false });

    if (p === "/api/v1/admin/drivers") {
      const status = url.searchParams.get("accountStatus");
      const items = [state.driver, OWNER].filter((item) => !status || item.accountStatus === status);
      return json(route, 200, { items, nextCursor: null });
    }
    if (p === "/api/v1/admin/drivers/D1001") return json(route, 200, state.driver);
    if (p === "/api/v1/admin/drivers/D1000") return json(route, 200, OWNER);
    if (p === "/api/v1/admin/drivers/D1001/status") {
      if (body.expectedVersion !== state.driver.version) return json(route, 409, { code: "version_mismatch", message: "Stale version", requestId: "r-409", retryable: false, projection: state.driver });
      if (!body.note) return json(route, 400, { code: "invalid_request", message: "note is required", requestId: "r-400", retryable: false });
      state.driver = { ...state.driver, accountStatus: body.accountStatus, version: state.driver.version + 1 };
      return json(route, 200, state.driver);
    }
    if (p === "/api/v1/admin/documents/DOC2/file") return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "image/png" }, body: PNG });
    if (p === "/api/v1/admin/documents/DOC2/review") {
      state.driver = { ...state.driver, documents: state.driver.documents.map((item) => (item.documentId === "DOC2" ? { ...item, status: body.decision, ...(body.expiresAt ? { expiresAt: body.expiresAt } : {}) } : item)) };
      return json(route, 200, { documentId: "DOC2", ownerId: "D1001", type: "driving_license", status: body.decision, version: 2, reviewNote: body.note });
    }
    if (p === "/api/v1/admin/fleets") return json(route, 200, { items: [state.fleet], nextCursor: null });
    if (p === "/api/v1/admin/fleets/F1") {
      return json(route, 200, {
        fleet: state.fleet,
        drivers: [
          { driverId: "D1000", firstName: "Bo", lastName: "Nord", accountStatus: "active", onlineStatus: "online", vehicleId: "V1", linkedAt: "2026-10-18T09:00:00Z" },
          { driverId: "D1001", firstName: "Anna", lastName: "Berg", accountStatus: state.driver.accountStatus, onlineStatus: "offline", linkedAt: "2026-10-20T10:00:00Z" },
        ],
        vehicles: [state.vehicle],
        invitations: state.invitations.filter((item) => item.status === "pending"),
      });
    }
    const decision = /^\/api\/v1\/admin\/fleets\/F1\/invitations\/([^/]+)\/(accept|cancel)$/.exec(p);
    if (decision) {
      const invitation = state.invitations.find((item) => item.invitationId === decision[1]);
      if (!invitation) return json(route, 404, { code: "not_found", message: "No such invitation in this fleet.", requestId: "r-inv404", retryable: false, reason: "invitation_not_found" });
      if (new Date(invitation.expiresAt).getTime() < Date.parse("2026-10-25T12:00:00Z")) return json(route, 409, { code: "invalid_transition", message: "The invitation has expired.", requestId: "r-inv409", retryable: false, reason: "invitation_expired" });
      if (decision[2] === "accept" && !invitation.driverId) return json(route, 409, { code: "invalid_transition", message: "That number has no account yet.", requestId: "r-inv409b", retryable: false, reason: "driver_not_signed_up" });
      invitation.status = decision[2] === "accept" ? "accepted" : "cancelled";
      if (decision[2] === "accept") state.fleet = { ...state.fleet, driverCount: state.fleet.driverCount + 1 };
      return json(route, 200, { ...invitation, decidedAt: "2026-10-25T12:00:00Z", version: 2 });
    }
    if (p === "/api/v1/admin/fleets/F1/code") {
      state.fleet = { ...state.fleet, code: "MV-NEW42", version: state.fleet.version + 1 };
      return json(route, 200, state.fleet);
    }
    if (p === "/api/v1/admin/fleets/F1/review") {
      state.fleet = { ...state.fleet, status: body.decision, version: state.fleet.version + 1 };
      return json(route, 200, state.fleet);
    }
    if (p === "/api/v1/admin/fleets/F1/drivers/D1001/remove") return json(route, 409, { code: "invalid_transition", message: "The driver is on a trip.", requestId: "r-trip", retryable: false, reason: "on_trip" });
    if (p === "/api/v1/admin/vehicles") return json(route, 200, { items: [state.vehicle], nextCursor: null });
    if (p === "/api/v1/admin/vehicles/V1/review") {
      state.vehicle = { ...state.vehicle, status: body.decision, version: state.vehicle.version + 1 };
      return json(route, 200, state.vehicle);
    }
    return json(route, 404, { code: "not_found", message: `No route ${method} ${p}`, requestId: "r-404", retryable: false });
  });
  return state;
}

async function signIn(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("6-digit code")).toHaveCount(0);
  await page.getByLabel("Email").fill("owner@movera.se");
  await page.getByLabel("Password").fill("correct-horse");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Drivers" })).toBeVisible();
}

test("forgot password: the sign-in page says how to get a new password link", async ({ page }) => {
  await fakeServer(page);
  await page.goto("/");
  await page.getByText("Forgot your password?").click();
  await expect(page.getByText("Ask a Super admin for a new password link.", { exact: false })).toBeVisible();
});

test("wrong password gives one plain message; the tokens never reach localStorage", async ({ page }) => {
  await fakeServer(page);
  await page.goto("/");
  await page.getByLabel("Email").fill("owner@movera.se");
  await page.getByLabel("Password").fill("nope");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Wrong e-mail or password.")).toBeVisible();
  await page.getByLabel("Password").fill("correct-horse");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Drivers" })).toBeVisible();
  const stored = await page.evaluate(() => ({ local: Object.keys(localStorage).join(","), session: sessionStorage.getItem("movera-admin-live-session") }));
  expect(stored.local).not.toContain("live-session");
  expect(stored.session).toContain("access-1");
});

test("drivers list, driver detail with documents, open a file, approve it and activate the driver", async ({ page }) => {
  const state = await fakeServer(page);
  await signIn(page);
  await expect(page.getByRole("cell", { name: "Anna Berg" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Stockholm län, SE" }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "2/5" })).toBeVisible();
  await page.getByRole("tab", { name: "Active" }).click();
  await expect.poll(() => state.calls.some((call) => call.path.includes("accountStatus=active"))).toBe(true);
  await expect(page.getByRole("cell", { name: "Bo Nord" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Anna Berg" })).toHaveCount(0);
  await page.getByRole("tab", { name: "All" }).click();
  await page.getByRole("button", { name: "Anna Berg" }).click();
  await expect(page).toHaveURL(/\/drivers\/D1001$/);
  await expect(page.getByRole("heading", { level: 2, name: "Anna Berg" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Taxi Nord AB" })).toBeVisible();
  const rows = page.locator(".live-documents tr[data-document-type]");
  await expect(rows).toHaveCount(5);
  await expect(page.locator('tr[data-document-type="taxi_driver_license"]')).toContainText("Missing");
  await expect(page.locator('tr[data-document-type="driving_license"]')).toContainText("In review");
  await page.locator('tr[data-document-type="driving_license"]').getByRole("button", { name: "Open" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("img.live-file")).toBeVisible();
  const fileCall = state.calls.find((call) => call.path.endsWith("/documents/DOC2/file"))!;
  expect(fileCall.headers.authorization).toBe("Bearer access-1");
  await dialog.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("dialog", { name: "Approve document" }).getByRole("button", { name: "Approve" }).click();
  await expect(page.locator('tr[data-document-type="driving_license"]')).toContainText("Approved");
  const review = state.calls.find((call) => call.path.endsWith("/documents/DOC2/review"))!;
  expect(review.body).toEqual({ decision: "approved" });
  expect(review.headers["idempotency-key"]?.length).toBeGreaterThan(15);

  await page.getByRole("button", { name: "Activate", exact: true }).click();
  const activate = page.getByRole("dialog", { name: "Activate driver" });
  await expect(activate.getByRole("button", { name: "Activate" })).toBeDisabled();
  await activate.getByLabel("Note (required)").fill("Documents checked");
  await activate.getByRole("button", { name: "Activate" }).click();
  await expect(page.locator(".page-heading")).toContainText("Active");
  const status = state.calls.find((call) => call.path.endsWith("/drivers/D1001/status"))!;
  expect(status.body).toEqual({ expectedVersion: 2, accountStatus: "active", note: "Documents checked" });
});

test("a stale version reloads the driver and says so", async ({ page }) => {
  const state = await fakeServer(page);
  await signIn(page);
  await page.goto("/drivers/D1001");
  await expect(page.getByRole("heading", { level: 2, name: "Anna Berg" })).toBeVisible();
  state.driver = { ...state.driver, version: 9 };
  await page.getByRole("button", { name: "Suspend", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Suspend driver" });
  await dialog.getByLabel("Note (required)").fill("Fraud check");
  await dialog.getByRole("button", { name: "Suspend" }).click();
  await expect(dialog).toContainText("Someone else changed this record.");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Version", { exact: true }).locator("..")).toContainText("9");
});

test("fleet detail: code with copy, new code after a confirm, vehicle review and remove refused on a trip", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const state = await fakeServer(page);
  await signIn(page);
  await page.getByRole("link", { name: "Fleet owners" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Fleet owners" })).toBeVisible();
  await page.getByRole("tab", { name: "Approved" }).click();
  await page.getByRole("button", { name: "Taxi Nord AB" }).click();
  await expect(page).toHaveURL(/\/fleets\/F1$/);
  await expect(page.getByTestId("fleet-code")).toHaveText("MV-7KQ2X");
  await page.getByRole("button", { name: "Copy code" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("MV-7KQ2X");
  await expect(page.getByRole("link", { name: "Bo Nord" }).first()).toHaveAttribute("href", "/drivers/D1000");
  await page.getByRole("link", { name: "Bo Nord" }).first().click();
  await expect(page.getByRole("heading", { level: 2, name: "Bo Nord" })).toBeVisible();
  await expect(page.getByTestId("pending-invitations")).toHaveText("Pending fleet invitations: 2");
  await expect(page.locator(".page-heading")).not.toContainText("Pending fleet invitations");
  await page.goBack();
  await expect(page.getByTestId("fleet-code")).toHaveText("MV-7KQ2X");

  await page.getByRole("button", { name: "New code" }).click();
  await page.getByRole("dialog", { name: "New join code" }).getByRole("button", { name: "Make a new code" }).click();
  await expect(page.getByTestId("fleet-code")).toHaveText("MV-NEW42");
  expect(state.calls.find((call) => call.path.endsWith("/fleets/F1/code"))!.body).toEqual({ expectedVersion: 3 });

  const car = page.locator('tr[data-vehicle-id="V1"]');
  await expect(car).toContainText("Pending");
  await car.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("dialog", { name: "Decide vehicle" }).getByRole("button", { name: "Approve" }).click();
  await expect(car).toContainText("Approved");
  expect(state.calls.find((call) => call.path.endsWith("/vehicles/V1/review"))!.body).toEqual({ expectedVersion: 1, decision: "approved" });

  await page.locator('tr[data-driver-id="D1001"]').getByRole("button", { name: "Remove from fleet" }).click();
  const remove = page.getByRole("dialog", { name: "Remove from fleet" });
  await remove.getByRole("button", { name: "Remove from fleet" }).click();
  await expect(remove).toContainText("The driver is on a trip.");
});

test("fleet detail: pending invitations with Accept (disabled for a number without an account) and Cancel; an expired one says so", async ({ page }) => {
  const state = await fakeServer(page);
  await signIn(page);
  await page.goto("/fleets/F1");
  const section = page.getByTestId("fleet-invitations");
  await expect(section.getByRole("heading", { name: "Pending invitations" })).toBeVisible();
  await expect(section).toContainText("3 pending");
  const request = section.locator('tr[data-invitation-id="INV1"]');
  await expect(request).toContainText("The driver asked to join");
  await expect(request.getByRole("link", { name: "Carl Ek" })).toHaveAttribute("href", "/drivers/D1002");
  await expect(request).toContainText(/24 Oct 2026|Oct 24, 2026/);
  await expect(request).toContainText(/31 Oct 2026|Oct 31, 2026/);
  const invite = section.locator('tr[data-invitation-id="INV2"]');
  await expect(invite).toContainText("+46701740609");
  await expect(invite).toContainText("not signed up yet");
  await expect(invite).toContainText("The owner invited");
  await expect(invite.getByRole("button", { name: "Accept", exact: true })).toBeDisabled();
  await expect(invite.getByRole("button", { name: "Cancel invitation" })).toBeEnabled();

  await request.getByRole("button", { name: "Accept", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Accept invitation" });
  await expect(dialog).toContainText("Carl Ek");
  await dialog.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(request).toHaveCount(0);
  await expect(section).toContainText("2 pending");
  const accept = state.calls.find((call) => call.path.endsWith("/fleets/F1/invitations/INV1/accept"))!;
  expect(accept.method).toBe("POST");
  expect(accept.headers.authorization).toBe("Bearer access-1");
  expect(accept.headers["idempotency-key"]?.length).toBeGreaterThan(15);
  await expect(page.locator(".page-heading")).toContainText("3 drivers, 1 vehicles");

  const expired = section.locator('tr[data-invitation-id="INV3"]');
  await expired.getByRole("button", { name: "Cancel invitation" }).click();
  const cancel = page.getByRole("dialog", { name: "Cancel invitation" });
  await cancel.getByRole("button", { name: "Cancel invitation" }).click();
  await expect(cancel).toContainText("This invitation has expired.");
  expect(state.calls.some((call) => call.path.endsWith("/fleets/F1/invitations/INV3/cancel"))).toBe(true);
  await cancel.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(cancel).toHaveCount(0);
});

test("vehicles list unfolds a car's documents; sign-out revokes on the server", async ({ page }) => {
  const state = await fakeServer(page);
  await signIn(page);
  await page.goto("/vehicles/V1");
  await expect(page.getByRole("heading", { level: 2, name: "Vehicles" })).toBeVisible();
  await expect(page.locator('tr[data-document-type="insurance"]')).toContainText("In review");
  await expect(page.locator('tr[data-document-type="vehicle_registration"]')).toContainText("Missing");
  const more = page.getByRole("button", { name: "More options", exact: true });
  if ((await more.isVisible()) && (await more.getAttribute("aria-expanded")) !== "true") await more.click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect.poll(() => state.calls.some((call) => call.path.endsWith("/admin/auth/sign-out"))).toBe(true);
  expect(await page.evaluate(() => sessionStorage.getItem("movera-admin-live-session"))).toBeNull();
});
