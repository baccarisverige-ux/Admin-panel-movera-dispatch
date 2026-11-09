import { test } from "node:test";
import assert from "node:assert/strict";
import { APP_WEB_URLS, appWebUrl, openPreviewWindow, parsePreviewSession, previewUrl } from "./appPreview.ts";

// Contract v0.18.25 §47 (BASE B7, owner P1 a / P2 b / P3 a).
test("app preview: the server's session becomes the framed app's address, token in the fragment only", () => {
  const session = parsePreviewSession({ token: "a.b.c", role: "driver", zoneId: "Z001", useDraft: true, expiresAt: "2026-11-04T10:15:00Z", subjectId: "preview:driver:Z001" });
  assert.ok(session);
  const url = previewUrl(APP_WEB_URLS.driver, session);
  assert.equal(url, "https://baccarisverige-ux.github.io/Movera-driver-app/live/#movera-preview=a.b.c&zone=Z001&draft=1");
  assert.equal(new URL(url).search, "");
  assert.equal(previewUrl("https://x.test/app/#old", { ...session, useDraft: false }), "https://x.test/app/#movera-preview=a.b.c&zone=Z001&draft=0");
});

test("app preview: a broken answer is never framed", () => {
  assert.equal(parsePreviewSession(null), null);
  assert.equal(parsePreviewSession({ token: "<script>", role: "rider", zoneId: "Z1", expiresAt: "x" }), null);
  assert.equal(parsePreviewSession({ token: "a.b.c", role: "admin", zoneId: "Z1", expiresAt: "x" }), null);
});

test("app preview: the build may point at another web build, https only", () => {
  assert.equal(appWebUrl("rider", { VITE_RIDER_APP_URL: "https://test.example/rider/" }), "https://test.example/rider/");
  assert.equal(appWebUrl("rider", { VITE_RIDER_APP_URL: "javascript:alert(1)" }), APP_WEB_URLS.rider);
  assert.equal(appWebUrl("driver"), APP_WEB_URLS.driver);
});

// Step 24 (owner Q31, 2026-11-09): the app opens in a new tab with noopener, never in a frame.
test("app preview: opens the app in a new tab with noopener; refuses non-https; false only when open() throws", () => {
  const calls: unknown[][] = [];
  const win = { open: (...args: unknown[]) => { calls.push(args); return null; } } as unknown as Pick<Window, "open">;
  assert.equal(openPreviewWindow("https://baccarisverige-ux.github.io/movera-rider-app/live/#movera-preview=a.b.c&zone=Z001&draft=0", win), true);
  assert.deepEqual(calls, [["https://baccarisverige-ux.github.io/movera-rider-app/live/#movera-preview=a.b.c&zone=Z001&draft=0", "_blank", "noopener,noreferrer"]]);
  assert.equal(openPreviewWindow("javascript:alert(1)", win), false);
  assert.equal(calls.length, 1);
  const refused = { open: () => { throw new Error("sandbox"); } } as unknown as Pick<Window, "open">;
  assert.equal(openPreviewWindow("https://x.test/app/#movera-preview=t&zone=Z1&draft=0", refused), false);
});
