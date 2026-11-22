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

// Launch fix 2026-11-20 (audit admin-every-control): a page file that fails once (a network blip) is fetched once more
// before the page shows "Could not load. Reload"; a file that is gone (a new version) still ends on that message.
test("a page file that fails to load is tried once more, then the loading error is passed on", async () => {
  const { loadPage } = await import("./chunkError.ts");
  let calls = 0;
  const flaky = () => (++calls === 1 ? Promise.reject(new TypeError("Failed to fetch dynamically imported module: /a.js")) : Promise.resolve({ Page: "ok" }));
  assert.deepEqual(await loadPage(flaky, 0), { Page: "ok" });
  assert.equal(calls, 2);
  let gone = 0;
  await assert.rejects(loadPage(() => { gone += 1; return Promise.reject(new TypeError("Failed to fetch dynamically imported module: /b.js")); }, 0), (error) => isChunkLoadError(error));
  assert.equal(gone, 2);
  let other = 0;
  await assert.rejects(loadPage(() => { other += 1; return Promise.reject(new Error("boom")); }, 0), /boom/);
  assert.equal(other, 1, "an error in the page's own code is not retried");
});
