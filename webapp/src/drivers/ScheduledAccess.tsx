import { useMemo, useState } from "react";
import { Link } from "react-router";
import { CalendarOff, History, UserCog } from "lucide-react";
import { useRecords, useSlice } from "../api/hooks";
import { can } from "../auth/permissions";
import { useSession } from "../auth/SessionContext";
import { Card, Choice, Num, Row } from "../dispatch/fields";
import { DISPATCH_KEY, emptyDispatchBook, liveRules, normalizeDispatchBook, type DispatchBook } from "../dispatch/rules";
import { zoneById } from "../markets/markets";
import { CommandButton } from "../ui/CommandButton";
import {
  ACCESS_PERIODS, SCHEDULED_ACCESS_KEY, accessLabel, accessState, choiceError, clearAccess, emptyAccessBook, lateCancelsFor, normalizeAccessBook, setAccess,
  type AccessBook, type AccessChoice, type AccessPeriod,
} from "./scheduledAccess";
import { tr, trn, trx, trSentences } from "../i18n";

const DAY = 86_400_000;

/**
 * Q11: scheduled rides on or off for one driver, the late cancels in the current period and the pause by the rule.
 * With a driverId it is that driver's control (driver page); without, a desk with every driver who is paused or off
 * (Reservations, Dispatch).
 */
