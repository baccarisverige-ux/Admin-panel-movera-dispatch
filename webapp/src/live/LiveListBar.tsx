import { useEffect, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRecords } from "../api/hooks";
import { TRIP_STATUSES } from "../domain/contract";
import { statusLabel } from "../domain/labels";
import { tr } from "../i18n";
import { useLiveSessionMaybe } from "./LiveSessionContext";
import { listQueryOf, setListQuery, subscribeLists, type LiveListName } from "./liveLists";
import { ErrorLine } from "./ui";

const STATUSES: Record<LiveListName, readonly string[]> = {
  drivers: ["pending", "active", "on_hold", "suspended"],
  fleets: ["pending", "approved", "rejected", "blocked"],
  vehicles: ["pending", "approved", "rejected", "blocked"],
  trips: TRIP_STATUSES,
};

/**
 * Live builds only: the server's status filter and "Load more" (the demo table's own search box searches the server) for a demo list page, and the error line with
 * "Try again" when the server fails. The demo page below keeps its own look; it shows what the server sent.
 */
export function LiveListBar({ list, records = list, initialStatus = "" }: { list: LiveListName; records?: string; initialStatus?: string }) {
  const live = useLiveSessionMaybe();
  if (!live) return null;
  return <Bar list={list} records={records} initialStatus={initialStatus} />;
}

function Bar({ list, records, initialStatus }: { list: LiveListName; records: string; initialStatus: string }) {
  const queryClient = useQueryClient();
  const query = useSyncExternalStore(subscribeLists, () => listQueryOf(list), () => listQueryOf(list));
  const rows = useRecords(records, null, { observe: true });
  useEffect(() => {
    setListQuery(list, { status: initialStatus, pages: 1 });
  }, [list, initialStatus]);
  const change = (patch: Parameters<typeof setListQuery>[1]) => {
    setListQuery(list, patch);
    void queryClient.invalidateQueries({ queryKey: ["records"] });
  };
  return (
    <div className="live-list-bar" data-testid={`live-list-${list}`}>
      <label className="live-status-filter">
        {tr("Status on the server")}
        <select value={query.status} onChange={(event) => change({ status: event.target.value, pages: 1 })}>
          <option value="">{tr("All")}</option>
          {STATUSES[list].map((code) => <option key={code} value={code}>{statusLabel(code)}</option>)}
        </select>
      </label>
      {query.hasMore && !rows.error ? (
        <button data-command="admin.server.loadMore" type="button" className="secondary-btn" disabled={rows.isFetching} onClick={() => change({ pages: query.pages + 1 })}>
          {rows.isFetching ? tr("Loading.") : tr("Load more")}
        </button>
      ) : null}
      {rows.error ? <ErrorLine error={rows.error} onRetry={() => void rows.refetch()} /> : null}
    </div>
  );
}
