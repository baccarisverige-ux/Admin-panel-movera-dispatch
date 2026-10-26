import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // The live people spec runs against a faked server with its own config (playwright.live.config.ts).
  testIgnore: /live-[a-z-]+\.spec\.ts/,
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:4173",
    ...devices["Desktop Chrome"],
    // Local runs on a machine without the pinned browser build can point at another Chromium (CI installs its own).
    ...(process.env.PW_CHROMIUM ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } } : {}),
  },
  webServer: {
    // CI runs the production build (every page is lazy-loaded; served by the dev server its modules were
    // transformed on demand, one per round trip, and a first visit on a busy two-core runner took longer than
    // an assertion waits while React Router kept the old page on screen). The build needs VITE_DATA=demo to
    // allow the simulation adapter. Locally the dev server stays, with hot reload.
    command: process.env.CI
      ? "npx vite build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort"
      : "npm run dev -- --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    // The e2e texts are English: every admin starts in English unless a test picks another language (round 4).
    env: { VITE_ADMIN_LANGUAGE: "en", ...(process.env.CI ? { VITE_DATA: "demo" } : {}) },
    timeout: process.env.CI ? 300_000 : 60_000,
  },
});
