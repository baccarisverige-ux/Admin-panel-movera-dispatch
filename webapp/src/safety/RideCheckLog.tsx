import { useState } from "react";
import { tr, trx } from "../i18n/core";
import { Link } from "react-router";
import { Repeat, ShieldCheck, X } from "lucide-react";
import type { DemoRecord } from "../api/seed";
import type { Market, MarketZone } from "../markets/markets";
import { Cards } from "../reports/ui";
import {
  EMPTY_FILTER,
  OUTCOMES,
  TRIGGERS,
  answerKind,
  answerLabel,
  filterChecks,
  followText,
  outcomeOf,
  reasonText,
  repeats,
  triggerLabel,
  worrying,
  type Answer,
  type LogFilter,
  type Outcome,
  type Person,
  type RideCheck,
  type Trigger,
} from "./rideCheck";

type Props = {
  checks: readonly RideCheck[];
  /** When each check happened, on the demo clock. */
  timeOf: (check: RideCheck) => number;
  /** The incident status of a check that sent an alert. */
  incidentState: (incidentId: string) => string | null;
  drivers: readonly DemoRecord[];
  zones: readonly MarketZone[];
  market: Market;
};

function AnswerCell({ who, answer }: { who: Person; answer: Answer | null }) {
  const kind = answerKind(answer);
  const worries = (answer?.follow ?? []).filter(worrying);
  return (
    <span className={`rc-cell ${kind}`}>
      <b>{answerLabel(who, answer)}</b>
      {worries.map((follow) => <small key={follow.q} className="worry">{followText(follow)}</small>)}
      {answer?.text ? <small>“{answer.text}”</small> : null}
    </span>
  );
}

