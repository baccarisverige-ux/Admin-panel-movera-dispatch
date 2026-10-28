import { lazy, Suspense } from "react";
import { NavLink, Navigate, useLocation } from "react-router";
import { CalendarClock, Map as MapIcon, Radar, ScrollText } from "lucide-react";
import { DISPATCH_TABS, dispatchHref, dispatchTabOf, type DispatchTabId } from "../dispatch/section";
import { tr } from "../i18n";

const LivePage = lazy(() => import("./LivePage").then((module) => ({ default: module.LivePage })));
const DispatchPage = lazy(() => import("./DispatchPage").then((module) => ({ default: module.DispatchPage })));

const ICON: Record<DispatchTabId, typeof Radar> = { map: MapIcon, radar: Radar, bookings: CalendarClock, rules: ScrollText };

function label(id: DispatchTabId): string {
  if (id === "map") return tr("Live map");
  if (id === "radar") return tr("Radar · Exclusive");
  if (id === "bookings") return tr("Bookings");
  return tr("Rules");
}

/** An old Dispatch, Live map or Radar · Exclusive · Reservations address: open the right tab, same zone, card and hash. */
export function DispatchRedirect() {
  const location = useLocation();
  return <Navigate to={dispatchHref(`${location.pathname}${location.search}${location.hash}`)} replace />;
}

/** Dispatch: one menu item, four tabs (Live map, Radar · Exclusive, Bookings, Rules), the same in demo and live. */
export function DispatchSectionPage() {
  const location = useLocation();
  const tab = dispatchTabOf(location.pathname);
  if (!tab) return <Navigate to="/dispatch/map" replace />;
  // The zone and country ride along between tabs, so switching keeps the same place.
  const params = new URLSearchParams(location.search);
  const keep = new URLSearchParams();
  for (const key of ["country", "zone"]) {
    const value = params.get(key);
    if (value) keep.set(key, value);
  }
  const carried = keep.toString();
  return (
    <div className="dispatch-section" data-testid="dispatch-section" data-tab={tab}>
      <nav className="dash-tabs dispatch-section-tabs" aria-label={tr("Dispatch")} data-testid="dispatch-section-tabs">
        {DISPATCH_TABS.map((item) => {
          const Icon = ICON[item.id];
          return (
            <NavLink key={item.id} to={carried ? `${item.path}?${carried}` : item.path} className={({ isActive }) => (isActive ? "dash-tab active" : "dash-tab")} aria-current={tab === item.id ? "page" : undefined} data-testid={`dispatch-tab-${item.id}`}>
              <Icon size={15} aria-hidden="true" /> {label(item.id)}
            </NavLink>
          );
        })}
      </nav>
      {/* One DispatchPage across Radar · Exclusive, Bookings and Rules: unsaved edits and open cards stay when the tab changes. */}
      <Suspense fallback={<p className="state-line">{tr("Loading.")}</p>}>
        {tab === "map" ? <LivePage /> : tab === "radar" ? <DispatchPage section="offers" /> : tab === "bookings" ? <DispatchPage section="bookings" /> : <DispatchPage />}
      </Suspense>
    </div>
  );
}
