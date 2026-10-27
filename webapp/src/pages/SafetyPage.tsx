import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { AlertOctagon, ArrowLeft, Car, Clock3, FileDown, History, ListChecks, MapPin, Phone, PhoneCall, Settings2, ShieldAlert, ShieldCheck, Siren, UserRound, Users } from "lucide-react";
import { useAdminApi } from "../api/AdminApiContext";
import { emptySafety, safetyAction, useCommands, useRecords, useSlice, type SafetyBook } from "../api/hooks";
import { useSession } from "../auth/SessionContext";
import { can } from "../auth/permissions";
import { demoShift } from "../dashboard/scheduled";
import { MapPanel } from "../dispatch/maps";
import { market, zoneById } from "../markets/markets";
import { useMarketScope } from "../markets/useMarketScope";
import { logExport } from "../reports/activityLog";
import { Cards } from "../reports/ui";
import {
  INCIDENT_OPS_KEY,
  KINDS,
  caseStep,
  LEVELS,
  caseOf,
  caseReport,
  clocks,
  emptyIncidentOps,
  lateText,
  linkedTrip,
  logCall,
  normalizeIncidentOps,
  pastCases,
  positions,
  setLevel,
  sortCases,
  type Case,
  type Clock,
  type IncidentOps,
  type Level,
} from "../safety/cases";
import { IncidentSettingsView } from "../safety/IncidentSettings";
import { DEFAULT_SAFETY } from "../safety/ops";
import { RideCheckLog } from "../safety/RideCheckLog";
import {
  QUESTIONS,
  RIDE_CHECK_KEY,
  alertBy,
  answerKind,
  answerLabel,
  asRideChecks,
  emptyRideCheckOps,
  followText,
  normalizeRideCheckOps,
  openCheck,
  reasonText,
  shiftOf,
  shifted,
  triggerLabel,
  worrying,
  type Answer,
  type Person,
  type RideCheck,
  type RideCheckOps,
} from "../safety/rideCheck";
import { routeOf } from "../trips/file";
import { agentName } from "../trips/TripParts";
import { RouteMap } from "../trips/RouteMap";
import { CommandButton } from "../ui/CommandButton";
import { tr, trx } from "../i18n/core";

type Show = "open" | "all" | "solved";

