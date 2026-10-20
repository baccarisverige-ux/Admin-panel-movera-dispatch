import { useState } from "react";
import { Eye, Pencil, Plus, Trash2, Wand2 } from "lucide-react";
import { can, ROLE_LABELS, type Role } from "../auth/permissions";
import { useSession } from "../auth/SessionContext";
import { CommandButton } from "../ui/CommandButton";
import { Check, Choice, Num } from "../dispatch/fields";
import { useAlertsData } from "./AlertsContext";
import { agentName } from "./AlertActions";
import { ALERTS_KEY, LEVELS, METRICS, rulePreview, ruleIssues, type AlertRule, type Level, type Metric } from "./engine";
import { tr, trn, trx, trSentences } from "../i18n";

const ROLES = (Object.keys(ROLE_LABELS) as Role[]).filter((role) => role !== "super");

/** Your own alerts: when a number is above or below a limit for some minutes in a zone. */
export function RulesView() {
  const data = useAlertsData();
  const { agent } = useSession();
  const canManage = Boolean(agent && can(agent.role, "alerts.manage"));
  const [editing, setEditing] = useState<AlertRule | null>(null);
  const [notice, setNotice] = useState("");
  const rules = data.book.rules.filter((rule) => rule.country === data.market.id);
  const blank = (): AlertRule => ({ id: `AR-${Date.now().toString(36)}`, name: "", on: true, metric: "free_drivers", op: "below", value: 3, forMin: 10, zoneId: "all", level: "important", who: "all", country: data.market.id, by: agent?.id ?? "" });
  const zoneName = (id: string) => (id === "all" ? "every zone" : data.zones.find((zone) => zone.id === id)?.name ?? id);
  const sentence = (rule: AlertRule) => `When ${METRICS.find((item) => item.id === rule.metric)?.label.toLowerCase()} is ${rule.op} ${rule.value} for ${rule.forMin} min in ${zoneName(rule.zoneId)} → ${LEVELS.find((item) => item.id === rule.level)?.label}`;

  return (
    <div className="al-rules">
      <section className="dash-card" aria-labelledby="al-rules-title">
        <div className="card-head">
          <h3 id="al-rules-title">{trn("{0} Your own alerts in {1}", <Wand2 size={16} aria-hidden="true" />, trx(data.market.name))}</h3>
          <button data-command="admin.alerts.view" type="button" className="dash-btn small" disabled={!canManage} onClick={() => setEditing(blank())}>{trn("{0} New rule", <Plus size={13} aria-hidden="true" />)}</button>
        </div>
        <p className="dx-modal-help">{tr("For what is special to your business, like \"Arlanda below 3 free drivers\". Pick from the list: no formulas, nothing can break.")}</p>
        {notice ? <p className="pricing-notice" role="status">{trSentences(notice)}</p> : null}
        {rules.length === 0 ? <p className="dx-calm">{tr("No rule yet.")}</p> : (
          <ul className="al-rule-list" aria-label={tr("Your rules")}>
            {rules.map((rule) => {
              const preview = rulePreview(rule, data.facts);
              const toggled = { ...data.book, draftRev: data.book.draftRev + 1, rules: data.book.rules.map((item) => (item.id === rule.id ? { ...item, on: !item.on } : item)) };
              const removed = { ...data.book, draftRev: data.book.draftRev + 1, rules: data.book.rules.filter((item) => item.id !== rule.id) };
              return (
                <li key={rule.id} className={rule.on ? `al-rule ${rule.level}` : `al-rule ${rule.level} off`}>
                  <span className="al-rule-text"><b>{rule.name}</b><small>{sentence(rule)}</small><small>{trn("{0} · {1} times in the last 24 h · made by {2}", rule.who === "all" ? tr("Every admin") : rule.who.map((role) => ROLE_LABELS[role]).join(", "), preview.times, agentName(rule.by))}</small></span>
                  <CommandButton command="admin.alerts.rule" className={rule.on ? "surge-toggle on" : "surge-toggle"} targetId={rule.name} confirmTarget={false} scope="all" before={rule.on ? "on" : "off"} after={rule.on ? "off" : "on"} expectedSliceRev={data.book.draftRev} sliceKey={ALERTS_KEY} value={toggled} disabled={!canManage} aria-label={`${rule.name} ${rule.on ? "on" : "off"}`} onDone={() => setNotice(`Rule ${rule.name} switched ${rule.on ? "off" : "on"}.`)}>
                    {rule.on ? tr("On") : tr("Off")} <span className="switch" aria-hidden="true"><i /></span>
                  </CommandButton>
                  <button data-command="admin.alerts.view" type="button" className="dash-btn small ghost" disabled={!canManage} onClick={() => setEditing(rule)}>{trn("{0} Edit", <Pencil size={13} aria-hidden="true" />)}</button>
                  <CommandButton command="admin.alerts.rule" className="icon-ghost" targetId={rule.name} confirmTarget={false} scope="all" before="rule" after="removed" expectedSliceRev={data.book.draftRev} sliceKey={ALERTS_KEY} value={removed} disabled={!canManage} aria-label={tr("Remove {0}", [rule.name])} onDone={() => setNotice(`Rule ${rule.name} removed.`)}><Trash2 size={14} aria-hidden="true" /></CommandButton>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {editing ? (
        <section className="dash-card al-builder" aria-label={tr("Rule builder")}>
          <h3>{data.book.rules.some((rule) => rule.id === editing.id) ? tr("Change {0}", [editing.name]) : tr("New rule")}</h3>
          <label className="field">{trn("Rule name{0}", <input aria-label={tr("Rule name")} maxLength={50} value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} placeholder={tr("For example Arlanda short of drivers")} />)}</label>
          <div className="al-sentence" role="group" aria-label={tr("When")}>
            <b>{tr("When")}</b>
            <select aria-label={tr("Measure")} value={editing.metric} onChange={(event) => setEditing({ ...editing, metric: event.target.value as Metric })}>{METRICS.map((item) => <option key={item.id} value={item.id}>{trx(item.label)}</option>)}</select>
            <b>{tr("is")}</b>
            <Choice label={tr("Above or below")} value={editing.op} onChange={(op) => setEditing({ ...editing, op })} options={[{ id: "above", label: tr("above") }, { id: "below", label: tr("below") }]} />
            <Num label={tr("Rule number")} value={editing.value} unit={METRICS.find((item) => item.id === editing.metric)?.unit} min={0} max={1000} onChange={(value) => setEditing({ ...editing, value })} />
            <b>{tr("for")}</b>
            <Num label={tr("Rule minutes")} value={editing.forMin} unit="min" min={0} max={240} onChange={(forMin) => setEditing({ ...editing, forMin })} />
            <b>{tr("in")}</b>
            <select aria-label={tr("Rule zone")} value={editing.zoneId} onChange={(event) => setEditing({ ...editing, zoneId: event.target.value })}>
              <option value="all">{tr("Every zone")}</option>
              {data.zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
            </select>
          </div>
          <div className="al-sentence" role="group" aria-label={tr("Then")}>
            <b>{tr("Then")}</b>
            <Choice label={tr("Rule level")} value={editing.level} onChange={(level: Level) => setEditing({ ...editing, level })} options={LEVELS} />
            <b>{tr("for")}</b>
            <Choice label={tr("Rule who")} value={editing.who === "all" ? "all" : "some"} onChange={(value) => setEditing({ ...editing, who: value === "all" ? "all" : ["dispatcher"] })} options={[{ id: "all", label: tr("Every admin") }, { id: "some", label: tr("Some roles") }]} />
            {editing.who !== "all" ? <span className="zn-chips">{ROLES.map((role) => { const list = editing.who === "all" ? [] : editing.who; return <Check key={role} label={trx(ROLE_LABELS[role])} on={list.includes(role)} onChange={(on) => setEditing({ ...editing, who: on ? [...list, role] : list.filter((item) => item !== role) })} />; })}</span> : null}
          </div>
          {(() => {
            const preview = rulePreview(editing, data.facts);
            const issues = ruleIssues(editing);
            const exists = data.book.rules.some((rule) => rule.id === editing.id);
            const next = { ...data.book, draftRev: data.book.draftRev + 1, rules: exists ? data.book.rules.map((rule) => (rule.id === editing.id ? { ...editing, name: editing.name.trim() } : rule)) : [...data.book.rules, { ...editing, name: editing.name.trim() }] };
            return (
              <>
                <p className={preview.times > 20 ? "al-preview noisy" : "al-preview"} aria-label={tr("Preview")}>{trn("{0} This would have alerted {1} in the last 24 hours{2}.{3}", <Eye size={14} aria-hidden="true" />, <b>{trn("{0} time{1}", preview.times, preview.times === 1 ? "" : tr("s"))}</b>, preview.zones ? tr(", in {0} zone{1}", [preview.zones, preview.zones === 1 ? "" : "s"]) : "", preview.times > 20 ? tr(" That is a lot: try a higher limit or more minutes.") : "")}</p>
                {issues.length ? <p className="dx-issues" role="alert">{issues[0]}</p> : null}
                <div className="dx-modal-actions">
                  <button data-command="admin.alerts.view" type="button" className="dash-btn ghost" onClick={() => setEditing(null)}>{tr("Cancel")}</button>
                  <CommandButton command="admin.alerts.rule" className="dash-btn" targetId={editing.name.trim() || "rule"} confirmTarget={false} scope="all" before={exists ? "rule" : "none"} after={editing.on ? "on" : "off"} expectedSliceRev={data.book.draftRev} sliceKey={ALERTS_KEY} value={next} disabled={!canManage || Boolean(issues.length)} onDone={() => { setNotice(`Rule ${editing.name.trim()} saved.`); setEditing(null); }}>{tr("Save rule")}</CommandButton>
                </div>
              </>
            );
          })()}
        </section>
      ) : null}
    </div>
  );
}
