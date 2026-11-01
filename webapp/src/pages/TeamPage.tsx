import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, Search, Users } from "lucide-react";
import { useMarketScope } from "../markets/useMarketScope";
import { Cards } from "../reports/ui";
import { Card } from "../dispatch/fields";
import { LimitsView, RolesView, SecurityView, useTeamOps } from "../platform/TeamParts";
import { placeOf } from "../platform/team";
import {
  ROLE_LABELS,
  changeAgentRole,
  deactivateAgent,
  inviteAgent,
  reactivateAgent,
  resetAgentCode,
  setAgentPresence,
  type Role,
} from "../auth/permissions";
import { useSession } from "../auth/SessionContext";
import { can } from "../auth/permissions";
import { DataTable } from "../ui/DataTable";
import { CommandButton } from "../ui/CommandButton";
import { tr, trx } from "../i18n";
import { isLiveData } from "../live/realData";

const ROLES = Object.keys(ROLE_LABELS) as Role[];

function scopeLabel(zones: "all" | string[]): string {
  return zones === "all" ? tr("All zones") : zones.join(", ");
}

function AdminsTable() {
  const session = useSession();
  const actor = session.agent;
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("viewer");
  const [desiredRoles, setDesiredRoles] = useState<Record<string, Role>>({});
  const [notice, setNotice] = useState(() => (isLiveData() ? tr("Only your own admin account is shown. Inviting and changing other admins is not connected yet.") : tr("Role and scope changes take effect from the stored demo team record.")));

  if (!actor) return null;

  function apply(next: ReturnType<typeof deactivateAgent>, success: string) {
    if (!Array.isArray(next)) {
      setNotice(next.error);
      return;
    }
    session.setAgents(next);
    setNotice(success);
  }

  return (
    <>
      <p className="state-line">{notice}</p>

      <article className="panel">
        <h3>{tr("Invite agent")}</h3>
        <div className="field-grid">
          <label>{tr("Name")}<input value={inviteName} onChange={(event) => setInviteName(event.target.value)} />
          </label>
          <label>
            {tr("Email")}
            <input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} />
          </label>
          <label>{tr("Role")}<select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as Role)}>
              {ROLES.map((role) => <option key={role} value={role}>{trx(ROLE_LABELS[role])}</option>)}
            </select>
          </label>
        </div>
        <CommandButton
          command="admin.team.invite"
          className="primary-btn"
          type="button"
          onDone={() => {
            const next = inviteAgent(session.agents, { name: inviteName, email: inviteEmail, role: inviteRole }, actor);
            if (!Array.isArray(next)) {
              setNotice(next.error);
              return;
            }
            session.setAgents(next);
            setInviteName("");
            setInviteEmail("");
            setInviteRole("viewer");
            setNotice(tr("Agent invited in the demo team."));
          }}
        >{tr("Invite agent")}</CommandButton>
      </article>

      <article className="panel">
        <DataTable
          head={[tr("Name"), tr("Email"), tr("Role"), tr("Presence"), tr("Scope"), tr("Status"), tr("Actions")]}
          rowIds={session.agents.map((agent) => agent.id)}
          rows={session.agents.map((agent) => {
            const desired = desiredRoles[agent.id] ?? agent.role;
            return [
              agent.name,
              agent.email,
              <span key={`${agent.id}-role`}>
                <select
                  aria-label={tr("Role for {0}", [agent.name])}
                  value={desired}
                  disabled={actor.role !== "super" || actor.id === agent.id}
                  onChange={(event) => setDesiredRoles((current) => ({ ...current, [agent.id]: event.target.value as Role }))}
                >
                  {ROLES.map((role) => <option key={role} value={role}>{trx(ROLE_LABELS[role])}</option>)}
                </select>
                <CommandButton
                  command="admin.team.editRole"
                  className="link-action"
                  type="button"
                  disabled={desired === agent.role || actor.id === agent.id}
                  onDone={() => apply(changeAgentRole(session.agents, agent.id, desired, actor), tr("{0} is now {1}.", [agent.name, trx(ROLE_LABELS[desired])]))}
                >{tr("Apply")}</CommandButton>
              </span>,
              <span key={`${agent.id}-presence`}>
                {trx(agent.presence)}
                <CommandButton
                  command="admin.team.presence"
                  className="link-action"
                  type="button"
                  disabled={actor.role !== "super"}
                  onDone={() => apply(setAgentPresence(session.agents, agent.id, agent.presence === "online" ? "away" : "online", actor), tr("{0} presence changed.", [agent.name]))}
                >{tr("Toggle")}</CommandButton>
              </span>,
              scopeLabel(agent.scope.zones),
              agent.active ? tr("active") : tr("inactive"),
              <span key={agent.id}>
                <CommandButton
                  command="admin.team.resetCode"
                  type="button"
                  className="link-action"
                  disabled={agent.id === actor.id}
                  targetId={agent.id}
                  onDone={() => apply(resetAgentCode(session.agents, agent.id, actor), tr("2-step code reset for {0}.", [agent.name]))}
                >{tr("Reset 2-step")}</CommandButton>
                {agent.active ? (
                  <CommandButton
                    command="admin.team.deactivate"
                    type="button"
                    className="link-action danger-text"
                    disabled={agent.id === actor.id}
                    targetId={agent.id}
                    onDone={() => apply(deactivateAgent(session.agents, agent.id, actor), tr("{0} deactivated.", [agent.name]))}
                  >{tr("Deactivate")}</CommandButton>
                ) : (
                  <CommandButton
                    command="admin.team.reactivate"
                    type="button"
                    className="link-action"
                    targetId={agent.id}
                    onDone={() => apply(reactivateAgent(session.agents, agent.id, actor), tr("{0} reactivated.", [agent.name]))}
                  >{tr("Reactivate")}</CommandButton>
                )}
              </span>,
            ];
          })}
        />
      </article>
    </>
  );
}