export function SafetyPage() {
  const { agent } = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const scope = useMarketScope();
  const place = scope.market;
  const rows = useRecords("incidents", undefined, { refetchMs: 10_000 });
  const trips = useRecords("trips");
  const drivers = useRecords("drivers");
  const riders = useRecords("riders");
  const vehicles = useRecords("vehicles");
  const rideCheckRows = useRecords("rideChecks", undefined, { refetchMs: 10_000 });
  const rideChecks = useMemo(() => asRideChecks(rideCheckRows.data), [rideCheckRows.data]);
  const rideSlice = useSlice<RideCheckOps>(RIDE_CHECK_KEY, emptyRideCheckOps());
  const rideOps = normalizeRideCheckOps(rideSlice.value);
  const api = useAdminApi();
  const store = useSlice<SafetyBook>("safetyOps", emptySafety());
  const opsSlice = useSlice<IncidentOps>(INCIDENT_OPS_KEY, emptyIncidentOps(), { enabled: Boolean(agent && can(agent.role, "incidents.read")) });
  const ops = normalizeIncidentOps(opsSlice.value);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = globalThis.setInterval(() => setNow(Date.now()), 30_000);
    return () => globalThis.clearInterval(timer);
  }, []);
  const show = (["open", "all", "solved"].includes(params.get("show") ?? "") ? params.get("show") : "all") as Show;
  const levelFilter = (LEVELS.some((item) => item.id === params.get("level")) ? params.get("level") : "") as Level | "";
  const cases = useMemo(() => sortCases((rows.data ?? []).map((row) => caseOf(row, store.value, ops, now))), [rows.data, store.value, ops, now]);
  const shown = cases.filter((item) => (show === "all" ? true : show === "open" ? item.state !== "solved" : item.state === "solved") && (!levelFilter || item.level === levelFilter));
  const selectedId = params.get("case");
  // Keep the case on screen while the list reorders (for example right after Take), instead of jumping to the new first one.
  const lastShown = useRef<string | null>(null);
  const item = shown.find((row) => row.id === selectedId) ?? shown.find((row) => row.id === lastShown.current) ?? shown[0] ?? null;
  lastShown.current = item?.id ?? null;
  const record = item ? rows.data?.find((row) => row.id === item.id) : undefined;
  const open = cases.filter((row) => row.state !== "solved");
  const late = open.filter((row) => lateText(row, ops.settings, now));
  const solved = cases.filter((row) => row.state === "solved" && row.solvedAt && now - row.solvedAt < 30 * 86_400_000);
  const takeTimes = cases.filter((row) => row.takenAt).map((row) => ((row.takenAt as number) - row.openedAt) / 60_000);
  const editable = Boolean(agent && can(agent.role, "safety.edit"));
  const time = (ms: number) => new Intl.DateTimeFormat(place.locale, { timeZone: place.timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));
  const view = params.get("view") === "ridechecks" ? "ridechecks" : "cases";
  const shiftMs = demoShift(now, api.demo);
  // When a ride check happened: live ones move with their incident, like an open SOS.
  const checkTime = (check: RideCheck) => shifted(check.at, shiftOf(check, cases.find((row) => row.id === check.incidentId)?.openedAt ?? null, shiftMs));
  const sections = (
    <div className="dash-tabs dx-views" role="tablist" aria-label="Incident sections">
      {([["cases", "Cases"], ["ridechecks", "Ride checks"]] as const).map(([id, label]) => (
        <button data-command="admin.incident.view" key={id} type="button" role="tab" aria-selected={view === id} className={view === id ? "active" : undefined} onClick={() => set({ view: id === "cases" ? null : id, case: null })}>
          {id === "cases" ? <Siren size={15} aria-hidden="true" /> : <ListChecks size={15} aria-hidden="true" />} {label}
          {id === "ridechecks" && rideChecks.length ? <span className="tab-count muted">{rideChecks.length}</span> : null}
        </button>
      ))}
    </div>
  );

  function set(patch: Record<string, string | null>) {
    setParams(() => {
      const next = new URLSearchParams(globalThis.location.search);
      for (const [key, value] of Object.entries(patch)) {
        if (!value) next.delete(key);
        else next.set(key, value);
      }
      return next;
    }, { replace: true });
  }

  if (params.get("view") === "settings") {
    return (
      <div className="dx-page op-page">
        <header className="dx-head">
          <button data-command="admin.incident.view" type="button" className="dash-btn ghost dx-back" onClick={() => set({ view: null })}><ArrowLeft size={16} aria-hidden="true" /> Back</button>
          <div className="dx-head-text">
            <h2>Incident settings</h2>
            <p>Time limits per level, what the case page shows, and the emergency numbers per country.</p>
          </div>
        </header>
        <IncidentSettingsView ops={ops} editable={editable} loading={opsSlice.loading} />
      </div>
    );
  }

  if (view === "ridechecks") {
    return (
      <div className="dx-page op-page">
        <header className="dx-head">
          <button data-command="admin.incident.view" type="button" className="dash-btn ghost dx-back" onClick={() => set({ view: null })}><ArrowLeft size={16} aria-hidden="true" /> Back</button>
          <div className="dx-head-text">
            <h2>Ride checks in {place.name}</h2>
            <p>Every time the apps asked &quot;Is everything OK?&quot;, with both answers. Spot drivers and areas that keep triggering it.</p>
          </div>
        </header>
        {sections}
        {rideCheckRows.error ? <p role="alert">{rideCheckRows.error.message}</p> : null}
        {rideCheckRows.isLoading ? <p className="state-line">Loading ride checks.</p> : (
          <RideCheckLog
            checks={rideChecks}
            timeOf={checkTime}
            incidentState={(id) => rows.data?.find((row) => row.id === id)?.status ?? null}
            drivers={drivers.data ?? []}
            zones={place.zones.filter((zone) => !scope.zones.length || scope.zones.includes(zone.id))}
            market={place}
          />
        )}
      </div>
    );
  }

  return (
    <div className="dx-page op-page">
      <header className="dx-head">
        <button data-command="admin.incident.view" type="button" className="dash-btn ghost dx-back" onClick={() => (globalThis.history.length > 1 ? navigate(-1) : navigate("/"))}><ArrowLeft size={16} aria-hidden="true" /> Back</button>
        <div className="dx-head-text">
          <h2>Incidents in {place.name}</h2>
          <p>SOS, Ride check and safety cases. One owner per case, shared with Alerts. Location must be checked before acting.</p>
        </div>
        {editable ? <button data-command="admin.incident.view" type="button" className="dash-btn small ghost" onClick={() => set({ view: "settings" })}><Settings2 size={14} aria-hidden="true" /> Settings</button> : null}
      </header>
      {sections}
      {rows.error ? <p role="alert">{rows.error.message}</p> : null}

      <Cards
        compare={false}
        compareLabel=""
        fmt={(value, format) => (format === "min" ? `${value} min` : String(value))}
        cards={[
          { id: "open", label: "Open now", value: open.length, previous: null, format: "count", info: "Cases not solved yet." },
          { id: "new", label: "Not taken yet", value: open.filter((row) => row.state === "new").length, previous: null, format: "count", info: "Nobody is working on these. Take them first.", goodDown: true },
          { id: "late", label: "Late", value: late.length, previous: null, format: "count", info: "Open cases past the time limit of their level.", goodDown: true },
          { id: "solved", label: "Solved, 30 days", value: solved.length, previous: null, format: "count", info: "Cases solved in the last 30 days." },
          { id: "take", label: "Average time to take", value: takeTimes.length ? Math.round(takeTimes.reduce((sum, value) => sum + value, 0) / takeTimes.length) : 0, previous: null, format: "min", info: "Minutes from the moment a case came in until someone took it.", goodDown: true },
        ]}
      />
      <p className="state-line op-help">{rows.data?.filter((row) => row.status === "queued" && row.kind !== "ride_check").length ?? "…"} unclaimed SOS incidents{rows.data?.some((row) => row.status === "queued" && row.kind === "ride_check") ? ` · ${rows.data.filter((row) => row.status === "queued" && row.kind === "ride_check").length} Ride check not taken` : ""}</p>

      <div className="op-case-grid">
        <aside className="op-case-list" aria-label="Cases">
          <div className="dx-choice" role="radiogroup" aria-label="Show">
            {(["all", "open", "solved"] as const).map((id) => (
              <label key={id} className={show === id ? "on" : undefined}><input type="radio" name="incident-show" checked={show === id} onChange={() => set({ show: id === "all" ? null : id, case: null })} />{id === "all" ? "All" : id === "open" ? "Open" : "Solved"}</label>
            ))}
          </div>
          <select aria-label="Level" value={levelFilter} onChange={(event) => set({ level: event.target.value, case: null })}>
            <option value="">Every level</option>
            {LEVELS.map((level) => <option key={level.id} value={level.id}>{level.label}</option>)}
          </select>
          <ul>
            {shown.map((row) => {
              const lateLine = lateText(row, ops.settings, now);
              return (
                <li key={row.id}>
                  <button data-command="admin.incident.view" type="button" className={`op-case ${row.level}${item?.id === row.id ? " active" : ""}`} aria-pressed={item?.id === row.id} onClick={() => set({ case: row.id })}>
                    <span className={`op-level ${row.level}`}>{LEVELS.find((level) => level.id === row.level)?.label}</span>
                    <b>{trx(KINDS.find((kind) => kind.id === row.kind)?.label)} · {row.who}</b>
                    <small>{row.id} · {zoneById(row.zoneId)?.name ?? row.zoneId} · {row.state === "solved" ? caseStep(row.status) : row.owner ? `${agentName(row.owner)} is on it` : "Nobody yet"}</small>
                    {lateLine ? <small className="op-late"><Clock3 size={11} aria-hidden="true" /> {lateLine}</small> : null}
                  </button>
                </li>
              );
            })}
            {!shown.length ? <li className="dx-calm">{rows.isLoading ? "Loading incidents…" : "No incidents in this scope."}</li> : null}
          </ul>
        </aside>
        {item && record ? (
          <CaseView
            key={item.id}
            item={item}
            record={record}
            all={cases}
            ops={ops}
            store={store.value}
            storeLoading={store.loading}
            now={now}
            time={time}
            trips={trips.data ?? []}
            drivers={drivers.data ?? []}
            riders={riders.data ?? []}
            vehicles={vehicles.data ?? []}
            check={rideChecks.find((row) => row.incidentId === item.id) ?? null}
            chosen={selectedId === item.id}
            rideOps={rideOps}
            rideLoading={rideSlice.loading}
            checkTime={checkTime}
            onOpen={(id) => set({ case: id, show: null, level: null })}
          />
        ) : <p className="dx-calm">{rows.isLoading ? "Loading incidents…" : "No incidents in this scope."}</p>}
      </div>
    </div>
  );
}

