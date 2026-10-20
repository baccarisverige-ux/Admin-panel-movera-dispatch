import { useState } from "react";
import { Link } from "react-router";
import { BellOff, CheckCircle2, ExternalLink, Hand, Send, TimerReset, UserCheck } from "lucide-react";
import type { DemoRecord } from "../api/seed";
import { can, AGENTS } from "../auth/permissions";
import { useSession } from "../auth/SessionContext";
import { safetyAction } from "../safety/ops";
import { CommandButton } from "../ui/CommandButton";
import { useAlertsData } from "./AlertsContext";
import { ALERTS_KEY, doneAlert, followsIncident, muteKind, passAlert, snoozeAlert, takeAlert, type OpenAlert } from "./engine";
import { OpenRideCheck } from "./OpenRideCheck";
import { tr, trn, trx } from "../i18n";

export function agentName(id: string | null | undefined): string {
  if (!id) return "";
  return AGENTS.find((agent) => agent.id === id)?.name ?? id;
}

/** "Nora Lind is working on it" or "Not taken yet". */
export function StatusLine({ alert }: { alert: OpenAlert }) {
  if (alert.status === "snoozed") return <span className="al-status snoozed">{trn("{0} Snoozed by {1}", <TimerReset size={12} aria-hidden="true" />, agentName(alert.record?.events.at(-1)?.by))}</span>;
  if (alert.owner) return <span className="al-status taken">{trn("{0} {1} is working on it", <UserCheck size={12} aria-hidden="true" />, agentName(alert.owner))}</span>;
  return <span className="al-status new">{tr("Not taken yet")}</span>;
}

/**
 * Take, solve, and the extras the admin switched on. An SOS uses the same take and resolve as
 * Incidents, so one person owns it everywhere and nobody can take it twice.
 */
