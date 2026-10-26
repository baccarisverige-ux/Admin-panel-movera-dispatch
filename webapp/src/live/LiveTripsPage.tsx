import { useNavigate, useSearchParams } from "react-router";
import { Tabs } from "../ui/Tabs";
import { NoAccess } from "../ui/kit";
import { tr, type MessageKey } from "../i18n";
import { useLiveSession } from "./LiveSessionContext";
import { listQuery, liveMoney } from "./format";
import { DateText, ErrorLine, LoadMore, SearchBox, Status, useLivePage } from "./ui";
import type { Trip } from "./types";

/** contract TripStatus, grouped the way the Trips page's tabs read them. */
const ACTIVE = ["requested", "searching", "offered", "accepted", "driver_to_pickup", "arrived", "rider_onboard", "in_trip", "approaching_dropoff"];
const CANCELLED = ["cancelled_by_rider", "cancelled_by_driver", "cancelled_by_admin", "cancelled_by_system", "no_show", "expired", "failed"];

const TABS = [
  { id: "all", label: "All", statuses: [] as string[] },
  { id: "active", label: "Active", statuses: ACTIVE },
  { id: "completed", label: "Completed", statuses: ["completed"] },
  { id: "cancelled", label: "Cancelled", statuses: CANCELLED },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** Offer and payment words the panel's shared status labels do not have (kept here so demo pages read as before). */
const WORDS: Record<string, MessageKey> = { partially_refunded: "Partially refunded", declined: "Declined", claimed: "Claimed" };

export function Word({ code }: { code: string }) {
  const word = WORDS[code];
  return word ? <>{tr(word)}</> : <Status code={code} />;
}

/** "Volvo V90 · ABC 123", or the vehicle id when the server sent no summary. */
export function carLabel(trip: Pick<Trip, "driver" | "vehicleId">): string {
  const car = trip.driver?.vehicle;
  const name = [car?.make, car?.model].filter(Boolean).join(" ");
  const label = [name, car?.plate].filter(Boolean).join(" · ");
  return label || trip.vehicleId || "—";
}

/**
 * GET /api/v1/admin/trips?status&q&zoneId&cursor&limit: the live trips list with status tabs, a search box and Load
 * more. A row opens the trip (GET /admin/trips/{tripId}).
 */
export function LiveTripsPage() {
  const { can } = useLiveSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab: TabId = (TABS.find((item) => item.id === params.get("status"))?.id ?? "all") as TabId;
  const q = params.get("q") ?? "";
  const zoneId = params.get("scope") ?? "";
  const statuses = TABS.find((item) => item.id === tab)?.statuses ?? [];
  const path = (cursor: string | null) => {
    const base = listQuery({ q, zoneId, cursor, limit: 50 });
    const status = statuses.map((code) => `status=${encodeURIComponent(code)}`).join("&");
    return `/admin/trips${base}${status ? `${base ? "&" : "?"}${status}` : ""}`;
  };
  const page = useLivePage<Trip>(["live", "trips", tab, q, zoneId], path, can("trips.read"));

  if (!can("trips.read")) return <NoAccess />;

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
          <h2>{tr("Trips")}</h2>
          <p>{tr("Trips from the server, in the zones of your scope. Open a row to see the rider, driver, car, money and timeline.")}</p>
        </div>
      </div>
      <Tabs tabs={TABS} activeId={tab} onChange={(id) => setParam("status", id === "all" ? "" : id)} />
      <SearchBox value={q} onChange={(next) => setParam("q", next)} placeholder={tr("Search by trip, rider or driver id")} />
      {page.isLoading ? <p className="state-line">{tr("Loading.")}</p> : null}
      <ErrorLine error={page.error} onRetry={page.reload} />
      {!page.isLoading && !page.error && page.items.length === 0 ? <p className="state-line">{tr("No trips match.")}</p> : null}
      {page.items.length > 0 ? (
        <div className="table-wrap">
          <table className="live-table live-rows">
            <thead>
              <tr>
                <th>{tr("Trip")}</th>
                <th>{tr("Status")}</th>
                <th>{tr("Rider")}</th>
                <th>{tr("Driver")}</th>
                <th>{tr("Car")}</th>
                <th>{tr("Fare")}</th>
                <th>{tr("Payment")}</th>
                <th>{tr("Created")}</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((trip) => {
                const open = () => navigate(`/trips/${encodeURIComponent(trip.tripId)}`);
                return (
                  <tr key={trip.tripId} data-trip-id={trip.tripId} className="live-row" onClick={open}>
                    <td>
                      <button data-command="admin.server.openRecord" type="button" className="link-action" onClick={(event) => { event.stopPropagation(); open(); }}>
                        {trip.tripId}
                      </button>
                    </td>
                    <td><Status code={trip.status} /></td>
                    <td>{trip.riderId}</td>
                    <td>{trip.driver?.firstName ?? trip.driverId ?? "—"}</td>
                    <td>{carLabel(trip)}</td>
                    <td>{liveMoney(trip.fare)}</td>
                    <td>{trip.paymentStatus ? <Word code={trip.paymentStatus} /> : "—"}</td>
                    <td><DateText value={trip.createdAt} /></td>
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
