import assert from "node:assert/strict";
import test from "node:test";
import { readTripMessages } from "./tripChat.ts";
import type { TripMessage } from "./LiveChat.tsx";
import type { Page } from "./types.ts";

// Owner G9 (2026-10-30): "Never store messages between rider or driver in driver app or rider app !!!!!!' Only admin
// panel inside the ride details" — the trip details page reads the whole chat from the server, oldest first.
test("G9: every page of the trip's chat is read, oldest first", async () => {
  const pages: Record<string, Page<TripMessage>> = {
    "/trips/T1/messages?limit=200": { items: [{ messageId: "b", tripId: "T1", from: "rider", text: "2", at: "2026-10-25T08:02:00Z" }], nextCursor: "c1" },
    "/trips/T1/messages?limit=200&cursor=c1": { items: [{ messageId: "a", tripId: "T1", from: "driver", text: "1", at: "2026-10-25T08:01:00Z" }], nextCursor: null },
  };
  const asked: string[] = [];
  const items = await readTripMessages(async (path) => {
    asked.push(path);
    return pages[path]!;
  }, "T1");
  assert.deepEqual(asked, ["/trips/T1/messages?limit=200", "/trips/T1/messages?limit=200&cursor=c1"]);
  assert.deepEqual(items.map((item) => item.text), ["1", "2"]);
});

// G9 live 2026-11-02: the Chat page showed raw trip ids ("trp_01M6…") as list titles and a "Not connected yet" badge
// although it reads and writes the server.
test("G9 live: a chat is titled by the rider's and the driver's first names, never by the raw trip id", async () => {
  const { chatTripLabel } = await import("./tripChat.ts");
  const label = chatTripLabel({ tripId: "trp_01M6DDWPQG6AS1HP46SNBAH8VP", rider: { firstName: "Anna" }, driver: { firstName: "Omar" } });
  assert.equal(label.title, "Anna ↔ Omar");
  assert.ok(!label.title.includes("trp_"));
  assert.ok(label.ref.length < 16, "a short reference only");
  const unnamed = chatTripLabel({ tripId: "trp_01M6DDWPQG6AS1HP46SNBAH8VP" });
  assert.ok(!unnamed.title.includes("trp_01M6"));
});

test("G9 live: the live Chat page shows no Not connected yet badge", async () => {
  const { connectionOf } = await import("./connection.ts");
  assert.equal(connectionOf("chat").state, "connected");
});
