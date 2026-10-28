import { useEffect, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { currentLanguage, subscribeLanguage } from "../i18n";
import { setLiveMarketZones } from "../markets/markets";
import { zoneStore } from "../zones/bookStore";
import { marketZoneOf, shapeOfServerZone, type ServerZone } from "../zones/live";
import { useLiveSessionMaybe } from "./LiveSessionContext";

/**
 * Contract v0.11.0 §20 (owner 2026-10-28, decision #9): in a live build GET /admin/zones is the zone list of every
 * screen — the top bar's country and zone picker, the Zones page, the zone page and the map. Until it answers (or
 * when the admin may not read zones) the screens keep the panel's built-in list.
 */
export const LIVE_ZONES_KEY = ["live", "zones"] as const;

let list: ServerZone[] | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
const snapshot = () => list;

/** The server's zones (null until loaded). */
export function useLiveZoneList(): ServerZone[] | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function liveZoneById(zoneId: string): ServerZone | undefined {
  return list?.find((zone) => zone.zoneId === zoneId);
}

function apply(zones: ServerZone[] | null) {
  list = zones;
  const language = currentLanguage();
  setLiveMarketZones(zones ? zones.map((zone) => marketZoneOf(zone, language)) : null);
  if (zones) zoneStore.loadLive(zones.map((zone) => shapeOfServerZone(zone, language)));
  listeners.forEach((listener) => listener());
}

export function LiveZonesSync() {
  const live = useLiveSessionMaybe();
  const signedIn = Boolean(live?.admin);
  const language = useSyncExternalStore(subscribeLanguage, currentLanguage, currentLanguage);
  const query = useQuery({
    queryKey: LIVE_ZONES_KEY,
    enabled: signedIn,
    retry: false,
    queryFn: async () => (await live!.client.json<{ zones: ServerZone[] }>("/admin/zones")).zones ?? [],
  });
  const data = query.data;
  useEffect(() => {
    if (signedIn && data) apply(data);
  }, [signedIn, data, language]);
  useEffect(() => {
    if (!signedIn && list) apply(null);
  }, [signedIn]);
  return null;
}
