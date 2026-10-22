import assert from "node:assert/strict";
import test from "node:test";
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import { baseMapStyle, MAP_LABELS_BEFORE, rasterFallbackStyle } from "./mapStyle.ts";

test("the shared vector map style is valid MapLibre and uses OpenFreeMap", () => {
  const style = baseMapStyle();
  assert.deepEqual(validateStyleMin(style).map((error) => error.message), []);
  assert.deepEqual(validateStyleMin(rasterFallbackStyle).map((error) => error.message), []);
  const source = style.sources.openmaptiles;
  assert.equal(source.type, "vector");
  assert.match((source as { url: string }).url, /^https:\/\/tiles\.openfreemap\.org\//);
  assert.match((source as { attribution: string }).attribution, /OpenStreetMap/);
  assert.ok(!JSON.stringify(style).includes("tile.openstreetmap.org"), "no raster tiles by default");
});

test("names stay on top, and each map gets its own copy", () => {
  const style = baseMapStyle();
  const ids = style.layers.map((layer) => layer.id);
  const first = ids.indexOf(MAP_LABELS_BEFORE);
  assert.ok(first > 0);
  assert.ok(style.layers.slice(first).every((layer) => layer.type === "symbol"), "everything from the first name layer up is a name");
  assert.ok(style.layers.slice(0, first).every((layer) => layer.type !== "symbol"));
  const other = baseMapStyle();
  other.layers.pop();
  assert.equal(baseMapStyle().layers.length, style.layers.length, "copies are independent");
});

test("extra raster layers such as satellite go under the names", () => {
  const style = baseMapStyle({
    sources: { satellite: { type: "raster", tiles: ["https://example.test/{z}/{x}/{y}.png"], tileSize: 256 } },
    layers: [{ id: "satellite", type: "raster", source: "satellite", layout: { visibility: "none" } }],
  });
  assert.deepEqual(validateStyleMin(style).map((error) => error.message), []);
  const ids = style.layers.map((layer) => layer.id);
  assert.equal(ids.indexOf("satellite"), ids.indexOf(MAP_LABELS_BEFORE) - 1);
});
