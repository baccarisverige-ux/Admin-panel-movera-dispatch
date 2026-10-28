import { Link } from "react-router";
import { useLiveSessionMaybe } from "../live/LiveSessionContext";
import { useState } from "react";
import { KeyRound, Plus, ShieldCheck, Wallet } from "lucide-react";
import { useSlice } from "../api/hooks";
import { ROLE_LABELS, type Role } from "../auth/permissions";
import { Card, Num, Row, Switch } from "../dispatch/fields";
import { useDirtyWarning } from "../ui/useDirtyWarning";
import { CommandButton } from "../ui/CommandButton";
import { PERMISSION_GROUPS, TEAM_OPS_KEY, emptyTeamOps, limitError, newRole, normalizeTeamOps, permissionsOf, removeRole, roleChanges, saveRole, securityError, type CustomRole, type RoleLimit, type Security, type TeamOps } from "./team";

const ROLES = Object.keys(ROLE_LABELS) as Role[];

/** Team settings that are saved but not yet applied anywhere: say so next to the setting. */
export function NotEnforced({ children }: { children: string }) {
  return <p className="pl-help" role="note" data-testid="not-enforced"><b>Not enforced yet.</b> {children}</p>;
}

export function useTeamOps() {
  const slice = useSlice<TeamOps>(TEAM_OPS_KEY, emptyTeamOps());
  return { slice, ops: normalizeTeamOps(slice.value) };
}

/** Built-in roles to look at, and custom roles made from switches. */
export function RolesView({ editable, by, onNotice }: { editable: boolean; by: string; onNotice: (text: string) => void }) {
  const { slice, ops } = useTeamOps();
  const [draft, setDraft] = useState<CustomRole | null>(null);
  const [look, setLook] = useState<Role>("support");
  useDirtyWarning(Boolean(draft));
  const shown = draft ? draft.permissions : permissionsOf(look);
  const result = draft ? saveRole(ops, draft) : null;
  const changes = draft ? roleChanges(draft) : null;
  return (
    <div className="pl-roles">
      <Card title="Roles" icon={<ShieldCheck size={15} />} tone="purple" help="Built-in roles are fixed. Make a custom role from one of them and switch permissions on or off." aside={<button data-command="admin.team.view" type="button" className="dash-btn small" disabled={!editable} onClick={() => setDraft(newRole(look, by, Date.now()))}><Plus size={13} aria-hidden="true" /> New role</button>}>
        <ul className="pl-role-list" aria-label="Roles">
          {ROLES.map((role) => <li key={role}><button data-command="admin.team.view" type="button" aria-pressed={!draft && look === role} className={!draft && look === role ? "on" : undefined} onClick={() => { setDraft(null); setLook(role); }}><b>{ROLE_LABELS[role]}</b><small>Built in · {permissionsOf(role).length} permissions</small></button></li>)}
          {ops.customRoles.map((role) => <li key={role.id}><button data-command="admin.team.view" type="button" aria-pressed={draft?.id === role.id} className={draft?.id === role.id ? "on custom" : "custom"} onClick={() => setDraft(role)}><b>{role.name}</b><small>Custom · from {ROLE_LABELS[role.base]} · {role.permissions.length} permissions</small></button></li>)}
        </ul>
      </Card>
      <Card title={draft ? (ops.customRoles.some((item) => item.id === draft.id) ? `Edit ${draft.name || "role"}` : "New custom role") : `${ROLE_LABELS[look]} can`} icon={<KeyRound size={15} />} tone="blue" help={draft ? "Switch each permission on or off." : "Built-in roles cannot be changed. Make a custom role to change them."}>
        {draft ? (
          <>
            <label className="pl-field"><span>Role name</span><input aria-label="Role name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
            <label className="pl-field"><span>Start from</span><select aria-label="Start from" value={draft.base} onChange={(e) => { const base = e.target.value as Role; setDraft({ ...draft, base, permissions: permissionsOf(base) }); }}>{ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></label>
          </>
        ) : null}
        <div className="pl-perms">
          {PERMISSION_GROUPS.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h4>{group.label}</h4>
              {group.items.map((item) => (
                <Row key={item.id} label={item.label}>
                  <Switch label={item.label} on={shown.includes(item.id)} disabled={!draft || !editable} onChange={(on) => draft && setDraft({ ...draft, permissions: on ? [...draft.permissions, item.id] : draft.permissions.filter((id) => id !== item.id) })} />
                </Row>
              ))}
            </section>
          ))}
        </div>
        {draft && changes ? <p className="pl-help">Compared with {ROLE_LABELS[draft.base]}: {changes.added.length} added, {changes.removed.length} removed.</p> : null}
        {result?.error ? <p role="alert" className="pl-warn">{result.error}</p> : null}
        {draft ? (
          <div className="actions">
            <CommandButton command="admin.team.role" confirmTarget={false} className="dash-btn small" sliceKey={TEAM_OPS_KEY} value={result?.ops} expectedSliceRev={ops.draftRev} targetId={draft.id} disabled={!editable || Boolean(result?.error) || slice.loading} onDone={() => { onNotice(`Role ${draft.name.trim()} saved.`); setDraft(null); }}>Save role</CommandButton>
            {ops.customRoles.some((item) => item.id === draft.id) ? <CommandButton command="admin.team.roleRemove" confirmTarget={false} className="dash-btn small ghost danger-text" sliceKey={TEAM_OPS_KEY} value={removeRole(ops, draft.id)} expectedSliceRev={ops.draftRev} targetId={draft.id} disabled={!editable} onDone={() => { onNotice(`Role ${draft.name} deleted.`); setDraft(null); }}>Delete role</CommandButton> : null}
            <button data-command="admin.team.view" type="button" className="dash-btn small ghost" onClick={() => setDraft(null)}>Close</button>
          </div>
        ) : null}
        <NotEnforced>Custom roles are saved here. The backend applies them when it signs an admin in; in the demo an admin keeps the permissions of their built-in role.</NotEnforced>
      </Card>
    </div>
  );
}

