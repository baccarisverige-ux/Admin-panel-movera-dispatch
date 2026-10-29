import { expect, test, type Page, type Route } from "@playwright/test";
import { API, DRIVER, FLEET, VEHICLE, fakeTripServer, signIn } from "./live-fake";
import { defaultDoc } from "../src/drivers/onboardingSettings";

/**
 * Driver group 2 "Onboarding" (owner decisions of 2026-10-29) in the live admin against a faked server (contract v0.17.0
 * §25): the onboarding settings are read and published per country, new document types get the server's id, approving
 * a document that expires needs its date (400 expiry_required otherwise), the info session is marked held, and a driver
 * who started his own company is approved like a new fleet. SE and FR.
 */
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,OPTIONS", "access-control-expose-headers": "*" };
const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(body) });
const modal = (page: Page) => page.locator(".modal.open").last();
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
async function confirm(page: Page) {
  const reason = modal(page).getByLabel(/^Reason$/);
  if ((await reason.count()) && (await reason.evaluate((el) => el.tagName)) === "SELECT" && (await reason.inputValue()) === "") await reason.selectOption({ index: 1 });
  await modal(page).getByRole("button", { name: "Confirm" }).click();
}

const PERMS = ["overview.read", "drivers.read", "drivers.activate", "documents.approve", "vehicles.edit", "trips.read", "settings.read", "settings.edit", "settings.publish", "zones.read"];

/** A driver who pressed "Start my own company" (SE): a fleet account on hold with a new pending fleet; and a French driver. */
const STARTER = { ...DRIVER, driverId: "D2001", firstName: "Sara", lastName: "Lind", accountStatus: "on_hold", accountType: "fleet", fleet: { fleetId: "F9", name: "Lind Taxi AB", role: "owner", status: "pending", linkedAt: "2026-10-29T08:00:00Z" },
  documents: [{ documentId: "DS1", type: "terms", status: "approved" }, { documentId: "DS2", type: "driving_license", status: "in_review" }, { documentId: "DS3", type: "profile_photo", status: "in_review" }],
  requiredDocuments: ["terms", "info_session", "driving_license", "profile_photo", "taxi_driver_license"], requiredFleetDocuments: ["company_registration", "taxi_traffic_permit", "tax_settings", "bank_statement"], version: 4 } as unknown as typeof DRIVER;
const FRENCH = { ...DRIVER, driverId: "D3001", firstName: "Hugo", lastName: "Petit", country: "FR", cityId: "paris", zoneIds: ["FR-PC"], accountStatus: "pending", fleet: undefined,
  documents: [{ documentId: "DF1", type: "vtc_card", status: "in_review" }], requiredDocuments: ["terms", "info_session", "vtc_card", "driving_license", "national_id", "profile_photo"], version: 1 } as unknown as typeof DRIVER;
const NEW_FLEET = { ...FLEET, fleetId: "F9", name: "Lind Taxi AB", orgNumber: "559000-0009", ownerDriverId: "D2001", ownerName: "Sara Lind", status: "pending", code: undefined, driverCount: 1, vehicleCount: 0, version: 1 } as unknown as typeof FLEET;

