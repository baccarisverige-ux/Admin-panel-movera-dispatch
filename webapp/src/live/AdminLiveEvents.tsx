import { useEffect, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { tr } from "../i18n/core";
import { connectAdminEvents, fetchEventSource, keyMatches, liveStreamState, showsReconnecting, watchLiveStream } from "./adminEvents";
import { useLiveSession } from "./LiveSessionContext";

/**
 * Live builds, on every page (contract v0.18.22 §46, BASE job admin live updates): one GET /admin/events stream.
 * Each event reloads the lists it changed; owner L1: while the stream is not open, a small "Reconnecting…" badge
 * (the lists then refresh every minute), never a big banner.
 */
export function AdminLiveEvents() {
  const { client } = useLiveSession();
  const queryClient = useQueryClient();
  useEffect(
    () =>
      connectAdminEvents(fetchEventSource(client), (event) => {
        void queryClient.invalidateQueries({ predicate: (query) => keyMatches(event, query.queryKey) });
      }),
    [client, queryClient],
  );
  const state = useSyncExternalStore(watchLiveStream, liveStreamState, liveStreamState);
  if (!showsReconnecting(state)) return null;
  return (
    <p className="live-not-connected live-reconnecting" role="note" aria-live="polite" data-testid="live-reconnecting">
      {tr("Reconnecting…")}
    </p>
  );
}
