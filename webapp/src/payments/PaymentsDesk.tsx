import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { AlertTriangle, CheckCircle2, Clock3, CreditCard, Gavel, Layers, RefreshCcw, RotateCcw, ShieldAlert, Undo2 } from "lucide-react";
import { useRecords, useSlice } from "../api/hooks";
import type { DemoRecord } from "../api/seed";
import { useSession } from "../auth/SessionContext";
import { ROLE_LABELS, can, type Role } from "../auth/permissions";
import { Card, Num, Row } from "../dispatch/fields";
import { formatMoney, formatZoneMoney, marketOfZone, zoneById } from "../markets/markets";
import { useMarketScope } from "../markets/useMarketScope";
import { Bars, Cards, SortTable } from "../reports/ui";
import { CommandButton } from "../ui/CommandButton";
import { DataTable } from "../ui/DataTable";
import { METHOD_LABELS, PAY_GROUPS, PAY_OPS_KEY, answerDispute, byMethod, emptyPayOps, factsOf, normalizePayOps, payRulesError, paySplit, retry, retryPlan, type PayFacts, type PayGroup, type PayOps, type PayRules } from "./desk";
import { tr, trn, uiLocale, trx } from "../i18n";

const GROUP_ICON: Record<PayGroup, ReactNode> = { all: <Layers size={16} />, paid: <CheckCircle2 size={16} />, failed: <AlertTriangle size={16} />, refunded: <Undo2 size={16} />, disputed: <Gavel size={16} />, waiting: <Clock3 size={16} /> };
const GROUP_TONE: Record<PayGroup, string> = { all: "blue", paid: "green", failed: "red", refunded: "orange", disputed: "violet", waiting: "grey" };

/** The new payment tabs. The old methods, vouchers, reconciliation and bank tools stay in their own tab. */

/** A payment row in its own currency (its zone's); without a known zone, the chosen country's. Totals stay in the chosen country's. */
function zoneMoney(money: (minor: number) => string, minor: number, zoneId: string): string {
  return zoneId && marketOfZone(zoneId) ? formatZoneMoney(minor, zoneId) : money(minor);
}
export function PaymentsDesk({ tab, rows, loading }: { tab: "payments" | "failed" | "disputes" | "numbers" | "rules"; rows: readonly DemoRecord[]; loading: boolean }) {
  const { agent } = useSession();
  const scope = useMarketScope();
  const country = scope.market.id;
  const riders = useRecords("riders", null);
  const trips = useRecords("trips", null);
  const slice = useSlice<PayOps>(PAY_OPS_KEY, emptyPayOps());
  const ops = normalizePayOps(slice.value);
  const [now] = useState(() => Date.now());
  const facts = useMemo(() => rows.map((row) => factsOf(row, riders.data ?? [], trips.data ?? [], ops, now)), [rows, riders.data, trips.data, ops, now]);
  const money = (minor: number) => formatMoney(minor, country);
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (loading) return <p className="state-line">{tr("Loading payments.")}</p>;
  if (tab === "failed") return <Failed facts={facts} byId={byId} ops={ops} now={now} money={money} me={agent?.id ?? ""} locale={scope.market.locale} timeZone={scope.market.timeZone} />;
  if (tab === "disputes") return <Disputes facts={facts} ops={ops} now={now} money={money} me={agent?.id ?? ""} />;
  if (tab === "numbers") return <Numbers facts={facts} money={money} />;
  if (tab === "rules") return <Rules ops={ops} country={country} editable={Boolean(agent && can(agent.role, "approval.decide"))} />;
  return <List facts={facts} money={money} country={country} />;
}

