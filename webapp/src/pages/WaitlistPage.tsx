import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { tr } from "../i18n";
import { useLiveSessionMaybe } from "../live/LiveSessionContext";
import { NotConnected } from "../live/NotConnected";
import { DataTable } from "../ui/DataTable";
import type { Page } from "../live/types";
import { askedTimes, displayPhone, numbersCount, WAITLIST_REFRESH_MS, waitlistCounts, waitlistPath, waitlistTime, type WaitlistApp, type WaitlistEntry } from "../waitlist/waitlist";

/**
 * Contract v0.15.0 §24 (owner 2026-10-29, decision 5): the numbers that asked to join from the rider or driver app's
 * sign-in while sign-in is open only for the test numbers. Live: read again every 15 s. The demo has no such list.
 */
export function WaitlistPage() {
  const live = useLiveSessionMaybe();
  const [app, setApp] = useState<WaitlistApp | "all">("all");
  const list = useQuery({
    queryKey: ["live", "waitlist", app],
    queryFn: () => live!.client.json<Page<WaitlistEntry>>(waitlistPath(app)),
    enabled: Boolean(live),
    refetchInterval: WAITLIST_REFRESH_MS,
  });
  const items = list.data?.items ?? [];
  const counts = waitlistCounts(items);
  const appLabel = (value: WaitlistApp) => (value === "rider" ? tr("Rider") : tr("Driver"));
  return (
    <div className="waitlist-page">
      <div className="page-heading">
        <div>
          <h2>{tr("Waiting list")}</h2>
          <p>{tr("Numbers that asked to join from the apps' sign-in. Sign-in is open only for the test numbers until an SMS company is chosen.")}</p>
        </div>
      </div>
      {!live ? (
        <NotConnected block />
      ) : (
        <section aria-label={tr("Waiting list")}>
          <div className="waitlist-filters" role="group" aria-label={tr("App")}>
            {(["all", "rider", "driver"] as const).map((value) => (
              <button key={value} data-command="admin.waitlist.view" type="button" className={`dash-btn small${app === value ? "" : " ghost"}`} aria-pressed={app === value} onClick={() => setApp(value)}>
                {value === "all" ? tr("All") : appLabel(value)}
              </button>
            ))}
            <small className="dx-calm">{tr("Live")} · {numbersCount(app === "all" ? counts.all : counts[app])}</small>
          </div>
          {list.isError ? <p role="alert" className="dx-warn">{tr("Could not load the waiting list. It is tried again in 15 seconds.")}</p> : null}
          {list.isSuccess && items.length === 0 ? <p className="dx-calm">{tr("Nobody is on the waiting list yet.")}</p> : null}
          {items.length ? (
            <DataTable
              head={[tr("Phone"), tr("App"), tr("Language"), tr("Asked"), tr("First asked"), tr("Last asked")]}
              rowIds={items.map((item) => `${item.phone}:${item.app}`)}
              rows={items.map((item) => [
                displayPhone(item.phone),
                appLabel(item.app),
                item.locale ? item.locale.toUpperCase() : "—",
                askedTimes(item.count),
                waitlistTime(item.firstAt),
                waitlistTime(item.lastAt),
              ])}
            />
          ) : null}
        </section>
      )}
    </div>
  );
}
