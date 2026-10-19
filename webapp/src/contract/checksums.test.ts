import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTRACTS_DIR, contractText } from "./load.ts";

/** contracts/ must be a byte-for-byte copy of the canonical contract: every file listed in CHECKSUMS, with that sha256. */
test("contracts/ matches contracts/CHECKSUMS", () => {
  const listed = contractText("CHECKSUMS").trim().split("\n").map((line) => {
    const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
    assert.ok(match, `bad CHECKSUMS line: ${line}`);
    return { sha: match[1], path: match[2] };
  });
  for (const { sha, path } of listed) {
    const actual = createHash("sha256").update(readFileSync(new URL(path, CONTRACTS_DIR))).digest("hex");
    assert.equal(actual, sha, `${path} differs from CHECKSUMS`);
  }
  const onDisk: string[] = [];
  const walk = (dir: URL, prefix: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "CHECKSUMS" || name === "__pycache__") continue;
      const url = new URL(name, dir);
      if (statSync(url).isDirectory()) walk(new URL(`${name}/`, dir), `${prefix}${name}/`);
      else onDisk.push(`${prefix}${name}`);
    }
  };
  walk(CONTRACTS_DIR, "");
  assert.deepEqual(onDisk.sort(), listed.map((item) => item.path).sort(), "every contract file is listed and nothing is missing");
});
