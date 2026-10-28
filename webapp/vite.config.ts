import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// MOVERA_DEV_PROXY=http://127.0.0.1:8080 makes the dev server forward /api to a Movera server, so the live mode
// (VITE_ADMIN_API=http) runs same-origin in development: no CORS, and the bearer token stays with this origin.
const proxyTarget = process.env.MOVERA_DEV_PROXY;

export default defineConfig({
  plugins: [react()],
  base: "/",
  // The status words come from the shared contract copy next to webapp/ (contracts/contract.json#statusWords).
  server: {
    fs: { allow: [".", "../contracts"] },
    ...(proxyTarget ? { proxy: { "/api": { target: proxyTarget, changeOrigin: true } } } : {}),
  },
});
