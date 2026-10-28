/**
 * The Dispatch section: one menu item, four tabs (owner 2026-10-28). Each tab has its own path under /dispatch;
 * the old separate pages (/live, /offers, /dispatch?...) redirect to the right tab, query and hash kept.
 */
export const DISPATCH_TABS = [
  { id: "map", path: "/dispatch/map", label: "Live map" },
  { id: "radar", path: "/dispatch/radar", label: "Radar · Exclusive" },
  { id: "bookings", path: "/dispatch/bookings", label: "Bookings" },
  { id: "rules", path: "/dispatch/rules", label: "Rules" },
] as const;

export type DispatchTabId = (typeof DISPATCH_TABS)[number]["id"];

export const DISPATCH_TAB_PATTERN = /^\/dispatch\/(map|radar|bookings|rules)$/;

/** The tab a path shows, or null when the path is not a Dispatch tab. */
export function dispatchTabOf(pathname: string): DispatchTabId | null {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  const match = DISPATCH_TAB_PATTERN.exec(path);
  return match ? (match[1] as DispatchTabId) : null;
}

function join(path: string, params: URLSearchParams, hash: string): string {
  const search = params.toString();
  return `${path}${search ? `?${search}` : ""}${hash ? `#${hash}` : ""}`;
}

/**
 * Where an old Dispatch, Live map or Radar · Exclusive · Reservations link opens now. Any other href comes back as it is.
 * /live → Live map; /offers → Radar · Exclusive, or Bookings for its reservations tab;
 * /dispatch with a radar/exclusive/reservations tab → that tab; any other /dispatch address → Rules (the old Dispatch page was the rules).
 */
export function dispatchHref(href: string): string {
  const [pathPart, hash = ""] = href.split("#");
  const [rawPath, query = ""] = pathPart.split("?");
  const path = rawPath.length > 1 ? rawPath.replace(/\/$/, "") : rawPath;
  const params = new URLSearchParams(query);
  const tab = params.get("tab");
  const offersTab = (): string => {
    if (tab === "reservations") {
      params.delete("tab");
      return join("/dispatch/bookings", params, hash);
    }
    if (tab !== "exclusive") params.delete("tab");
    return join("/dispatch/radar", params, hash);
  };
  if (path === "/live") return join("/dispatch/map", params, hash);
  if (path === "/offers") return offersTab();
  if (path === "/dispatch") {
    if (tab === "radar" || tab === "exclusive" || tab === "reservations") return offersTab();
    return join("/dispatch/rules", params, hash);
  }
  return href;
}
