import { useNavigate, useSearchParams } from "react-router";
import { Tabs } from "../ui/Tabs";
import { NoAccess } from "../ui/kit";
import { tr } from "../i18n";
import { useLiveSession } from "./LiveSessionContext";
import { listQuery, placeLabel } from "./format";
import { DateText, ErrorLine, LoadMore, SearchBox, Status, useLivePage } from "./ui";
import type { Fleet } from "./types";

const TABS = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "blocked", label: "Blocked" },
  { id: "all", label: "All" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** GET /api/v1/admin/fleets?status&country&zoneId&q&cursor: the companies, pending first. */
export function LiveFleetsPage() {
  const { can } = useLiveSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab: TabId = (TABS.find((item) => item.id === params.get("status"))?.id ?? "pending") as TabId;
  const q = params.get("q") ?? "";
  const zoneId = params.get("scope") ?? "";
  const country = params.get("country") ?? "";
  const path = (cursor: string | null) => `/admin/fleets${listQuery({ status: tab === "all" ? "" : tab, q, zoneId, country, cursor, limit: 50 })}`;
  const page = useLivePage<Fleet>(["live", "fleets", tab, q, zoneId, country], path, can("drivers.read"));

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
          <h2>{tr("Fleet owners")}</h2>
          <p>{tr("Companies that signed up as fleet accounts. Approving a fleet makes its join code; its owner is activated as a driver separately.")}</p>
        </div>
      </div>
      <Tabs tabs={TABS} activeId={tab} onChange={(id) => setParam("status", id === "pending" ? "" : id)} />
      <SearchBox value={q} onChange={(next) => setParam("q", next)} placeholder={tr("Search by company, owner or org. number")} />
      {page.isLoading ? <p className="state-line">{tr("Loading.")}</p> : null}
      <ErrorLine error={page.error} onRetry={page.reload} />
      {!page.isLoading && !page.error && page.items.length === 0 ? <p className="state-line">{tr("No fleets match.")}</p> : null}
      {page.items.length > 0 ? (
        <div className="table-wrap">
          <table className="live-table live-rows">
            <thead>
              <tr>
                <th>{tr("Company")}</th>
                <th>{tr("Org. number")}</th>
                <th>{tr("Owner")}</th>
                <th>{tr("Country / city")}</th>
                <th>{tr("Status")}</th>
                <th>{tr("Drivers")}</th>
                <th>{tr("Vehicles")}</th>
                <th>{tr("Signed up")}</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((fleet) => {
                const open = () => navigate(`/fleets/${encodeURIComponent(fleet.fleetId)}`);
                return (
                  <tr key={fleet.fleetId} data-fleet-id={fleet.fleetId} className="live-row" onClick={open}>
                    <td>
                      <button data-command="admin.server.openRecord" type="button" className="link-action" onClick={(event) => { event.stopPropagation(); open(); }}>{fleet.name}</button>
                    </td>
                    <td>{fleet.orgNumber}</td>
                    <td>{fleet.ownerName}</td>
                    <td>{placeLabel(fleet.country, fleet.cityId)}</td>
                    <td><Status code={fleet.status} /></td>
                    <td>{fleet.driverCount}</td>
                    <td>{fleet.vehicleCount}</td>
                    <td><DateText value={fleet.createdAt} /></td>
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
