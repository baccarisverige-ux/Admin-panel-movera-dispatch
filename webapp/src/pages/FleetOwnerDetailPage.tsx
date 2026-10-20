import { useEffect, useMemo, useState } from "react";
import { NotFoundRecord } from "../ui/NotFoundRecord";
import { Link, useParams, useSearchParams } from "react-router";
import { AlertTriangle, ArrowLeft, Building2, Car, Hash, Mail, MessageSquare, Phone, StickyNote, Users } from "lucide-react";
import { useAudit, useRecords, useSlice } from "../api/hooks";
import { can } from "../auth/permissions";
import { useSession } from "../auth/SessionContext";
import { PeriodPicker } from "../dashboard/PeriodPicker";
import { change } from "../dashboard/earnings";
import { parsePeriodOr, periodParams, periodWindow } from "../dashboard/period";
import { localDay } from "../dashboard/time";
import { DRIVER_DOCUMENTS } from "../drivers/gate";
import { driverOps, emptyDriverOpsBook, type DriverOpsBook } from "../drivers/ops";
import { statusLabel } from "../domain/labels";
import { countHealth } from "../fleet/documents";
import { useDocWarnDays } from "../drivers/useDocWarnDays";
import {
  emptyOwnerOpsBook,
  OWNER_DOCUMENTS,
  ownerOps,
  reviewOwnerDocument,
  sendOwnerMessage,
  setOwnerAccount,
  setOwnerDocumentExpiry,
  setOwnerNote,
  type OwnerDocId,
  type OwnerOpsBook,
} from "../fleet/ownerOps";
import { combine, driverPerformance, performanceWarning } from "../fleet/performance";
import { liveDrivers } from "../dashboard/live";
import { driverCode, ownerCode } from "../fleet/codes";
import { AccountChip, Avatar, ContactActions, DocSummary, DocumentsTable, Field, MessagesPanel, OnlinePill, Stat, type DocRow, type Presence } from "../fleet/ui";
import { formatMoney, market as marketById, marketOfZone, zoneById } from "../markets/markets";
import { CommandButton } from "../ui/CommandButton";
import { TabPanel, Tabs } from "../ui/Tabs";
import { uiLocale } from "../i18n";

const TABS = ["Overview", "Fleets", "Documents", "Performance", "Earnings", "Messages", "Notes", "Activity"];
const TEMPLATES = [
  "Your fleet insurance expires soon. Please upload the renewed policy.",
  "Please send the operator licence again, the number does not match.",
  "Two of your drivers have documents expiring this month.",
];

