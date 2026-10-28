import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ZoneSurge } from "../pricing/surge";
import type { PricingStore } from "../pricing/zonePricing";
import { useLiveSessionMaybe } from "./LiveSessionContext";
import { liveSurgeRows, surgeHistoryPath, surgeNowPath, type SurgeHistory, type SurgeNowAnswer } from "./liveSurge.ts";

/** "loading" while asking, "failed" when the call failed (the page says Not connected yet), "ok" with the answer. */
export type LiveState = "loading" | "failed" | "ok";

export type LiveSurgeData = {
  now: SurgeNowAnswer | null;
  nowState: LiveState;
  history: SurgeHistory | null;
  historyState: LiveState;
};

const stateOf = (query: { isError: boolean; isPending: boolean }): LiveState => (query.isError ? "failed" : query.isPending ? "loading" : "ok");

/**
 * Contract v0.7.2 (contract.json#surgeLive): the live panel's surge numbers. null in the demo (no live session),
 * where the Surge tab keeps its own model. The surge now is asked every 30 s, the chosen zone's history every 60 s.
 */
export function useLiveSurge(zoneIds: readonly string[], zoneId: string | null, withHistory: boolean): LiveSurgeData | null {
  const live = useLiveSessionMaybe();
  const key = zoneIds.join(",");
  const now = useQuery({
    queryKey: ["live", "surge-now", key],
    queryFn: () => live!.client.json<SurgeNowAnswer>(surgeNowPath(key.split(","))),
    enabled: Boolean(live) && key.length > 0,
    refetchInterval: 30_000,
    retry: false,
  });
  const history = useQuery({
    queryKey: ["live", "surge-history", zoneId],
    queryFn: () => live!.client.json<SurgeHistory>(surgeHistoryPath(zoneId!)),
    enabled: Boolean(live) && Boolean(zoneId) && withHistory,
    refetchInterval: 60_000,
    retry: false,
  });
  if (!live) return null;
  const nowData = now.data && Array.isArray(now.data.zones) ? now.data : null;
  const historyData = history.data && Array.isArray(history.data.points) && Array.isArray(history.data.timeline) && history.data.priceCheck ? history.data : null;
  // An answer of the wrong shape counts as no answer: nothing is shown as data.
  const nowState = !key.length ? "failed" : stateOf(now) === "ok" && !nowData ? "failed" : stateOf(now);
  const historyState = stateOf(history) === "ok" && !historyData ? "failed" : stateOf(history);
  return { now: nowData, nowState, history: historyData, historyState };
}

/**
 * Live Dashboard and Dispatch maps (contract.json#driverSurgeMap): the server's surge now per zone, in the demo's
 * ZoneSurge shape. null in the demo, where the maps keep the demo's surge model.
 */
export function useLiveMapSurge(zoneIds: readonly string[], store: PricingStore): { rows: ZoneSurge[]; state: LiveState } | null {
  const data = useLiveSurge(zoneIds, null, false);
  const answer = data?.now ?? null;
  const key = zoneIds.join(",");
  const rows = useMemo(() => liveSurgeRows(store, key ? key.split(",") : [], answer, Date.now()).map((row) => row.surge), [store, key, answer]);
  if (!data) return null;
  return { rows, state: data.nowState };
}
