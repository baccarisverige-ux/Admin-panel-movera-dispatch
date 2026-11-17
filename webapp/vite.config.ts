import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { entryProblems } from "./src/build/entryGuard.ts";

// Admin lazy-load job (2026-11-16): the build stops when a heavy module is back in the first load (entry script) or a
// safety module (alert bar, SOS / alert sound, live safety reads) has left it. Lists: src/build/entryGuard.ts.
function entryGuard(): Plugin {
  return {
    name: "movera-entry-guard",
    apply: "build",
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk" || !chunk.isEntry) continue;
        const problems = entryProblems(Object.keys(chunk.modules));
        if (problems.length) this.error(`entry ${chunk.fileName}:\n${problems.join("\n")}`);
      }
    },
  };
}

// MOVERA_DEV_PROXY=http://127.0.0.1:8080 makes the dev server forward /api to a Movera server, so the live mode
// (VITE_ADMIN_API=http) runs same-origin in development: no CORS, and the bearer token stays with this origin.
const proxyTarget = process.env.MOVERA_DEV_PROXY;

export default defineConfig({
  plugins: [react(), entryGuard()],
  base: "/",
  // Load-time job (owner 2026-11-03, audit F9): the libraries every page needs go into their own files, so the entry
  // script stays under its size budget (scripts/check-bundle.mjs) and a new admin build does not make browsers
  // download React again. Only the start-up libraries are named here; maps and drawing stay loaded on demand.
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/node_modules\/(react|react-dom|scheduler|react-router)\//.test(id)) return "vendor-react";
          // BQ-A07 PR: bignumber.js (money maths, needed at start-up) joins the start-up libraries; entry gzip about 8 kB smaller.
          if (/node_modules\/(zod|@tanstack\/query-core|@tanstack\/react-query|lucide-react|bignumber\.js)\//.test(id)) return "vendor-lib";
          return undefined;
        },
      },
    },
  },
  // The status words come from the shared contract copy next to webapp/ (contracts/contract.json#statusWords).
  server: {
    fs: { allow: [".", "../contracts"] },
    ...(proxyTarget ? { proxy: { "/api": { target: proxyTarget, changeOrigin: true } } } : {}),
  },
});
