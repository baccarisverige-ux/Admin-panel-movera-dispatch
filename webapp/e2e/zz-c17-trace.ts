import type { Page } from "@playwright/test";
// C17 diagnostic only (rule 36). Removed before the PR is ready.
export async function tracer(page: Page) {
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
export const dump = async (page: Page, tag: string) => { const log: string[] = await page.evaluate(() => (window as any).__ro ?? []); const i = log.findIndex((l) => l.startsWith("ERROR")); console.log(`[${tag}] ${log.length} lines, first error at ${i}\n` + (i < 0 ? log.slice(0, 15) : log.slice(0, 12).concat(["..."], log.slice(Math.max(12, i - 25), i + 3))).join("\n")); };

