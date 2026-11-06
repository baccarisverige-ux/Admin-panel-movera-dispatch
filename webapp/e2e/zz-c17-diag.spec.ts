import { expect, test, type Page } from "@playwright/test";
// C17 diagnostic only (rule 36: prove the cause). Removed before the PR is ready.
async function session(page: Page) {
  await page.addInitScript(() => { localStorage.setItem("movera-admin-session", "nora"); localStorage.setItem("movera-admin-activity", String(Date.now())); });
}
async function tracer(page: Page) {
  await page.addInitScript(() => {
    const Orig = window.ResizeObserver; let n = 0; const log: string[] = []; (window as any).__ro = log;
    const desc = (el: Element) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 2).join(".")}`;
    window.ResizeObserver = class extends Orig {
      constructor(cb: ResizeObserverCallback) {
        const id = ++n; const where = (new Error().stack ?? "").split("\n").slice(1, 4).map((s) => s.trim().slice(0, 120)).join(" | ");
        log.push(`new RO#${id} ${where}`);
        super((entries, obs) => { log.push(`cb RO#${id} t=${performance.now().toFixed(0)} ${entries.map((e) => `${desc(e.target)} ${Math.round(e.contentRect.width)}x${Math.round(e.contentRect.height)}`).join(", ")}`); cb(entries, obs); });
      }
    } as any;
    window.addEventListener("error", (e) => log.push(`ERROR t=${performance.now().toFixed(0)} ${e.message}`));
  });
}
const dump = async (page: Page, tag: string) => { const log: string[] = await page.evaluate(() => (window as any).__ro ?? []); const i = log.findIndex((l) => l.startsWith("ERROR")); console.log(`[${tag}] ${log.length} lines, first error at ${i}\n` + (i < 0 ? log.slice(0, 15) : log.slice(0, 12).concat(["..."], log.slice(Math.max(12, i - 25), i + 3))).join("\n")); };

test("diag RO live", async ({ page }) => {
  await session(page); await tracer(page);
  await page.goto("/live");
  const marker = page.locator(".ops-marker.driver:not(.stale)").first();
  await expect(marker).toBeVisible();
  await page.waitForTimeout(4000);
  await dump(page, "live");
});
test("diag RO zones", async ({ page }) => {
  await session(page); await tracer(page);
  await page.goto("/zones");
  await expect(page.getByRole("article", { name: "Stockholm zones" })).toBeVisible();
  await page.waitForTimeout(3000);
  await page.goto("/zones?country=FR");
  await page.waitForTimeout(3000);
  await dump(page, "zones");
});
test("diag settings find", async ({ page }) => {
  await session(page);
  await page.goto("/settings");
  const box = page.getByLabel("Find a setting");
  await box.fill("booking");
  const state = async (t: string) => console.log(`[find ${t}] value=${await box.inputValue()} loading=${await page.getByText("Loading configuration.").count()} h3=${await page.locator(".pl-settings-all article.panel > h3").count()} jumps=${JSON.stringify(await page.locator(".pl-jumps").innerText())} links=${await page.getByRole("link", { name: "Booking rules" }).count()} h3text=${JSON.stringify((await page.locator(".pl-settings-all article.panel > h3").allTextContents()).slice(0, 20))}`);
  await state("0ms"); await page.waitForTimeout(1500); await state("1.5s"); await page.waitForTimeout(4000); await state("5.5s");
});
test("diag r06 timing", async ({ page }) => {
  await session(page);
  const t0 = Date.now();
  await page.goto("/onboarding");
  await page.getByRole("cell", { name: "D0005" }).click();
  const app = page.getByRole("article", { name: /^Application of / });
  await expect(app).toBeVisible();
  console.log(`[r06] open ${Date.now() - t0}ms fields=${await app.getByLabel(/^Valid until for /).count()} buttons=${await app.getByRole("button", { name: /^(Approve|Mark held) / }).count()}`);
  const t1 = Date.now();
  const all = app.getByRole("button", { name: /^(Approve|Mark held) / });
  console.log(`[r06] enabled=${await all.evaluateAll((els) => els.filter((e) => !(e as HTMLButtonElement).disabled).length)} countTook=${Date.now() - t1}ms`);
});
