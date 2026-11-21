import { useQuery } from "@tanstack/react-query";
import { useLiveSessionMaybe } from "./LiveSessionContext";
import { AIRPORT_QUEUES_PATH, isNoQueueArea, queueAreaWanted, parseQueueArea, parseQueueFeed, queueAreaPath, type QueueArea, type QueueFeedItem } from "./airportQueue.ts";

/** Fix job 9 (§60): the Dashboard feed, asked every 30 s (no push). null in the demo; data null while loading or failed. */
export function useAirportQueueFeed(): { data: QueueFeedItem[] | null; failed: boolean } | null {
  const live = useLiveSessionMaybe();
  const query = useQuery({
    queryKey: ["live", "airport-queues"],
    queryFn: async () => parseQueueFeed(await live!.client.json<unknown>(AIRPORT_QUEUES_PATH)),
    enabled: Boolean(live?.admin),
    refetchInterval: 30_000,
    retry: false,
  });
  if (!live) return null;
  return { data: query.data ?? null, failed: query.isError };
}

export const queueAreaKey = (zoneId: string) => ["live", "queue-area", zoneId];

/** An airport zone's queue area; area null when none is drawn yet (404). */
export function useQueueArea(zone: { zoneId: string; kind: string }) {
  const zoneId = zone.zoneId;
  const live = useLiveSessionMaybe();
  return useQuery({
    queryKey: queueAreaKey(zoneId),
    queryFn: async (): Promise<QueueArea | null> => {
      try {
        return parseQueueArea(await live!.client.json<unknown>(queueAreaPath(zoneId)));
      } catch (error) {
        if (isNoQueueArea(error)) return null;
        throw error;
      }
    },
    enabled: Boolean(live?.admin) && queueAreaWanted(zone),
    retry: false,
  });
}