export function FleetOwnerDetailPage() {
  const { ownerId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const { agent } = useSession();
  const owners = useRecords("fleetOwners", null);
  const fleets = useRecords("fleets", null);
  const drivers = useRecords("drivers", null);
  const vehicles = useRecords("vehicles", null);
  const trips = useRecords("trips", null);
  const incidents = useRecords("incidents", null);
  const audit = useAudit();
  const store = useSlice<OwnerOpsBook>("fleetOwnerOps", emptyOwnerOpsBook());
  const driverStore = useSlice<DriverOpsBook>("driverOps", emptyDriverOpsBook());
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
  const owner = owners.data?.find((item) => item.id === ownerId);
  const country = owner ? marketOfZone(owner.zoneId)?.id ?? "SE" : "SE";
  const market = marketById(country);
  const periodSearch = params.toString();
  const span = useMemo(() => periodWindow(parsePeriodOr(new URLSearchParams(periodSearch), { kind: "month" }), now, market.timeZone, uiLocale()), [periodSearch, now, market]);
  const period = parsePeriodOr(params, { kind: "month" });

  const ownFleets = useMemo(() => (fleets.data ?? []).filter((fleet) => fleet.ownerId === ownerId), [fleets.data, ownerId]);
  const crew = useMemo(() => {
    const ids = new Set(ownFleets.map((fleet) => fleet.id));
    return (drivers.data ?? []).filter((driver) => driver.fleetId && ids.has(driver.fleetId));
  }, [drivers.data, ownFleets]);
  const presence = useMemo(() => new Map(liveDrivers(drivers.data ?? [], vehicles.data ?? [], trips.data ?? [], incidents.data ?? [], 0).map((row) => [row.id, row.state as Presence])), [drivers.data, vehicles.data, trips.data, incidents.data]);
  const crewStats = useMemo(() => crew.map((driver) => {
    const ops = driverOps(driverStore.value, { id: driver.id, name: driver.name, fleetId: driver.fleetId, status: driver.status, kind: driver.kind });
    const docs = DRIVER_DOCUMENTS.filter((id) => id !== "company_registration").map((id) => ops.documents[id]);
    const report = driverPerformance({ id: driver.id, zoneId: driver.zoneId, status: driver.status, stars: ops.ratings.stars, acceptancePct: ops.ratings.acceptancePct, cancellationPct: ops.ratings.cancellationPct }, span, false);
    return { driver, counts: countHealth(docs, now, warnDaysFor(driver.zoneId)), total: docs.length, perf: report.current, prev: report.previous };
  }), [crew, driverStore.value, span, now, warnDaysFor]);

  if (owners.isLoading || store.loading) return <p className="state-line">Loading fleet owner.</p>;
  if (!owner) {
    return <NotFoundRecord kind="Fleet owner" id={ownerId} list="/fleets" listLabel="fleet owners" />;
  }

  const role = agent?.role ?? "viewer";
  const seed = { id: owner.id, name: owner.name, status: owner.status, kind: owner.kind };
  const ops = ownerOps(store.value, seed);
  const docRows: DocRow[] = OWNER_DOCUMENTS.map((id) => ops.documents[id]);
  const warnDays = warnDaysFor(owner.zoneId);
  const health = countHealth(docRows, now, warnDays);
  const money = (minor: number) => formatMoney(minor, country);
  const compact = (minor: number) => formatMoney(minor, country, { compact: true });
  const total = combine(crewStats.map((row) => row.perf));
  const before = combine(crewStats.map((row) => row.prev));
  const ownerAudits = (audit.data ?? []).filter((item) => item.targetId === owner.id).slice(0, 20);
  const carsOf = (fleetId: string) => (vehicles.data ?? []).filter((car) => car.fleetId === fleetId);
  const ranking = [...crewStats].sort((a, b) => b.perf.netMinor - a.perf.netMinor);
  const maxNet = Math.max(1, ...ranking.map((row) => row.perf.netMinor));
  const joined = owner.joinedAt ? new Intl.DateTimeFormat(market.locale, { dateStyle: "medium", timeZone: market.timeZone }).format(Date.parse(owner.joinedAt)) : "—";

  function selectTab(id: string) {
    setTab(id);
    const next = new URLSearchParams(params);
    next.set("tab", id);
    setParams(next);
  }

  const accountAction = (command: "admin.fleetOwner.activate" | "admin.fleetOwner.onHold", status: "active" | "on_hold", label: string, disabled: boolean, tone = "ghost") => (
    <CommandButton
      command={command}
      className={`dash-btn ${tone}`}
      type="button"
      targetId={owner.id}
      entityState={owner.status}
      scope={owner.zoneId}
      before={owner.status}
      after={status}
      collection="fleetOwners"
      patch={{ status }}
      expectedSliceRev={store.value.draftRev}
      sliceKey="fleetOwnerOps"
      value={setOwnerAccount(store.value, seed, status, accountNote || label, agent?.id ?? "")}
      disabled={disabled}
      onDone={() => {
        setNotice(`Fleet owner account is now ${statusLabel(status).toLowerCase()}.`);
        setAccountNote("");
      }}
    >
      {label}
    </CommandButton>
  );

  const buildDoc = (row: DocRow, draft: { status: DocRow["status"]; expiresAt: string; note: string }) => {
    const id = row.id as OwnerDocId;
    let value = store.value;
    const reviewed = draft.status !== row.status || draft.note.trim() !== row.note;
    if (reviewed) value = reviewOwnerDocument(value, seed, id, draft.status, agent?.id ?? "", draft.note);
    if (draft.expiresAt !== row.expiresAt) value = setOwnerDocumentExpiry(value, seed, id, draft.expiresAt, agent?.id ?? "");
    return {
      command: reviewed ? "admin.fleetOwner.review" : "admin.fleetOwner.docExpiry",
      before: `${row.status} ${row.expiresAt || "no date"}`,
      after: `${draft.status} ${draft.expiresAt || "no date"}`,
      value,
      needsReason: reviewed,
    };
  };

  return (
    <div className="fd-page fd-profile">
      <Link className="fd-back" to={{ pathname: "/fleets", search: params.get("country") ? `?country=${params.get("country")}` : "" }}><ArrowLeft size={15} aria-hidden="true" /> Back to fleet owners</Link>

      <section className="fd-hero" aria-label="Fleet owner">
        <div className="fd-hero-main">
          <Avatar name={owner.name} size={76} />
          <div className="fd-hero-title">
            <h2>{owner.name}</h2>
            <div className="fd-chips">
              <AccountChip status={owner.status} />
              <span className="fd-chip code"><Hash size={13} aria-hidden="true" />{ownerCode(owner)}</span>
              <span className="fd-chip fleet"><Building2 size={13} aria-hidden="true" />{owner.company}</span>
              <span className="fd-chip"><Users size={13} aria-hidden="true" />{crew.length} drivers</span>
              <DocSummary counts={health} total={docRows.length} />
            </div>
            <p className="fd-sub">{owner.id} · Fleet owner · {market.name}</p>
          </div>
          <div className="fd-hero-actions">
            <label className="fd-reason">
              <span>Reason shown to the owner</span>
              <input value={accountNote} onChange={(event) => setAccountNote(event.target.value)} placeholder="For example: fleet insurance expired" />
            </label>
            <div className="fd-action-row">
              {accountAction("admin.fleetOwner.activate", "active", "Activate", owner.status === "active" || health.invalid > 0, health.invalid === 0 && owner.status !== "active" ? "" : "ghost")}
              {accountAction("admin.fleetOwner.onHold", "on_hold", "Put on hold", owner.status === "on_hold")}
              <CommandButton
                command="admin.fleetOwner.call"
                className="dash-btn ghost"
                type="button"
                targetId={owner.id}
                confirmTarget={false}
                scope={owner.zoneId}
                before="idle"
                after="call started"
                onDone={() => { window.location.href = `tel:${owner.phone.replace(/[^+\d]/g, "")}`; }}
              >
                <Phone size={15} aria-hidden="true" />Call
              </CommandButton>
              <button type="button" data-command="admin.ui.dashboardTab" className="dash-btn ghost" onClick={() => selectTab("messages")}><MessageSquare size={15} aria-hidden="true" />Message</button>
              <button type="button" data-command="admin.ui.dashboardTab" className="dash-btn ghost" onClick={() => selectTab("notes")}><StickyNote size={15} aria-hidden="true" />Note</button>
            </div>
          </div>
        </div>
        <dl className="fd-facts">
          <Field label="Phone"><Phone size={13} aria-hidden="true" /> {can(role, "drivers.viewSensitive") ? owner.phone : `•••• ${owner.phone.slice(-4)}`}</Field>
          <Field label="Email"><Mail size={13} aria-hidden="true" /> {owner.email}</Field>
          <Field label="Company number"><Hash size={13} aria-hidden="true" /> {owner.orgNumber}</Field>
          <Field label="Main zone">{zoneById(owner.zoneId)?.name ?? owner.zoneId}</Field>
          <Field label="Fleets">{ownFleets.map((fleet) => fleet.name).join(", ") || "No fleet yet"}</Field>
          <Field label="Vehicles"><Car size={13} aria-hidden="true" /> {ownFleets.reduce((sum, fleet) => sum + carsOf(fleet.id).length, 0)}</Field>
          <Field label="Joined">{joined}</Field>
          <Field label="Payouts go to">The company account</Field>
        </dl>
      </section>

      {notice || store.message ? <p className="fd-notice" role="status">{notice} {store.message}</p> : null}
      {health.invalid ? <p className="fd-banner red"><AlertTriangle size={16} aria-hidden="true" /> {health.invalid} company document{health.invalid > 1 ? "s are" : " is"} missing, wrong or expired.</p> : null}
      {ops.accountReason ? <p className="fd-sub">Latest account reason: {ops.accountReason}</p> : null}

      <Tabs tabs={TABS} activeId={tab} onChange={selectTab} />
      <div className="fd-panel">
        <TabPanel id="overview" activeId={tab}>
          <div className="fd-stats">
            <Stat label="Fleets" value={String(ownFleets.length)} />
            <Stat label="Drivers" value={String(crew.length)} hint={`${crew.filter((driver) => driver.status === "active").length} active · ${crew.filter((driver) => driver.status === "on_hold").length} on hold`} />
            <Stat label="Drivers with document problems" value={String(crewStats.filter((row) => row.counts.invalid).length)} warn={crewStats.some((row) => row.counts.invalid) ? "red" : null} />
            <Stat label={`Trips · ${span.label}`} value={String(total.trips)} delta={change(total.trips, before.trips)} />
            <Stat label="Average rating" value={total.rating ? total.rating.toFixed(2) : "—"} warn={performanceWarning("rating", total.rating)} />
            <Stat label={`Net earnings · ${span.label}`} value={compact(total.netMinor)} delta={change(total.netMinor, before.netMinor)} />
          </div>
          <button type="button" data-command="admin.ui.dashboardTab" className="link-action" onClick={() => selectTab("fleets")}>See every fleet and its drivers →</button>
        </TabPanel>

        <TabPanel id="fleets" activeId={tab}>
          {ownFleets.length === 0 ? <p className="state-line">This owner has no fleet yet.</p> : ownFleets.map((fleet) => {
            const members = crewStats.filter((row) => row.driver.fleetId === fleet.id);
            return (
              <section key={fleet.id} className="fd-fleet" aria-label={fleet.name}>
                <div className="fd-fleet-head">
                  <div>
                    <h3><Building2 size={16} aria-hidden="true" /> {fleet.name}</h3>
                    <p className="fd-sub">{fleet.id} · {zoneById(fleet.zoneId)?.name ?? fleet.zoneId} · {members.length} drivers · {carsOf(fleet.id).length} vehicles</p>
                  </div>
                  <div className="fd-chips">
                    <span className="fd-chip s-active">{members.filter((row) => row.driver.status === "active").length} active</span>
                    <span className="fd-chip s-on_hold">{members.filter((row) => row.driver.status === "on_hold").length} on hold</span>
                    <span className="fd-chip">{members.filter((row) => row.driver.status === "pending").length} pending</span>
                  </div>
                </div>
                <ul className="fd-crew" aria-label={`Drivers in ${fleet.name}`}>
                  <li className="fd-crew-head" aria-hidden="true"><span>Driver</span><span>Account</span><span>Online</span><span>Documents</span><span>Rating</span><span>Trips</span><span>Earnings</span><span>Contact</span></li>
                  {members.length === 0 ? <li className="state-line">No drivers in this fleet yet.</li> : members.map(({ driver, counts, total: docTotal, perf }) => (
                    <li key={driver.id}>
                      <Link to={`/drivers/${driver.id}`} className="fd-crew-name"><Avatar name={driver.name} size={30} /><span><strong>{driver.name}</strong><small>{driverCode(driver)}</small></span></Link>
                      <span><AccountChip status={driver.status} /></span>
                      <span><OnlinePill presence={presence.get(driver.id) ?? "offline"} /></span>
                      <span><DocSummary counts={counts} total={docTotal} /></span>
                      <span>{perf.rating ? perf.rating.toFixed(2) : "—"}</span>
                      <span>{perf.trips}</span>
                      <span className="num">{perf.netMinor ? compact(perf.netMinor) : "—"}</span>
                      <ContactActions kind="driver" compact id={driver.id} name={driver.name} phone={driver.phone} zoneId={driver.zoneId} messageTo={`/drivers/${driver.id}?tab=messages`} mapTo={presence.has(driver.id) ? `/?country=${country}&focus=${driver.id}` : null} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </TabPanel>

        <TabPanel id="documents" activeId={tab}>
          <div className="fd-section-head">
            <div>
              <h3>Company documents</h3>
              <p>Fleet owners provide company documents. Some are the same as drivers (registration, tax, bank), others are only for owners. Set each one on its own.</p>
            </div>
          </div>
          <DocumentsTable
            label="Fleet owner documents"
            rows={docRows}
            nowMs={now}
            warnDays={warnDays}
            canEdit={can(role, "documents.approve")}
            targetId={owner.id}
            scope={owner.zoneId}
            sliceKey="fleetOwnerOps"
            expectedSliceRev={store.value.draftRev}
            build={buildDoc}
            onSaved={setNotice}
          />
        </TabPanel>

        <TabPanel id="performance" activeId={tab}>
          <div className="fd-section-head">
            <div><h3>Fleet performance</h3><p>All drivers in this owner's fleets · {span.label} · {span.compareLabel}</p></div>
            <PeriodPicker key={`${period.kind}${period.on ?? ""}${period.from ?? ""}`} period={period} today={localDay(now, market.timeZone)} onChange={(next) => setParams(periodParams(next, params))} />
          </div>
          <div className="fd-stats">
            <Stat label="Completed trips" value={String(total.trips)} delta={change(total.trips, before.trips)} />
            <Stat label="Average rating" value={total.rating ? total.rating.toFixed(2) : "—"} warn={performanceWarning("rating", total.rating)} />
            <Stat label="Acceptance rate" value={`${total.acceptancePct}%`} warn={performanceWarning("acceptancePct", total.acceptancePct)} />
            <Stat label="Cancellation rate" value={`${total.cancellationPct}%`} inverse warn={performanceWarning("cancellationPct", total.cancellationPct)} />
            <Stat label="Online hours" value={`${total.onlineHours} h`} delta={change(total.onlineHours, before.onlineHours)} />
            <Stat label="Rider no-shows" value={String(total.noShows)} inverse delta={change(total.noShows, before.noShows)} />
            <Stat label="Complaints" value={String(total.complaints)} inverse delta={change(total.complaints, before.complaints)} />
            <Stat label="Distance" value={`${new Intl.NumberFormat(market.locale).format(total.distanceKm)} km`} />
          </div>
        </TabPanel>

        <TabPanel id="earnings" activeId={tab}>
          <div className="fd-section-head">
            <div><h3>Fleet earnings</h3><p>{span.label} · paid to the company account</p></div>
            <PeriodPicker key={`e${period.kind}${period.on ?? ""}${period.from ?? ""}`} period={period} today={localDay(now, market.timeZone)} onChange={(next) => setParams(periodParams(next, params))} />
          </div>
          <div className="fd-earn">
            <dl className="fd-ledger">
              <div><dt>Gross fares</dt><dd>{money(total.grossMinor)}</dd></div>
              <div><dt>Movera commission <small>20% placeholder</small></dt><dd>−{money(total.commissionMinor)}</dd></div>
              <div><dt>Tips</dt><dd>+{money(total.tipsMinor)}</dd></div>
              <div><dt>Bonuses</dt><dd>+{money(total.bonusMinor)}</dd></div>
              <div><dt>Adjustments and refunds</dt><dd>{money(total.adjustmentsMinor)}</dd></div>
              <div className="total"><dt>Net to the fleet</dt><dd>{money(total.netMinor)}</dd></div>
            </dl>
            <section className="fd-box">
              <h3>Earnings by driver</h3>
              {ranking.length === 0 ? <p className="state-line">No drivers yet.</p> : (
                <ul className="share-bars">
                  {ranking.map(({ driver, perf }) => (
                    <li key={driver.id}>
                      <div className="share-head"><span><Link to={`/drivers/${driver.id}`}>{driver.name}</Link></span><strong>{compact(perf.netMinor)}</strong><small>{perf.trips} trips</small></div>
                      <div className="share-track"><i style={{ width: `${(perf.netMinor / maxNet) * 100}%` }} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </TabPanel>

        <TabPanel id="messages" activeId={tab}>
          <MessagesPanel
            messages={ops.messages}
            contactName={owner.name}
            command="admin.fleetOwner.message"
            targetId={owner.id}
            scope={owner.zoneId}
            sliceKey="fleetOwnerOps"
            expectedSliceRev={store.value.draftRev}
            build={(text) => sendOwnerMessage(store.value, seed, text, agent?.id ?? "", new Date().toISOString())}
            templates={TEMPLATES}
            onSent={() => setNotice(`Message sent to ${owner.name}.`)}
            locale={market.locale}
            timeZone={market.timeZone}
          />
        </TabPanel>

        <TabPanel id="notes" activeId={tab}>
          <h3>Private notes</h3>
          <p className="fd-note">{ops.note || "No private note stored yet."}</p>
          <label className="fd-textarea">
            Private internal note
            <textarea value={privateNote} onChange={(event) => setPrivateNote(event.target.value)} />
          </label>
          <CommandButton
            command="admin.fleetOwner.note"
            className="dash-btn"
            type="button"
            targetId={owner.id}
            confirmTarget={false}
            scope={owner.zoneId}
            before={ops.note || "empty"}
            after={privateNote || "empty"}
            expectedSliceRev={store.value.draftRev}
            sliceKey="fleetOwnerOps"
            value={setOwnerNote(store.value, seed, privateNote, agent?.id ?? "")}
            disabled={!privateNote.trim()}
            onDone={() => {
              setNotice("Private fleet owner note saved.");
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
              {ownerAudits.length === 0 ? <p className="state-line">No audited action on this owner yet.</p> : (
                <ul className="fd-timeline">{ownerAudits.map((item) => <li key={item.id}>{item.at.slice(0, 16).replace("T", " ")} · {item.action} · {item.result} · {item.actorId}</li>)}</ul>
              )}
            </section>
          </div>
        </TabPanel>
      </div>
    </div>
  );
}
