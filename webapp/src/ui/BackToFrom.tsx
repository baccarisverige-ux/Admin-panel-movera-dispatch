import { useEffect, useRef, type MouseEvent, type RefObject } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";
import type * as maplibregl from "maplibre-gl";
import { tr } from "../i18n";
import { BACK_PARAM, backPlace, decodeMapAt, decodeMapOpen, MAP_AT_PARAM, MAP_OPEN_PARAM, safeBack, searchWithMap, stripBase, withBack, type MapOpen } from "./backTo";

/**
 * "← Back to …" on any page opened from a map pop-up (it carries `?back=`). Without `back`, nothing shows and the
 * page's own Back button works as before. Shown once, at the top of the page, by the app shell.
 */
export function BackToFrom() {
  const location = useLocation();
  const raw = new URLSearchParams(location.search).get(BACK_PARAM);
  const fresh = safeBack(raw, location.pathname + location.search);
  // A page may rewrite its own address after it opens (a tab, the country): keep the target while on the same page.
  const kept = useRef<{ path: string; target: string } | null>(null);
  if (fresh) kept.current = { path: location.pathname, target: fresh };
  else if (kept.current && kept.current.path !== location.pathname) kept.current = null;
  const target = fresh ?? kept.current?.target ?? null;
  if (!target) return null;
  const place = backPlace(target);
  const label = place === "dashboard" ? tr("Back to Dashboard") : place === "dispatch" ? tr("Back to Dispatch") : place === "live" ? tr("Back to Live map") : place === "offers" ? tr("Back to Radar · Exclusive · Reservations") : tr("Back to the map");
  return (
    <div className="back-to-from">
      <Link className="dash-btn ghost dx-back" to={target} data-testid="back-to-map"><ArrowLeft size={15} aria-hidden="true" />{label}</Link>
    </div>
  );
}

/**
 * For a map: internal links clicked inside it (pop-ups, cards) open with `?back=` set to this page's address, so the
 * page they open shows "Back to …". Use as `onClickCapture` on the map's wrapper.
 */
export function useBackLinks() {
  const navigate = useNavigate();
  return (event: MouseEvent<HTMLElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor || anchor.target === "_blank") return;
    const href = anchor.getAttribute("href");
    if (!href || !href.startsWith("/") || href.startsWith("//")) return;
    if (new URLSearchParams(href.split("?")[1] ?? "").has(BACK_PARAM)) return;
    event.preventDefault();
    const base = import.meta.env.BASE_URL;
    navigate(withBack(stripBase(href, base), stripBase(window.location.pathname, base) + window.location.search));
  };
}

/**
 * Keeps the map's view in the page address (center and zoom, and which driver or rider pop-up is open) with
 * replaceState, and restores it when the page opens again (Back to …, a reload, a shared link).
 */
export function useMapUrlState(mapRef: RefObject<maplibregl.Map | null>, ready: boolean, open: MapOpen | null, restore: (open: MapOpen) => void) {
  const restored = useRef(false);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  const openRef = useRef(open);
  openRef.current = open;

  const page = useRef(window.location.pathname);
  const write = () => {
    const map = mapRef.current;
    // Only ever the map page's own address: never a page opened from it a moment ago.
    if (!map || !restored.current || window.location.pathname !== page.current) return;
    const center = map.getCenter();
    const search = searchWithMap(window.location.search, { lat: center.lat, lng: center.lng, zoom: map.getZoom() }, openRef.current);
    if (search === window.location.search) return;
    // Keep the router's own history state so its Back/Forward keep working.
    window.history.replaceState(window.history.state, "", window.location.pathname + search + window.location.hash);
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!restored.current) {
      restored.current = true;
      const params = new URLSearchParams(window.location.search);
      const at = decodeMapAt(params.get(MAP_AT_PARAM));
      if (at) map.jumpTo({ center: [at.lng, at.lat], zoom: at.zoom });
      const wanted = decodeMapOpen(params.get(MAP_OPEN_PARAM));
      if (wanted) restoreRef.current(wanted);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onMove = () => {
      clearTimeout(timer);
      timer = setTimeout(write, 400);
    };
    map.on("moveend", onMove);
    return () => {
      clearTimeout(timer);
      map.off("moveend", onMove);
    };
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const openKey = open ? `${open.kind}:${open.id}` : "";
  useEffect(() => {
    if (ready) write();
  }, [openKey, ready]); // eslint-disable-line react-hooks/exhaustive-deps
}
