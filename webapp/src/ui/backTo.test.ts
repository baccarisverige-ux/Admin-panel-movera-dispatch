import assert from "node:assert/strict";
import test from "node:test";
import { backPlace, decodeMapAt, decodeMapOpen, encodeMapAt, encodeMapOpen, safeBack, searchWithMap, withBack } from "./backTo.ts";

test("map view round-trips through the address", () => {
  const text = encodeMapAt({ lat: 59.334591, lng: 18.06324, zoom: 12.456 });
  assert.equal(text, "59.33459,18.06324,12.46");
  assert.deepEqual(decodeMapAt(text), { lat: 59.33459, lng: 18.06324, zoom: 12.46 });
  for (const bad of [null, "", "1,2", "a,b,c", "95,10,10", "10,190,10", "10,10,30"]) assert.equal(decodeMapAt(bad), null, String(bad));
  assert.equal(encodeMapOpen({ kind: "driver", id: "D0042" }), "driver:D0042");
  assert.deepEqual(decodeMapOpen("rider:T0345"), { kind: "rider", id: "T0345" });
  assert.equal(decodeMapOpen("admin:x"), null);
  assert.equal(decodeMapOpen("driver:<script>"), null);
  assert.equal(encodeMapOpen(null), null);
});

test("searchWithMap writes and clears the map view, keeping other parameters", () => {
  assert.equal(searchWithMap("?view=live&zone=Z001", { lat: 59.3, lng: 18.1, zoom: 12 }, { kind: "driver", id: "D1" }), "?view=live&zone=Z001&mapAt=59.3%2C18.1%2C12&mapOpen=driver%3AD1");
  assert.equal(searchWithMap("?view=live&mapOpen=driver%3AD1", { lat: 1, lng: 2, zoom: 3 }, null), "?view=live&mapAt=1%2C2%2C3");
  assert.equal(searchWithMap("", null, null), "");
});

test("only a path on this site is a return address, and never the page itself", () => {
  assert.equal(safeBack("/dispatch?view=live&mapAt=1%2C2%2C3", "/trips/T0345"), "/dispatch?view=live&mapAt=1%2C2%2C3");
  for (const bad of ["https://evil.example/", "//evil.example/x", "javascript:alert(1)", "/\\evil", "dispatch", "", null]) assert.equal(safeBack(bad, "/trips/T1"), null, String(bad));
  assert.equal(safeBack("/trips/T1?tab=money", "/trips/T1?tab=money&back=%2Fdispatch"), null, "no loop back to itself");
  assert.equal(safeBack("/?back=%2Ftrips%2FT1&tab=live", "/trips/T1"), "/?tab=live", "a back inside back is dropped");
  assert.equal(safeBack(`/${"x".repeat(2000)}`, "/"), null);
});

test("withBack adds the return address once, keeping the link's own parameters and hash", () => {
  assert.equal(withBack("/trips/T1", "/dispatch?view=live"), "/trips/T1?back=%2Fdispatch%3Fview%3Dlive");
  assert.equal(withBack("/drivers/D1?tab=messages#top", "/?tab=live&back=%2Fx"), "/drivers/D1?tab=messages&back=%2F%3Ftab%3Dlive#top");
});

test("the back button names the screen it returns to", () => {
  assert.equal(backPlace("/?tab=live"), "dashboard");
  assert.equal(backPlace("/dispatch?view=live"), "dispatch");
  assert.equal(backPlace("/live"), "live");
  assert.equal(backPlace("/offers?tab=radar"), "offers");
  assert.equal(backPlace("/dispatch/map?zone=Z1"), "live");
  assert.equal(backPlace("/dispatch/radar"), "offers");
  assert.equal(backPlace("/dispatch/bookings"), "offers");
  assert.equal(backPlace("/dispatch/rules?tab=best"), "dispatch");
  assert.equal(backPlace("/pricing"), "other");
});
