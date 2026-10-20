import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("C-27: map pills never put data (zone names, numbers) into HTML", () => {
  const source = readFileSync(new URL("./surgeLayers.ts", import.meta.url), "utf8");
  for (const line of source.split("\n").filter((text) => /innerHTML|insertAdjacentHTML|outerHTML/.test(text))) {
    assert.doesNotMatch(line, /\$\{/, `no template data in an HTML sink: ${line.trim()}`);
    assert.doesNotMatch(line, /row\./, `no record field in an HTML sink: ${line.trim()}`);
  }
  assert.match(source, /name\.textContent = row\.name/);
});
