import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { COMMANDS } from "../commands/registry.ts";
import { LIVE_COMMANDS, SCREEN_ONLY_COMMANDS, liveClass } from "./liveCommands.ts";

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

// Demo tour key finding 1: screen-only buttons (view and tab switches, filters, zone tools) must never be hidden on live.

function sources(dir: URL): string[] {
  return readdirSync(dir).flatMap((name) => {
    const url = new URL(name, dir);
    if (statSync(url).isDirectory()) return sources(new URL(`${name}/`, dir));
    return /\.tsx?$/.test(name) && !name.endsWith(".test.ts") && name !== "registry.ts" && name !== "liveCommands.ts" ? [readFileSync(url, "utf8")] : [];
  });
}
const code = sources(new URL("../", import.meta.url)).join("\n");
const uses = (id: string) => {
  const q = id.replace(/\./g, "\\.");
  return {
    total: [...code.matchAll(new RegExp(`["\`]${q}["\`]`, "g"))].length,
    plain: [...code.matchAll(new RegExp(`data-command=["\`]${q}["\`]|dataset\\.command = "${q}"`, "g"))].length,
  };
};

test("every command is classified once: server-handled, screen-only or hidden", () => {
  const counts = { server: 0, screen: 0, hidden: 0 };
  for (const command of COMMANDS) counts[liveClass(command.id)] += 1;
  assert.equal(counts.server + counts.screen + counts.hidden, COMMANDS.length);
  for (const id of LIVE_COMMANDS) assert.equal(liveClass(id), "server", id);
  for (const id of SCREEN_ONLY_COMMANDS) {
    assert.ok(COMMANDS.some((command) => command.id === id), `${id} is not a command`);
    assert.ok(!LIVE_COMMANDS.has(id), `${id} is both server and screen-only`);
  }
});

test("screen-only commands are only plain screen buttons (they never reach a server)", () => {
  for (const id of SCREEN_ONLY_COMMANDS) {
    const { total, plain } = uses(id);
    assert.ok(plain > 0 && plain === total, `${id}: used ${total - plain} time(s) as a server command`);
  }
});

test("every command used only by plain screen buttons is visible on live", () => {
  const missing = COMMANDS.filter((command) => liveClass(command.id) === "hidden").map((command) => command.id).filter((id) => {
    const { total, plain } = uses(id);
    return plain > 0 && plain === total;
  });
  assert.deepEqual(missing, []);
});
