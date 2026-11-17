// Admin lazy-load job (owner 2026-11-03 rule "new admin screens are lazy-loaded"; job 2026-11-16): what the first load
// (the entry script, scripts/check-bundle.mjs) may and must contain. vite.config.ts runs entryProblems() on the entry
// chunk of every build and stops the build when it returns a problem, so a heavy module cannot come back into the
// first load by a new static import, and the safety code cannot be made lazy by mistake.
// Paths are relative to webapp/ ("node_modules/<pkg>/" for libraries); a path ending in "/" means every file under it.

/** Not needed on the first screen: the live client and its settings code, the zone maths and its map libraries. */
export const HEAVY_OUT_OF_ENTRY: readonly string[] = [
  "src/live/liveAdminApi.ts", // the live client (loaded with live/LiveAdminApiProvider, already lazy)
  "src/live/liveSettings.ts",
  "src/live/configDocs.ts",
  "src/config/appConfigs.ts",
  "src/config/book.ts",
  "src/zones/releases.ts",
  "node_modules/polyclip-ts/",
  "node_modules/@turf/",
];

/** Safety (owner: never lazy, never slower): the alert bar, the SOS / alert sound and the live safety reads. */
export const SAFETY_IN_ENTRY: readonly string[] = [
  "src/alerts/AlertsContext.tsx",
  "src/alerts/useAlerts.ts",
  "src/alerts/reads.ts",
  "src/alerts/AlertBell.tsx",
  "src/alerts/RideCheckBanner.tsx",
  "src/dashboard/useAlertSignals.ts", // the alert sound
  "src/live/IncidentAlarm.tsx", // the SOS alarm
  "src/live/AdminLiveEvents.tsx",
  "src/live/liveAlerts.ts",
  "src/live/incidents.ts",
];

/** Module ids as the bundler gives them (absolute paths) → the same path relative to webapp/. */
export function webappPath(id: string): string {
  const clean = id.replace(/\\/g, "/").replace(/\?.*$/, "");
  const lib = clean.lastIndexOf("/node_modules/");
  if (lib >= 0) return clean.slice(lib + 1);
  const src = clean.lastIndexOf("/webapp/src/");
  return src >= 0 ? clean.slice(src + "/webapp/".length) : clean;
}

function matches(path: string, rule: string): boolean {
  return rule.endsWith("/") ? path.startsWith(rule) : path === rule;
}

/** The problems of one entry chunk, given the ids of the modules in it; empty when the first load is as it must be. */
export function entryProblems(moduleIds: readonly string[]): string[] {
  const paths = moduleIds.map(webappPath);
  const problems: string[] = [];
  for (const rule of HEAVY_OUT_OF_ENTRY) {
    const found = paths.filter((path) => matches(path, rule));
    if (found.length) problems.push(`heavy module back in the first load: ${found.slice(0, 3).join(", ")}${found.length > 3 ? ` (+${found.length - 3})` : ""} — load it lazily (src/build/entryGuard.ts)`);
  }
  for (const rule of SAFETY_IN_ENTRY) {
    if (!paths.some((path) => matches(path, rule))) problems.push(`safety module not in the first load: ${rule} — it must stay eager (src/build/entryGuard.ts)`);
  }
  return problems;
}