function List({ facts, money, country }: { facts: readonly PayFacts[]; money: (minor: number) => string; country: "SE" | "FR" | "TN" }) {
  const navigate = useNavigate();
  const [group, setGroup] = useState<PayGroup>("all");
  const [method, setMethod] = useState("all");
  const shown = facts.filter((item) => (group === "all" || item.group === group) && (method === "all" || item.method === method));
  const paid = facts.filter((item) => item.group === "paid" || item.group === "disputed");
  const methods = [...new Set(facts.map((item) => item.method))];
  return (
    <div className="pm-tab">
      <Cards
        compare={false}
        compareLabel=""
        fmt={(value, format) => (format === "money" ? money(value) : format === "pct" ? `${value}%` : String(value))}
        cards={[
          { id: "count", label: tr("Payments"), value: facts.length, previous: null, format: "count", info: tr("Payments in the chosen country and zones.") },
          { id: "paid", label: tr("Money taken"), value: paid.reduce((sum, item) => sum + item.amount, 0), previous: null, format: "money", info: tr("Captured payments, before refunds.") },
          { id: "ok", label: tr("Success"), value: facts.length ? Math.round((paid.length / facts.length) * 100) : 0, previous: null, format: "pct", info: tr("Captured payments ÷ all payments.") },
          { id: "failed", label: tr("Failed"), value: facts.filter((item) => item.group === "failed").length, previous: null, format: "count", info: tr("Payments that did not go through. See Failed and retries."), goodDown: true },
          { id: "disputes", label: tr("Open disputes"), value: facts.filter((item) => item.group === "disputed").length, previous: null, format: "count", info: tr("Chargebacks waiting for an answer before the deadline."), goodDown: true },
        ]}
      />
      <nav className="fn-groups" aria-label={tr("Payment groups")}>
        {PAY_GROUPS.map((item) => (
          <button key={item.id} data-command="admin.payment.view" type="button" title={trx(item.help)} className={`fn-group ${GROUP_TONE[item.id]}${group === item.id ? " active" : ""}`} aria-pressed={group === item.id} onClick={() => setGroup(item.id)}>
            <span className="fn-group-icon" aria-hidden="true">{GROUP_ICON[item.id]}</span>
            <span className="fn-group-text"><b>{trx(item.label)}</b><small>{item.id === "all" ? facts.length : facts.filter((row) => row.group === item.id).length}</small></span>
          </button>
        ))}
      </nav>
      <section className="rp-bar" aria-label={tr("Payment filters")}>
        <select aria-label={tr("Payment method")} value={method} onChange={(event) => setMethod(event.target.value)}>
          <option value="all">{tr("All methods")}</option>
          {methods.map((item) => <option key={item} value={item}>{trx(METHOD_LABELS[item])}</option>)}
        </select>
        <small className="fn-help">{trn("Amounts in {0}. Click a payment to see who gets what and refund it.", country === "SE" ? "SEK" : country === "FR" ? "EUR" : "TND")}</small>
      </section>
      <DataTable
        head={[tr("Payment"), tr("Rider"), tr("Method"), tr("Status"), tr("Zone"), tr("Amount"), tr("Driver gets"), tr("Movera"), tr("Trip")]}
        rowIds={shown.map((item) => item.id)}
        rows={shown.map((item) => {
          const split = paySplit(item.amount, item.country, item.tripId);
          return [item.id, item.riderName, METHOD_LABELS[item.method], item.group === "disputed" ? "Disputed" : item.status, zoneById(item.zoneId)?.name ?? item.zoneId, zoneMoney(money, item.amount, item.zoneId), zoneMoney(money, split.driver, item.zoneId), zoneMoney(money, split.movera, item.zoneId), item.tripId ?? "–"];
        })}
        onRow={(index) => {
          const id = shown[index]?.id;
          if (id) navigate(`/payments/${id}`);
        }}
      />
    </div>
  );
}

