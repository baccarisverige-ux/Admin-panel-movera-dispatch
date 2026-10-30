import { useQuery } from "@tanstack/react-query";
import { useLiveSessionMaybe } from "./LiveSessionContext";
import { performanceFacts } from "./liveAdminApi";
import type { Driver } from "./types";

/**
 * G3-D2: the driver's performance from GET /admin/drivers/{driverId} (the list has none). Same query as the documents
 * box, so the page reads the driver once. null = not loaded, the server sent none, or the demo.
 */
export function useDriverPerformance(driverId: string) {
  const live = useLiveSessionMaybe();
  const query = useQuery({ queryKey: ["live", "driver", driverId], queryFn: () => live!.client.json<Driver>(`/admin/drivers/${encodeURIComponent(driverId)}`), enabled: Boolean(live && driverId) });
  return query.data?.performance ? performanceFacts(query.data.performance) : null;
}
