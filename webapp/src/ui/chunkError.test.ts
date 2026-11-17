import assert from "node:assert/strict";
import test from "node:test";
import { isChunkLoadError } from "./chunkError.ts";

test("a lazily loaded file that cannot be fetched is a loading error (each browser's words)", () => {
  assert.ok(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://x/assets/TripsPage-abc.js")));
  assert.ok(isChunkLoadError(new TypeError("error loading dynamically imported module: https://x/assets/a.js")));
  assert.ok(isChunkLoadError(new TypeError("Importing a module script failed.")));
  assert.ok(isChunkLoadError(new Error("Unable to preload CSS for /assets/a.css")));
});

test("any other error is not a loading error (it is thrown on as before)", () => {
  assert.equal(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'x')")), false);
  assert.equal(isChunkLoadError(null), false);
  assert.equal(isChunkLoadError({ message: "Failed to fetch dynamically imported module" }), false);
});
