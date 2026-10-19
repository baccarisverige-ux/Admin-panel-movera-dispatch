import { readdirSync, readFileSync } from "node:fs";
import { COLLECTION_WRITES, COMMANDS, REFUND_APPROVAL_MINOR, SLICE_WRITERS } from "./registry.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

const ids = new Set(COMMANDS.map((command) => command.id));
assert(ids.size === COMMANDS.length, "command ids are unique");
for (const command of COMMANDS) {
  assert(command.owner.length > 0, `${command.id} has an owner`);
  assert(command.entity.length > 0, `${command.id} has an entity`);
  assert(["global", "zone", "record"].includes(command.scope), `${command.id} has a scope policy`);
  assert(command.idempotent === true, `${command.id} is idempotent`);
  assert(command.audit === "always" || command.audit === "none", `${command.id} declares its audit policy`);
  if (command.versioned) assert(command.audit === "always", `${command.id} business actions are audited`);
  if (command.destructive) assert(command.reason, `${command.id} destructive actions require a reason`);
}
assert(COMMANDS.every((command) => command.owner.length > 0), "every action has an owner");
assert(COMMANDS.every((command) => command.entity.length > 0), "every action has an entity");
assert(COMMANDS.find((command) => command.id === "admin.trip.cancel")?.allowedStates?.includes("in_trip"), "trip cancel has state policy");
const refundSpec = COMMANDS.find((command) => command.id === "admin.payment.refund");
assert(refundSpec?.approvalThresholdMinor?.SEK === 20_000, "refund threshold is registered");
// C-08: the same rule in every currency: 200 kr, 20 €, 60 DT (TND has 1000 millimes, so not 20 DT).
assert(refundSpec?.approvalThresholdMinor?.EUR === 2_000 && refundSpec.approvalThresholdMinor.TND === 60_000, "refund threshold per currency");
assert(COMMANDS.find((command) => command.id === "admin.trip.refund")?.approvalThresholdMinor === REFUND_APPROVAL_MINOR, "a full trip refund has the same threshold");
// C-04: every command declares what it writes, and the tables only name real commands.
for (const id of Object.keys(COLLECTION_WRITES)) assert(ids.has(id), `${id} in COLLECTION_WRITES is a command`);
for (const [slice, patterns] of Object.entries(SLICE_WRITERS)) {
  assert(patterns.every((pattern) => COMMANDS.some((command) => pattern.endsWith("*") ? command.id.startsWith(pattern.replace(/\.?\*$/, (m) => (m === ".*" ? "." : ""))) : command.id === pattern)), `${slice} writers are commands`);
}
assert(!COMMANDS.find((command) => command.id === "admin.trip.note")?.writes.slices.includes("finance"), "a trip note cannot write finance");
assert(COMMANDS.find((command) => command.id === "admin.trip.note")?.writes.slices.includes("tripOps"), "a trip note writes trip ops");
assert(!COMMANDS.find((command) => command.id === "admin.driver.note")?.writes.collections.drivers, "a driver note cannot patch the driver record");

function buttonTags(text: string): string[] {
  const tags: string[] = [];
  let index = 0;
  while (index < text.length) {
    const start = text.indexOf("<button", index);
    if (start < 0) break;
    let end = start + 7;
    while (end < text.length) {
      if (text[end] === ">" && text[end - 1] !== "=") break;
      end += 1;
    }
    tags.push(text.slice(start, end + 1));
    index = end + 1;
  }
  return tags;
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return walk(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

const root = new URL("../", import.meta.url).pathname;
for (const path of walk(root)) {
  const text = readFileSync(path, "utf8");
  for (const tag of buttonTags(text)) {
    const literal = /data-command="([^"]+)"/.exec(tag);
    if (literal) {
      assert(ids.has(literal[1]), `${path} uses unknown command ${literal[1]}`);
      continue;
    }
    assert(path.endsWith("/CommandButton.tsx") && tag.includes("data-command={command}"), `${path} has a button that is not in the registry`);
  }
  for (const match of text.matchAll(/command="([^"]+)"/g)) {
    assert(ids.has(match[1]), `${path} references unknown command ${match[1]}`);
  }
}

const trips = readFileSync(new URL("../pages/TripsPage.tsx", import.meta.url), "utf8");
const riders = readFileSync(new URL("../pages/RidersPage.tsx", import.meta.url), "utf8");
assert(trips.includes("useTrips"), "trips come from the demo hook");
assert(!trips.includes("T1001"), "the 3-trip sample is gone");
assert(riders.includes("useRiders"), "riders come from the demo hook");
assert(!riders.includes("RIDERS"), "the sample rider cards are gone");

console.log("registry ok");
