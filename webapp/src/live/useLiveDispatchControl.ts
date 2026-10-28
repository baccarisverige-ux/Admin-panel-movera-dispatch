import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLiveSessionMaybe } from "./LiveSessionContext";
import { dispatchControlPath, parseControl, type ServerDispatchControl } from "./dispatchControl.ts";

export type LiveControls = { byZone: Map<string, ServerDispatchControl>; failed: boolean; refresh: () => void };

/**
 * Live Dispatch › Zones right now (contract v0.7.2 §3.6): each zone's switch from GET /admin/zones/{id}/dispatch-control,
 * asked every 15 s. null in the demo, where the page keeps the dispatch book's control.
 */
export function useLiveDispatchControls(zoneIds: readonly string[]): LiveControls | null {
  const live = useLiveSessionMaybe();
  const client = useQueryClient();
  const key = zoneIds.join(",");
  const query = useQuery({
    queryKey: ["live", "dispatch-control", key],
    queryFn: async () => {
      const rows = await Promise.all(key.split(",").filter(Boolean).map((zoneId) => live!.client.json<unknown>(dispatchControlPath(zoneId)).then(parseControl, () => null)));
      return rows.filter((row): row is ServerDispatchControl => row !== null);
    },
    enabled: Boolean(live) && key.length > 0,
    refetchInterval: 15_000,
    retry: false,
  });
  const data = query.data;
  const byZone = useMemo(() => new Map((data ?? []).map((row) => [row.zoneId, row])), [data]);
  if (!live) return null;
  return { byZone, failed: query.isError, refresh: () => void client.invalidateQueries({ queryKey: ["live", "dispatch-control"] }) };
}