type TeamTab = "admins" | "roles" | "limits" | "security";
const TEAM_TABS: { id: TeamTab; label: string }[] = [
  { id: "admins", label: "Admins" },
  { id: "roles", label: "Roles and permissions" },
  { id: "limits", label: "Limits" },
  { id: "security", label: "Sign-in safety" },
];


export function TeamPage() {
  const session = useSession();
  const actor = session.agent;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (TEAM_TABS.find((item) => item.id === params.get("tab"))?.id ?? "admins") as TeamTab;
  const scope = useMarketScope();
  const { ops } = useTeamOps();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [notice, setNotice] = useState("");
  const editable = Boolean(actor && can(actor.role, "team.edit"));
  const selectTab = (id: TeamTab) => setParams(() => {
    const next = new URLSearchParams(globalThis.location.search);
    if (id === "admins") next.delete("tab");
    else next.set("tab", id);
    return next;
  }, { replace: true });
  const q = query.trim().toLowerCase();
  const list = useMemo(() => session.agents.filter((agent) => (!role || agent.role === role) && (!q || `${agent.name} ${agent.email} ${trx(ROLE_LABELS[agent.role])}`.toLowerCase().includes(q))), [session.agents, role, q]);
  if (!actor) return null;
  return (
    <div className="dx-page pl-page">
      <div className="page-heading">
        <div className="pl-head">
          <button data-command="admin.team.view" type="button" className="dash-btn ghost dx-back" onClick={() => (globalThis.history.length > 1 ? navigate(-1) : navigate("/"))}><ArrowLeft size={16} aria-hidden="true" />{" "}{tr("Back")}</button>
          <div>
            <h2>{tr("Team and roles")}</h2>
            <p>{isLiveData() ? tr("Eleven admin roles. Changes are permission-gated.") : tr("Eleven planned admin roles are represented. Changes are permission-gated and stored in the demo session.")}</p>
          </div>
        </div>
      </div>
      <div className="dash-tabs dx-views" role="tablist" aria-label={tr("Team sections")}>
        {TEAM_TABS.map((item) => <button data-command="admin.team.view" key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : undefined} onClick={() => selectTab(item.id)}>{trx(item.label)}</button>)}
      </div>
      {notice ? <p role="status" className="pl-status">{notice}</p> : null}
      {tab === "roles" ? <RolesView editable={editable} by={actor.id} onNotice={setNotice} /> : null}
      {tab === "limits" ? <LimitsView editable={editable} currency={scope.market.currency} onNotice={setNotice} /> : null}
      {tab === "security" ? <SecurityView editable={editable} onNotice={setNotice} /> : null}
      {tab === "admins" ? (
        <>
          <Cards
            compare={false}
            compareLabel=""
            fmt={(n) => String(n)}
            cards={[
              { id: "all", label: "Admins", value: session.agents.length, previous: null, format: "count", info: "Everyone with an admin account." },
              { id: "active", label: "Active", value: session.agents.filter((agent) => agent.active).length, previous: null, format: "count", info: "Admins who can sign in." },
              { id: "online", label: "Online now", value: session.agents.filter((agent) => agent.active && agent.presence === "online").length, previous: null, format: "count", info: "Admins marked online." },
              { id: "custom", label: "Custom roles", value: ops.customRoles.length, previous: null, format: "count", info: "Roles made from switches in Roles and permissions." },
            ]}
          />
          <Card title={tr("Admins")} icon={<Users size={15} />} tone="blue" help={tr("Open an admin to see what they can do and what they did.")}>
            <div className="pl-filters">
              <label className="pl-search"><Search size={14} aria-hidden="true" /><input aria-label={tr("Search admins")} placeholder={tr("Name, email or role")} value={query} onChange={(e) => setQuery(e.target.value)} /></label>
              <select aria-label={tr("Filter by role")} value={role} onChange={(e) => setRole(e.target.value as Role | "")}><option value="">{tr("Every role")}</option>{ROLES.map((item) => <option key={item} value={item}>{trx(ROLE_LABELS[item])}</option>)}</select>
            </div>
            <ul className="pl-admins" aria-label={tr("Admin list")}>
              {list.map((agent) => {
                const custom = ops.customRoles.find((item) => item.id === ops.assigned[agent.id]);
                return (
                  <li key={agent.id} className={agent.active ? undefined : "off"}>
                    <Link to={`/team/${agent.id}`}>
                      <span className={`pl-avatar ${agent.presence}`} aria-hidden="true">{agent.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>
                      <span className="pl-admin-text"><b>{agent.name}</b><small>{agent.email}</small></span>
                      <span className="pl-role-pill">{custom ? custom.name : trx(ROLE_LABELS[agent.role])}</span>
                      <small className="pl-admin-place">{placeOf(agent.scope)} · {agent.active ? agent.presence : tr("deactivated")}</small>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
          <AdminsTable />
        </>
      ) : null}
    </div>
  );
}
