import { useEffect, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router";
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
  riders: ["active", "suspended"],
  payments: ["pending", "authorized", "captured", "failed", "refunded", "partially_refunded"],
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

/** The page visit each list's starting status was last set on. */
const appliedOn = new Map<LiveListName, string>();

function Bar({ list, records, initialStatus }: { list: LiveListName; records: string; initialStatus: string }) {
  const queryClient = useQueryClient();
  const query = useSyncExternalStore(subscribeLists, () => listQueryOf(list), () => listQueryOf(list));
  const rows = useRecords(records, null, { observe: true });
  const visit = useLocation().key;
  useEffect(() => {
    // Once per visit of the page: a remount while the page loads keeps the status the admin just picked.
    const key = `${visit}:${initialStatus}`;
    if (appliedOn.get(list) === key) return;
    appliedOn.set(list, key);
    setListQuery(list, { status: initialStatus, pages: 1 });
  }, [list, initialStatus, visit]);
  const change = (patch: Parameters<typeof setListQuery>[1]) => {
    setListQuery(list, patch);
    // Only this list asks the server again; the page's other lists keep their rows.
    void queryClient.invalidateQueries({ queryKey: ["records", records] });
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
