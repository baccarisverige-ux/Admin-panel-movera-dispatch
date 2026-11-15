import { useQuery } from "@tanstack/react-query";
import { useAdminApi } from "../api/AdminApiContext";
import { isTerminal } from "../domain/contract";
import { traceView, type TraceView } from "./tripTrace";

/**
 * BQ-A08: the trip page's driven line (GET /admin/trips/{tripId}/trace). Live only (the demo has no trace): null there.
 * While the trip runs it is read again every 15 s (the line grows); an ended trip is read once.
 */
export function useTripTrace(tripId: string, status: string | undefined, enabled: boolean): TraceView | null {
  const api = useAdminApi();
  const query = useQuery({
    queryKey: ["trip-trace", tripId],
    queryFn: () => api.tripTrace!(tripId),
    enabled: enabled && Boolean(tripId) && Boolean(api.tripTrace) && Boolean(status),
    refetchInterval: status && !isTerminal(status) ? 15_000 : false,
    staleTime: status && isTerminal(status) ? 10 * 60_000 : 0,
    retry: (count, error) => count < 2 && !(error instanceof Error && "status" in error && ((error as { status: number }).status === 404 || (error as { status: number }).status === 403)),
  });
  if (!api.tripTrace || !enabled) return null;
  if (query.error) return traceView(query.error);
  return query.data ? traceView(query.data) : null;
}
