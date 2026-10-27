import { defineConfig, devices } from "@playwright/test";

/**
 * The live people area against a faked server: the app starts with VITE_ADMIN_API pointing at an origin nobody
 * listens on, and e2e/live-people.spec.ts answers every call with page.route. Run with `npm run e2e:live`.
 */
/** PW_LIVE_PORT lets two checkouts run the live suite side by side (default 4174). */
const PORT = Number(process.env.PW_LIVE_PORT ?? 4174);

export default defineConfig({
  testDir: "./e2e",
  testMatch: /live-[a-z-]+\.spec\.ts/,
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...devices["Desktop Chrome"],
    ...(process.env.PW_CHROMIUM ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } } : {}),
  },
  webServer: {
    command: process.env.CI
      ? `npx vite build --outDir dist-live && npx vite preview --outDir dist-live --host 127.0.0.1 --port ${PORT} --strictPort`
      : `npm run dev -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    env: { VITE_ADMIN_LANGUAGE: "en", VITE_ADMIN_API: "http://127.0.0.1:4310" },
    timeout: process.env.CI ? 300_000 : 60_000,
  },
});
