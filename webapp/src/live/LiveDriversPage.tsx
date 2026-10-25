import { useNavigate, useSearchParams } from "react-router";
import { Tabs } from "../ui/Tabs";
import { NoAccess } from "../ui/kit";
import { tr } from "../i18n";
import { useLiveSession } from "./LiveSessionContext";
import { documentCounts, fullName, listQuery, placeLabel } from "./format";
import { ErrorLine, LoadMore, SearchBox, Status, useLivePage } from "./ui";
import type { Driver, DriverAccountStatus } from "./types";

const TABS = [
  { id: "all", label: "All" },
  { id: "on_hold", label: "On hold" },
  { id: "pending", label: "Pending" },
  { id: "active", label: "Active" },
  { id: "suspended", label: "Suspended" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * GET /api/v1/admin/drivers?accountStatus&onlineStatus&zoneId&q&cursor&limit: the live drivers list with status tabs,
 * a search box and Load more. Onboarding opens it on the "on hold" tab (details sent, waiting for Movera).
 */
export function LiveDriversPage({ initialStatus, title = "Drivers" }: { initialStatus?: DriverAccountStatus; title?: "Drivers" | "Onboarding" }) {
  const { can } = useLiveSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get("status");
  const tab: TabId = (TABS.find((item) => item.id === fromUrl)?.id ?? initialStatus ?? "all") as TabId;
  const q = params.get("q") ?? "";
  const zoneId = params.get("scope") ?? "";
  const path = (cursor: string | null) => `/admin/drivers${listQuery({ accountStatus: tab === "all" ? "" : tab, q, zoneId, cursor, limit: 50 })}`;
  const page = useLivePage<Driver>(["live", "drivers", tab, q, zoneId], path, can("drivers.read"));

  if (!can("drivers.read")) return <NoAccess />;

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h2>{tr(title)}</h2>
          <p>{tr("Drivers from the server, in the zones of your scope. Open a row to see the details and documents.")}</p>
        </div>
      </div>
      <Tabs tabs={TABS} activeId={tab} onChange={(id) => setParam("status", id === (initialStatus ?? "all") ? "" : id)} />
      <SearchBox value={q} onChange={(next) => setParam("q", next)} placeholder={tr("Search by name, e-mail or id")} />
      {page.isLoading ? <p className="state-line">{tr("Loading.")}</p> : null}
      <ErrorLine error={page.error} onRetry={page.reload} />
      {!page.isLoading && !page.error && page.items.length === 0 ? <p className="state-line">{tr("No drivers match.")}</p> : null}
      {page.items.length > 0 ? (
        <div className="table-wrap">
          <table className="live-table live-rows">
            <thead>
              <tr>
                <th>{tr("Name")}</th>
                <th>{tr("Account type")}</th>
                <th>{tr("Country / city")}</th>
                <th>{tr("Status")}</th>
                <th>{tr("Online")}</th>
                <th>{tr("Fleet")}</th>
                <th>{tr("Documents")}</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((driver) => {
                const counts = documentCounts(driver);
                const open = () => navigate(`/drivers/${encodeURIComponent(driver.driverId)}`);
                return (
                  <tr key={driver.driverId} data-driver-id={driver.driverId} className="live-row" onClick={open}>
                    <td>
                      <button data-command="admin.server.openRecord" type="button" className="link-action" onClick={(event) => { event.stopPropagation(); open(); }}>
                        {fullName(driver.firstName, driver.lastName, driver.driverId)}
                      </button>
                    </td>
                    <td>{driver.accountType ? (driver.accountType === "fleet" ? tr("Fleet account") : tr("Driver")) : "—"}</td>
                    <td>{placeLabel(driver.country, driver.cityId) || "—"}</td>
                    <td><Status code={driver.accountStatus} /></td>
                    <td><Status code={driver.onlineStatus} /></td>
                    <td>{driver.fleet?.name ?? "—"}</td>
                    <td>{counts.required ? `${counts.approved}/${counts.required}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      <LoadMore hasMore={page.hasMore} loading={page.loadingMore} onClick={() => void page.loadMore()} />
    </>
  );
}
