import { useState } from "react";
import { NotFoundRecord } from "../ui/NotFoundRecord";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, BarChart3, History, KeyRound, ShieldCheck } from "lucide-react";
import { useAudit } from "../api/hooks";
import { ROLE_LABELS, can } from "../auth/permissions";
import { useSession } from "../auth/SessionContext";
import { Card } from "../dispatch/fields";
import { RESULT_LABEL, changeOf } from "../platform/audit";
import { PERMISSION_GROUPS, TEAM_OPS_KEY, permissionsOf, placeOf } from "../platform/team";
import { NotEnforced, useTeamOps } from "../platform/TeamParts";
import { CommandButton } from "../ui/CommandButton";
import { tr, trn, trx } from "../i18n";

/** One admin: who they are, what their role lets them do, where they work, and what they did lately. */
export function AdminPage() {
  const { adminId } = useParams();
  const navigate = useNavigate();
  const session = useSession();
  const agent = session.agents.find((item) => item.id === adminId);
  const audit = useAudit();
  const { slice, ops } = useTeamOps();
  const [custom, setCustom] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const editable = Boolean(session.agent && can(session.agent.role, "team.edit"));
  if (!agent) {
    return <NotFoundRecord kind="Admin" id={adminId} list="/team" back={tr("Back to the team")} />;
  }
  const assigned = custom ?? ops.assigned[agent.id] ?? "";
  const customRole = ops.customRoles.find((item) => item.id === assigned);
  const allowed = customRole ? customRole.permissions : permissionsOf(agent.role);
  const recent = (audit.data ?? []).filter((row) => row.actorId === agent.id).slice(0, 12);
  const nextAssigned = Object.fromEntries(Object.entries({ ...ops.assigned, [agent.id]: assigned }).filter(([, id]) => id));
  return (
    <div className="dx-page pl-page">
      <div className="page-heading">
        <div className="pl-head">
          <button data-command="admin.team.view" type="button" className="dash-btn ghost dx-back" onClick={() => (globalThis.history.length > 1 ? navigate(-1) : navigate("/team"))}><ArrowLeft size={16} aria-hidden="true" />{" "}{tr("Back")}</button>
          <span className={`pl-avatar big ${agent.presence}`} aria-hidden="true">{agent.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>
          <div>
            <h2>{agent.name}</h2>
            <p>{agent.email} · {trx(ROLE_LABELS[agent.role])}{customRole ? ` · ${customRole.name}` : ""} · {placeOf(agent.scope)} · {agent.active ? trx(agent.presence) : tr("deactivated")}</p>
          </div>
        </div>
        <Link className="dash-btn small" to={`/reports?tab=work&admin=${agent.id}`}><BarChart3 size={14} aria-hidden="true" />{" "}{tr("All their work in Reports")}</Link>
      </div>
      {notice ? <p role="status" className="pl-status">{notice}</p> : null}
      <div className="pl-two">
        <Card title={tr("Role")} icon={<ShieldCheck size={15} />} tone="purple" help={tr("A custom role is saved for the backend. Change the built-in role on the Team page.")}>
          <label className="pl-field"><span>{tr("Custom role")}</span>
            <select aria-label={tr("Custom role")} value={assigned} disabled={!editable} onChange={(e) => setCustom(e.target.value)}>
              <option value="">{trn("None, use {0}", trx(ROLE_LABELS[agent.role]))}</option>
              {ops.customRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
            </select>
          </label>
          <div className="actions">
            <CommandButton command="admin.team.assign" confirmTarget={false} className="dash-btn small" sliceKey={TEAM_OPS_KEY} value={{ ...ops, draftRev: ops.draftRev + 1, assigned: nextAssigned }} expectedSliceRev={ops.draftRev} targetId={agent.id} disabled={!editable || custom === null || slice.loading} onDone={() => { setCustom(null); setNotice(assigned ? tr("{0} now has {1}.", [agent.name, customRole?.name ?? "the custom role"]) : tr("{0} uses {1} again.", [agent.name, trx(ROLE_LABELS[agent.role])])); }}>{tr("Save role")}</CommandButton>
          </div>
          <p className="pl-help"><KeyRound size={12} aria-hidden="true" />{" "}{trn("2-step code {0} for this role. Sign out after {1}.", ops.security.twoStep[agent.role] ? tr("on") : tr("off"), ops.security.idle.on ? tr("{0} min idle", [ops.security.idle.minutes]) : tr("never"))}</p>
          <NotEnforced>{tr("The custom role, the 2-step setting and the idle time are saved for the backend. In the demo {0} keeps the permissions of {1}, always gets the code and is signed out after 15 minutes.", [agent.name, trx(ROLE_LABELS[agent.role])])}</NotEnforced>
        </Card>
        <Card title={tr("Can do")} icon={<KeyRound size={15} />} tone="green" help={tr("{0} permissions.", [allowed.length])}>
          <div className="pl-can">
            {PERMISSION_GROUPS.map((group) => (
              <section key={group.label} aria-label={tr("{0} permissions", [trx(group.label)])}>
                <h4>{trx(group.label)}</h4>
                <ul>{group.items.map((item) => <li key={item.id} className={allowed.includes(item.id) ? "yes" : "no"}>{trx(item.label)}</li>)}</ul>
              </section>
            ))}
          </div>
        </Card>
      </div>
      <Card title={tr("Lately")} icon={<History size={15} />} tone="blue" help={tr("Their last recorded actions. The full list is in Audit and in Reports.")}>
        {recent.length ? (
          <ol className="pl-log" aria-label={tr("Recent actions")}>
            {recent.map((row) => (
              <li key={row.id} className={`pl-log-row ${row.result}`}>
                <span className="pl-log-line">
                  <time dateTime={row.at}>{new Date(row.at).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}</time>
                  <span className="pl-what">{trn("{0} on {1}{2}", <b>{row.action}</b>, row.targetId || "—", changeOf(row) ? <small className="pl-change">{changeOf(row)}</small> : null)}</span>
                  <span className={`pl-result ${row.result}`}>{RESULT_LABEL[row.result] ?? row.result}</span>
                </span>
              </li>
            ))}
          </ol>
        ) : <p className="dx-calm">{tr("No recorded actions yet.")}</p>}
        <Link to={`/audit`}>{tr("Open the audit")}</Link>
      </Card>
    </div>
  );
}
