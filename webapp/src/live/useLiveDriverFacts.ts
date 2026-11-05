import { useQuery } from "@tanstack/react-query";
import { useLiveSessionMaybe } from "./LiveSessionContext";
import { driverFactsPath, parseDriverFactsList, type ServerDriverFacts } from "./dispatchFacts.ts";

/**
 * Contract v0.18.21 §45: the real facts of the online drivers of `zoneIds` (GET /admin/zones/{id}/driver-facts).
 * The server has no push for these yet, so they are asked every 30 s while the panel is open. null in the demo.
 */
export function useLiveDriverFacts(zoneIds: readonly string[]): { rows: ServerDriverFacts[]; loading: boolean; failed: boolean; partial: boolean } | null {
  const live = useLiveSessionMaybe();
  const key = zoneIds.join(",");
  const query = useQuery({
    queryKey: ["live", "driver-facts", key],
    // One zone failing (e.g. 403 outside scope) never blanks the others; failed only when every zone failed.
    queryFn: async () => {
      const settled = await Promise.allSettled(key.split(",").filter(Boolean).map((zoneId) => live!.client.json<unknown>(driverFactsPath(zoneId)).then(parseDriverFactsList)));
      const ok = settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
      if (ok.length === 0 && settled.length > 0) throw new Error("driver facts unavailable");
      return { rows: ok.flat(), partial: ok.length < settled.length };
    },
    enabled: Boolean(live) && key.length > 0,
    refetchInterval: 30_000,
    retry: false,
  });
  if (!live) return null;
  return { rows: query.data?.rows ?? [], loading: query.isLoading, failed: query.isError, partial: query.data?.partial ?? false };
}
