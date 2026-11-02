import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The live adapter's command code names each id it handles; the hide list must name exactly those.
function idsIn(file: string, start: RegExp, end: RegExp): string[] {
  const text = readFileSync(new URL(file, import.meta.url), "utf8");
  const from = text.search(start);
  const rest = text.slice(from);
  const body = rest.slice(0, rest.search(end));
  return [...body.matchAll(/"(admin\.[A-Za-z0-9.]+)"/g)].map((match) => match[1]!);
}

test("LIVE_COMMANDS is exactly what the live adapter handles", () => {
  const api = readFileSync(new URL("./liveAdminApi.ts", import.meta.url), "utf8");
  const maps = [...api.matchAll(/^const (?:STATUS_COMMANDS|FLEET_COMMANDS|VEHICLE_COMMANDS|INCIDENT_COMMANDS|TRIP_STEPS)\b[^]*?;$/gm)].flatMap((match) => [...match[0].matchAll(/"(admin\.[A-Za-z0-9.]+)"\s*:/g)].map((m) => m[1]!));
  const handled = new Set([
    ...maps,
    ...idsIn("./liveAdminApi.ts", /async function command\(/, /\n {2}function nameOf\(/),
    ...idsIn("./liveSettings.ts", /\n {4}command\(action, input\) \{/, /\n {4}\},\n {2}\};/),
  ]);
  const listed = idsIn("./liveCommands.ts", /export const LIVE_COMMANDS/, /\]\);/);
  assert.deepEqual([...new Set(listed)].sort(), [...handled].sort());
});
