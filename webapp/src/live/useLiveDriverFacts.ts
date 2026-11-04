import { useQuery } from "@tanstack/react-query";
import { useLiveSessionMaybe } from "./LiveSessionContext";
import { driverFactsPath, parseDriverFactsList, type ServerDriverFacts } from "./dispatchFacts.ts";

/**
 * Contract v0.18.21 §45: the real facts of the online drivers of `zoneIds` (GET /admin/zones/{id}/driver-facts).
 * The server has no push for these yet, so they are asked every 30 s while the panel is open. null in the demo.
 */
export function useLiveDriverFacts(zoneIds: readonly string[]): { rows: ServerDriverFacts[]; loading: boolean; failed: boolean } | null {
  const live = useLiveSessionMaybe();
  const key = zoneIds.join(",");
  const query = useQuery({
    queryKey: ["live", "driver-facts", key],
    queryFn: async () => (await Promise.all(key.split(",").filter(Boolean).map((zoneId) => live!.client.json<unknown>(driverFactsPath(zoneId)).then(parseDriverFactsList)))).flat(),
    enabled: Boolean(live) && key.length > 0,
    refetchInterval: 30_000,
    retry: false,
  });
  if (!live) return null;
  return { rows: query.data ?? [], loading: query.isLoading, failed: query.isError };
}
