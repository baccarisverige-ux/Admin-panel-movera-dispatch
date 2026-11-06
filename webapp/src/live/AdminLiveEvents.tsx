import { useEffect, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { tr } from "../i18n/core";
import { batchedInvalidator, connectAdminEvents, fetchEventSource, liveStreamState, showsReconnecting, watchLiveStream } from "./adminEvents";
import { useLiveSession } from "./LiveSessionContext";

/**
 * Live builds, on every page (contract v0.18.22 §46, BASE job admin live updates): one GET /admin/events stream.
 * Each event reloads the lists it changed; owner L1: while the stream is not open, a small "Reconnecting…" badge
 * (the lists then refresh every minute), never a big banner.
 */
export function AdminLiveEvents() {
  const { client } = useLiveSession();
  const queryClient = useQueryClient();
  useEffect(() => {
    // 503 proof 2026-11-06: one reload per changed list per second, never one per event; a running read is not
    // cancelled and started again (cancelRefetch false), so a burst of events cannot multiply the calls.
    const batch = batchedInvalidator((match) => void queryClient.invalidateQueries({ predicate: (query) => match(query.queryKey) }, { cancelRefetch: false }));
    const stop = connectAdminEvents(fetchEventSource(client), batch.push);
    return () => {
      stop();
      batch.stop();
    };
  }, [client, queryClient]);
  const state = useSyncExternalStore(watchLiveStream, liveStreamState, liveStreamState);
  if (!showsReconnecting(state)) return null;
  return (
    <p className="live-not-connected live-reconnecting" role="note" aria-live="polite" data-testid="live-reconnecting">
      {tr("Reconnecting…")}
    </p>
  );
}
