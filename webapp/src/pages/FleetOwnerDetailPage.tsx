import { activationMissing, groupMissing } from "../live/activation";
import { isLiveData } from "../live/realData";
import { NotConnected } from "../live/NotConnected";
import { LiveDriverDocuments } from "../live/LiveDriverDocuments";
import { useEffect, useMemo, useState } from "react";
import { LiveFleetPanel } from "../live/LiveFleetPanel";
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
import { liveAverageRating, liveCompanyDocs, liveDriverDocs, liveFleetCode } from "../fleet/liveOwner";
import { COUNTRY_LABEL } from "../i18n/countries";
import { AccountChip, Avatar, ContactActions, DocSummary, DocumentsTable, Field, MessagesPanel, OnlinePill, Stat, type DocRow, type Presence } from "../fleet/ui";
import { formatMoney, market as marketById, marketOfZone, zoneById } from "../markets/markets";
import { CommandButton } from "../ui/CommandButton";
import { TabPanel, Tabs } from "../ui/Tabs";
import { uiLocale, tr, trn, trx } from "../i18n";

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
  const live = isLiveData();
  const crewStats = useMemo(() => crew.map((driver) => {
    if (live) {
      // Live (owner G2 R3): the server's documents and rating only; trips and earnings are not sent, so they read "—".
      const docs = liveDriverDocs(driver.liveAccount, now, warnDaysFor(driver.zoneId)) ?? { counts: { valid: 0, expiring: 0, invalid: 0, review: 0 }, total: 0 };
      const zero = combine([]);
      return { driver, counts: docs.counts, total: docs.total, perf: zero, prev: zero, rating: driver.liveDriver?.rating ?? null };
    }
    const ops = driverOps(driverStore.value, { id: driver.id, name: driver.name, fleetId: driver.fleetId, status: driver.status, kind: driver.kind });
    const docs = DRIVER_DOCUMENTS.filter((id) => id !== "company_registration").map((id) => ops.documents[id]);
    const report = driverPerformance({ id: driver.id, zoneId: driver.zoneId, status: driver.status, stars: ops.ratings.stars, acceptancePct: ops.ratings.acceptancePct, cancellationPct: ops.ratings.cancellationPct }, span, false);
    return { driver, counts: countHealth(docs, now, warnDaysFor(driver.zoneId)), total: docs.length, perf: report.current, prev: report.previous, rating: report.current.rating || null };
  }), [crew, driverStore.value, span, now, warnDaysFor, live]);

  if (owners.isLoading || store.loading) return <p className="state-line">{tr("Loading fleet owner.")}</p>;
  if (!owner) {
    return <NotFoundRecord kind="Fleet owner" id={ownerId} list="/fleets" listLabel="fleet owners" />;
  }

  const role = agent?.role ?? "viewer";
  const seed = { id: owner.id, name: owner.name, status: owner.status, kind: owner.kind };
  const ops = ownerOps(store.value, seed);
  const docRows: DocRow[] = OWNER_DOCUMENTS.map((id) => ops.documents[id]);
  const warnDays = warnDaysFor(owner.zoneId);
  // Live: the company is approved only when its documents are (the server's facts, not the demo's papers).
  const ownerFacts = (drivers.data ?? []).find((item) => item.id === owner.id)?.liveAccount;
  // Live (owner G2 R3): the country's real company documents ("1/4"), never the demo's seven.
  const liveDocs = live ? liveCompanyDocs(ownerFacts, country, now, warnDays) : null;
  const health = liveDocs ? liveDocs.counts : countHealth(docRows, now, warnDays);
  const docTotal = liveDocs ? liveDocs.total : docRows.length;
  const crewRating = live ? liveAverageRating(crew) : null;
  const liveCompanyMissing = ownerFacts ? groupMissing(activationMissing(ownerFacts)).fleet.length > 0 : true;
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
        setNotice(tr("Fleet owner account is now {0}.", [status === "on_hold" ? "on hold" : statusLabel(status).toLowerCase()]));
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
      <Link className="fd-back" to={{ pathname: "/fleets", search: params.get("country") ? `?country=${params.get("country")}` : "" }}><ArrowLeft size={15} aria-hidden="true" />{" "}{tr("Back to fleet owners")}</Link>

      <section className="fd-hero" aria-label={tr("Fleet owner")}>
        <div className="fd-hero-main">
          <Avatar name={owner.name} size={76} />
          <div className="fd-hero-title">
            <h2>{owner.name}</h2>
            <div className="fd-chips">
              <AccountChip status={owner.status} />
              <span className="fd-chip code"><Hash size={13} aria-hidden="true" />{live ? liveFleetCode(owner) : ownerCode(owner)}</span>
              <span className="fd-chip fleet"><Building2 size={13} aria-hidden="true" />{owner.company}</span>
              <span className="fd-chip"><Users size={13} aria-hidden="true" />{trn("{0} drivers", crew.length)}</span>
              <DocSummary counts={health} total={docTotal} />
            </div>
            <p className="fd-sub">{trn("{0} · Fleet owner · {1}", owner.id, trx(COUNTRY_LABEL[country]))}</p>
          </div>
          <div className="fd-hero-actions">
            <label className="fd-reason">
              <span>{tr("Reason shown to the owner")}</span>
              <input value={accountNote} onChange={(event) => setAccountNote(event.target.value)} placeholder={tr("For example: fleet insurance expired")} />
            </label>
            <div className="fd-action-row">
              {accountAction("admin.fleetOwner.activate", "active", tr("Activate"), owner.status === "active" || (live ? liveCompanyMissing : health.invalid > 0), health.invalid === 0 && owner.status !== "active" ? "" : "ghost")}
              {accountAction("admin.fleetOwner.onHold", "on_hold", tr("Put on hold"), owner.status === "on_hold")}
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
                <Phone size={15} aria-hidden="true" />{tr("Call")}</CommandButton>
              <button type="button" data-command="admin.ui.dashboardTab" className="dash-btn ghost" onClick={() => selectTab("messages")}><MessageSquare size={15} aria-hidden="true" />{tr("Message")}</button>
              <button type="button" data-command="admin.ui.dashboardTab" className="dash-btn ghost" onClick={() => selectTab("notes")}><StickyNote size={15} aria-hidden="true" />{tr("Note")}</button>
            </div>
          </div>
        </div>
        <dl className="fd-facts">
          <Field label={tr("Phone")}><Phone size={13} aria-hidden="true" /> {can(role, "drivers.viewSensitive") ? owner.phone : `•••• ${owner.phone.slice(-4)}`}</Field>
          <Field label={tr("Email")}><Mail size={13} aria-hidden="true" /> {owner.email}</Field>
          <Field label={tr("Company number")}><Hash size={13} aria-hidden="true" /> {owner.orgNumber}</Field>
          <Field label={tr("Main zone")}>{zoneById(owner.zoneId)?.name ?? owner.zoneId}</Field>
          <Field label={tr("Fleets")}>{ownFleets.map((fleet) => fleet.name).join(", ") || tr("No fleet yet")}</Field>
          <Field label={tr("Vehicles")}><Car size={13} aria-hidden="true" /> {ownFleets.reduce((sum, fleet) => sum + carsOf(fleet.id).length, 0)}</Field>
          <Field label={tr("Joined")}>{joined}</Field>
          <Field label={tr("Payouts go to")}>{tr("The company account")}</Field>
        </dl>
      </section>

      {notice || store.message ? <p className="fd-notice" role="status">{notice} {store.message}</p> : null}
      {health.invalid ? <p className="fd-banner red"><AlertTriangle size={16} aria-hidden="true" />{" "}{trn("{0} company document{1} missing, wrong or expired.", health.invalid, health.invalid > 1 ? tr("s are") : tr(" is"))}</p> : null}
      {ops.accountReason ? <p className="fd-sub">{trn("Latest account reason: {0}", ops.accountReason)}</p> : null}

      <Tabs tabs={TABS} activeId={tab} onChange={selectTab} />
      <div className="fd-panel">
        <TabPanel id="overview" activeId={tab}>
          <div className="fd-stats">
            <Stat label={tr("Fleets")} value={String(ownFleets.length)} />
            <Stat label={tr("Drivers")} value={String(crew.length)} hint={tr("{0} active · {1} on hold", [crew.filter((driver) => driver.status === "active").length, crew.filter((driver) => driver.status === "on_hold").length])} />
            <Stat label={tr("Drivers with document problems")} value={String(crewStats.filter((row) => row.counts.invalid).length)} warn={crewStats.some((row) => row.counts.invalid) ? "red" : null} />
            {live ? <>
              {/* Live (owner G2 R3): the server sends no fleet trips or income yet: "—", never a seeded number. */}
              <Stat label={tr("Trips · {0}", [span.label])} value="—" />
              <Stat label={tr("Average rating")} value={crewRating === null ? "—" : crewRating.toFixed(2)} warn={crewRating === null ? null : performanceWarning("rating", crewRating)} />
              <Stat label={tr("Net earnings · {0}", [span.label])} value="—" />
            </> : <>
            <Stat label={tr("Trips · {0}", [span.label])} value={String(total.trips)} delta={change(total.trips, before.trips)} />
            <Stat label={tr("Average rating")} value={total.rating ? total.rating.toFixed(2) : "—"} warn={performanceWarning("rating", total.rating)} />
            <Stat label={tr("Net earnings · {0}", [span.label])} value={compact(total.netMinor)} delta={change(total.netMinor, before.netMinor)} />
            </>}
          </div>
          <button type="button" data-command="admin.ui.dashboardTab" className="link-action" onClick={() => selectTab("fleets")}>{tr("See every fleet and its drivers →")}</button>
        </TabPanel>

        <TabPanel id="fleets" activeId={tab}>
          <LiveFleetPanel ownerId={owner.id} />
          {ownFleets.length === 0 ? <p className="state-line">{tr("This owner has no fleet yet.")}</p> : ownFleets.map((fleet) => {
            const members = crewStats.filter((row) => row.driver.fleetId === fleet.id);
            return (
              <section key={fleet.id} className="fd-fleet" aria-label={fleet.name}>
                <div className="fd-fleet-head">
                  <div>
                    <h3><Building2 size={16} aria-hidden="true" /> {fleet.name}</h3>
                    <p className="fd-sub">{trn("{0} · {1} · {2} drivers · {3} vehicles", fleet.id, zoneById(fleet.zoneId)?.name ?? fleet.zoneId, members.length, carsOf(fleet.id).length)}</p>
                  </div>
                  <div className="fd-chips">
                    <span className="fd-chip s-active">{trn("{0} active", members.filter((row) => row.driver.status === "active").length)}</span>
                    <span className="fd-chip s-on_hold">{trn("{0} on hold", members.filter((row) => row.driver.status === "on_hold").length)}</span>
                    <span className="fd-chip">{trn("{0} pending", members.filter((row) => row.driver.status === "pending").length)}</span>
                  </div>
                </div>
                <ul className="fd-crew" aria-label={tr("Drivers in {0}", [fleet.name])}>
                  <li className="fd-crew-head" aria-hidden="true"><span>{tr("Driver")}</span><span>{tr("Account")}</span><span>{tr("Online")}</span><span>{tr("Documents")}</span><span>{tr("Rating")}</span><span>{tr("Trips")}</span><span>{tr("Earnings")}</span><span>{tr("Contact")}</span></li>
                  {members.length === 0 ? <li className="state-line">{tr("No drivers in this fleet yet.")}</li> : members.map(({ driver, counts, total: crewDocs, perf, rating }) => (
                    <li key={driver.id}>
                      <Link to={`/drivers/${driver.id}`} className="fd-crew-name"><Avatar name={driver.name} size={30} /><span><strong>{driver.name}</strong><small>{live ? driver.id : driverCode(driver)}</small></span></Link>
                      <span><AccountChip status={driver.status} family="driverAccountStatus" /></span>
                      <span><OnlinePill presence={presence.get(driver.id) ?? "offline"} /></span>
                      <span><DocSummary counts={counts} total={crewDocs} /></span>
                      <span>{rating ? rating.toFixed(2) : "—"}</span>
                      <span>{live ? "—" : perf.trips}</span>
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
              <h3>{tr("Company documents")}</h3>
              <p>{tr("Fleet owners provide company documents. Some are the same as drivers (registration, tax, bank), others are only for owners. Set each one on its own.")}</p>
            </div>
          </div>
          {isLiveData() ? <LiveDriverDocuments driverId={owner.id} /> : <DocumentsTable
            label={tr("Fleet owner documents")}
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
          />}
        </TabPanel>

        <TabPanel id="performance" activeId={tab}>
          {isLiveData() ? <NotConnected block /> : <>
          <div className="fd-section-head">
            <div><h3>{tr("Fleet performance")}</h3><p>{trn("All drivers in this owner's fleets · {0} · {1}", span.label, span.compareLabel)}</p></div>
            <PeriodPicker key={`${period.kind}${period.on ?? ""}${period.from ?? ""}`} period={period} today={localDay(now, market.timeZone)} onChange={(next) => setParams(periodParams(next, params))} />
          </div>
          <div className="fd-stats">
            <Stat label={tr("Completed trips")} value={String(total.trips)} delta={change(total.trips, before.trips)} />
            <Stat label={tr("Average rating")} value={total.rating ? total.rating.toFixed(2) : "—"} warn={performanceWarning("rating", total.rating)} />
            <Stat label={tr("Acceptance rate")} value={`${total.acceptancePct}%`} warn={performanceWarning("acceptancePct", total.acceptancePct)} />
            <Stat label={tr("Cancellation rate")} value={`${total.cancellationPct}%`} inverse warn={performanceWarning("cancellationPct", total.cancellationPct)} />
            <Stat label={tr("Online hours")} value={`${total.onlineHours} h`} delta={change(total.onlineHours, before.onlineHours)} />
            <Stat label={tr("Rider no-shows")} value={String(total.noShows)} inverse delta={change(total.noShows, before.noShows)} />
            <Stat label={tr("Complaints")} value={String(total.complaints)} inverse delta={change(total.complaints, before.complaints)} />
            <Stat label={tr("Distance")} value={`${new Intl.NumberFormat(market.locale).format(total.distanceKm)} km`} />
          </div>
        </>}
        </TabPanel>

        <TabPanel id="earnings" activeId={tab}>
          {isLiveData() ? <NotConnected block /> : <>
          <div className="fd-section-head">
            <div><h3>{tr("Fleet earnings")}</h3><p>{trn("{0} · paid to the company account", span.label)}</p></div>
            <PeriodPicker key={`e${period.kind}${period.on ?? ""}${period.from ?? ""}`} period={period} today={localDay(now, market.timeZone)} onChange={(next) => setParams(periodParams(next, params))} />
          </div>
          <div className="fd-earn">
            <dl className="fd-ledger">
              <div><dt>{tr("Gross fares")}</dt><dd>{money(total.grossMinor)}</dd></div>
              <div><dt>{trn("Movera commission {0}", <small>{tr("20% placeholder")}</small>)}</dt><dd>−{money(total.commissionMinor)}</dd></div>
              <div><dt>{tr("Tips")}</dt><dd>+{money(total.tipsMinor)}</dd></div>
              <div><dt>{tr("Bonuses")}</dt><dd>+{money(total.bonusMinor)}</dd></div>
              <div><dt>{tr("Adjustments and refunds")}</dt><dd>{money(total.adjustmentsMinor)}</dd></div>
              <div className="total"><dt>{tr("Net to the fleet")}</dt><dd>{money(total.netMinor)}</dd></div>
            </dl>
            <section className="fd-box">
              <h3>{tr("Earnings by driver")}</h3>
              {ranking.length === 0 ? <p className="state-line">{tr("No drivers yet.")}</p> : (
                <ul className="share-bars">
                  {ranking.map(({ driver, perf }) => (
                    <li key={driver.id}>
                      <div className="share-head"><span><Link to={`/drivers/${driver.id}`}>{driver.name}</Link></span><strong>{compact(perf.netMinor)}</strong><small>{trn("{0} trips", perf.trips)}</small></div>
                      <div className="share-track"><i style={{ width: `${(perf.netMinor / maxNet) * 100}%` }} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>}
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
            onSent={() => setNotice(tr("Message sent to {0}.", [owner.name]))}
            locale={market.locale}
            timeZone={market.timeZone}
          />
        </TabPanel>

        <TabPanel id="notes" activeId={tab}>
          <h3>{tr("Private notes")}</h3>
          <p className="fd-note">{ops.note || tr("No private note stored yet.")}</p>
          <label className="fd-textarea">{tr("Private internal note")}<textarea value={privateNote} onChange={(event) => setPrivateNote(event.target.value)} />
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
              setNotice(tr("Private fleet owner note saved."));
              setPrivateNote("");
            }}
          >{tr("Save private note")}</CommandButton>
        </TabPanel>

        <TabPanel id="activity" activeId={tab}>
          <div className="fd-grid-2">
            <section className="fd-box">
              <h3>{tr("History")}</h3>
              <ul className="fd-timeline">{ops.activity.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
            </section>
            <section className="fd-box">
              <h3>{tr("Audited actions")}</h3>
              {ownerAudits.length === 0 ? <p className="state-line">{tr("No audited action on this owner yet.")}</p> : (
                <ul className="fd-timeline">{ownerAudits.map((item) => <li key={item.id}>{item.at.slice(0, 16).replace("T", " ")} · {item.action} · {item.result} · {item.actorId}</li>)}</ul>
              )}
            </section>
          </div>
        </TabPanel>
      </div>
    </div>
  );
}
