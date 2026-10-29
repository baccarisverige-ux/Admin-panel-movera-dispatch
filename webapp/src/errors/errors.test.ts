import assert from "node:assert/strict";
import test from "node:test";
import { can, ROLE_PERMISSIONS, type Role } from "../auth/permissions.ts";
import { pageForPath } from "../nav.ts";
import { showInMenu, emptyPanelOps } from "../platform/panel.ts";
import { createDemoErrors, ERRORS_REFRESH_MS, errorsPath, sortNewest, versionsOf, type ErrorGroup } from "./errors.ts";

/** Contract v0.16.0 §11 (owner 2026-10-29): the admin "Crashes & errors" section, open to every admin role. */

test("the list asks the contract's endpoint with only the filters that are set", () => {
  assert.equal(errorsPath({}), "/admin/errors?limit=200");
  assert.equal(errorsPath({ app: "driver", platform: "android", version: "1.4.2", status: "open" }), "/admin/errors?limit=200&app=driver&platform=android&version=1.4.2&status=open");
  assert.equal(errorsPath({ version: "1.4.2 beta" }), "/admin/errors?limit=200&version=1.4.2+beta");
});

test("it is read again every 30 s", () => {
  assert.equal(ERRORS_REFRESH_MS, 30_000);
});

test("newest last seen first, and the versions for the filter", () => {
  const base = { platform: "android", message: "m", kind: "crash", count: 1, devices: 1, firstSeen: "2026-10-01T00:00:00Z", status: "open" } as const;
  const items: ErrorGroup[] = [
    { ...base, id: "a", app: "driver", appVersions: ["1.4.1", "1.4.2"], lastSeen: "2026-10-28T10:00:00Z" },
    { ...base, id: "b", app: "rider", appVersions: ["2.0.0"], lastSeen: "2026-10-29T10:00:00Z" },
  ];
  assert.deepEqual(sortNewest(items).map((item) => item.id), ["b", "a"]);
  assert.deepEqual(versionsOf(items), ["2.0.0", "1.4.2", "1.4.1"]);
});

test("every admin role sees the section, in the menu too; the rest of System stays super only", () => {
  const page = pageForPath("/errors");
  assert.ok(page, "/errors is a page");
  assert.equal(page.group, "Platform");
  for (const role of Object.keys(ROLE_PERMISSIONS) as Role[]) {
    assert.ok(can(role, page.permission), `${role} can open Crashes & errors`);
    assert.ok(showInMenu(page.id, role, emptyPanelOps()), `${role} sees it in the menu`);
  }
  assert.equal(can("viewer", pageForPath("/system")!.permission), false);
});

test("the demo has app, platform and server groups, filters like the server and marks fixed and open again", () => {
  const demo = createDemoErrors(Date.parse("2026-10-29T12:00:00Z"));
  const all = demo.list({});
  assert.ok(all.items.length >= 6);
  assert.deepEqual(new Set(all.items.map((item) => item.app)), new Set(["driver", "rider", "server"]));
  assert.deepEqual(all.items, sortNewest(all.items));
  assert.ok(demo.list({ app: "rider", platform: "ios" }).items.every((item) => item.app === "rider" && item.platform === "ios"));
  const version = all.items[0]!.appVersions[0]!;
  assert.ok(demo.list({ version }).items.every((item) => item.appVersions.includes(version)));
  const open = all.items.find((item) => item.status === "open")!;
  const fixed = demo.patch(open.id, "fixed");
  assert.equal(fixed.status, "fixed");
  assert.ok(fixed.fixedAt);
  assert.ok(demo.list({ status: "fixed" }).items.some((item) => item.id === open.id));
  const back = demo.patch(open.id, "open");
  assert.equal(back.status, "open");
  assert.equal(back.fixedAt, undefined);
  assert.throws(() => demo.patch("nope", "fixed"));
});