/** Every Ride check, OK or not, so drivers and areas that keep triggering it stand out. */
export function RideCheckLog({ checks, timeOf, incidentState, drivers, zones, market }: Props) {
  const [filter, setFilter] = useState<LogFilter>(EMPTY_FILTER);
  const set = (patch: Partial<LogFilter>) => setFilter((current) => ({ ...current, ...patch }));
  const day = (ms: number) => new Intl.DateTimeFormat("sv-SE", { timeZone: market.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
  const when = (ms: number) => new Intl.DateTimeFormat(market.locale, { timeZone: market.timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));
  const zoneName = (id: string) => zones.find((zone) => zone.id === id)?.name ?? id;
  const driverName = (id: string) => drivers.find((row) => row.id === id)?.name ?? id;
  const rows = filterChecks(checks, filter, timeOf, day).sort((a, b) => timeOf(b) - timeOf(a));
  const again = repeats(rows);
  const count = (outcome: Outcome) => rows.filter((check) => outcomeOf(check) === outcome).length;
  const driverIds = [...new Set(checks.map((check) => check.driverId))].sort((a, b) => driverName(a).localeCompare(driverName(b)));
  const filtered = JSON.stringify(filter) !== JSON.stringify(EMPTY_FILTER);

  return (
    <div className="rc-log">
      <Cards
        compare={false}
        compareLabel=""
        fmt={(value) => String(value)}
        cards={[
          { id: "all", label: tr("Ride checks"), value: rows.length, previous: null, format: "count", info: tr("Every time the driver and rider apps asked “Is everything OK?”.") },
          { id: "ok", label: tr("I'm OK"), value: count("ok"), previous: null, format: "count", info: tr("Both said they are OK, or one did and the other did not answer.") },
          { id: "reason", label: tr("Gave a reason"), value: count("reason"), previous: null, format: "count", info: tr("For example traffic, a stop the rider asked for, or a car problem.") },
          { id: "help", label: tr("Alerts sent"), value: count("help"), previous: null, format: "count", info: tr("Accident, someone hurt or I feel unsafe. Each one opened a Ride check incident."), goodDown: true },
        ]}
      />

      <div className="rc-filters" role="group" aria-label={tr("Filter the ride check log")}>
        <select aria-label={tr("Trigger")} value={filter.trigger} onChange={(event) => set({ trigger: event.target.value as Trigger | "" })}>
          <option value="">{tr("Every trigger")}</option>
          {TRIGGERS.map((item) => <option key={item.id} value={item.id}>{trx(item.label)}</option>)}
        </select>
        <select aria-label={tr("Answer")} value={filter.answer} onChange={(event) => set({ answer: event.target.value as Outcome | "" })}>
          <option value="">{tr("Every answer")}</option>
          {OUTCOMES.map((item) => <option key={item.id} value={item.id}>{trx(item.label)}</option>)}
        </select>
        <select aria-label={tr("Zone")} value={filter.zoneId} onChange={(event) => set({ zoneId: event.target.value })}>
          <option value="">{tr("Every zone")}</option>
          {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
        </select>
        <select aria-label={tr("Driver")} value={filter.driverId} onChange={(event) => set({ driverId: event.target.value })}>
          <option value="">{tr("Every driver")}</option>
          {driverIds.map((id) => <option key={id} value={id}>{driverName(id)} · {id}</option>)}
        </select>
        <label className="rc-date"><span>{tr("From")}</span><input type="date" aria-label={tr("From date")} value={filter.from} onChange={(event) => set({ from: event.target.value })} /></label>
        <label className="rc-date"><span>{tr("To")}</span><input type="date" aria-label={tr("To date")} value={filter.to} onChange={(event) => set({ to: event.target.value })} /></label>
        {filtered ? <button data-command="admin.rideCheck.view" type="button" className="dash-btn small ghost" onClick={() => setFilter(EMPTY_FILTER)}><X size={13} aria-hidden="true" /> {tr("Clear filters")}</button> : null}
      </div>

      {again.drivers.length || again.zones.length ? (
        <section className="rc-repeats" aria-label={tr("Keeps coming back")}>
          <span className="rc-repeats-head"><Repeat size={14} aria-hidden="true" /> <b>{tr("Keeps coming back")}</b></span>
          {again.drivers.slice(0, 4).map((row) => (
            <button data-command="admin.rideCheck.view" key={row.id} type="button" className={filter.driverId === row.id ? "rc-pill on" : "rc-pill"} aria-pressed={filter.driverId === row.id} onClick={() => set({ driverId: filter.driverId === row.id ? "" : row.id })}>
              {driverName(row.id)} <small>{tr("{0} checks", [row.count])}</small>
            </button>
          ))}
          {again.zones.slice(0, 3).map((row) => (
            <button data-command="admin.rideCheck.view" key={row.id} type="button" className={filter.zoneId === row.id ? "rc-pill zone on" : "rc-pill zone"} aria-pressed={filter.zoneId === row.id} onClick={() => set({ zoneId: filter.zoneId === row.id ? "" : row.id })}>
              {zoneName(row.id)} <small>{tr("{0} checks", [row.count])}</small>
            </button>
          ))}
        </section>
      ) : null}

      <div className="rp-table-wrap rc-table-wrap">
        <table className="rp-table rc-table" aria-label={tr("Ride check log")}>
          <thead>
            <tr><th scope="col">{tr("When")}</th><th scope="col">{tr("Trigger")}</th><th scope="col">{tr("Driver answer")}</th><th scope="col">{tr("Rider answer")}</th><th scope="col">{tr("Zone")}</th><th scope="col">{tr("Driver")}</th><th scope="col">{tr("Trip")}</th><th scope="col">{tr("Incident")}</th></tr>
          </thead>
          <tbody>
            {rows.map((check) => {
              const state = check.incidentId ? incidentState(check.incidentId) : null;
              return (
                <tr key={check.id} className={outcomeOf(check) === "help" ? "rc-row help" : "rc-row"}>
                  <td><time>{when(timeOf(check))}</time><small>{check.id}</small></td>
                  <td><span className="rc-cell"><b>{triggerLabel(check.trigger)}</b><small>{reasonText({ ...check, place: "" })}{check.place ? ` · ${check.place}` : ""}</small></span></td>
                  <td><AnswerCell who="driver" answer={check.driver} /></td>
                  <td><AnswerCell who="rider" answer={check.rider} /></td>
                  <td>{zoneName(check.zoneId)}</td>
                  <td><Link to={`/drivers/${check.driverId}`}>{driverName(check.driverId)}</Link></td>
                  <td><Link to={`/trips/${check.tripId}`}>{check.tripId}</Link></td>
                  <td>{check.incidentId ? <Link to={`/incidents?case=${check.incidentId}`}>{check.incidentId}</Link> : <span className="op-help">–</span>}{state ? <small>{state === "queued" ? tr("Not taken") : state === "taken" ? tr("Taken") : tr("Solved")}</small> : null}</td>
                </tr>
              );
            })}
            {rows.length === 0 ? <tr><td colSpan={8} className="rp-empty">{checks.length ? tr("No ride check matches these filters.") : tr("No ride checks in this scope.")}</td></tr> : null}
          </tbody>
        </table>
      </div>
      <p className="op-help rc-foot"><ShieldCheck size={12} aria-hidden="true" /> <span>{tr("Triggers and numbers are set per zone in")} <Link to="/dispatch?tab=safety">{tr("Dispatch → Safety")}</Link>. {tr("Audio recordings stay on the person's phone and are never sent to Movera.")}</span></p>
    </div>
  );
}