type CaseProps = {
  item: Case;
  record: NonNullable<ReturnType<typeof useRecords>["data"]>[number];
  all: readonly Case[];
  ops: IncidentOps;
  store: SafetyBook;
  storeLoading: boolean;
  now: number;
  time: (ms: number) => string;
  trips: NonNullable<ReturnType<typeof useRecords>["data"]>;
  drivers: NonNullable<ReturnType<typeof useRecords>["data"]>;
  riders: NonNullable<ReturnType<typeof useRecords>["data"]>;
  vehicles: NonNullable<ReturnType<typeof useRecords>["data"]>;
  /** The ride check behind a "Ride check" incident. */
  check: RideCheck | null;
  /** The admin opened this case (a link, the banner or a click in the list), so its alert counts as opened. */
  chosen: boolean;
  rideOps: RideCheckOps;
  rideLoading: boolean;
  checkTime: (check: RideCheck) => number;
  onOpen: (id: string) => void;
};

function CaseView({ item, record, all, ops, store, storeLoading, now, time, trips, drivers, riders, vehicles, check, chosen, rideOps, rideLoading, checkTime, onOpen }: CaseProps) {
  const { agent } = useSession();
  const me = agent?.id ?? "";
  const commands = useCommands();
  const editable = Boolean(agent && can(agent.role, "safety.edit"));
  const [text, setText] = useState("");
  const [notice, setNotice] = useState("");
  const [level, setLevelDraft] = useState<Level>(item.level);
  const settings = ops.settings;
  const time2 = clocks(item, settings, now);
  const trip = linkedTrip(item, trips);
  const driver = drivers.find((row) => row.id === (item.driverId ?? trip?.driverId));
  const rider = riders.find((row) => row.phone === item.phone) ?? riders.find((row) => row.name === item.who);
  const where = positions(item);
  const policy = store.policies[item.zoneId] ?? DEFAULT_SAFETY;
  const stale = where.secondsAgo > policy.staleSeconds;
  const past = pastCases(item, all);
  const calls = ops.calls.filter((call) => call.incidentId === item.id);
  const caseInfo = ops.cases[item.id];
  const place = market(item.country);
  const emergency = settings.emergency[item.country] ?? [];
  const lateLine = lateText(item, settings, now);
  const vehicle = vehicles.find((row) => row.driverId === (driver?.id ?? item.driverId)) ?? (check?.vehicleId ? vehicles.find((row) => row.id === check.vehicleId) : undefined);
  // Ride check: the shift puts a live check's answers at the time the incident opened.
  const shift = check ? checkTime(check) - Date.parse(check.at) : 0;
  const clock = (iso: string) => shifted(iso, shift);
  const raisedBy: Person | "system" = (check ? alertBy(check)?.who : null) ?? item.raisedBy;
  const opened = check ? rideOps.opened[check.id] : undefined;
  const route = check && trip ? routeOf(trip) : null;
  const carAt = route?.path.length ? route.path[Math.round((route.path.length - 1) * (check?.trigger === "far" ? 0.94 : check?.trigger === "crash" ? 0.45 : 0.58))] : where.driver ?? where.rider;
  const carPoint = check?.trigger === "route" ? [carAt[0] + 0.006, carAt[1] + 0.009] as [number, number] : carAt;

  // Opening a ride check case acknowledges its alert, so the red banner goes for everyone.
  const acking = useRef({ busy: false, tries: 0 });
  useEffect(() => {
    if (!check || !chosen || opened || rideLoading || acking.current.busy || acking.current.tries >= 3 || commands.busy || !me || item.state === "solved") return;
    acking.current = { busy: true, tries: acking.current.tries + 1 };
    void commands.run("admin.rideCheck.open", { targetId: check.id, scope: check.zoneId, before: "new", after: "opened", sliceKey: RIDE_CHECK_KEY, value: openCheck(rideOps, check.id, me, new Date().toISOString()), expectedSliceRev: rideOps.draftRev }).finally(() => {
      acking.current = { ...acking.current, busy: false };
    });
  }, [check, chosen, opened, rideLoading, commands.busy, me, item.state, rideOps]);

  const rideEvents = check ? [
    { at: clock(check.at), text: `Ride check opened in both apps: ${triggerLabel(check.trigger)} (${reasonText(check)})`, who: "" },
    ...(["driver", "rider"] as const).flatMap((who) => {
      const answer = check[who];
      if (!answer) return [];
      const name = who === "driver" ? "The driver" : "The rider";
      return [
        { at: clock(answer.at), text: `${name} answered: ${answerLabel(who, answer)}${answer.text ? ` (“${answer.text}”)` : ""}`, who: "" },
        ...(answer.follow ?? []).map((follow) => ({ at: clock(follow.at), text: `${name}: ${followText(follow)}`, who: "" })),
      ];
    }),
    ...(opened ? [{ at: Date.parse(opened.at), text: "Opened the alert", who: agentName(opened.by) }] : []),
  ] : [];
  const events = [
    ...rideEvents,
    { at: item.openedAt, text: check ? `Alert sent by the ${raisedBy}. Ride check incident opened.` : item.raisedBy === "system" ? tr("Movera opened the case: no car position for 30 min with the rider on board.") : `${item.raisedBy === "rider" ? "The rider" : "The driver"} raised the case (${trx(KINDS.find((kind) => kind.id === item.kind)?.label)})`, who: "" },
    ...(item.escalatedAt ? [{ at: Date.parse(item.escalatedAt), text: tr("Nobody took it in 2 minutes: every signed-in admin is alerted."), who: "" }] : []),
    ...item.events.map((event) => ({ at: Date.parse(event.at), text: event.kind === "take" ? "Took the case" : event.kind === "resolve" ? `${tr("Solved")}: ${event.text}` : event.kind === "dismiss" ? `${tr("False alarm")}: ${event.text}` : `Contact: ${event.text}`, who: agentName(event.actor) })),
    ...(caseInfo?.levelAt ? [{ at: Date.parse(caseInfo.levelAt), text: `Level set to ${LEVELS.find((row) => row.id === caseInfo.level)?.label}${caseInfo.levelWhy ? `: ${caseInfo.levelWhy}` : ""}`, who: agentName(caseInfo.levelBy ?? "") }] : []),
    ...calls.map((call) => ({ at: Date.parse(call.at), text: `Called ${call.to}`, who: agentName(call.actorId) })),
    ...(item.state === "solved" && !item.events.some((event) => event.kind === "resolve") && item.solvedAt ? [{ at: item.solvedAt, text: "Solved (earlier case)", who: "" }] : []),
  ].sort((a, b) => a.at - b.at);

  function call(to: string, number: string) {
    globalThis.location.href = `tel:${number.replace(/[^+\d]/g, "")}`;
    setNotice(`Calling ${to}. The call is logged on the case.`);
  }

  function download() {
    const body = caseReport(item, {
      zone: zoneById(item.zoneId)?.name ?? item.zoneId,
      trip: trip?.id ?? "none",
      owner: item.owner ? agentName(item.owner) : "nobody",
      level: LEVELS.find((row) => row.id === item.level)?.label ?? item.level,
      events: events.map((event) => `${time(event.at)} ${event.who ? `${event.who}: ` : ""}${event.text}`),
      calls: calls.map((row) => `${time(Date.parse(row.at))} ${agentName(row.actorId)} called ${row.to}`),
    }, time);
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `movera-incident-${item.id}.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
    logExport(agent?.id, `Incident report ${item.id}`, item.zoneId);
    setNotice("Case report downloaded.");
  }

  const callButton = (to: string, number: string, key: string, primary = false, label?: string) => (
    <CommandButton key={key} command="admin.incident.call" className={primary ? "dash-btn small danger" : "dash-btn small ghost"} sliceKey={INCIDENT_OPS_KEY} value={logCall(ops, item.id, to, me, new Date().toISOString())} expectedSliceRev={ops.draftRev} targetId={item.id} scope={item.zoneId} confirmTarget={false} before="" after={`called ${to}`} disabled={!editable} title={!editable ? "Only the safety team can call from a case." : undefined} onDone={() => call(to, number)}>
      <PhoneCall size={13} aria-hidden="true" /> {label ?? to} <small>{number}</small>
    </CommandButton>
  );

  return (
    <article className={`op-case-view ${item.level}`} aria-label={`Case ${item.id}`}>
      <header className="op-case-head">
        <span className={`op-level ${item.level}`}><AlertOctagon size={12} aria-hidden="true" /> {LEVELS.find((row) => row.id === item.level)?.label}</span>
        <h3>{record.id} · {caseStep(record.status)}</h3>
        <p>{trx(KINDS.find((kind) => kind.id === item.kind)?.label)} · raised by the {raisedBy} · rider {item.who}{driver ? ` · driver ${driver.name}` : ""} · {zoneById(item.zoneId)?.name ?? item.zoneId} · opened {time(item.openedAt)}</p>
        <p className="op-owner"><UserRound size={13} aria-hidden="true" /> Owner {item.owner ? agentName(item.owner) : "Unassigned"}{item.owner === me ? " (you)" : ""}</p>
      </header>
      {notice ? <p className="dx-note" role="status">{notice}</p> : null}
      {item.escalatedAt && item.state === "new" ? <p className="op-late-banner" role="alert"><Siren size={14} aria-hidden="true" /> {tr("Nobody took it in 2 minutes: every signed-in admin is alerted.")}</p> : null}
      {lateLine ? <p className="op-late-banner"><Clock3 size={14} aria-hidden="true" /> Late: {lateLine}.</p> : null}

      <div className="op-clocks">
        <ClockBar clock={time2.take} />
        <ClockBar clock={time2.solve} />
      </div>

      {check ? (
        <section className="op-section rc-answers" aria-label="Ride check answers">
          <header className="op-section-head">
            <h3><span aria-hidden="true"><ShieldCheck size={16} /></span> Ride check · {triggerLabel(check.trigger)}</h3>
            <span className="rc-chip">{reasonText(check)}</span>
          </header>
          <p className="op-help">Card opened {time(clock(check.at))} in both apps. {opened ? `Alert opened by ${agentName(opened.by)} at ${time(Date.parse(opened.at))}.` : "Alert not opened yet."}</p>
          <div className="rc-answer-grid">
            <RideAnswer who="driver" name={driver?.name ?? "Driver"} answer={check.driver} clock={(iso) => time(clock(iso))} />
            <RideAnswer who="rider" name={rider?.name ?? item.who} answer={check.rider} clock={(iso) => time(clock(iso))} />
          </div>
        </section>
      ) : null}

      <section className="op-case-actions" aria-label="Work on the case">
        <label className="op-field"><span>Contact or outcome</span><textarea aria-label="Contact or outcome" rows={2} value={text} placeholder="Who you called, what they said, what you did" onChange={(event) => setText(event.target.value)} /></label>
        <div className="op-inline wrap">
          {(["take", "contact", "resolve", "dismiss"] as const).map((kind) => {
            const prepared = safetyAction(store, record, me, kind, kind === "take" ? "Responder accepted incident" : text);
            return (
              <CommandButton key={kind} command={`admin.safety.${kind}`} className={kind === "take" ? "dash-btn small danger" : "dash-btn small"} targetId={record.id} scope={record.zoneId} collection="incidents" patch={{ status: prepared.status }} entityState={record.status} sliceKey="safetyOps" value={prepared.book} expectedSliceRev={store.draftRev} confirmTarget={false} disabled={storeLoading || Boolean(prepared.error)} title={prepared.error} after={prepared.status} onDone={() => { setText(""); onOpen(item.id); setNotice(kind === "take" ? tr("You took the case.") : kind === "resolve" ? tr("Case solved.") : kind === "dismiss" ? tr("Marked as a false alarm.") : "Contact logged."); }}>
                {kind === "take" ? tr("Take") : kind === "contact" ? "Log contact" : kind === "resolve" ? tr("Solve") : tr("False alarm")}
              </CommandButton>
            );
          })}
        </div>
      </section>

      <section className="op-level-pick" aria-label="Level">
        <span className="dx-choice" role="radiogroup" aria-label="Case level">
          {LEVELS.map((row) => <label key={row.id} className={level === row.id ? `on ${row.id}` : undefined} title={row.help}><input type="radio" name={`level-${item.id}`} checked={level === row.id} disabled={!editable} onChange={() => setLevelDraft(row.id)} />{row.label}</label>)}
        </span>
        <CommandButton command="admin.incident.level" className="dash-btn small ghost" sliceKey={INCIDENT_OPS_KEY} value={setLevel(ops, item.id, level, me, "", new Date().toISOString())} expectedSliceRev={ops.draftRev} targetId={item.id} scope={item.zoneId} confirmTarget={false} before={item.level} after={level} disabled={!editable || level === item.level} onDone={() => setNotice(`Level changed to ${LEVELS.find((row) => row.id === level)?.label}.`)}>Change level</CommandButton>
        <small className="op-help">{LEVELS.find((row) => row.id === level)?.help} Take within {settings.limits[level].takeMin} min, solve within {settings.limits[level].solveMin} min.</small>
      </section>

      {settings.callButtons ? (
        <section className="op-calls-bar" aria-label="Call">
          <h4 className="op-sub"><Phone size={13} aria-hidden="true" /> Call</h4>
          <div className="op-inline wrap">
            {check ? (
              <>
                {driver ? callButton("the driver", driver.phone, "driver", false, "Call driver") : null}
                {callButton("the rider", rider?.phone ?? item.phone, "rider", false, "Call rider")}
              </>
            ) : (
              <>
                {callButton("the rider", item.phone, "rider")}
                {driver ? callButton("the driver", driver.phone, "driver") : null}
              </>
            )}
            {emergency.map((row, index) => callButton(row.label, row.number, `e-${index}`, index === 0))}
          </div>
        </section>
      ) : null}

      <div className="op-case-split">
        {settings.liveMap && check && carPoint ? (
          <MapPanel title={item.state === "solved" ? "Where the car was" : "Where the car is now"} note={<span className={stale ? "op-late" : "op-help"}><MapPin size={12} aria-hidden="true" /> {item.state === "solved" ? `At the ride check, ${time(clock(check.at))}.` : `Location updated ${where.secondsAgo} s ago${stale ? `, older than ${policy.staleSeconds} s: call to check` : ""}.`} Demo location until the apps send it.</span>}>
            <RouteMap key={trip?.id ?? "no-trip"} stops={route?.stops ?? []} path={route?.path ?? []} points={[{ id: "car", label: `${vehicle?.plate ?? "Car"} · ${driver?.name ?? "Driver"}`, at: carPoint, tone: "alert" }]} label={`Where the car of ${item.id} is`} />
          </MapPanel>
        ) : settings.liveMap && where.live ? (
          <MapPanel title={tr("Where they are")} note={<span className="op-help"><MapPin size={12} aria-hidden="true" /> {tr("Phone GPS sent with the SOS; car position from the server, {0} s ago.", [where.secondsAgo])}</span>}>
            <RouteMap stops={[]} path={[]} points={[...(item.phoneAt ? [{ id: "phone", label: tr("SOS phone"), at: where.rider, tone: "alert" as const }] : []), ...(where.driver ? [{ id: "car", label: `${tr("Car")} · ${driver?.name ?? item.driverId ?? ""}`, at: where.driver, tone: item.kind === "car_lost" ? "alert" as const : "driver" as const }] : [])]} label={`Where the people of ${item.id} are`} />
          </MapPanel>
        ) : settings.liveMap ? (
          <MapPanel title="Where they are now" note={<span className={stale ? "op-late" : "op-help"}><MapPin size={12} aria-hidden="true" /> Location updated {where.secondsAgo} s ago{stale ? `, older than ${policy.staleSeconds} s: call to check` : ""}. Demo location until the apps send it.</span>}>
            <RouteMap stops={[]} path={[]} points={[{ id: "rider", label: item.who, at: where.rider, tone: item.raisedBy === "rider" ? "alert" : "rider" }, ...(where.driver ? [{ id: "driver", label: driver?.name ?? "Driver", at: where.driver, tone: item.raisedBy === "driver" ? "alert" as const : "driver" as const }] : [])]} label={`Where the people of ${item.id} are`} />
          </MapPanel>
        ) : null}
        <section className="op-section" aria-label="People and trip">
          <header className="op-section-head"><h3><span aria-hidden="true"><Users size={16} /></span> People and trip</h3></header>
          <div className="op-facts-list">
            <p><UserRound size={13} aria-hidden="true" /> Rider {rider ? <Link to={`/riders/${rider.id}`}>{rider.name}</Link> : item.who}</p>
            <p><UserRound size={13} aria-hidden="true" /> Driver {driver ? <Link to={`/drivers/${driver.id}`}>{driver.name}</Link> : "not known"}</p>
            {check ? <p><Car size={13} aria-hidden="true" /> Car {vehicle ? <Link to={`/vehicles/${vehicle.id}`}>{vehicle.plate}</Link> : "not known"}{vehicle ? ` · ${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trimEnd() : ""}</p> : null}
            <p><Siren size={13} aria-hidden="true" /> Trip {trip ? <Link to={`/trips/${trip.id}`}>{trip.id}</Link> : "not linked"}</p>
            <p className="op-help">{place.name} · {zoneById(item.zoneId)?.city ?? ""}</p>
          </div>
          {settings.pastCases ? (
            <>
              <h4 className="op-sub"><History size={13} aria-hidden="true" /> Earlier cases of {item.who}</h4>
              {past.length ? (
                <ul className="op-past">
                  {past.map((row) => <li key={row.id}><button data-command="admin.incident.view" type="button" className="link-action" onClick={() => onOpen(row.id)}>{row.id}</button> · {KINDS.find((kind) => kind.id === row.kind)?.label} · {time(row.openedAt)}</li>)}
                </ul>
              ) : <p className="op-help">No earlier cases.</p>}
            </>
          ) : null}
        </section>
      </div>

      <section className="op-section" aria-label="What happened">
        <header className="op-section-head">
          <h3><span aria-hidden="true"><ShieldAlert size={16} /></span> What happened</h3>
          {settings.caseReport ? <button data-command="admin.incident.report" type="button" className="dash-btn small ghost" onClick={download}><FileDown size={13} aria-hidden="true" /> Case report</button> : null}
        </header>
        <ol className="op-timeline">
          {events.map((event, index) => <li key={`${event.at}-${index}`}><time>{new Intl.DateTimeFormat(place.locale, { timeZone: place.timeZone, timeStyle: "short" }).format(new Date(event.at))}</time><i aria-hidden="true" /><span>{event.who ? <b>{event.who}: </b> : null}{event.text}</span></li>)}
        </ol>
        {item.events.length ? (
          <details className="op-log" open>
            <summary>Full log ({item.events.length})</summary>
            <ol aria-label="Incident log">{item.events.map((event, index) => <li key={index}>{time(Date.parse(event.at))} · {agentName(event.actor)} · {event.kind}: {event.text}</li>)}</ol>
          </details>
        ) : null}
      </section>
    </article>
  );
}