export function AlertActions({ alert, compact = false, onDone }: { alert: OpenAlert; compact?: boolean; onDone?: (text: string) => void }) {
  const data = useAlertsData();
  const { agent } = useSession();
  const [note, setNote] = useState("");
  const [snooze, setSnooze] = useState(30);
  const [passTo, setPassTo] = useState("");
  const book = data.book;
  const me = agent?.id ?? "";
  const at = new Date().toISOString();
  const extras = book.settings.extras;
  const say = (text: string) => onDone?.(text);

  if (followsIncident(alert.kind)) {
    if (!alert.incidentId) return null;
    const incident = data.facts.incidents.find((row) => row.id === alert.incidentId);
    if (!incident) return null;
    const row = { id: incident.id, name: incident.who, phone: "", zoneId: incident.zoneId, status: incident.status } as DemoRecord;
    const canSafety = Boolean(agent && can(agent.role, "safety.edit"));
    const owner = data.sosOwner(incident.id);
    const ride = alert.kind === "ride_check";
    const what = ride ? "ride check" : "SOS";
    const open = ride ? <OpenRideCheck alert={alert} label={tr("Open case")} className="dash-btn small ghost" /> : <Link className="dash-btn small ghost" to="/incidents">{tr("Open Incidents")}</Link>;
    if (incident.status === "queued") {
      const prepared = safetyAction(data.safety.value, row, me, "take", "Responder accepted incident");
      return (
        <div className={compact ? "al-actions compact" : "al-actions"}>
          <CommandButton command="admin.safety.take" className="dash-btn small danger" targetId={row.id} scope={row.zoneId} collection="incidents" patch={{ status: prepared.status }} entityState={row.status} sliceKey="safetyOps" value={prepared.book} expectedSliceRev={data.safety.value.draftRev} confirmTarget={false} disabled={!canSafety || Boolean(prepared.error)} title={!canSafety ? (ride ? tr("Only the safety team can take the case.") : tr("Only the safety team can take an SOS.")) : prepared.error} onDone={() => say(tr("You are working on the {0} from {1}.", [what, incident.who]))}>
            <Hand size={13} aria-hidden="true" /> {ride ? tr("Take case") : tr("Take SOS")}
          </CommandButton>
          {open}
        </div>
      );
    }
    const mine = owner === me;
    const prepared = safetyAction(data.safety.value, row, me, "resolve", note || "Solved from Alerts");
    return (
      <div className={compact ? "al-actions compact" : "al-actions"}>
        {mine && !compact ? <input className="al-note" aria-label={tr("Solved note")} maxLength={140} value={note} onChange={(event) => setNote(event.target.value)} placeholder={tr("What was done (optional)")} /> : null}
        {mine ? (
          <CommandButton command="admin.safety.resolve" className="dash-btn small" targetId={row.id} scope={row.zoneId} collection="incidents" patch={{ status: prepared.status }} entityState={row.status} sliceKey="safetyOps" value={prepared.book} expectedSliceRev={data.safety.value.draftRev} confirmTarget={false} disabled={Boolean(prepared.error)} title={prepared.error} onDone={() => { setNote(""); say(tr("{0} from {1} solved by {2}.", [ride ? "Ride check" : "SOS", incident.who, agentName(me)])); }}>{trn("{0} Solved", <CheckCircle2 size={13} aria-hidden="true" />)}</CommandButton>
        ) : <span className="al-locked">{trn("Only {0} can solve it", agentName(owner))}</span>}
        {open}
      </div>
    );
  }

  const taken = takeAlert(book, alert, me, at);
  const done = doneAlert(book, alert, me, note, at);
  const snoozed = snoozeAlert(book, alert, me, snooze, at);
  const passed = passAlert(book, alert, me, passTo, at);
  const mine = alert.owner === me;
  const other = alert.owner && !mine;
  const common = { confirmTarget: false, scope: alert.zoneId ?? "all", expectedSliceRev: book.draftRev, sliceKey: ALERTS_KEY } as const;

  return (
    <div className={compact ? "al-actions compact" : "al-actions"}>
      {!alert.owner ? (
        <CommandButton command="admin.alerts.take" className="dash-btn small" targetId={alert.id} before="new" after={`taken by ${me}`} value={taken.book} disabled={Boolean(taken.error)} title={taken.error} {...common} onDone={() => say(tr("You are working on: {0}.", [trx(alert.title)]))}>{trn("{0} Take it", <Hand size={13} aria-hidden="true" />)}</CommandButton>
      ) : null}
      {other ? <span className="al-locked">{trn("Only {0} can solve it", agentName(alert.owner))}</span> : null}
      {mine && !compact ? <input className="al-note" aria-label={tr("Solved note")} maxLength={140} value={note} onChange={(event) => setNote(event.target.value)} placeholder={tr("What was done (optional)")} /> : null}
      {mine ? (
        <CommandButton command="admin.alerts.done" className="dash-btn small" targetId={alert.id} before={`taken by ${me}`} after={`solved by ${me}`} value={done.book} disabled={Boolean(done.error)} title={done.error} {...common} onDone={() => { setNote(""); say(tr("Solved by {0}: {1}.", [agentName(me), trx(alert.title)])); }}>{trn("{0} Solved", <CheckCircle2 size={13} aria-hidden="true" />)}</CommandButton>
      ) : null}
      {!compact && extras.snooze && !other ? (
        <span className="al-extra">
          <select aria-label={tr("Snooze for")} value={snooze} onChange={(event) => setSnooze(Number(event.target.value))}>{[10, 30, 60, 240].map((value) => <option key={value} value={value}>{value < 60 ? tr("{0} min", [value]) : tr("{0} h", [value / 60])}</option>)}</select>
          <CommandButton command="admin.alerts.snooze" className="dash-btn small ghost" targetId={alert.id} before={alert.status} after={`snoozed ${snooze} min`} value={snoozed.book} disabled={Boolean(snoozed.error)} title={snoozed.error} {...common} onDone={() => say(tr("Snoozed for {0} min.", [snooze]))}>{trn("{0} Snooze", <TimerReset size={13} aria-hidden="true" />)}</CommandButton>
        </span>
      ) : null}
      {!compact && extras.pass && !other ? (
        <span className="al-extra">
          <select aria-label={tr("Pass to")} value={passTo} onChange={(event) => setPassTo(event.target.value)}>
            <option value="">{tr("Pass to…")}</option>
            {AGENTS.filter((item) => item.active && item.id !== me).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <CommandButton command="admin.alerts.pass" className="dash-btn small ghost" targetId={alert.id} before={alert.owner ?? "new"} after={`passed to ${passTo}`} value={passed.book} disabled={!passTo || Boolean(passed.error)} title={passed.error} {...common} onDone={() => { say(tr("Passed to {0}.", [agentName(passTo)])); setPassTo(""); }}>{trn("{0} Pass", <Send size={13} aria-hidden="true" />)}</CommandButton>
        </span>
      ) : null}
      {!compact && extras.mute ? (
        <CommandButton command="admin.alerts.mute" className="dash-btn small ghost" targetId={alert.kind} confirmTarget={false} scope="all" before="on" after="muted 60 min" expectedSliceRev={book.draftRev} sliceKey={ALERTS_KEY} value={muteKind(book, alert.kind, me, 60, at)} onDone={() => say(tr("This kind of alert is muted for 60 min."))}>{trn("{0} Mute 1 h", <BellOff size={13} aria-hidden="true" />)}</CommandButton>
      ) : null}
      {extras.fixLink ? <Link className="dash-btn small ghost" to={alert.path}>{trn("{0} Open", <ExternalLink size={13} aria-hidden="true" />)}</Link> : null}
    </div>
  );
}
