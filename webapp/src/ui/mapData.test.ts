import { test } from "node:test";
import assert from "node:assert/strict";
import { setDataIfChanged } from "./mapData.ts";

test("a map source gets setData only when its data really changes (a re-render with new arrays does not repaint)", () => {
  const calls: unknown[] = [];
  const source = { setData: (data: unknown) => { calls.push(data); return source as never; } };
  const empty = (): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features: [] });
  assert.equal(setDataIfChanged(source, empty()), true);
  assert.equal(setDataIfChanged(source, empty()), false);
  const point: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [18, 59] } }] };
  assert.equal(setDataIfChanged(source, point), true);
  assert.equal(setDataIfChanged(source, empty()), true);
  assert.equal(calls.length, 3);
  assert.equal(setDataIfChanged(undefined, empty()), false);
});