/** One person's answer on the Ride check card, with the follow-up questions. */
function RideAnswer({ who, name, answer, clock }: { who: Person; name: string; answer: Answer | null; clock: (iso: string) => string }) {
  return (
    <div className={`rc-answer ${answerKind(answer)}`} aria-label={`${who === "driver" ? "Driver" : "Rider"} answer`}>
      <small>{who === "driver" ? "Driver" : "Rider"} · {name}</small>
      <b>{answerLabel(who, answer)}</b>
      {answer ? <time>{clock(answer.at)}</time> : <span className="op-help">The card stays open until they answer.</span>}
      {answer?.follow?.length ? (
        <ul>
          {answer.follow.map((follow) => (
            <li key={follow.q} className={worrying(follow) ? "worry" : undefined}><span>{QUESTIONS[follow.q]}</span> <b>{follow.a}</b> <time>{clock(follow.at)}</time></li>
          ))}
        </ul>
      ) : null}
      {answer?.text ? <p>“{answer.text}”</p> : null}
    </div>
  );
}

function ClockBar({ clock }: { clock: Clock }) {
  const pct = Math.min(100, Math.round((clock.minutes / Math.max(clock.limit, 1)) * 100));
  return (
    <div className={clock.late ? "op-clock late" : clock.done ? "op-clock done" : "op-clock"}>
      <span><b>{clock.label} {clock.done ? `after ${clock.minutes} min` : `· ${clock.minutes} min so far`}</b><small>Limit {clock.limit} min</small></span>
      <span className="op-clock-track"><i style={{ width: `${pct}%` }} /></span>
    </div>
  );
}