type Sent = { method: string; path: string; body: Record<string, unknown> | null };
async function fakeOnboarding(page: Page) {
  const car = { ...VEHICLE, driverId: "D2001", documents: [{ documentId: "DV1", type: "vehicle_photo_front", status: "in_review" }, { documentId: "DV2", type: "insurance", status: "in_review" }], requiredDocuments: ["vehicle_registration", "insurance", "vehicle_photo_front", "vehicle_photo_back", "vehicle_photo_side", "vehicle_photo_inside"] } as unknown as typeof VEHICLE;
  const state = await fakeTripServer(page, { drivers: [{ ...STARTER }, { ...FRENCH }], fleets: [{ ...FLEET }, { ...NEW_FLEET }], vehicles: [car], admin: { permissions: PERMS } });
  const docs: Record<string, { version: number; liveVersion: number; document: Record<string, unknown> }> = {};
  for (const c of ["SE", "FR", "TN"] as const) docs[c] = { version: 1, liveVersion: 0, document: defaultDoc(c) as unknown as Record<string, unknown> };
  const sent: Sent[] = [];
  let ids = 0;
  await page.route(`${API}/api/v1/admin/**`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(request.url());
    const p = url.pathname.replace("/api/v1", "");
    const body = (request.postDataJSON?.() ?? null) as Record<string, unknown> | null;
    const keep = () => sent.push({ method: request.method(), path: p + url.search, body });
    if (p.startsWith("/admin/config/onboarding")) {
      keep();
      if (url.searchParams.get("zoneId") || body?.["zoneId"]) return json(route, 400, { code: "invalid_request", message: "per country", requestId: "r", retryable: false, reason: "scope_country_only" });
      const country = url.searchParams.get("country") ?? String(body?.["country"]);
      const entry = docs[country]!;
      if (request.method() === "GET") return json(route, 200, { doc: "onboarding", country, ...entry });
      if (body?.["expectedVersion"] !== entry.version) return json(route, 409, { code: "version_mismatch", message: "changed", requestId: "r", retryable: false });
      if (request.method() === "PUT") {
        // The server's prepare step: new types get custom_ + 10 letters; draft:<key> in the lists becomes the id.
        const document = structuredClone(body!["document"]) as { customTypes?: Array<Record<string, unknown>>; documents: Record<string, string[]>; expiringTypes: string[] };
        const swap = new Map<string, string>();
        for (const custom of document.customTypes ?? []) if (!custom["id"]) { ids += 1; custom["id"] = `custom_${String(ids).padStart(10, "a")}`; swap.set(`draft:${String(custom["draftKey"])}`, String(custom["id"])); delete custom["draftKey"]; }
        for (const key of Object.keys(document.documents)) document.documents[key] = document.documents[key]!.map((t) => swap.get(t) ?? t);
        document.expiringTypes = document.expiringTypes.map((t) => swap.get(t) ?? t);
        docs[country] = { ...entry, version: entry.version + 1, document: document as unknown as Record<string, unknown> };
        return json(route, 200, { doc: "onboarding", country, ...docs[country] });
      }
      docs[country] = { ...entry, version: entry.version + 1, liveVersion: entry.liveVersion + 1 };
      return json(route, 200, { doc: "onboarding", version: entry.liveVersion + 1, publishedAt: "2026-10-29T10:00:00Z" });
    }
    const review = /^\/admin\/documents\/([^/]+)\/review$/.exec(p);
    if (review) {
      keep();
      const car = state.vehicles.find((v) => ((v as { documents?: Array<{ documentId: string }> }).documents ?? []).some((doc) => doc.documentId === review[1]));
      const owner = car ? state.drivers.find((d) => d.driverId === car.driverId)! : state.drivers.find((d) => d.documents.some((doc) => doc.documentId === review[1]))!;
      const doc = car ? (car as unknown as { documents: Array<{ documentId: string; type: string; status: string }> }).documents.find((item) => item.documentId === review[1])! : owner.documents.find((item) => item.documentId === review[1])!;
      const country = (owner as { country: string }).country;
      const expiring = (docs[country]!.document["expiringTypes"] as string[]).includes(doc.type);
      if (body?.["decision"] === "approved" && expiring && !body["expiresAt"]) return json(route, 400, { code: "invalid_request", message: "Type the expiry date to approve this document.", requestId: "r", retryable: false, reason: "expiry_required" });
      (doc as { status: string }).status = String(body?.["decision"]);
      return json(route, 200, { documentId: doc.documentId, ownerId: owner.driverId, type: doc.type, status: doc.status, version: 2 });
    }
    const check = /^\/admin\/drivers\/([^/]+)\/documents\/([^/]+)\/check$/.exec(p);
    if (check) {
      keep();
      const owner = state.drivers.find((d) => d.driverId === check[1])!;
      owner.documents = [...owner.documents.filter((doc) => doc.type !== check[2]), { documentId: "DCHK", type: check[2]!, status: "approved" }];
      return json(route, 200, { documentId: "DCHK", ownerId: owner.driverId, type: check[2], status: "approved", version: 1 });
    }
    if (p === "/admin/fleets/F9" && request.method() === "GET") return json(route, 200, { fleet: state.fleets[1], drivers: [], vehicles: [], invitations: [] });
    if (p === "/admin/fleets/F9/review") {
      keep();
      if (body?.["expectedVersion"] !== state.fleets[1]!.version) return json(route, 409, { code: "version_mismatch", message: "x", requestId: "r", retryable: false });
      state.fleets[1] = { ...state.fleets[1]!, status: String(body?.["decision"]), version: state.fleets[1]!.version + 1 } as typeof FLEET;
      return json(route, 200, state.fleets[1]);
    }
    return route.fallback();
  });
  return { state, docs, sent };
}

test.use({ viewport: { width: 1440, height: 1000 } });

