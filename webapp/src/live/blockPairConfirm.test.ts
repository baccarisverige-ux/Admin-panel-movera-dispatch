import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Admin check round 2 (2026-11-20): on a trip page, "Block this pair" sent POST /admin/trips/{id}/block-pair on the
// first click, with no confirm dialog (owner 2026-11-16: every confirm shows what will happen). Fails on main.
const src = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("round 2: Block this pair opens a confirm dialog first; the server call is in its Confirm", () => {
  const text = src("./LiveBlockedPairs.tsx");
  const button = text.match(/<button[^>]*data-command="admin\.rider\.block"[^>]*>/)?.[0] ?? "";
  assert.ok(button, "the Block this pair button is there");
  assert.doesNotMatch(button, /onClick=\{\(\) => void block\(\)\}/, "one click must not send the block");
  assert.match(text, /<DecisionDialog[\s\S]*?command="admin\.rider\.block"[\s\S]*?onConfirm=/, "Block this pair confirms through DecisionDialog");
  assert.match(text, /title=\{tr\("Block this pair"\)\}/);
  assert.match(text, /confirmLabel=\{tr\("Block this pair"\)\}/);
});

test("round 2: the incident case card wraps a long case id on a phone (390 px) instead of running off the card", () => {
  const css = src("../styles/ops.css");
  assert.match(css, /\.op-case-view \{[^}]*grid-template-columns: minmax\(0, 1fr\);/, "the card's one column may shrink below its longest word");
  assert.match(css, /\.op-case-head h3, \.op-case-head p \{[^}]*overflow-wrap: anywhere;/, "the case id and the rider id break");
});
