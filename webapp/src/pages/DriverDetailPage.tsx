import { logExport } from "../reports/activityLog";
import { NotFoundRecord } from "../ui/NotFoundRecord";
import { ScheduledAccessCard } from "../drivers/ScheduledAccess";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { AlertTriangle, ArrowLeft, Building2, Car, CheckCircle2, Hash, Mail, MapPin, MessageSquare, Phone, Star, StickyNote } from "lucide-react";
import { useAdminApi } from "../api/AdminApiContext";
import { useAudit, useRecords, useSlice } from "../api/hooks";
import { can } from "../auth/permissions";
import { useSession } from "../auth/SessionContext";
import { EarningsChart } from "../dashboard/EarningsChart";
import { change } from "../dashboard/earnings";
import { PeriodPicker } from "../dashboard/PeriodPicker";
import { parsePeriodOr, periodParams, periodWindow } from "../dashboard/period";
import { localDay } from "../dashboard/time";
import { DRIVER_DOCUMENTS, type DocId, type Vehicle } from "../drivers/gate";
import {
  approveRequiredDocuments,
  driverActivationIssue,
  driverOps,
  emptyDriverOpsBook,
  reviewDriverDocument,
  sendDriverMessage,
  setAccountReason,
  setBankReview,
  setDocumentExpiry,
  setDriverCategory,
  setDriverNote,
  vehicleOps,
  type DriverOpsBook,
} from "../drivers/ops";
import { CATEGORIES as CATEGORY_INFO } from "../domain/contract";
import { NOTE_MAX, statusLabel } from "../domain/labels";
import { countHealth, docHealth } from "../fleet/documents";
import { useDocWarnDays } from "../drivers/useDocWarnDays";
import { driverPerformance, performanceWarning } from "../fleet/performance";
import { liveDrivers } from "../dashboard/live";
import { liveTrip } from "../dashboard/liveTrip";
import { demoShift } from "../dashboard/scheduled";
import { TripCard, WaybillDialog } from "../dashboard/TripCard";
import { driverCode } from "../fleet/codes";
import { AccountChip, Avatar, DocSummary, DocumentsTable, Field, HealthPill, MessagesPanel, OnlinePill, Stat, type DocRow, type Presence } from "../fleet/ui";
import { formatMoney, market as marketById, marketOfZone, zoneById } from "../markets/markets";
import { CommandButton } from "../ui/CommandButton";
import { SensitiveValue } from "../ui/SensitiveValue";
import { TabPanel, Tabs } from "../ui/Tabs";

const TABS = ["Overview", "Documents", "Performance", "Earnings", "Trips", "Vehicles", "Messages", "Notes", "Activity"];
const CATEGORIES: Vehicle["category"][] = ["economy", "comfort", "premium", "priority", "xl", "electric", "pet"];
const TEMPLATES = [
  "Your vehicle insurance expires soon. Please upload the new one.",
  "Please upload your document again, the photo is not readable.",
  "Your account is active again. Welcome back!",
];
const REVIEW_TEXT = ["Very friendly and on time.", "Clean car, smooth ride.", "Took a longer route than needed.", "Great music and conversation.", "Helped with my luggage, thank you!", "Arrived a bit late but drove safely."];

