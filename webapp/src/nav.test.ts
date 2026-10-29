import { can } from "./auth/permissions.ts";
import { readFileSync } from "node:fs";
import { MENU, MENU_GROUPS, REDIRECT_PATHS, pageForPath } from "./nav.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

assert(MENU_GROUPS.length === 8, "eight groups");
assert(new Set(MENU.map((item) => item.id)).size === MENU.length, "ids are unique");
assert(pageForPath("/trips")?.id === "trips", "trips route");
assert(pageForPath("/drivers/D2847")?.id === "drivers", "driver record");
assert(pageForPath("/tickets/S1")?.id === "support", "ticket record");
assert(pageForPath("/no-such") === undefined, "unknown path is not a page");
assert(MENU.some((item) => item.id === "drivers" && item.path === "/drivers"), "drivers address");
assert(!MENU.some((item) => item.path === "/franchise" || item.path === "/database" || item.path === "/api"), "old pages are gone");
assert(pageForPath("/incidents")?.group === "Operations", "incidents sit in Operations");
assert(pageForPath("/risk")?.group === "Operations", "risk sits in Operations");
// Owner 2026-10-28: one Dispatch item; Live map, Radar · Exclusive, Bookings and Rules are its tabs.
assert(MENU.filter((item) => item.icon === "Radar" || item.id === "live" || item.id === "offers").map((item) => item.id).join() === "dispatch", "one Dispatch item in the menu");
for (const tab of ["map", "radar", "bookings", "rules"]) assert(pageForPath(`/dispatch/${tab}`)?.id === "dispatch", `the ${tab} tab is the Dispatch page`);
assert(REDIRECT_PATHS.includes("/live") && REDIRECT_PATHS.includes("/offers") && REDIRECT_PATHS.includes("/dispatch"), "the old Live map and Radar · Exclusive · Reservations addresses redirect");

const support = MENU.filter((item) => can("support", item.permission));
assert(support.some((item) => item.id === "support") && support.some((item) => item.id === "riders"), "support sees its work");
// Owner 2026-10-29: Crashes & errors is open to every admin role; support sees no other Platform page.
assert(!support.some((item) => item.group === "Finance" || (item.group === "Platform" && item.id !== "errors")), "support does not see finance or platform");
assert(support.some((item) => item.id === "errors"), "support sees Crashes & errors");

// C-06 / UI-01: an admin's page is guarded like the Team list, so a viewer cannot open /team/nora.
assert(pageForPath("/team/nora")?.id === "team", "team member page is the Team page");
assert(!can("viewer", pageForPath("/team/nora")!.permission), "viewer cannot open a team member page");
// Every route in App.tsx resolves to a page with a permission (or is a plain redirect), so none is open by accident.
const routes = [...readFileSync(new URL("./App.tsx", import.meta.url), "utf8").matchAll(/<Route path="([^"*]+)"/g)].map((match) => `/${match[1]}`.replace(/:[^/]+/g, "x"));
assert(routes.length > 30, "found the routes");
for (const route of routes) assert(pageForPath(route) || REDIRECT_PATHS.includes(route), `route ${route} has no page entry`);

console.log("admin nav ok");
