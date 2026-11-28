import { expect, test, type Route } from "@playwright/test";
import { API, VEHICLE, fakeTripServer, signIn } from "./live-fake";

/**
 * v0.18.178 (contract.json#carCatalogue.admin, c73): Vehicles › Vehicle rules › Car catalogue against a faked server:
 * the list (Hidden badge, source), Add make (409 make_exists for a hidden make says "use Show"), Show, and the car's
 * "Typed by driver" marker with Add to catalogue. SHOT_DIR=<dir> also saves screenshots for the owner.
 */
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,OPTIONS", "access-control-expose-headers": "*" };
const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(body) });
const ATTR = "Contains data from the European Environment Agency (EEA), CO2 monitoring of new passenger cars, CC BY 4.0.";
const model = (makeId: string, name: string, hidden = false, source = "eea") => ({ modelId: `${makeId}.${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name, hidden, source });
const shot = async (page: import("@playwright/test").Page, name: string) => {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png`, fullPage: true });
};

test.use({ viewport: { width: 1440, height: 1000 } });

test("Car catalogue: list, add, 409 for a hidden make, show; Typed by driver on a car", async ({ page }) => {
  const makes = [
    { makeId: "skoda", name: "Škoda", hidden: false, source: "eea", models: [model("skoda", "Enyaq"), model("skoda", "Octavia"), model("skoda", "Superb")] },
    { makeId: "ssangyong", name: "SsangYong", hidden: true, source: "eea", models: [model("ssangyong", "Korando")] },
    { makeId: "volkswagen", name: "Volkswagen", hidden: false, source: "eea", models: [model("volkswagen", "Golf"), model("volkswagen", "ID.4"), model("volkswagen", "Passat"), model("volkswagen", "Touran")] },
    { makeId: "volvo", name: "Volvo", hidden: false, source: "eea", models: [model("volvo", "V60"), model("volvo", "V90"), model("volvo", "XC60"), model("volvo", "XC90", true)] },
  ];
  const sent: { method: string; path: string; body: unknown }[] = [];
  await fakeTripServer(page, { vehicles: [{ ...VEHICLE, make: "Zeekr", model: "001", makeId: null, modelId: null } as typeof VEHICLE], admin: { permissions: ["overview.read", "drivers.read", "vehicles.edit", "zones.read"] } });
  await page.route(`${API}/api/v1/admin/car-catalogue**`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    const body = request.postDataJSON?.() ?? null;
    if (request.method() !== "GET") sent.push({ method: request.method(), path, body });
    if (request.method() === "GET") return json(route, 200, { version: 1, attribution: ATTR, makes });
    if (path === "/admin/car-catalogue/makes" && body.name.toLowerCase() === "ssangyong") return json(route, 409, { code: "conflict", message: "exists", requestId: "r", retryable: false, reason: "make_exists", details: ["ssangyong", "hidden"] });
    if (path === "/admin/car-catalogue/makes") { const m = { makeId: "a-1", name: body.name, hidden: false, source: "admin", models: [] }; makes.push(m); return json(route, 201, m); }
    const id = path.split("/").pop();
    const m = makes.find((x) => x.makeId === id);
    if (m) { Object.assign(m, body); return json(route, 200, m); }
    return json(route, 404, { code: "not_found", message: "x", requestId: "r", retryable: false });
  });
  await signIn(page);
  await page.goto(`/vehicles/${VEHICLE.vehicleId}`);
  await expect(page.getByTestId("vehicle-typed")).toContainText("Typed by driver", { timeout: 20_000 });
  await shot(page, "admin-vehicle-typed-by-driver-en");
  await page.getByRole("link", { name: "Add to catalogue" }).click();
  const card = page.getByTestId("car-catalogue");
  await expect(card.getByLabel("Add make")).toHaveValue("Zeekr");
  await card.getByRole("searchbox").fill("");
  await expect(card.getByRole("heading", { name: "Car catalogue" })).toBeVisible();
  await expect(card.getByText("Hidden")).toBeVisible();
  await expect(card.getByText(ATTR)).toBeVisible();
  await card.getByRole("button", { name: /Volvo/ }).click();
  await card.scrollIntoViewIfNeeded();
  await shot(page, "admin-car-catalogue-en");
  await card.getByLabel("Add make").fill("SsangYong");
  await card.getByRole("button", { name: "Add make" }).click();
  await expect(card.getByText("Already in the catalogue, hidden: use Show.")).toBeVisible();
  await shot(page, "admin-car-catalogue-409-hidden-en");
  await card.locator('[data-make="ssangyong"]').getByRole("button", { name: "Show" }).click();
  await expect.poll(() => sent.at(-1)).toMatchObject({ method: "PATCH", path: "/admin/car-catalogue/makes/ssangyong", body: { hidden: false } });
  await card.getByLabel("Add make").fill("Zeekr");
  await card.getByRole("button", { name: "Add make" }).click();
  await expect.poll(() => sent.at(-1)).toMatchObject({ method: "POST", path: "/admin/car-catalogue/makes", body: { name: "Zeekr" } });
  expect(sent.some((s) => s.method === "DELETE")).toBe(false);
});