for (const [country, button, name, extra] of [["SE", "Sweden", "Sweden", "Taxi driver licence"], ["FR", "France", "France", "VTC professional card"]] as const) {
  test(`items 10, 14, 15 (${country}): the admin adds a NEW document type, renames and removes one, and publishes it per country`, async ({ page }) => {
    const fake = await fakeOnboarding(page);
    await signIn(page);
    await page.goto(`/onboarding?country=${country}`);
    await page.getByRole("button", { name: "Steps and papers" }).click();
    await expect(page.getByRole("heading", { name: `Onboarding steps for ${name}` })).toBeVisible();
    void button;
    const drivers = page.getByRole("list", { name: "Driver documents" });
    await expect(drivers.locator("li[data-type]")).toHaveCount(country === "SE" ? 5 : 6);
    await page.getByRole("region", { name: "Fleet company documents" }).getByRole("button", { name: "New document type" }).click();
    const dialog = page.getByTestId("type-dialog");
    for (const [lang, word] of [["Swedish", "Hyresavtal"], ["French", "Bail"], ["English", "Office lease"]]) {
      await dialog.getByLabel(`Name (${lang})`).fill(word);
      await dialog.getByLabel(`Help text (${lang})`).fill(`${word}: signed page`);
    }
    await dialog.getByRole("checkbox", { name: /Expires: the admin types/ }).check();
    await dialog.getByRole("button", { name: "Add the document" }).click();
    await drivers.getByRole("button", { name: `Remove ${extra}` }).click();
    await drivers.getByRole("button", { name: "Edit Profile photo" }).click();
    await page.getByTestId("type-dialog").getByLabel("Name (Swedish)").fill("Ansiktsfoto");
    await page.getByTestId("type-dialog").getByRole("button", { name: "Save" }).click();
    await page.getByLabel("Stuck after days").fill("12");
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await confirm(page);
    await expect(page.getByText("Everything is published")).toBeVisible();
    const put = fake.sent.find((call) => call.method === "PUT")!;
    expect(put.path).toBe("/admin/config/onboarding");
    expect(put.body?.["country"]).toBe(country);
    expect(put.body?.["zoneId"]).toBeUndefined();
    const doc = put.body!["document"] as { documents: Record<string, string[]>; customTypes: Array<{ draftKey: string; owner: string; name: Record<string, string> }>; texts: Record<string, { name: Record<string, string> }>; signUpReminders: { stuckAfterDays: number }; expiringTypes: string[] };
    expect(doc.customTypes[0]!.owner).toBe("fleet");
    expect(doc.customTypes[0]!.name).toEqual({ sv: "Hyresavtal", fr: "Bail", en: "Office lease" });
    expect(doc.documents["fleet"]!.at(-1)).toBe(`draft:${doc.customTypes[0]!.draftKey}`);
    expect(doc.expiringTypes).toContain(`draft:${doc.customTypes[0]!.draftKey}`);
    expect(doc.documents["driver"]).not.toContain(country === "SE" ? "taxi_driver_license" : "vtc_card");
    expect(doc.texts["profile_photo"]!.name.sv).toBe("Ansiktsfoto");
    expect(doc.signUpReminders.stuckAfterDays).toBe(12);
    expect(fake.sent.find((call) => call.method === "POST")).toEqual({ method: "POST", path: "/admin/config/onboarding/publish", body: { expectedVersion: 2, country } });
    await expect(page.getByRole("list", { name: "Fleet company documents" }).locator('li[data-type="custom_aaaaaaaaa1"]')).toContainText("Office lease");
    await expect(page.getByTestId("settings-status")).toContainText("Live version 1.");
  });
}

test("item 11 (SE): car rules per category are published live", async ({ page }) => {
  const fake = await fakeOnboarding(page);
  await signIn(page);
  await page.goto("/vehicles?view=rules");
  await expect(page.getByLabel("Movera oldest year")).toHaveValue("2015");
  await page.getByLabel("Movera XL seats").fill("7");
  await page.getByLabel("Pet on").uncheck();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await confirm(page);
  await expect(page.getByText("Everything is published")).toBeVisible();
  const vehicles = (fake.sent.find((call) => call.method === "PUT")!.body!["document"] as { vehicles: { categories: Array<{ category: string; on: boolean; minSeats: number }> } }).vehicles;
  expect(vehicles.categories.find((rule) => rule.category === "xl")!.minSeats).toBe(7);
  expect(vehicles.categories.find((rule) => rule.category === "pet")!.on).toBe(false);
});

