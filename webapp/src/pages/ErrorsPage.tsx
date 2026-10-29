import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tr, trn } from "../i18n";
import { useLiveSessionMaybe } from "../live/LiveSessionContext";
import { DataTable } from "../ui/DataTable";
import {
  createDemoErrors,
  ERROR_APPS,
  ERROR_PLATFORMS,
  ERROR_STATUSES,
  ERRORS_REFRESH_MS,
  errorsPath,
  sortNewest,
  versionsOf,
  type ErrorApp,
  type ErrorFilters,
  type ErrorGroup,
  type ErrorGroupPage,
  type ErrorPlatform,
  type ErrorStatus,
} from "../errors/errors";

/** The demo build's groups: one store per tab, so "Mark fixed" stays until a reload, like the live list would. */
const demoErrors = createDemoErrors();

const appLabel = (app: ErrorApp) => (app === "driver" ? tr("Driver") : app === "rider" ? tr("Rider") : tr("Server"));
const platformLabel = (platform: ErrorPlatform) => (platform === "android" ? tr("Android") : platform === "ios" ? tr("iPhone") : platform === "web" ? tr("Web") : tr("Server"));
const statusLabel = (status: ErrorStatus) => (status === "open" ? tr("Open") : tr("Fixed"));

/**
 * Contract v0.16.0 §11 (owner 2026-10-29, "Crashes & errors"): crashes and errors from the driver app, the rider app
 * and the server, grouped by fingerprint, newest first. Every admin role sees it and may mark a group fixed or open
 * again (owner: "No code now every one can see and later we add"). Live: GET /admin/errors every 30 s and
 * PATCH /admin/errors/{id}; the demo build answers the same shapes from example data.
 */
export function ErrorsPage() {
  const live = useLiveSessionMaybe();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<ErrorFilters>({});
  const [failed, setFailed] = useState(false);
  const list = useQuery({
    queryKey: ["errors", live ? "live" : "demo", filters],
    queryFn: async (): Promise<ErrorGroupPage> => (live ? live.client.json<ErrorGroupPage>(errorsPath(filters)) : demoErrors.list(filters)),
    refetchInterval: ERRORS_REFRESH_MS,
  });
  const mark = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ErrorStatus }): Promise<ErrorGroup> =>
      live
        ? live.client.json<ErrorGroup>(`/admin/errors/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }), idempotencyKey: crypto.randomUUID() })
        : demoErrors.patch(id, status),
    onMutate: () => setFailed(false),
    onError: () => setFailed(true),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["errors"] }),
  });
  const items = useMemo(() => sortNewest(list.data?.items ?? []), [list.data]);
  // The version filter offers every version seen so far, so choosing one keeps the others in the list.
  const [seen, setSeen] = useState<string[]>([]);
  const versions = useMemo(() => versionsOf(items), [items]);
  if (versions.some((version) => !seen.includes(version))) setSeen([...new Set([...seen, ...versions])].sort((a, b) => b.localeCompare(a, "en", { numeric: true })));
  const set = (patch: Partial<ErrorFilters>) => setFilters((current) => ({ ...current, ...patch }));
  const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—");

  return (
    <div className="errors-page">
      <div className="page-heading">
        <div>
          <h2>{tr("Crashes & errors")}</h2>
          <p>{tr("Crashes and errors from the driver app, the rider app and the server, grouped when they are the same. Newest first.")}</p>
        </div>
      </div>
      <section className="panel" aria-label={tr("Crashes & errors")}>
        <div className="pl-filters errors-filters">
          <select aria-label={tr("App")} data-command="admin.errors.view" value={filters.app ?? ""} onChange={(e) => set({ app: (e.target.value || undefined) as ErrorApp | undefined })}>
            <option value="">{tr("Every app")}</option>
            {ERROR_APPS.map((app) => <option key={app} value={app}>{appLabel(app)}</option>)}
          </select>
          <select aria-label={tr("Platform")} data-command="admin.errors.view" value={filters.platform ?? ""} onChange={(e) => set({ platform: (e.target.value || undefined) as ErrorPlatform | undefined })}>
            <option value="">{tr("Every platform")}</option>
            {ERROR_PLATFORMS.map((platform) => <option key={platform} value={platform}>{platformLabel(platform)}</option>)}
          </select>
          <select aria-label={tr("Version")} data-command="admin.errors.view" value={filters.version ?? ""} onChange={(e) => set({ version: e.target.value || undefined })}>
            <option value="">{tr("Every version")}</option>
            {seen.map((version) => <option key={version} value={version}>{version}</option>)}
          </select>
          <select aria-label={tr("Status")} data-command="admin.errors.view" value={filters.status ?? ""} onChange={(e) => set({ status: (e.target.value || undefined) as ErrorStatus | undefined })}>
            <option value="">{tr("Any status")}</option>
            {ERROR_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
          </select>
          {list.isSuccess ? <small className="dx-calm">{trn("{0} groups", items.length)}</small> : null}
        </div>
        {list.isError ? <p role="alert" className="dx-warn">{tr("Could not load crashes and errors. It is tried again in 30 seconds.")}</p> : null}
        {failed ? <p role="alert" className="dx-warn">{tr("Could not change the status. Try again.")}</p> : null}
        {list.isPending ? <p className="state-line">{tr("Loading.")}</p> : null}
        {list.isSuccess && items.length === 0 ? <p className="dx-calm errors-empty">{tr("No crashes or errors here.")}</p> : null}
        {items.length ? (
          <DataTable
            head={[tr("App"), tr("Platform"), tr("Version"), tr("Message"), tr("Count"), tr("Devices"), tr("First seen"), tr("Last seen"), tr("Status"), tr("Action")]}
            rowIds={items.map((item) => item.id)}
            rows={items.map((item) => [
              appLabel(item.app),
              platformLabel(item.platform),
              item.appVersions.join(", "),
              {
                text: item.message,
                node: (
                  <span className="errors-message">
                    <span className={`errors-kind ${item.kind}`}>{item.kind === "crash" ? tr("Crash") : tr("Error")}</span> <strong>{item.message}</strong>
                    {item.topFrame ? <code>{item.topFrame}</code> : null}
                  </span>
                ),
              },
              String(item.count),
              String(item.devices),
              when(item.firstSeen),
              when(item.lastSeen),
              { text: statusLabel(item.status), node: <span className={`errors-pill ${item.status}`}>{statusLabel(item.status)}</span> },
              {
                text: "",
                node: (
                  <button
                    type="button"
                    data-command="admin.errors.status"
                    className="dash-btn small ghost"
                    disabled={mark.isPending}
                    onClick={() => mark.mutate({ id: item.id, status: item.status === "open" ? "fixed" : "open" })}
                  >
                    {item.status === "open" ? tr("Mark fixed") : tr("Reopen")}
                  </button>
                ),
              },
            ])}
          />
        ) : null}
        <p className="dx-calm errors-note">{tr("A group marked fixed opens again by itself if it happens again. Personal data (e-mails, phone numbers, places) is removed before a report is saved; reports are kept 30 days.")}</p>
      </section>
    </div>
  );
}
