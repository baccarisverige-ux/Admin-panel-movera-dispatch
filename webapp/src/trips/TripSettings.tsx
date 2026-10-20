import { useState } from "react";
import { Banknote, EyeOff, ListChecks } from "lucide-react";
import { ROLE_LABELS, type Role } from "../auth/permissions";
import { Link } from "react-router";
import { Card, Check, Row } from "../dispatch/fields";
import { useRefundPolicy } from "../payments/useRefundPolicy";
import { MARKETS } from "../markets/markets";
import { CommandButton } from "../ui/CommandButton";
import { ACTIONS, PRIVATE_BASE, TRIP_OPS_KEY, saveSettings, type TripOps, type TripSettings } from "./file";

const SYMBOL = { SE: "kr", FR: "€", TN: "DT" } as const;

/** Super admin only: who sees private trip data, which actions exist, and the money limits. */
export function TripSettingsView({ ops, rev, loading, editable }: { ops: TripOps; rev: number; loading: boolean; editable: boolean }) {
  const [draft, setDraft] = useState<TripSettings | null>(null);
  const { policy: refundPolicy } = useRefundPolicy();
  const settings = draft ?? ops.settings;
  const dirty = Boolean(draft) && JSON.stringify(draft) !== JSON.stringify(ops.settings);
  const result = saveSettings(ops, settings);
  const others = (Object.keys(ROLE_LABELS) as Role[]).filter((role) => !PRIVATE_BASE.includes(role));
  const patch = (next: Partial<TripSettings>) => setDraft({ ...settings, ...next });
  const changes = [
    ...others.filter((role) => settings.extraRoles.includes(role) !== ops.settings.extraRoles.includes(role)).map((role) => `${ROLE_LABELS[role]}: ${settings.extraRoles.includes(role) ? "can see" : "cannot see"} numbers and chats`),
    ...(settings.reasonToShow !== ops.settings.reasonToShow ? [`Reason before showing: ${settings.reasonToShow ? "on" : "off"}`] : []),
    ...ACTIONS.filter((item) => settings.actions[item.id] !== ops.settings.actions[item.id]).map((item) => `${item.label}: ${settings.actions[item.id] ? "on" : "off"}`),
  ];

  return (
    <div className="op-settings">
      {!editable ? <p className="dx-readonly">Only the Super admin can change these settings.</p> : null}
      <fieldset className="op-fieldset" disabled={!editable || loading}>
        <Card title="Phone numbers and chats" icon={<EyeOff size={18} />} tone="purple" help="Hidden by default. Each time someone presses Show, it is logged in Reports → Admin work as a private data view.">
          <div className="dx-row">
            <span className="dx-row-text"><b>Always allowed</b><small>These roles can always press Show.</small></span>
            <span className="zn-chips">{PRIVATE_BASE.map((role) => <span key={role} className="dx-tag">{ROLE_LABELS[role]}</span>)}</span>
          </div>
          <div className="dx-row">
            <span className="dx-row-text"><b>Also allowed</b><small>Add more roles. They still only see trips in their own zones.</small></span>
            <span className="zn-chips">{others.map((role) => <Check key={role} label={ROLE_LABELS[role]} on={settings.extraRoles.includes(role)} onChange={(on) => patch({ extraRoles: on ? [...settings.extraRoles, role] : settings.extraRoles.filter((item) => item !== role) })} />)}</span>
          </div>
          <Row label="Ask for a reason before showing" help="When off, Show still works and is still logged, without a reason." on={settings.reasonToShow} onToggle={(on) => patch({ reasonToShow: on })} />
        </Card>
        <Card title="Actions on a trip" icon={<ListChecks size={18} />} tone="blue" help="Turn an action off and its button is gone from every trip page. Everything done is logged with the admin's name.">
          {ACTIONS.map((item) => <Row key={item.id} label={item.label} help={item.help} on={settings.actions[item.id]} onToggle={(on) => patch({ actions: { ...settings.actions, [item.id]: on } })} />)}
        </Card>
        <Card title="Second admin for big amounts" icon={<Banknote size={18} />} tone="green" help="Refunds and driver pay changes above the amount wait until another admin approves them. One limit per country, the same everywhere (Q25).">
          {MARKETS.map((item) => (
            <Row key={item.id} label={item.name} help={`In ${item.currency}.`}>
              <span className="dx-tag" data-testid={`trip-second-admin-${item.id}`}>Above {refundPolicy.aboveMajor[item.id]} {SYMBOL[item.id]}</span>
            </Row>
          ))}
          <p className="dx-readonly"><Link to="/settings#refunds">Edit in Settings</Link></p>
        </Card>
      </fieldset>
      {editable ? (
        <div className="dx-publish">
          <span className="dx-publish-text">
            <b>{dirty ? `${changes.length} change${changes.length === 1 ? "" : "s"} not saved` : "Everything is saved"}</b>
            {dirty ? <small>{changes.slice(0, 3).join(" · ")}{changes.length > 3 ? " …" : ""}</small> : <small>Changes apply to every trip page right away.</small>}
          </span>
          {result.error ? <span className="dx-warn">{result.error}</span> : null}
          <button data-command="admin.trip.view" type="button" className="dash-btn small ghost" disabled={!dirty} onClick={() => setDraft(null)}>Undo changes</button>
          <CommandButton command="admin.trip.settings" className="dash-btn small" targetId="trip settings" confirmTarget={false} before="saved" after={changes.join("; ") || "no change"} sliceKey={TRIP_OPS_KEY} value={result.ops} expectedSliceRev={rev} disabled={!dirty || Boolean(result.error)} onDone={() => setDraft(null)}>Save settings</CommandButton>
        </div>
      ) : null}
    </div>
  );
}