/** Money limits per role. */
export function LimitsView({ editable, currency, onNotice }: { editable: boolean; currency: string; onNotice: (text: string) => void }) {
  const { slice, ops } = useTeamOps();
  const [role, setRole] = useState<Role>("support");
  const [draft, setDraft] = useState<RoleLimit | null>(null);
  useDirtyWarning(Boolean(draft));
  const value = draft ?? ops.limits[role];
  const error = limitError(value);
  const patch = (next: Partial<RoleLimit>) => setDraft({ ...value, ...next });
  return (
    <Card title="Limits per role" icon={<Wallet size={15} />} tone="orange" help="The most one admin with this role can give in one go. Above the country's second-admin limit (Settings), a second admin must approve.">
      <label className="pl-field"><span>Role</span><select aria-label="Limits for role" value={role} onChange={(e) => { setRole(e.target.value as Role); setDraft(null); }}>{ROLES.map((item) => <option key={item} value={item}>{ROLE_LABELS[item]}</option>)}</select></label>
      <Row label="Money back on one payment" on={value.refund.on} onToggle={(on) => patch({ refund: { ...value.refund, on } })} disabled={!editable}><Num label="Refund limit" value={value.refund.max} unit={currency} min={1} disabled={!editable || !value.refund.on} onChange={(max) => patch({ refund: { ...value.refund, max } })} /></Row>
      <Row label="Wallet credit to one rider" on={value.credit.on} onToggle={(on) => patch({ credit: { ...value.credit, on } })} disabled={!editable}><Num label="Credit limit" value={value.credit.max} unit={currency} min={1} disabled={!editable || !value.credit.on} onChange={(max) => patch({ credit: { ...value.credit, max } })} /></Row>
      {/* Owner 2026-10-28: one admin is enough everywhere (live panel). */}
      {useLiveSessionMaybe() ? null : <Row label="Second admin above" help="One limit per country for every role, set in Settings."><Link to="/settings#refunds">Edit in Settings</Link></Row>}
      {error ? <p role="alert" className="pl-warn">{error}</p> : null}
      <NotEnforced>These limits are saved for the backend. Refunds and wallet credits do not check them yet.</NotEnforced>
      <div className="actions">
        <CommandButton command="admin.team.limits" confirmTarget={false} className="dash-btn small" sliceKey={TEAM_OPS_KEY} value={{ ...ops, draftRev: ops.draftRev + 1, limits: { ...ops.limits, [role]: value } }} expectedSliceRev={ops.draftRev} targetId={role} disabled={!editable || !draft || Boolean(error) || slice.loading} onDone={() => { setDraft(null); onNotice(`Limits for ${ROLE_LABELS[role]} saved.`); }}>Save limits</CommandButton>
        {draft ? <button data-command="admin.team.view" type="button" className="dash-btn small ghost" onClick={() => setDraft(null)}>Undo changes</button> : null}
      </div>
    </Card>
  );
}

/** 2-step code per role and sign-out after idle time. */
export function SecurityView({ editable, onNotice }: { editable: boolean; onNotice: (text: string) => void }) {
  const { slice, ops } = useTeamOps();
  const [draft, setDraft] = useState<Security | null>(null);
  useDirtyWarning(Boolean(draft));
  const value = draft ?? ops.security;
  const error = securityError(value);
  return (
    <Card title="Sign-in safety" icon={<KeyRound size={15} />} tone="green" help="The 2-step code is the 6-digit code sent at sign-in.">
      <Row label="Sign out when idle" help="An admin who does nothing for this long is signed out." on={value.idle.on} onToggle={(on) => setDraft({ ...value, idle: { ...value.idle, on } })} disabled={!editable}><Num label="Idle minutes" value={value.idle.minutes} unit="min" min={5} max={240} disabled={!editable || !value.idle.on} onChange={(minutes) => setDraft({ ...value, idle: { ...value.idle, minutes } })} /></Row>
      <h4 className="pl-sub">2-step code per role</h4>
      {ROLES.map((role) => (
        <Row key={role} label={ROLE_LABELS[role]} help={role === "super" ? "Always on for the Super admin." : undefined}>
          <Switch label={`2-step code for ${ROLE_LABELS[role]}`} on={value.twoStep[role]} disabled={!editable || role === "super"} onChange={(on) => setDraft({ ...value, twoStep: { ...value.twoStep, [role]: on } })} />
        </Row>
      ))}
      {error ? <p role="alert" className="pl-warn">{error}</p> : null}
      <div className="actions">
        <CommandButton command="admin.team.security" confirmTarget={false} className="dash-btn small" sliceKey={TEAM_OPS_KEY} value={{ ...ops, draftRev: ops.draftRev + 1, security: value }} expectedSliceRev={ops.draftRev} targetId="sign-in" disabled={!editable || !draft || Boolean(error) || slice.loading} onDone={() => { setDraft(null); onNotice("Sign-in safety saved."); }}>Save sign-in safety</CommandButton>
        {draft ? <button data-command="admin.team.view" type="button" className="dash-btn small ghost" onClick={() => setDraft(null)}>Undo changes</button> : null}
      </div>
      <NotEnforced>Saved here for the backend. The demo sign-in always asks for the code and signs out after 15 minutes.</NotEnforced>
    </Card>
  );
}