export function ScheduledAccessCard({ driverId }: { driverId?: string }) {
  const { agent } = useSession();
  const drivers = useRecords("drivers");
  const slice = useSlice<AccessBook>(SCHEDULED_ACCESS_KEY, emptyAccessBook());
  const book = useMemo(() => normalizeAccessBook(slice.value), [slice.value]);
  const dispatch = useSlice<DispatchBook>(DISPATCH_KEY, emptyDispatchBook());
  const rules = useMemo(() => normalizeDispatchBook(dispatch.value), [dispatch.value]);
  const [now] = useState(() => Date.now());
  const [picked, setPicked] = useState("");
  const [draft, setDraft] = useState<AccessChoice | null>(null);
  const [notice, setNotice] = useState("");
  const canEdit = Boolean(agent && can(agent.role, "trips.intervene"));
  const rows = drivers.data ?? [];
  const stateOf = (id: string, zoneId: string) => {
    const rule = liveRules(rules, zoneId).reservation;
    const entry = book.drivers[id];
    const state = accessState(entry, lateCancelsFor(id, now), rule, now);
    return { rule, entry, state, label: accessLabel(state, entry, rule) };
  };
  const desk = !driverId;
  const watched = desk
    ? rows.map((row) => ({ row, ...stateOf(row.id, row.zoneId) }))
      .filter((item) => !item.state.allowed || item.entry || item.state.lateInPeriod.length)
      // Admin choices first (newest first), then drivers paused by the rule, then drivers with late cancels.
      .sort((a, b) => Number(Boolean(b.entry)) - Number(Boolean(a.entry)) || (b.entry?.from ?? "").localeCompare(a.entry?.from ?? "") || Number(a.state.allowed) - Number(b.state.allowed) || b.state.lateInPeriod.length - a.state.lateInPeriod.length)
    : [];
  const [all, setAll] = useState(false);
  const currentId = driverId ?? (picked || watched[0]?.row.id || "");
  const driver = rows.find((row) => row.id === currentId);
  const current = driver ? stateOf(driver.id, driver.zoneId) : null;
  const choice: AccessChoice = draft ?? (current?.entry ? { on: current.entry.on, period: current.entry.period, days: current.entry.days, until: current.entry.until } : { on: !current?.state.allowed, period: "days", days: 7, until: new Date(now + 14 * DAY).toISOString().slice(0, 10) });
  const nowIso = new Date(now).toISOString();
  const saved = driver ? setAccess(book, driver.id, choice, agent?.id ?? "", nowIso) : { book, error: "Pick a driver." };
  const cleared = driver ? clearAccess(book, driver.id, agent?.id ?? "", nowIso) : book;
  const patch = (next: Partial<AccessChoice>) => setDraft({ ...choice, ...next });
  const error = choiceError(choice, now);
  const log = driver ? book.log.filter((item) => item.driverId === driver.id).slice(0, 4) : [];

  return (
    <Card title={desk ? tr("Drivers' access to scheduled rides") : tr("Scheduled rides for this driver")} tone="orange" icon={<CalendarOff size={18} />} help={desk ? tr("Drivers paused by the late-cancel rule or turned off by an admin. Turn scheduled rides on or off for one driver, for some days, until a date or always.") : tr("Turn scheduled rides on or off for this driver, for some days, until a date or always. Without that, the late-cancel rule decides.")}>
      {desk ? (
        watched.length ? (
          <ul className="sa-list" aria-label={tr("Drivers paused or off")}>
            {(all ? watched : watched.slice(0, 6)).map((item) => (
              <li key={item.row.id} className={item.state.allowed ? undefined : "off"}>
                <span><b>{item.row.name}</b><small>{zoneById(item.row.zoneId)?.name ?? item.row.zoneId} · {trx(item.label)}{item.state.source !== "rule" && item.state.lateInPeriod.length ? tr(" · {0} late cancel{1} in {2} days", [item.state.lateInPeriod.length, item.state.lateInPeriod.length === 1 ? "" : "s", item.rule.latePeriodDays]) : ""}</small></span>
                <span className="sa-tools">
                  <button data-command="admin.dispatch.view" type="button" className={item.row.id === currentId ? "dash-btn small" : "dash-btn small ghost"} aria-pressed={item.row.id === currentId} onClick={() => { setPicked(item.row.id); setDraft(null); setNotice(""); }}>{tr("Change")}</button>
                  <Link className="dash-btn small ghost" to={`/drivers/${item.row.id}`}>{tr("Open driver")}</Link>
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="dx-calm">{tr("Every driver can get scheduled rides.")}</p>
      ) : null}
      {desk && watched.length > 6 ? (
        <button data-command="admin.dispatch.view" type="button" className="dash-btn small ghost" aria-expanded={all} onClick={() => setAll((value) => !value)}>{all ? tr("Show fewer") : tr("Show all {0}", [watched.length])}</button>
      ) : null}
      {desk ? (
        <Row label={tr("Driver")}>
          <select className="dx-select" aria-label={tr("Driver for scheduled rides")} value={currentId} onChange={(event) => { setPicked(event.target.value); setDraft(null); setNotice(""); }}>
            {rows.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.id}</option>)}
          </select>
        </Row>
      ) : null}
      {driver && current ? (
        <div className="sa-driver" data-testid="scheduled-access">
          <p className={current.state.allowed ? "sa-state" : "sa-state off"} role="status"><b>{desk ? `${driver.name}: ` : ""}{trx(current.label)}.</b></p>
          <p className="sa-rule">{trn("{0} late cancel{1} in the last {2} days.{3}{4}", current.state.lateInPeriod.length, current.state.lateInPeriod.length === 1 ? "" : tr("s"), current.rule.latePeriodDays, current.rule.latePause ? tr(" Rule: {0} late cancels in {1} days pause scheduled rides for {2} days. ", [current.rule.latePauseAfter, current.rule.latePeriodDays, current.rule.latePauseDays]) : tr(" The late-cancel pause is off. "), <Link to={`/dispatch?zone=${driver.zoneId}&tab=reservations`}>{tr("Late-cancel rule")}</Link>)}</p>
          {current.state.lateInPeriod.length ? (
            <ul className="sa-late" aria-label={tr("Late cancels in the period")}>
              {current.state.lateInPeriod.map((item) => <li key={item.id}>{trn("{0} · {1} · {2} min before pickup · {3}", item.at.slice(0, 16).replace("T", " "), <Link to={`/reservations/${item.reservationId}`}>{item.reservationId}</Link>, item.minutesBefore, item.reason)}</li>)}
            </ul>
          ) : null}
          <Row label={tr("Scheduled rides")}>
            <Choice label={tr("Scheduled rides for the driver")} value={choice.on ? "on" : "off"} disabled={!canEdit} onChange={(value) => patch({ on: value === "on" })} options={[{ id: "on", label: tr("On") }, { id: "off", label: tr("Off") }]} />
          </Row>
          <Row label={tr("How long")} help={choice.on && current.state.pausedByRule ? tr("On skips the late-cancel pause while it lasts.") : undefined}>
            <Choice<AccessPeriod> label={tr("How long")} value={choice.period} disabled={!canEdit} onChange={(period) => patch({ period })} options={ACCESS_PERIODS} />
            {choice.period === "days" ? <Num label={tr("Days")} value={choice.days} unit="days" min={1} max={365} disabled={!canEdit} onChange={(days) => patch({ days: Math.round(days) })} /> : null}
            {choice.period === "until" ? <input className="dx-select" type="date" aria-label={tr("Last day")} value={choice.until} disabled={!canEdit} onChange={(event) => patch({ until: event.target.value })} /> : null}
          </Row>
          {error ? <p className="dx-issues" role="alert">{trSentences(error)}</p> : null}
          {notice ? <p className="dx-note" role="status">{trSentences(notice)}</p> : null}
          <div className="dx-modal-actions">
            {current.entry ? (
              <CommandButton command="admin.driver.scheduledAccess" className="dash-btn small ghost" targetId={driver.id} confirmTarget={false} scope={driver.zoneId} before="set by an admin" after="by the rule" expectedSliceRev={book.draftRev} sliceKey={SCHEDULED_ACCESS_KEY} value={cleared} disabled={!canEdit} onDone={() => { setDraft(null); setNotice(`${driver.name}: back to the late-cancel rule.`); }}>{tr("Back to the rule")}</CommandButton>
            ) : null}
            <CommandButton command="admin.driver.scheduledAccess" className="dash-btn small" targetId={driver.id} confirmTarget={false} scope={driver.zoneId} before={current.label} after={choice.on ? "on" : "off"} expectedSliceRev={book.draftRev} sliceKey={SCHEDULED_ACCESS_KEY} value={saved.book} disabled={!canEdit || Boolean(error) || Boolean(saved.error)} title={!canEdit ? tr("Your role cannot change this.") : error ?? saved.error} onDone={() => { setDraft(null); setNotice(`${driver.name}: scheduled rides ${choice.on ? "on" : "off"}.`); }}>{trn("{0} Save for {1}", <UserCog size={13} aria-hidden="true" />, driver.name)}</CommandButton>
          </div>
          {log.length ? (
            <ul className="sa-log" aria-label={tr("Scheduled rides changes")}>
              {log.map((item) => <li key={`${item.at}-${item.line}`}><History size={11} aria-hidden="true" /> {item.at.slice(0, 16).replace("T", " ")} · {trx(item.line)} · {item.by}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
