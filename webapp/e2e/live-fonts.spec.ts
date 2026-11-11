import { expect, test } from "@playwright/test";
import { fakeTripServer, signIn } from "./live-fake";

/** C12 (audit A16 S4): Inter and Poppins come from the app itself; no call to fonts.googleapis.com / fonts.gstatic.com. */
test("fonts are self-hosted: Inter loads from the app, nothing goes to Google Fonts", async ({ page }) => {
  const google: string[] = [];
  page.on("request", (request) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) google.push(request.url());
  });
  await fakeTripServer(page);
  await signIn(page);
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(() => [...document.fonts].filter((face) => face.status === "loaded").map((face) => face.family.replace(/['"]/g, "")));
  expect(loaded).toContain("Inter");
  expect(google).toEqual([]);
});
