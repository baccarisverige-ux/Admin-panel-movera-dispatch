import { expect, test } from "@playwright/test";
import { fakeTripServer, signIn } from "./live-fake";

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