function Failed({ facts, byId, ops, now, money, me, timeZone }: { facts: readonly PayFacts[]; byId: Map<string, DemoRecord>; ops: PayOps; now: number; money: (minor: number) => string; me: string; locale: string; timeZone: string }) {
  const failed = facts.filter((item) => item.group === "failed");
  const time = (iso: string) => new Intl.DateTimeFormat(uiLocale(), { timeZone, dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  const fails = new Map<string, number>();
  for (const item of failed) if (item.riderId) fails.set(item.riderId, (fails.get(item.riderId) ?? 0) + 1);
  return (
    <div className="pm-tab">
      <p className="dx-note">{tr("Failed payments are retried by themselves on the schedule in Rules. A rider who owes money above the limit cannot book until it is paid.")}</p>
      <ul className="pm-list" aria-label={tr("Failed payments")}>
        {failed.map((item) => {
          const record = byId.get(item.id);
          if (!record) return null;
          const plan = retryPlan(record, item, ops, now);
          const succeeds = plan.cause.kind === "system";
          return (
            <li key={item.id} className={plan.cause.kind}>
              <span className="pm-main">
                <b><Link to={`/payments/${item.id}`}>{item.id}</Link> · {zoneMoney(money, item.amount, item.zoneId)} · {trx(METHOD_LABELS[item.method])}</b>
                <small>{item.riderId ? <Link to={`/riders/${item.riderId}`}>{item.riderName}</Link> : item.riderName} · {plan.cause.kind === "system" ? tr("Our side") : tr("Rider's side")}: {plan.cause.reason}</small>
                <span className="pm-tags">
                  {Number.isFinite(plan.tries) ? <span className="dx-tag">{trn("Tried {0} of {1}", plan.tries, plan.max)}</span> : null}
                  {plan.nextAt ? <span className="dx-tag">{trn("Next try {0}", time(plan.nextAt))}</span> : <span className="dx-tag">{tr("No more automatic tries")}</span>}
                  {plan.owing ? <span className="dx-tag bad">{tr("Rider blocked until paid")}</span> : null}
                  {item.riderId && (fails.get(item.riderId) ?? 0) >= 2 ? <Link className="dx-tag bad" to="/risk?tab=flagged">{trn("{0} Check in Risk", <ShieldAlert size={11} aria-hidden="true" />)}</Link> : null}
                </span>
              </span>
              <CommandButton command="admin.payment.retry" className="dash-btn small" sliceKey={PAY_OPS_KEY} value={retry(ops, item.id, succeeds ? "paid" : "failed", me, new Date().toISOString())} expectedSliceRev={ops.draftRev} targetId={item.id} confirmTarget={false} before="failed" after={succeeds ? "captured" : "failed again"}>{trn("{0} Retry now", <RefreshCcw size={13} aria-hidden="true" />)}</CommandButton>
            </li>
          );
        })}
        {!failed.length ? <li className="dx-calm">{tr("No failed payments.")}</li> : null}
      </ul>
    </div>
  );
}

function Disputes({ facts, ops, now, money, me }: { facts: readonly PayFacts[]; ops: PayOps; now: number; money: (minor: number) => string; me: string }) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const list = facts.filter((item) => item.dispute);
  return (
    <div className="pm-tab">
      <p className="dx-note">{tr("The rider's bank asks for proof. Answer before the deadline or the money goes back to the rider. The trip page has the route, chat and calls to use as proof.")}</p>
      <ul className="pm-list" aria-label={tr("Disputes")}>
        {list.map((item) => {
          const dispute = item.dispute!;
          const days = Math.ceil((Date.parse(`${dispute.deadline}T23:59:59Z`) - now) / 86_400_000);
          const open = dispute.status === "open" || dispute.status === "evidence_sent";
          const note = notes[item.id] ?? "";
          const answer = (status: "evidence_sent" | "accepted" | "won" | "lost") => answerDispute(ops, item.id, status, status === "evidence_sent" ? note : note || status, me, new Date().toISOString());
          return (
            <li key={item.id} className={open ? (days <= 3 ? "late" : "open") : "done"}>
              <span className="pm-main">
                <b><Link to={`/payments/${item.id}`}>{item.id}</Link> · {zoneMoney(money, item.amount, item.zoneId)} · {dispute.reason}</b>
                <small>{item.riderName}{item.tripId ? <>{" "}{trn("· trip {0}", <Link to={`/trips/${item.tripId}`}>{item.tripId}</Link>)}</> : null} · {open ? tr("Answer by {0} ({1} day{2} left)", [dispute.deadline, days, days === 1 ? "" : "s"]) : tr("Closed: {0}", [dispute.status])}</small>
                <span className="pm-tags"><span className={`dx-tag ${dispute.status}`}>{dispute.status.replace("_", " ")}</span></span>
              </span>
              {open ? (
                <span className="pm-actions">
                  <input aria-label={tr("Proof for {0}", [item.id])} placeholder={tr("What you send to the bank")} value={note} onChange={(event) => setNotes({ ...notes, [item.id]: event.target.value })} />
                  {(["evidence_sent", "accepted", "won", "lost"] as const).map((status) => {
                    const result = answer(status);
                    return <CommandButton key={status} command="admin.payment.dispute" className={status === "evidence_sent" ? "dash-btn small" : "dash-btn small ghost"} sliceKey={PAY_OPS_KEY} value={result.ops} expectedSliceRev={ops.draftRev} targetId={item.id} confirmTarget={false} before={dispute.status} after={status} disabled={Boolean(result.error)} title={result.error}>{status === "evidence_sent" ? tr("Send proof") : status === "accepted" ? tr("Give the money back") : status === "won" ? tr("Mark won") : tr("Mark lost")}</CommandButton>;
                  })}
                </span>
              ) : null}
            </li>
          );
        })}
        {!list.length ? <li className="dx-calm">{tr("No disputes.")}</li> : null}
      </ul>
    </div>
  );
}

function Numbers({ facts, money }: { facts: readonly PayFacts[]; money: (minor: number) => string }) {
  const rows = byMethod(facts);
  return (
    <div className="pm-tab rp-grid">
      <section className="dash-card rp-panel" aria-label={tr("Money by method")}>
        <div className="card-head"><h3>{trn("{0} Money by method", <CreditCard size={16} aria-hidden="true" />)}</h3></div>
        <Bars rows={rows.map((row) => ({ label: row.label, value: row.amount, hint: `${row.count} payments` }))} format={money} />
      </section>
      <section className="dash-card rp-panel" aria-label={tr("Success by method")}>
        <div className="card-head"><h3>{trn("{0} Success by method", <CheckCircle2 size={16} aria-hidden="true" />)}</h3></div>
        <SortTable label={tr("Payment methods")} rowKey={(row) => row.method} columns={[
          { id: "method", label: tr("Method"), value: (row) => row.label },
          { id: "count", label: tr("Payments"), value: (row) => row.count, numeric: true },
          { id: "success", label: tr("Success"), value: (row) => row.success, show: (row) => `${row.success}%`, numeric: true },
          { id: "failed", label: tr("Failed"), value: (row) => row.failed, numeric: true },
          { id: "amount", label: tr("Money"), value: (row) => row.amount, show: (row) => money(row.amount), numeric: true },
        ]} rows={rows} initial="amount" />
      </section>
    </div>
  );
}

const LIMIT_ROLES: Role[] = ["support", "ops", "finance"];

function Rules({ ops, country, editable }: { ops: PayOps; country: "SE" | "FR" | "TN"; editable: boolean }) {
  const [draft, setDraft] = useState<PayRules | null>(null);
  const saved = ops.rules[country];
  const current = draft ?? saved;
  const dirty = Boolean(draft) && JSON.stringify(draft) !== JSON.stringify(saved);
  const error = payRulesError(current);
  const symbol = { SE: "kr", FR: "€", TN: "DT" }[country];
  const patch = (next: Partial<PayRules>) => setDraft({ ...current, ...next });
  const hours = Array.from({ length: current.retry.maxTries }, (_, index) => current.retry.afterHours[index] ?? (current.retry.afterHours.at(-1) ?? 24) * 2);
  return (
    <div className="fn-settings">
      {!editable ? <p className="dx-readonly">{tr("Only admins who approve money can change these rules.")}</p> : null}
      <fieldset className="fn-fieldset" disabled={!editable}>
        <Card title={tr("Retry failed payments")} icon={<RotateCcw size={18} />} tone="blue" help={tr("Failed payments are tried again by themselves.")}>
          <Row label={tr("Retry by themselves")} help={tr("Turn off to only retry by hand.")} on={current.retry.on} onToggle={(on) => patch({ retry: { ...current.retry, on } })}>
            <Num label={tr("Tries")} before="Tries" value={current.retry.maxTries} min={1} max={5} onChange={(value) => patch({ retry: { ...current.retry, maxTries: value } })} />
          </Row>
          {current.retry.on ? hours.map((value, index) => (
            <Row key={index} label={tr("Try {0}", [index + 1])} help={index === 0 ? tr("Hours after the payment failed.") : tr("Hours after it failed, not after the try before.")}>
              <Num label={tr("Try {0} after", [index + 1])} value={value} unit="h" min={1} max={240} onChange={(next) => patch({ retry: { ...current.retry, afterHours: hours.map((item, at) => (at === index ? next : item)) } })} />
            </Row>
          )) : null}
        </Card>
        <Card title={tr("Riders who owe money")} icon={<AlertTriangle size={18} />} tone="orange" help={tr("A rider with an unpaid ride above the amount cannot book until it is paid.")}>
          <Row label={tr("Block riders who owe money")} on={current.owing.on} onToggle={(on) => patch({ owing: { ...current.owing, on } })}>
            <Num label={tr("Owing over")} before="Over" value={current.owing.overMajor} unit={symbol} onChange={(value) => patch({ owing: { ...current.owing, overMajor: value } })} />
            <Num label={tr("Owing after days")} before="After" value={current.owing.afterDays} unit="days" onChange={(value) => patch({ owing: { ...current.owing, afterDays: value } })} />
          </Row>
        </Card>
        <Card title={tr("Refund limit per role")} icon={<Undo2 size={18} />} tone="green" help={tr("The biggest refund each role can give at all; above it, a role with a higher limit must do it. The Super admin has no limit. When a refund needs a second admin is one limit per country in Settings.")}>
          {LIMIT_ROLES.map((role) => (
            <Row key={role} label={trx(ROLE_LABELS[role])}>
              <Num label={tr("{0} refund limit", [trx(ROLE_LABELS[role])])} value={current.refundLimit[role] ?? 0} unit={symbol} onChange={(value) => patch({ refundLimit: { ...current.refundLimit, [role]: value } })} />
            </Row>
          ))}
        </Card>
      </fieldset>
      {editable ? (
        <div className="dx-publish">
          <span className="dx-publish-text"><b>{dirty ? tr("Changes not saved") : tr("Everything is saved")}</b><small>{error ?? tr("Rules apply to the whole country.")}</small></span>
          <button data-command="admin.payment.view" type="button" className="dash-btn small ghost" disabled={!dirty} onClick={() => setDraft(null)}>{tr("Undo changes")}</button>
          <CommandButton command="admin.payment.rules" className="dash-btn small" targetId={`payment rules ${country}`} scope="all" confirmTarget={false} before="saved" after="changed" sliceKey={PAY_OPS_KEY} value={{ ...ops, draftRev: ops.draftRev + 1, rules: { ...ops.rules, [country]: { ...current, retry: { ...current.retry, afterHours: hours } } } }} expectedSliceRev={ops.draftRev} disabled={!dirty || Boolean(error)} onDone={() => setDraft(null)}>{tr("Save payment rules")}</CommandButton>
        </div>
      ) : null}
    </div>
  );
}
