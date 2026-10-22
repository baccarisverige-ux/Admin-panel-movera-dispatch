import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { SURGE_STYLES, dotsGeo, isSurgeStyle, pointsGeo } from "./surgeGeo.ts";
import type { ZoneSurge } from "./surge.ts";

const row = (zoneId: string, multiplier: number, level: ZoneSurge["level"]): ZoneSurge => ({
  zoneId, name: zoneId, center: [59.33, 18.06], airport: false, multiplier, source: "manual", level, profile: null, smartNote: null, ratio: 1, requests: 0, free: 0, endsAt: null, scheduledName: null,
});

test("ten surge styles, each with layers and at least one clickable layer", () => {
  assert.equal(SURGE_STYLES.length, 10);
  assert.ok(isSurgeStyle("heat") && isSurgeStyle("soft") && !isSurgeStyle("boom"));
  const source = readFileSync(new URL("./surgeLayers.ts", import.meta.url), "utf8");
  for (const style of SURGE_STYLES) assert.match(source, new RegExp(`\\b${style.id}: \\[`), `${style.id} has layers`);
});

test("points carry the level label and weight; dots get denser with a higher surge", () => {
  const points = pointsGeo([row("A", 1.4, "low"), row("B", 1, "none")]);
  assert.equal(points.features[0].properties.label, "×1.4");
  assert.equal(points.features[1].properties.label, "×1.0");
  assert.ok(points.features[0].properties.weight > points.features[1].properties.weight);
  const low = dotsGeo([row("A", 1.2, "low")]).features.length;
  const high = dotsGeo([row("A", 2.4, "high")]).features.length;
  assert.ok(high > low);
  assert.deepEqual(dotsGeo([row("A", 2, "high")]), dotsGeo([row("A", 2, "high")]), "same places every time");
});

test("C-27: map pills never put data (zone names, numbers) into HTML", () => {
  const source = readFileSync(new URL("./surgeLayers.ts", import.meta.url), "utf8");
  for (const line of source.split("\n").filter((text) => /innerHTML|insertAdjacentHTML|outerHTML/.test(text))) {
    assert.doesNotMatch(line, /\$\{/, `no template data in an HTML sink: ${line.trim()}`);
    assert.doesNotMatch(line, /row\./, `no record field in an HTML sink: ${line.trim()}`);
  }
  assert.match(source, /name\.textContent = row\.name/);
});
