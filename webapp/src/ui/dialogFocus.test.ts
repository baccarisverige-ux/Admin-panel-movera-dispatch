import assert from "node:assert/strict";
import { test } from "node:test";
import { initialFocusOf, tabTargetOf } from "./dialogFocus.ts";

/** R18 + confirm "!": the "!" (marked data-skip-initial-focus) never takes the dialog's first focus, but stays in the Tab cycle. */
type Item = { skip: boolean; name: string };
const item = (name: string, skip = false): Item => ({ name, skip });
const skips = (element: Item) => element.skip;
const info = item("!", true), reason = item("Reason"), confirm = item("Confirm"), cancel = item("Cancel");
const items = [info, reason, confirm, cancel];

test("initial focus: the first element that is not marked; the marked one only when it is alone", () => {
  assert.equal(initialFocusOf(items, skips), reason);
  assert.equal(initialFocusOf([info], skips), info);
  assert.equal(initialFocusOf([], skips), undefined);
});

test("Shift+Tab from the first field goes to the last control; Tab from the last goes to the \"!\", so it stays reachable", () => {
  assert.equal(tabTargetOf(items, reason, true, skips), cancel);
  assert.equal(tabTargetOf(items, info, true, skips), cancel);
  assert.equal(tabTargetOf(items, cancel, false, skips), info);
  assert.equal(tabTargetOf(items, info, false, skips), null);
  assert.equal(tabTargetOf(items, confirm, true, skips), null);
});
