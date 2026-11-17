// Admin lazy-load job (2026-11-16): a page, the live client or the sign-in screen is a separate file loaded on demand.
// When that file cannot be fetched (offline, a new deploy removed the old file), the browser's import() rejects with
// one of these messages; the screen then shows "Could not load. Reload" instead of a blank page (ui/ChunkBoundary.tsx).
// Any other error is not a loading error and is passed on unchanged.
const LOAD_FAILED = [
  /Failed to fetch dynamically imported module/i, // Chromium
  /error loading dynamically imported module/i, // Firefox
  /Importing a module script failed/i, // Safari
  /Unable to preload CSS/i, // Vite's CSS preload
  /ChunkLoadError|Loading chunk .* failed/i,
];

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : typeof error === "string" ? error : "";
  return LOAD_FAILED.some((pattern) => pattern.test(message));
}