export function DriverDetailPage() {
  const { driverId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const { agent } = useSession();
  const drivers = useRecords("drivers", null);
  const vehicles = useRecords("vehicles", null);
  const trips = useRecords("trips", null);
  const payouts = useRecords("payouts", null);
  const fleets = useRecords("fleets", null);
  const tickets = useRecords("tickets", null);
  const incidents = useRecords("incidents", null);
  const reservations = useRecords("reservations", null);
  const riders = useRecords("riders", null);
  const api = useAdminApi();
  const [waybillOpen, setWaybillOpen] = useState(false);
  const audit = useAudit();
  const store = useSlice<DriverOpsBook>("driverOps", emptyDriverOpsBook());
  const warnDaysFor = useDocWarnDays();
  const [tab, setTab] = useState(() => params.get("tab") ?? "overview");
  useEffect(() => {
    const restore = () => setTab(new URLSearchParams(window.location.search).get("tab") ?? "overview");
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  const [accountNote, setAccountNote] = useState("");
  const [privateNote, setPrivateNote] = useState("");
  const [notice, setNotice] = useState("");
  const [now] = useState(() => Date.now());
  const period = parsePeriodOr(params, { kind: "month" });

  const driver = drivers.data?.find((item) => item.id === driverId);
  const country = driver ? marketOfZone(driver.zoneId)?.id ?? "SE" : "SE";
  const market = marketById(country);
  const periodSearch = params.toString();
  const span = useMemo(() => periodWindow(parsePeriodOr(new URLSearchParams(periodSearch), { kind: "month" }), now, market.timeZone, market.locale), [periodSearch, now, market]);

  if (drivers.isLoading || vehicles.isLoading || store.loading) return <p className="state-line">Loading driver.</p>;
  if (!driver) {
    return <NotFoundRecord kind="Driver" id={driverId} list="/drivers" listLabel="drivers" />;
  }
  if (agent?.scope.fleetPartnerId && driver.fleetId !== agent.scope.fleetPartnerId) {
    return (
      <div className="page-heading">
        <div>
          <h2>No access</h2>
          <p>This driver belongs to another fleet partner.</p>
          <Link to="/drivers">Back to drivers</Link>
        </div>
      </div>
    );
  }

  const role = agent?.role ?? "viewer";
  const driverSeed = { id: driver.id, name: driver.name, fleetId: driver.fleetId, status: driver.status, kind: driver.kind };
  const ops = driverOps(store.value, driverSeed);
  const cars = (vehicles.data ?? []).filter((item) => item.driverId === driverId);
  const carRecord = cars[0] ?? null;
  const car = carRecord ? vehicleOps(store.value, carRecord) : null;
  const fleet = (fleets.data ?? []).find((item) => item.id === driver.fleetId);
  const jobs = (trips.data ?? []).filter((item) => item.driverId === driverId);
  const pay = (payouts.data ?? []).filter((item) => item.driverId === driverId);
  const activationIssue = driverActivationIssue(store.value, driverSeed, car);
  const driverAudits = (audit.data ?? []).filter((item) => item.targetId === driver.id).slice(0, 20);
  const money = (minor: number) => formatMoney(minor, country);
  const compact = (minor: number) => formatMoney(minor, country, { compact: true });
  const dateFormat = new Intl.DateTimeFormat(market.locale, { dateStyle: "medium", timeZone: market.timeZone });

  const docIds = DRIVER_DOCUMENTS as readonly DocId[];
  const docRows: DocRow[] = docIds.map((id) => ({ ...ops.documents[id], exempt: Boolean(driver.fleetId && id === "company_registration") }));
  const required = docRows.filter((row) => !row.exempt);
  const warnDays = warnDaysFor(driver.zoneId);
  const health = countHealth(required, now, warnDays);
  const allGreen = health.invalid === 0 && health.review === 0;
  const canReview = can(role, "documents.approve");

  const profile = { id: driver.id, zoneId: driver.zoneId, status: driver.status, stars: ops.ratings.stars, acceptancePct: ops.ratings.acceptancePct, cancellationPct: ops.ratings.cancellationPct };
  const report = driverPerformance(profile, span);
  const perf = report.current;
  const prev = report.previous;
  const sinceMonth = driverPerformance(profile, periodWindow({ kind: "month" }, now, market.timeZone, market.locale), false).current;
  const email = `${driver.name.toLowerCase().normalize("NFD").replace(/[^a-z\s]/g, "").trim().replace(/\s+/g, ".")}@${country === "SE" ? "mail.se" : country === "FR" ? "mail.fr" : "mail.tn"}`;
  const seed = Number(driver.id.replace(/\D/g, "")) || 1;
  const joined = driver.joinedAt ?? new Date(Date.parse("2026-10-05T00:00:00Z") - (60 + (seed * 37) % 800) * 86_400_000).toISOString();
  const live = liveDrivers(drivers.data ?? [], vehicles.data ?? [], trips.data ?? [], incidents.data ?? [], 0).find((row) => row.id === driver.id);
  const presence: Presence = live?.state ?? "offline";
  const code = driverCode(driver);
  const mapTo = live ? `/?country=${country}&focus=${driver.id}` : null;
  const current = live ? liveTrip(live, { trips: trips.data ?? [], reservations: reservations.data ?? [], vehicles: vehicles.data ?? [], fleets: fleets.data ?? [], riders: riders.data ?? [] }, now, demoShift(now, api.demo)) : null;
  const lastOnline = live ? "Online now" : driver.status === "active" ? (seed % 3 === 0 ? "Online now" : `${5 + (seed % 50)} min ago`) : driver.status === "pending" ? "Never" : `${7 + (seed % 9)} days ago`;

  function selectTab(id: string) {
    setTab(id);
    const next = new URLSearchParams(params);
    next.set("tab", id);
    setParams(next);
  }

  const accountAction = (
    command: "admin.driver.activate" | "admin.driver.onHold" | "admin.driver.suspend" | "admin.driver.reactivate",
    status: "active" | "on_hold" | "suspended",
    label: string,
    disabled = false,
    tone = "ghost",
  ) => (
    <CommandButton
      command={command}
      className={`dash-btn ${tone}`}
      type="button"
      targetId={driver.id}
      entityState={driver.status}
      scope={driver.zoneId}
      before={driver.status}
      after={status}
      collection="drivers"
      patch={{ status }}
      expectedSliceRev={store.value.draftRev}
      sliceKey="driverOps"
      value={setAccountReason(store.value, driverSeed, status, accountNote || label, agent?.id ?? "")}
      disabled={disabled}
      title={disabled && status === "active" ? activationIssue ?? undefined : undefined}
      onDone={() => {
        setNotice(`Driver account is now ${statusLabel(status).toLowerCase()}.`);
        setAccountNote("");
      }}
    >
      {label}
    </CommandButton>
  );

  const buildDoc = (row: DocRow, draft: { status: DocRow["status"]; expiresAt: string; note: string }) => {
    const id = row.id as DocId;
    let value = store.value;
    const reviewed = draft.status !== row.status || draft.note.trim() !== row.note;
    if (reviewed) value = reviewDriverDocument(value, driverSeed, id, draft.status, agent?.id ?? "", draft.note);
    if (draft.expiresAt !== row.expiresAt) value = setDocumentExpiry(value, driverSeed, id, draft.expiresAt, agent?.id ?? "");
    return {
      command: reviewed ? "admin.driver.review" : "admin.driver.docExpiry",
      before: `${row.status} ${row.expiresAt || "no date"}`,
      after: `${draft.status} ${draft.expiresAt || "no date"}`,
      value,
      needsReason: reviewed,
    };
  };

  const reviews = (perf.trips ? jobs : []).slice(0, 5).map((trip, index) => ({
    id: trip.id,
    rider: trip.name,
    stars: Math.max(3, Math.min(5, Math.round(ops.ratings.stars + ((seed + index) % 3 === 0 ? -1 : 0.2)))),
    text: REVIEW_TEXT[(seed + index) % REVIEW_TEXT.length],
  }));
  const statement = [["Item", "Amount"], ["Gross fares", money(perf.grossMinor)], ["Movera commission", money(-perf.commissionMinor)], ["Tips", money(perf.tipsMinor)], ["Bonuses", money(perf.bonusMinor)], ["Adjustments", money(perf.adjustmentsMinor)], ["Net earnings", money(perf.netMinor)]]
    .map((line) => line.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");

  return (
    <div className="fd-page fd-profile">
      <Link className="fd-back" to={{ pathname: "/drivers", search: params.get("country") ? `?country=${params.get("country")}` : "" }}><ArrowLeft size={15} aria-hidden="true" /> Back to drivers</Link>

      <section className="fd-hero" aria-label="Driver">
        <div className="fd-hero-main">
          <Avatar name={driver.name} size={76} />
          <div className="fd-hero-title">
            <h2>{driver.name}</h2>
            <div className="fd-chips">
              <AccountChip status={driver.status} />
              <OnlinePill presence={presence} />
              <span className="fd-chip code"><Hash size={13} aria-hidden="true" />{code}</span>
              {fleet ? (
                <Link className="fd-chip fleet" to={`/fleets/${fleet.ownerId ?? ""}`}><Building2 size={13} aria-hidden="true" />{fleet.name}</Link>
              ) : <span className="fd-chip">Independent driver</span>}
              <span className="fd-chip"><Star size={13} aria-hidden="true" />{ops.ratings.stars.toFixed(2)}</span>
              <DocSummary counts={health} total={required.length} />
            </div>
            <p className="fd-sub">{driver.id} · {statusLabel(driver.status)} · {zoneById(driver.zoneId)?.name ?? driver.zoneId}, {market.name}</p>
          </div>
          <div className="fd-hero-actions">
            <label className="fd-reason">
              <span>Reason shown to the driver</span>
              <input value={accountNote} onChange={(event) => setAccountNote(event.target.value)} placeholder="For example: insurance expired" />
            </label>
            <div className="fd-action-row">
              {accountAction("admin.driver.activate", "active", "Activate", Boolean(activationIssue) || driver.status === "active", allGreen && driver.status !== "active" ? "" : "ghost")}
              {accountAction("admin.driver.onHold", "on_hold", "Put on hold", driver.status === "on_hold" || driver.status === "suspended")}
              {accountAction("admin.driver.suspend", "suspended", "Suspend", driver.status !== "active" && driver.status !== "on_hold")}
              {accountAction("admin.driver.reactivate", "active", "Reactivate", Boolean(activationIssue) || (driver.status !== "suspended" && driver.status !== "on_hold"))}
            </div>
            <div className="fd-action-row">
              <CommandButton
                command="admin.driver.call"
                className="dash-btn ghost"
                type="button"
                targetId={driver.id}
                confirmTarget={false}
                scope={driver.zoneId}
                before="idle"
                after="call started"
                onDone={() => { window.location.href = `tel:${driver.phone.replace(/[^+\d]/g, "")}`; }}
              >
                <Phone size={15} aria-hidden="true" />Call
              </CommandButton>
              <button type="button" data-command="admin.ui.dashboardTab" className="dash-btn ghost" onClick={() => selectTab("messages")}><MessageSquare size={15} aria-hidden="true" />Message</button>
              {mapTo ? <Link className="dash-btn ghost" to={mapTo}><MapPin size={15} aria-hidden="true" />See on map</Link> : <span className="dash-btn ghost off" title="The driver is offline"><MapPin size={15} aria-hidden="true" />Offline</span>}
              <button type="button" data-command="admin.ui.dashboardTab" className="dash-btn ghost" onClick={() => selectTab("notes")}><StickyNote size={15} aria-hidden="true" />Note</button>
            </div>
          </div>
        </div>
        <dl className="fd-facts">
          <Field label="Driver code"><Hash size={13} aria-hidden="true" /> {code}</Field>
          <Field label="Phone"><Phone size={13} aria-hidden="true" /> <SensitiveValue value={driver.phone} permission="drivers.viewSensitive" command="admin.driver.revealSensitive" targetId={driver.id} label="Phone" /></Field>
          <Field label="Email"><Mail size={13} aria-hidden="true" /> {email}</Field>
          <Field label="Zone">{zoneById(driver.zoneId)?.name ?? driver.zoneId}</Field>
          <Field label="Vehicle"><Car size={13} aria-hidden="true" /> {carRecord ? `${carRecord.make ?? ""} ${carRecord.model ?? ""} · ${carRecord.plate ?? carRecord.id}` : "No vehicle linked"}</Field>
          <Field label="Payouts go to">{fleet ? `${fleet.name} (fleet)` : `The driver · bank •••• ${ops.bank.last4}`}</Field>
          <Field label="Joined">{dateFormat.format(Date.parse(joined))}</Field>
          <Field label="Last online">{lastOnline}</Field>

        </dl>
      </section>

      {notice || store.message ? <p className="fd-notice" role="status">{notice} {store.message}</p> : null}
      {driver.status === "active" && health.invalid ? (
        <p className="fd-banner red"><AlertTriangle size={16} aria-hidden="true" /> {health.invalid} document{health.invalid > 1 ? "s are" : " is"} missing, wrong or expired. Consider putting the account on hold.</p>
      ) : driver.status !== "active" && allGreen && !activationIssue ? (
        <p className="fd-banner green"><CheckCircle2 size={16} aria-hidden="true" /> All documents are valid. The account can be activated.</p>
      ) : activationIssue && driver.status !== "active" ? (
        <p className="fd-banner amber"><AlertTriangle size={16} aria-hidden="true" /> Activation check: {activationIssue}</p>
      ) : null}
      {ops.accountReason ? <p className="fd-sub">Latest account reason: {ops.accountReason}</p> : null}

      <Tabs tabs={TABS} activeId={tab} onChange={selectTab} />
      <div className="fd-panel">
        <TabPanel id="overview" activeId={tab}>
          <section className="fd-box fd-cats" aria-labelledby="cats-title">
            <div className="fd-section-head">
              <div>
                <h3 id="cats-title">Categories this driver can drive</h3>
                <p>Switch each category on or off. Ride offers only come in for categories that are on{car ? "" : ", and a vehicle must be linked"}.</p>
                <p className="fd-sub">The driver sees only these in the app and can switch some of them off, for example drive Comfort but not Movera. Offers follow the driver's choice. The driver can never switch on a category that is off here.</p>
              </div>
            </div>
            <div className="cat-grid">
              {CATEGORIES.map((category) => {
                const enabled = ops.categories[category];
                const info = CATEGORY_INFO.find((item) => item.id === category);
                const fits = !car ? false : category === "xl" ? car.seats >= 6 : category === "electric" ? car.fuel === "electric" : category === "premium" ? car.year >= 2020 : true;
                return (
                  <CommandButton
                    command="admin.driver.category"
                    key={category}
                    className={enabled ? "cat-toggle on" : "cat-toggle"}
                    type="button"
                    targetId={driver.id}
                    confirmTarget={false}
                    scope={driver.zoneId}
                    before={enabled ? "enabled" : "disabled"}
                    after={enabled ? "disabled" : "enabled"}
                    expectedSliceRev={store.value.draftRev}
                    sliceKey="driverOps"
                    value={setDriverCategory(store.value, driverSeed, category, !enabled, agent?.id ?? "")}
                    aria-label={`${info?.label ?? category}: ${enabled ? "on, turn off" : "off, turn on"}`}
                    onDone={() => setNotice(`${info?.label ?? category} ${enabled ? "turned off" : "turned on"} for ${driver.name}.`)}
                  >
                    <span className="cat-name">{info?.label ?? category}</span>
                    <span className="cat-switch" aria-hidden="true"><i /></span>
                    <small>{info?.seats ?? 4} seats{fits ? "" : " · vehicle does not fit"}</small>
                  </CommandButton>
                );
              })}
            </div>
          </section>
          <ScheduledAccessCard driverId={driver.id} />
          {current ? (
            <div className="fd-current">
              <h3>Current trip</h3>
              <TripCard
                trip={current}
                locale={market.locale}
                timeZone={market.timeZone}
                routeLink={mapTo ?? undefined}
                onWaybill={() => setWaybillOpen(true)}
                tripLink={current.tripId.startsWith("T-") ? `/drivers/${driver.id}?tab=trips` : `/trips/${current.tripId}`}
              />
            </div>
          ) : null}
          {waybillOpen && current ? <WaybillDialog waybill={current.waybill} onClose={() => setWaybillOpen(false)} /> : null}
          <div className="fd-grid-2">
            <section className="fd-box">
              <h3>Documents</h3>
              <div className="fd-health-big">
                <span className="h-valid"><strong>{health.valid}</strong>Valid</span>
                <span className="h-expiring"><strong>{health.expiring}</strong>Expiring</span>
                <span className="h-invalid"><strong>{health.invalid}</strong>Missing or wrong</span>
                <span className="h-review"><strong>{health.review}</strong>Waiting review</span>
              </div>
              <ul className="fd-mini-docs">
                {required.filter((row) => docHealth(row, now, warnDays).health !== "valid").map((row) => {
                  const state = docHealth(row, now, warnDays);
                  return <li key={row.id} className={`h-${state.health}`}><i aria-hidden="true" />{row.id.replaceAll("_", " ")} · {state.label}</li>;
                })}
              </ul>
              <button type="button" data-command="admin.ui.dashboardTab" className="link-action" onClick={() => selectTab("documents")}>Open documents →</button>
            </section>
            <section className="fd-box">
              <h3>This month</h3>
              <div className="fd-stats compact">
                <Stat label="Rating" value={sinceMonth.rating ? sinceMonth.rating.toFixed(2) : "—"} warn={performanceWarning("rating", sinceMonth.rating)} />
                <Stat label="Trips" value={String(sinceMonth.trips)} />
                <Stat label="Acceptance" value={`${ops.ratings.acceptancePct}%`} warn={performanceWarning("acceptancePct", ops.ratings.acceptancePct)} />
                <Stat label="Cancel rate" value={`${ops.ratings.cancellationPct}%`} warn={performanceWarning("cancellationPct", ops.ratings.cancellationPct)} />
                <Stat label="Online" value={`${sinceMonth.onlineHours} h`} />
                <Stat label="Net earnings" value={compact(sinceMonth.netMinor)} />
              </div>
              <button type="button" data-command="admin.ui.dashboardTab" className="link-action" onClick={() => selectTab("performance")}>Open performance →</button>
            </section>
          </div>
        </TabPanel>

        <TabPanel id="documents" activeId={tab}>
          <div className="fd-section-head">
            <div>
              <h3>Documents</h3>
              <p>Set each document on its own and write its expiry date. Documents expiring within 30 days turn orange automatically.</p>
              <div className="fd-legend"><HealthPill health="valid">Valid</HealthPill><HealthPill health="expiring">Expires soon</HealthPill><HealthPill health="invalid">Missing, wrong or expired</HealthPill><HealthPill health="review">Waiting review</HealthPill></div>
            </div>
            <CommandButton
              command="admin.driver.approveAll"
              className="dash-btn ghost"
              type="button"
              targetId={driver.id}
              confirmTarget={false}
              scope={driver.zoneId}
              before="documents"
              after="approved"
              expectedSliceRev={store.value.draftRev}
              sliceKey="driverOps"
              value={approveRequiredDocuments(store.value, driverSeed, agent?.id ?? "")}
              disabled={allGreen || !canReview}
              onDone={() => setNotice("All remaining documents approved.")}
            >
              Approve all remaining
            </CommandButton>
          </div>
          <DocumentsTable
            label="Driver documents"
            rows={docRows}
            nowMs={now}
            warnDays={warnDays}
            canEdit={canReview}
            targetId={driver.id}
            scope={driver.zoneId}
            sliceKey="driverOps"
            expectedSliceRev={store.value.draftRev}
            build={buildDoc}
            onSaved={setNotice}
          />
        </TabPanel>

        <TabPanel id="performance" activeId={tab}>
          <div className="fd-section-head">
            <div><h3>Performance</h3><p>{span.label} · {span.compareLabel}</p></div>
            <PeriodPicker key={`${period.kind}${period.on ?? ""}${period.from ?? ""}`} period={period} today={localDay(now, market.timeZone)} onChange={(next) => setParams(periodParams(next, params))} />
          </div>
          <div className="fd-stats">
            <Stat label="Rating" value={perf.rating ? perf.rating.toFixed(2) : "—"} delta={change(perf.rating, prev.rating)} warn={performanceWarning("rating", perf.rating)} hint={`${perf.ratings} ratings`} />
            <Stat label="Completed trips" value={String(perf.trips)} delta={change(perf.trips, prev.trips)} />
            <Stat label="Acceptance rate" value={`${perf.acceptancePct}%`} warn={performanceWarning("acceptancePct", perf.acceptancePct)} />
            <Stat label="Cancellation rate" value={`${perf.cancellationPct}%`} inverse warn={performanceWarning("cancellationPct", perf.cancellationPct)} />
            <Stat label="Rider no-shows" value={String(perf.noShows)} delta={change(perf.noShows, prev.noShows)} inverse />
            <Stat label="Online hours" value={`${perf.onlineHours} h`} delta={change(perf.onlineHours, prev.onlineHours)} />
            <Stat label="Time on trips" value={`${perf.utilisationPct}%`} />
            <Stat label="Average pickup" value={`${perf.avgPickupMin} min`} delta={change(perf.avgPickupMin, prev.avgPickupMin)} inverse />
            <Stat label="Distance" value={`${new Intl.NumberFormat(market.locale).format(perf.distanceKm)} km`} delta={change(perf.distanceKm, prev.distanceKm)} />
            <Stat label="Complaints" value={String(perf.complaints)} delta={change(perf.complaints, prev.complaints)} inverse />
          </div>
          <section className="fd-box">
            <h3>Latest reviews</h3>
            {reviews.length === 0 ? <p className="state-line">No reviews yet.</p> : (
              <ul className="fd-reviews">
                {reviews.map((review) => (
                  <li key={review.id}>
                    <span className="fd-stars" role="img" aria-label={`${review.stars} stars`}>{[1, 2, 3, 4, 5].map((index) => <Star key={index} size={14} aria-hidden="true" className={index <= review.stars ? "on" : undefined} />)}</span>
                    <p>{review.text}</p>
                    <small>{review.rider} · <Link to={`/trips/${review.id}`}>{review.id}</Link></small>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </TabPanel>

        <TabPanel id="earnings" activeId={tab}>
          <div className="fd-section-head">
            <div><h3>Earnings</h3><p>{span.label} · {fleet ? `paid to ${fleet.name}` : "paid to the driver"}</p></div>
            <div className="fd-head-tools">
              <PeriodPicker key={`e${period.kind}${period.on ?? ""}${period.from ?? ""}`} period={period} today={localDay(now, market.timeZone)} onChange={(next) => setParams(periodParams(next, params))} />
              <a className="dash-btn ghost" onClick={() => logExport(agent?.id, `Statement of ${driver.name}`)} download={`movera-${driver.id}-statement.csv`} href={`data:text/csv;charset=utf-8,${encodeURIComponent(statement)}`}>Download statement</a>
            </div>
          </div>
          <div className="fd-earn">
            <dl className="fd-ledger">
              <div><dt>Gross fares</dt><dd>{money(perf.grossMinor)}</dd></div>
              <div><dt>Movera commission <small>20% placeholder</small></dt><dd>−{money(perf.commissionMinor)}</dd></div>
              <div><dt>Tips</dt><dd>+{money(perf.tipsMinor)}</dd></div>
              <div><dt>Bonuses</dt><dd>+{money(perf.bonusMinor)}</dd></div>
              <div><dt>Adjustments and refunds</dt><dd>{money(perf.adjustmentsMinor)}</dd></div>
              <div className="total"><dt>Net earnings</dt><dd>{money(perf.netMinor)}</dd></div>
              <div><dt>Per trip · per online hour</dt><dd>{perf.trips ? money(perf.netMinor / perf.trips) : "—"} · {perf.onlineHours ? money(perf.netMinor / perf.onlineHours) : "—"}</dd></div>
            </dl>
            <div className="fd-box">
              <h3>Net earnings</h3>
              <EarningsChart points={report.series} format={money} formatAxis={compact} compareLabel={span.compareLabel} />
            </div>
          </div>
          <div className="fd-grid-2">
            <section className="fd-box">
              <h3>Payouts</h3>
              {pay.length === 0 ? <p className="state-line">{fleet ? `Payouts are made to ${fleet.name}.` : "No payout yet."}</p> : (
                <ul className="fd-list">{pay.map((item) => <li key={item.id}><Link to={`/payouts/${item.id}`}>{item.name}</Link><span>{money(item.fareOre ?? 0)}</span><span className={`fd-chip s-${item.status}`}>{statusLabel(item.status)}</span></li>)}</ul>
              )}
            </section>
            <section className="fd-box">
              <h3>Bank account</h3>
              <p>{ops.bank.holder} · •••• {ops.bank.last4} · <strong>{statusLabel(ops.bank.status)}</strong></p>
              {ops.bank.note ? <p className="state-line">Review note: {ops.bank.note}</p> : null}
              <div className="fd-action-row">
                {(["approved", "rejected", "in_review"] as const).map((status) => (
                  <CommandButton
                    command="admin.driver.bankReview"
                    key={status}
                    className="dash-btn small ghost"
                    type="button"
                    targetId={driver.id}
                    confirmTarget={false}
                    scope={driver.zoneId}
                    before={ops.bank.status}
                    after={status}
                    expectedSliceRev={store.value.draftRev}
                    sliceKey="driverOps"
                    value={setBankReview(store.value, driverSeed, status, agent?.id ?? "", accountNote)}
                    disabled={ops.bank.status === status}
                    onDone={() => setNotice(`Bank details marked ${statusLabel(status).toLowerCase()}.`)}
                  >
                    {statusLabel(status)}
                  </CommandButton>
                ))}
              </div>
            </section>
          </div>
        </TabPanel>

        <TabPanel id="trips" activeId={tab}>
          <h3>Trips</h3>
          <p className="fd-sub">{jobs.length} trips in the demo records.</p>
          <ul className="fd-list">
            {jobs.slice(0, 20).map((trip) => (
              <li key={trip.id}>
                <Link to={`/trips/${trip.id}`}>{trip.id}</Link>
                <span>{trip.name}</span>
                <span>{zoneById(trip.zoneId)?.name ?? trip.zoneId}</span>
                <span className={`fd-chip s-${trip.status}`}>{statusLabel(trip.status)}</span>
                <span className="num">{money(trip.fareOre ?? 0)}</span>
              </li>
            ))}
          </ul>
        </TabPanel>

        <TabPanel id="vehicles" activeId={tab}>
          <h3>Vehicles</h3>
          {cars.length === 0 ? <p>No vehicle linked. Activation remains blocked.</p> : cars.map((record) => {
            const vehicle = vehicleOps(store.value, record);
            return (
              <div key={record.id} className="fd-vehicle">
                <Car size={22} aria-hidden="true" />
                <div>
                  <Link to={`/vehicles/${record.id}`}><strong>{record.plate ?? record.id}</strong></Link>
                  <p>{record.make ?? "Vehicle"} {record.model ?? ""} · {vehicle.year} · {vehicle.seats} seats · {vehicle.fuel} · {vehicle.category}</p>
                  <small>Inspection until {vehicle.inspectionExpiresAt} · insurance until {vehicle.insuranceExpiresAt} · {statusLabel(record.status)}</small>
                </div>
              </div>
            );
          })}
          <p className="fd-sub">Which categories this driver may drive is set on the Overview tab.</p>
        </TabPanel>

        <TabPanel id="messages" activeId={tab}>
          <MessagesPanel
            messages={ops.messages ?? []}
            contactName={driver.name}
            command="admin.driver.message"
            targetId={driver.id}
            scope={driver.zoneId}
            sliceKey="driverOps"
            expectedSliceRev={store.value.draftRev}
            build={(text) => sendDriverMessage(store.value, driverSeed, text, agent?.id ?? "", new Date().toISOString())}
            templates={TEMPLATES}
            onSent={() => setNotice(`Message sent to ${driver.name}.`)}
            locale={market.locale}
            timeZone={market.timeZone}
          />
        </TabPanel>

        <TabPanel id="notes" activeId={tab}>
          <h3>Private notes</h3>
          <p className="fd-note">{ops.note || "No private note stored yet."}</p>
          <label className="fd-textarea">
            Private internal note
            <textarea value={privateNote} maxLength={NOTE_MAX} onChange={(event) => setPrivateNote(event.target.value)} />
          </label>
          <CommandButton
            command="admin.driver.note"
            className="dash-btn"
            type="button"
            targetId={driver.id}
            confirmTarget={false}
            scope={driver.zoneId}
            before={ops.note || "empty"}
            after={privateNote || "empty"}
            expectedSliceRev={store.value.draftRev}
            sliceKey="driverOps"
            value={setDriverNote(store.value, driverSeed, privateNote, agent?.id ?? "")}
            disabled={!privateNote.trim()}
            onDone={() => {
              setNotice("Private driver note saved.");
              setPrivateNote("");
            }}
          >
            Save private note
          </CommandButton>
        </TabPanel>

        <TabPanel id="activity" activeId={tab}>
          <div className="fd-grid-2">
            <section className="fd-box">
              <h3>History</h3>
              <ul className="fd-timeline">{ops.activity.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
            </section>
            <section className="fd-box">
              <h3>Audited actions</h3>
              {driverAudits.length === 0 ? <p className="state-line">No audited action on this driver yet.</p> : (
                <ul className="fd-timeline">{driverAudits.map((item) => <li key={item.id}>{item.at.slice(0, 16).replace("T", " ")} · {item.action} · {item.result} · {item.actorId}</li>)}</ul>
              )}
              <h3>Support and safety</h3>
              <ul className="fd-timeline">
                {(tickets.data ?? []).filter((item) => item.name === driver.name).map((ticket) => <li key={ticket.id}><Link to={`/tickets/${ticket.id}`}>{ticket.id}</Link> · {statusLabel(ticket.status)}</li>)}
                {(incidents.data ?? []).filter((item) => item.name === driver.name).map((incident) => <li key={incident.id}><Link to={`/incidents/${incident.id}`}>{incident.id}</Link> · {statusLabel(incident.status)}</li>)}
                <li><Link to="/support">Open support queue</Link> · <Link to="/incidents">Open incident center</Link></li>
              </ul>
            </section>
          </div>
        </TabPanel>
      </div>
    </div>
  );
}