test("items 1, 7, 8 (SE): expiry date required to approve, info session marked held, own company approved like a new fleet", async ({ page }) => {
  const fake = await fakeOnboarding(page);
  await signIn(page);
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Sara Lind" }).click();
  const selected = page.getByTestId("onboarding-selected");
  const company = selected.getByTestId("company-review");
  await expect(company).toContainText("Lind Taxi AB");
  await expect(company).toContainText("Waiting for Movera");
  await company.getByRole("button", { name: "Approve the company" }).click();
  await modal(page).getByRole("button", { name: "Approve" }).click();
  await expect.poll(() => fake.state.fleets[1]!.status).toBe("approved");
  expect(fake.sent.find((call) => call.path === "/admin/fleets/F9/review")!.body).toEqual({ expectedVersion: 1, decision: "approved" });

  const docs = selected.getByTestId("live-documents");
  const licence = docs.locator('[data-document-type="driving_license"]').first();
  await licence.getByRole("button", { name: "Approve" }).click();
  const dialog = page.getByRole("dialog", { name: "Approve document" });
  await expect(dialog.getByLabel("Valid until (required)")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Approve" })).toBeDisabled();
  await dialog.getByLabel("Valid until (required)").fill(day(365));
  await dialog.getByRole("button", { name: "Approve" }).click();
  await expect.poll(() => fake.sent.filter((call) => call.path === "/admin/documents/DS2/review").length).toBe(1);
  expect(String(fake.sent.find((call) => call.path === "/admin/documents/DS2/review")!.body!["expiresAt"])).toMatch(new RegExp(`^${day(365)}`));

  // A type that does not expire keeps the date optional.
  const photo = docs.locator('[data-document-type="profile_photo"]').first();
  await photo.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("dialog", { name: "Approve document" }).getByLabel("Valid until (optional)")).toBeVisible();
  await page.getByRole("dialog", { name: "Approve document" }).getByRole("button", { name: "Approve" }).click();
  await expect.poll(() => fake.sent.some((call) => call.path === "/admin/documents/DS3/review")).toBe(true);

  const session = docs.locator('[data-document-type="info_session"]').first();
  await expect(session.getByTestId("waiting-for-movera")).toBeVisible();
  await session.getByRole("button", { name: "Mark held" }).click();
  await modal(page).getByRole("button", { name: "Mark held" }).click();
  await expect.poll(() => fake.sent.find((call) => call.path === "/admin/drivers/D2001/documents/info_session/check")?.body).toEqual({ decision: "approved" });
});

test("item 1 (FR): the VTC card needs its expiry date; the server's expiry_required is explained", async ({ page }) => {
  const fake = await fakeOnboarding(page);
  await signIn(page);
  await page.goto("/drivers/D3001?tab=documents");
  const row = page.getByTestId("live-documents").locator('[data-document-type="vtc_card"]').first();
  await expect(row).toContainText("Expires", { timeout: 15_000 });
  await row.getByRole("button", { name: "Approve" }).click();
  const dialog = page.getByRole("dialog", { name: "Approve document" });
  await expect(dialog.getByRole("button", { name: "Approve" })).toBeDisabled();
  await dialog.getByLabel("Valid until (required)").fill(day(200));
  await dialog.getByRole("button", { name: "Approve" }).click();
  await expect.poll(() => fake.sent.filter((call) => call.path === "/admin/documents/DF1/review").length).toBe(1);
  await expect(page.getByTestId("live-documents").locator('[data-document-type="info_session"]').first().getByTestId("waiting-for-movera")).toBeVisible();
});

test("live audit (owner 2026-10-29): Fleet owners Activate and Put on hold review the fleet on the server", async ({ page }) => {
  const fake = await fakeOnboarding(page);
  await signIn(page);
  await page.goto("/fleets/D2001");
  // The company documents are not approved yet: Activate stays off.
  await expect(page.getByRole("button", { name: "Activate", exact: true }).first()).toBeDisabled();
  const starter = fake.state.drivers.find((item) => item.driverId === "D2001")!;
  starter.documents = [...starter.documents, ...["company_registration", "taxi_traffic_permit", "tax_settings", "bank_statement"].map((type, index) => ({ documentId: `DC${index}`, type, status: "approved" }))];
  await page.reload();
  await page.getByRole("button", { name: "Activate", exact: true }).first().click();
  const target = modal(page).locator("label input").first();
  if (await target.count()) await target.fill("D2001");
  await confirm(page);
  await expect.poll(() => fake.sent.find((call) => call.path === "/admin/fleets/F9/review")?.body?.["decision"]).toBe("approved");
});

test("live audit: car photos and insurance are reviewed as car documents; insurance needs its expiry date", async ({ page }) => {
  const fake = await fakeOnboarding(page);
  await signIn(page);
  await page.goto("/vehicles/V1");
  const docs = page.getByTestId("live-vehicle-documents");
  await expect(page.getByRole("region", { name: "Photos" })).toHaveCount(0);
  await docs.locator('[data-document-type="vehicle_photo_front"]').getByRole("button", { name: "Approve" }).click();
  await page.getByRole("dialog", { name: "Approve document" }).getByRole("button", { name: "Approve" }).click();
  await expect.poll(() => fake.sent.some((call) => call.path === "/admin/documents/DV1/review")).toBe(true);
  await docs.locator('[data-document-type="insurance"]').getByRole("button", { name: "Approve" }).click();
  const dialog = page.getByRole("dialog", { name: "Approve document" });
  await expect(dialog.getByRole("button", { name: "Approve" })).toBeDisabled();
  await dialog.getByLabel("Valid until (required)").fill(day(300));
  await dialog.getByRole("button", { name: "Approve" }).click();
  await expect.poll(() => fake.sent.some((call) => call.path === "/admin/documents/DV2/review")).toBe(true);
});
