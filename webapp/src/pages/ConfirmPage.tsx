import { useState } from "react";
import { formatCurrencyMoney } from "../markets/markets";
import { commandById } from "../commands/registry";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, Banknote, CheckCircle2, ClipboardList, Settings2 } from "lucide-react";
import { emptyConfig, normalizeConfig, useApprovals, useSlice, type ConfigBook } from "../api/hooks";
import { useSession } from "../auth/SessionContext";
import { can } from "../auth/permissions";
import { OPEN_VALUES } from "../config/confirm";
import { CONFIRM_OPS_KEY, decisionError, emptyConfirmOps, inboxItems, normalizeConfirmOps, type ConfirmOps, type InboxKind } from "../platform/inbox";
import { Cards } from "../reports/ui";
import { CommandButton } from "../ui/CommandButton";
import { tr, trn, trx } from "../i18n";

const KIND_LABEL: Record<InboxKind, string> = { money: "Money", settings: "Settings", value: "Product value" };

export function ConfirmPage() {
  const { agent } = useSession();
  const navigate = useNavigate();
  const approvals = useApprovals();
  const config = normalizeConfig(useSlice<ConfigBook>("config", emptyConfig()).value);
  const slice = useSlice<ConfirmOps>(CONFIRM_OPS_KEY, emptyConfirmOps());
  const ops = normalizeConfirmOps(slice.value);
  const [kind, setKind] = useState<InboxKind | "all">("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState("");
  const me = agent?.id ?? "";
  const canDecide = Boolean(agent && can(agent.role, "approval.decide"));
  // A decider must also be allowed to do the action itself (the server checks it too).
  const canDo = (approvalId: string) => {
    const action = (approvals.data ?? []).find((row) => row.id === approvalId)?.action;
    return Boolean(agent && action && can(agent.role, commandById(action)?.permission ?? "*"));
  };
  const canConfirm = Boolean(agent && can(agent.role, "settings.publish"));
  const items = inboxItems({ approvals: approvals.data ?? [], config, values: OPEN_VALUES, decisions: ops.values, me, money: formatCurrencyMoney });
  const work = items.filter((item) => item.kind !== "value");
  const shown = (kind === "all" ? work : items.filter((item) => item.kind === kind));
  const confirmed = OPEN_VALUES.filter((item) => ops.values[item.id]).length;
  const error = editing ? decisionError(value) : null;

  function start(id: string, today: string) {
    setEditing(id);
    setValue(ops.values[id]?.value ?? today);
    setNote(ops.values[id]?.note ?? "");
  }

  return (
    <div className="dx-page pl-page">
      <div className="page-heading">
        <div className="pl-head">
          <button data-command="admin.inbox.view" type="button" className="dash-btn ghost dx-back" onClick={() => (globalThis.history.length > 1 ? navigate(-1) : navigate("/"))}><ArrowLeft size={16} aria-hidden="true" />{" "}{tr("Back")}</button>
          <div>
            <h2>{tr("To confirm")}</h2>
            <p>{tr("Values the product owner has not confirmed. Today’s number is the demo default, not a second policy.")}</p>
          </div>
        </div>
      </div>
      {notice ? <p role="status" className="pl-status">{notice}</p> : null}

      <Cards
        compare={false}
        compareLabel=""
        fmt={(n) => String(n)}
        cards={[
          { id: "money", label: "Money to approve", value: items.filter((item) => item.kind === "money").length, previous: null, format: "count", info: "Refunds and other money actions that need a second admin." },
          { id: "settings", label: "Settings to approve", value: items.filter((item) => item.kind === "settings").length, previous: null, format: "count", info: "A settings draft waiting for approval or publishing." },
          { id: "open", label: "Values to confirm", value: OPEN_VALUES.length - confirmed, previous: null, format: "count", info: "Product values nobody has confirmed yet." },
          { id: "done", label: "Values confirmed", value: confirmed, previous: null, format: "count", info: "Values a product owner has confirmed, with who and when." },
        ]}
      />

      <section className="panel pl-inbox" aria-label={tr("Waiting for you")}>
        <h3><ClipboardList size={15} aria-hidden="true" />{" "}{tr("Waiting for a decision")}</h3>
        <div className="pl-chips" role="group" aria-label={tr("Kind")}>
          {(["all", "money", "settings", "value"] as const).map((id) => <button data-command="admin.inbox.view" key={id} type="button" aria-pressed={kind === id} className={kind === id ? "pl-chip on" : "pl-chip"} onClick={() => setKind(id)}>{id === "all" ? tr("Approvals") : KIND_LABEL[id]} <small>{id === "all" ? work.length : items.filter((item) => item.kind === id).length}</small></button>)}
        </div>
        {shown.length ? (
          <ul className="pl-inbox-list" aria-label={tr("Inbox")}>
            {shown.map((item) => (
              <li key={item.id} className={`pl-inbox-row ${item.kind}`}>
                <span className="pl-inbox-icon" aria-hidden="true">{item.kind === "money" ? <Banknote size={15} /> : item.kind === "settings" ? <Settings2 size={15} /> : <CheckCircle2 size={15} />}</span>
                <span className="pl-inbox-text"><b>{trx(item.title)}</b><small>{trx(item.detail)}{item.by ? tr(" · asked by {0}", [item.by]) : ""}</small></span>
                <span className="actions">
                  {item.kind === "money" ? (
                    <>
                      <CommandButton command="admin.approval.approve" className="dash-btn small" type="button" targetId={item.id} confirmTarget={false} before="pending" after="approved" disabled={item.mine || !canDecide || !canDo(item.id)} title={item.mine ? tr("The requester cannot approve their own action.") : !canDo(item.id) ? tr("Your role cannot do this action, so it cannot approve it.") : undefined}>{tr("Approve")}</CommandButton>
                      <CommandButton command="admin.approval.reject" className="dash-btn small ghost" type="button" targetId={item.id} confirmTarget={false} before="pending" after="rejected" disabled={item.mine || !canDecide || !canDo(item.id)} title={item.mine ? tr("The requester cannot decide their own action.") : !canDo(item.id) ? tr("Your role cannot do this action, so it cannot decide it.") : undefined}>{tr("Reject")}</CommandButton>
                    </>
                  ) : null}
                  {item.kind === "value" ? <button data-command="admin.inbox.view" type="button" className="dash-btn small" disabled={!canConfirm} onClick={() => { start(item.id, OPEN_VALUES.find((row) => row.id === item.id)?.today ?? ""); document.getElementById(`value-${item.id}`)?.scrollIntoView({ block: "center" }); }}>{tr("Confirm")}</button> : null}
                  <Link className="dash-btn small ghost" to={item.link}>{tr("Open")}</Link>
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="dx-calm">{tr("Nothing is waiting. Good work.")}</p>}
      </section>

      <section className="panel pl-values" aria-label={tr("Product values")}>
        <h3>{tr("Product values")}</h3>
        <p className="pl-help">{tr("Confirm a value to record who decided it and when. The setting itself is changed in its own section.")}</p>
        <div className="field-grid">
          {OPEN_VALUES.map((item) => {
            const decision = ops.values[item.id];
            return (
              <div className="confirm-field pl-value" key={item.id} id={`value-${item.id}`}>
                <label>
                  {trx(item.label)}
                  <input readOnly value={item.today} />
                </label>
                {item.link ? <Link className="link-action" to={item.link}>{item.link.startsWith("/dispatch") ? tr("Open in Dispatch") : tr("Open")}</Link> : null}
                {decision ? <span className="pl-confirmed">{trn("Confirmed: {0} · {1} · {2}{3}", decision.value, decision.by, decision.at.slice(0, 10), decision.note ? ` · ${decision.note}` : "")}</span> : <span className="badge-amber">{tr("To confirm")}</span>}
                {editing === item.id ? (
                  <div className="pl-value-edit">
                    <input aria-label={tr("Value to confirm")} value={value} onChange={(e) => setValue(e.target.value)} />
                    <input aria-label={tr("Note for the team")} placeholder={tr("Why, or where it was decided")} value={note} onChange={(e) => setNote(e.target.value)} />
                    {error ? <small role="alert" className="pl-warn">{error}</small> : null}
                    <span className="actions">
                      <CommandButton command="admin.inbox.value" confirmTarget={false} className="dash-btn small" sliceKey={CONFIRM_OPS_KEY} value={{ ...ops, draftRev: ops.draftRev + 1, values: { ...ops.values, [item.id]: { value: value.trim(), note: note.trim(), by: me, at: new Date().toISOString() } } }} expectedSliceRev={ops.draftRev} targetId={item.id} disabled={Boolean(error) || slice.loading} onDone={() => { setEditing(null); setNotice(tr("{0} confirmed.", [item.label])); }}>{tr("Save confirmation")}</CommandButton>
                      <button data-command="admin.inbox.view" type="button" className="dash-btn small ghost" onClick={() => setEditing(null)}>{tr("Cancel")}</button>
                    </span>
                  </div>
                ) : canConfirm ? <button data-command="admin.inbox.view" type="button" className="dash-btn small ghost" aria-label={tr("Confirm {0}", [item.id])} onClick={() => start(item.id, item.today)}>{decision ? tr("Change") : tr("Confirm")}</button> : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
