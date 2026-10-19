import { useState } from "react";
import { CalendarClock, CheckCheck, FileDown, Hand, PauseCircle, RefreshCcw, Zap } from "lucide-react";
import type { DemoRecord } from "../api/seed";
import { useSession } from "../auth/SessionContext";
import { AGENTS, can } from "../auth/permissions";
import { Card, Choice, Num, Row } from "../dispatch/fields";
import { market, type MarketId } from "../markets/markets";
import { logExport } from "../reports/activityLog";
import { CommandButton } from "../ui/CommandButton";
import { FieldErrorScope, useFieldErrors } from "../ui/fieldErrors";
import {
  PAYOUT_OPS_KEY,
  WEEKDAYS,
  approveRun,
  bankFile,
  failedOf,
  holdOf,
  payoutLines,
  retryPayout,
  runApproved,
  runNeedsApproval,
  scheduleError,
  scheduleLine,
  setHold,
  type FileRow,
  type PayoutOps,
  type Schedule,
} from "./runs";
import type { CurrencyCode } from "../domain/money";

const agentName = (id: string) => AGENTS.find((item) => item.id === id)?.name ?? id;

/** The run at the top: total, drivers, next date, approval by a second admin, and the bank file. */
export function RunCard({ run, rows, ops, country, next, money, fileRows, startedBy, currency }: { run: string; rows: readonly DemoRecord[]; ops: PayoutOps; country: MarketId; next: string; money: (minor: number) => string; fileRows: FileRow[]; startedBy: string; currency: CurrencyCode }) {
  const { agent } = useSession();
  const sched = ops.schedules[country];
  const total = rows.reduce((sum, row) => sum + (row.fareOre ?? 0), 0);
  const needs = runNeedsApproval(total, country, sched);
  const approved = runApproved(ops, run);
  const approve = approveRun(ops, run, agent?.id ?? "", new Date().toISOString(), startedBy);
  const held = rows.filter((row) => holdOf(ops, row.id)).length;
  const failed = rows.filter((row) => failedOf(ops, row)).length;
  function download() {
    const blob = new Blob([bankFile(fileRows, currency)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `movera-payouts-${country}-${next.slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
    logExport(agent?.id, `Payout bank file ${country} (${fileRows.length} payouts)`);
  }
  return (
    <section className="po-run" aria-label="Next payout run">
      <span className="po-run-icon" aria-hidden="true"><CalendarClock size={26} /></span>
      <span className="po-run-text">
        <b>Next run {next}</b>
        <small>{scheduleLine(sched)} · {rows.length} payouts · {money(total)}{held ? ` · ${held} on hold` : ""}{failed ? ` · ${failed} failed` : ""}</small>
        <small>{needs ? (approved ? `Approved by ${agentName(approved.by)}` : `Over ${money(sched.approvalOverMajor * market(country).minorUnits)}: a second admin must approve the run.`) : "Small enough to go without a second admin."}</small>
      </span>
      {needs && !approved ? (
        <CommandButton command="admin.payout.approveRun" className="dash-btn small" sliceKey={PAYOUT_OPS_KEY} value={approve.ops} expectedSliceRev={ops.draftRev} targetId={run} confirmTarget={false} before="waiting" after="approved" disabled={Boolean(approve.error) || !(agent && can(agent.role, "approval.decide"))} title={approve.error}><CheckCheck size={13} aria-hidden="true" /> Approve run</CommandButton>
      ) : null}
      <button data-command="admin.payout.bankFile" type="button" className="dash-btn small ghost" disabled={!fileRows.length || (needs && !approved)} title={needs && !approved ? "Approve the run first." : !fileRows.length ? "No payout is ready." : undefined} onClick={download}><FileDown size={13} aria-hidden="true" /> Bank file ({fileRows.length})</button>
    </section>
  );
}

/** One payout explained line by line, with hold and retry. */
export function PayoutLines({ record, fleet, ops, country, money, onNotice, cash }: { record: DemoRecord; fleet: boolean; ops: PayoutOps; country: MarketId; money: (minor: number) => string; onNotice: (text: string) => void; cash?: { minor: number; trips: number } }) {
  const { agent } = useSession();
  const [reason, setReason] = useState("");
  const sched = ops.schedules[country];
  const { lines, instant } = payoutLines(record, fleet, sched, cash);
  const hold = holdOf(ops, record.id);
  const failed = failedOf(ops, record);
  const next = setHold(ops, record.id, !hold, hold ? "Released" : reason, agent?.id ?? "", new Date().toISOString());
  return (
    <section className="fn-section po-lines" aria-label="Line by line">
      <h3><Hand size={16} aria-hidden="true" /> {record.id} line by line {instant ? <span className="dx-tag"><Zap size={11} aria-hidden="true" /> Instant cash-out</span> : null}</h3>
      <ul className="po-line-list">
        {lines.map((line) => <li key={line.label} className={line.kind} title={line.help}><span>{line.label}</span><b>{line.kind === "minus" ? `− ${money(Math.abs(line.minor))}` : money(line.minor)}</b></li>)}
      </ul>
      {hold ? <p className="fn-warn"><PauseCircle size={14} aria-hidden="true" /> On hold by {agentName(hold.by)}: {hold.reason}</p> : null}
      {failed ? <p className="fn-warn"><RefreshCcw size={14} aria-hidden="true" /> {failed}</p> : null}
      <div className="po-hold">
        {!hold ? <input aria-label="Hold reason" value={reason} placeholder="Why hold this payout?" onChange={(event) => setReason(event.target.value)} /> : null}
        <CommandButton command="admin.payout.hold" className={hold ? "dash-btn small" : "dash-btn small danger-ghost"} sliceKey={PAYOUT_OPS_KEY} value={next.ops} expectedSliceRev={ops.draftRev} targetId={record.id} confirmTarget={false} before={hold ? "held" : "free"} after={hold ? "released" : "held"} disabled={Boolean(next.error)} title={next.error} onDone={() => { setReason(""); onNotice(hold ? "Payout released." : "Payout on hold."); }}>{hold ? "Release payout" : "Hold payout"}</CommandButton>
        {failed ? <CommandButton command="admin.payout.retry" className="dash-btn small" sliceKey={PAYOUT_OPS_KEY} value={retryPayout(ops, record.id, agent?.id ?? "", new Date().toISOString())} expectedSliceRev={ops.draftRev} targetId={record.id} confirmTarget={false} before="failed" after="retried" disabled={!sched.retryFailed} title={sched.retryFailed ? undefined : "Retries are off in the schedule."} onDone={() => onNotice("Payout sent again.")}><RefreshCcw size={13} aria-hidden="true" /> Retry payout</CommandButton> : null}
      </div>
    </section>
  );
}

/** The schedule per country: when, instant cash-out, approval and the fleet owner part. */
export function ScheduleView({ ops, country, editable }: { ops: PayoutOps; country: MarketId; editable: boolean }) {
  const [draft, setDraft] = useState<Schedule | null>(null);
  const fieldErrors = useFieldErrors();
  const saved = ops.schedules[country];
  const current = draft ?? saved;
  const dirty = Boolean(draft) && JSON.stringify(draft) !== JSON.stringify(saved);
  const error = scheduleError(current);
  const symbol = { SE: "kr", FR: "€", TN: "DT" }[country];
  const patch = (next: Partial<Schedule>) => setDraft({ ...current, ...next });
  return (
    <FieldErrorScope value={fieldErrors.report}>
    <div className="fn-settings">
      {!editable ? <p className="dx-readonly">Only admins who approve money can change the schedule.</p> : null}
      <fieldset className="fn-fieldset" disabled={!editable}>
        <Card title="When drivers get paid" icon={<CalendarClock size={18} />} tone="blue" help={scheduleLine(current)}>
          <Row label="How often">
            <Choice label="Payout frequency" value={current.every} options={[{ id: "weekly", label: "Every week" }, { id: "daily", label: "Every day" }]} onChange={(every) => patch({ every })} />
          </Row>
          {current.every === "weekly" ? (
            <Row label="Day">
              <select aria-label="Payout day" value={current.weekday} onChange={(event) => patch({ weekday: Number(event.target.value) })}>{WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}</select>
            </Row>
          ) : null}
          <Row label="Time" help="In the country's time.">
            <input aria-label="Payout time" type="time" value={current.time} onChange={(event) => patch({ time: event.target.value })} />
          </Row>
          <Row label="Retry failed payouts" help="Admins can send a payout again after the bank returned it." on={current.retryFailed} onToggle={(on) => patch({ retryFailed: on })} />
        </Card>
        <Card title="Instant cash-out" icon={<Zap size={18} />} tone="orange" help="Drivers can take their money before the run, for a fee.">
          <Row label="Instant cash-out" on={current.instant.on} onToggle={(on) => patch({ instant: { ...current.instant, on } })}>
            <Num label="Cash-out fee" before="Fee" value={current.instant.feePct} unit="%" step={0.1} max={10} onChange={(value) => patch({ instant: { ...current.instant, feePct: value } })} />
            <Num label="Smallest cash-out" before="From" value={current.instant.minMajor} unit={symbol} onChange={(value) => patch({ instant: { ...current.instant, minMajor: value } })} />
          </Row>
        </Card>
        <Card title="Checks" icon={<CheckCheck size={18} />} tone="green">
          <Row label="Second admin for big runs" help="A run above this total waits until another admin approves it.">
            <Num label="Approval over" before="Over" value={current.approvalOverMajor} unit={symbol} onChange={(value) => patch({ approvalOverMajor: value })} />
          </Row>
          <Row label="Fleet owner part" help="What a fleet owner gets from their drivers' rides, after commission.">
            <Num label="Fleet owner part" value={current.fleetPct} unit="%" max={50} onChange={(value) => patch({ fleetPct: value })} />
          </Row>
        </Card>
      </fieldset>
      {editable ? (
        <div className="dx-publish">
          <span className="dx-publish-text"><b>{dirty ? "Changes not saved" : "Everything is saved"}</b><small>{fieldErrors.first ?? error ?? "Applies from the next run."}</small></span>
          <button data-command="admin.payout.view" type="button" className="dash-btn small ghost" disabled={!dirty} onClick={() => setDraft(null)}>Undo changes</button>
          <CommandButton command="admin.payout.schedule" className="dash-btn small" targetId={`payout schedule ${country}`} scope="all" confirmTarget={false} before={scheduleLine(saved)} after={scheduleLine(current)} sliceKey={PAYOUT_OPS_KEY} value={{ ...ops, draftRev: ops.draftRev + 1, schedules: { ...ops.schedules, [country]: current } }} expectedSliceRev={ops.draftRev} disabled={!dirty || Boolean(error) || fieldErrors.count > 0} title={fieldErrors.first ?? error ?? undefined} onDone={() => setDraft(null)}>Save schedule</CommandButton>
        </div>
      ) : null}
    </div>
    </FieldErrorScope>
  );
}
