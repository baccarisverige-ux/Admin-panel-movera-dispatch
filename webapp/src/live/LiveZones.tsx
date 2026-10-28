import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { currentLanguage, subscribeLanguage, tr } from "../i18n";
import { setLiveMarketZones } from "../markets/markets";
import { zoneStore } from "../zones/bookStore";
import { marketZoneOf, shapeOfServerZone, type ServerZone } from "../zones/live";
import { useLiveSessionMaybe } from "./LiveSessionContext";

/**
 * Contract v0.11.0 §21 (owner 2026-10-28, decision #9): in a live build GET /admin/zones is the zone list of every
 * screen — the top bar's country and zone picker, the Zones page, the zone page and the map. Never the panel's
 * built-in list: until it answers the list is empty, and a failed read shows the error with Try again.
 */
export const LIVE_ZONES_KEY = ["live", "zones"] as const;

let list: ServerZone[] | null = null;
let failure: { error: unknown; retry: () => void } | null = null;
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

const failureSnapshot = () => failure;
/** The failed read of GET /admin/zones, with a retry (null while it is fine or loading). */
export function useLiveZonesFailure(): { error: unknown; retry: () => void } | null {
  return useSyncExternalStore(subscribe, failureSnapshot, failureSnapshot);
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
  const error = query.isError ? query.error : null;
  const refetch = query.refetch;
  useEffect(() => {
    failure = error ? { error, retry: () => void refetch() } : null;
    listeners.forEach((listener) => listener());
  }, [error, refetch]);
  // Signed in but not loaded yet (or failed): no zones at all, never the built-in seeds.
  useEffect(() => {
    if (signedIn && !data) {
      setLiveMarketZones([]);
      zoneStore.loadLive([]);
    }
  }, [signedIn, data]);
  useEffect(() => {
    if (signedIn && data) apply(data);
  }, [signedIn, data, language]);
  useEffect(() => {
    if (!signedIn && list) apply(null);
  }, [signedIn]);
  return null;
}

/**
 * The screens wait for the zone list (or its failure) after sign-in, so every page reads the server's zones from its
 * first render (pages that load per zone once, such as Pricing, would otherwise read an empty list).
 */
export function LiveZonesGate({ children }: { children: ReactNode }) {
  const live = useLiveSessionMaybe();
  const zones = useLiveZoneList();
  const failed = useLiveZonesFailure();
  if (live?.admin && zones === null && !failed) return <p className="state-line">{tr("Loading.")}</p>;
  return <>{children}</>;
}
