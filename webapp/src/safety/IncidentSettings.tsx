import { useState } from "react";
import { tr, trx } from "../i18n/core";
import { Clock3, PhoneCall, Plus, ToggleRight, Trash2 } from "lucide-react";
import { Card, Num, Row } from "../dispatch/fields";
import { MARKETS, type MarketId } from "../markets/markets";
import { CommandButton } from "../ui/CommandButton";
import { INCIDENT_OPS_KEY, LEVELS, settingsError, type IncidentOps, type IncidentSettings } from "./cases";

const SWITCHES: { id: "lateAlerts" | "callButtons" | "liveMap" | "pastCases" | "caseReport"; label: string; help: string }[] = [
  { id: "lateAlerts", label: "Alert when a case is late", help: "The SOS alert in Alerts and the bell says the case is late." },
  { id: "callButtons", label: "Call buttons on the case", help: "Call the rider, the driver and the emergency numbers. Each call is logged." },
  { id: "liveMap", label: "Live map on the case", help: "Where the rider and the driver are now." },
  { id: "pastCases", label: "Earlier cases of the same person", help: "Shown on the case page." },
  { id: "caseReport", label: "Case report download", help: "A text report of the case, for example for the police." },
];

export function IncidentSettingsView({ ops, editable, loading }: { ops: IncidentOps; editable: boolean; loading: boolean }) {
  const [draft, setDraft] = useState<IncidentSettings | null>(null);
  const settings = draft ?? ops.settings;
  const dirty = Boolean(draft) && JSON.stringify(draft) !== JSON.stringify(ops.settings);
  const error = settingsError(settings);
  const patch = (next: Partial<IncidentSettings>) => setDraft({ ...settings, ...next });
  const setEmergency = (country: MarketId, rows: IncidentSettings["emergency"][MarketId]) => patch({ emergency: { ...settings.emergency, [country]: rows } });
  return (
    <div className="op-settings">
      {!editable ? <p className="dx-readonly">{tr("Only the safety team can change these settings.")}</p> : null}
      <fieldset className="op-fieldset" disabled={!editable || loading}>
        <Card title={tr("Time limits per level")} icon={<Clock3 size={18} />} tone="red" help={tr("How fast a case must be taken and solved. Late cases are marked red.")}>
          {LEVELS.map((level) => (
            <Row key={level.id} label={trx(level.label)} help={trx(level.help)}>
              <Num label={tr("{0} take within", [trx(level.label)])} before={tr("Take within")} value={settings.limits[level.id].takeMin} unit={tr("min")} min={1} onChange={(value) => patch({ limits: { ...settings.limits, [level.id]: { ...settings.limits[level.id], takeMin: value } } })} />
              <Num label={tr("{0} solve within", [trx(level.label)])} before={tr("Solve within")} value={settings.limits[level.id].solveMin} unit={tr("min")} min={1} onChange={(value) => patch({ limits: { ...settings.limits, [level.id]: { ...settings.limits[level.id], solveMin: value } } })} />
            </Row>
          ))}
        </Card>
        <Card title={tr("On the case page")} icon={<ToggleRight size={18} />} tone="purple">
          {SWITCHES.map((item) => <Row key={item.id} label={trx(item.label)} help={trx(item.help)} on={settings[item.id]} onToggle={(on) => patch({ [item.id]: on })} />)}
        </Card>
        <Card title={tr("Emergency numbers")} icon={<PhoneCall size={18} />} tone="orange" help={tr("The first number of each country is the big red button.")}>
          {MARKETS.map((country) => (
            <div key={country.id} className="op-emergency">
              <b>{trx(country.name)}</b>
              {(settings.emergency[country.id] ?? []).map((row, index) => (
                <div key={index} className="op-inline">
                  <input aria-label={tr("{0} number {1} name", [trx(country.name), index + 1])} value={row.label} onChange={(event) => setEmergency(country.id, settings.emergency[country.id].map((item, at) => (at === index ? { ...item, label: event.target.value } : item)))} />
                  <input aria-label={tr("{0} number {1}", [trx(country.name), index + 1])} className="short" value={row.number} onChange={(event) => setEmergency(country.id, settings.emergency[country.id].map((item, at) => (at === index ? { ...item, number: event.target.value } : item)))} />
                  <button data-command="admin.incident.view" type="button" className="dash-btn small ghost icon" aria-label={tr("Remove {0}", [trx(row.label)])} onClick={() => setEmergency(country.id, settings.emergency[country.id].filter((_, at) => at !== index))}><Trash2 size={13} aria-hidden="true" /></button>
                </div>
              ))}
              <button data-command="admin.incident.view" type="button" className="dash-btn small ghost" onClick={() => setEmergency(country.id, [...(settings.emergency[country.id] ?? []), { label: "", number: "" }])}><Plus size={13} aria-hidden="true" /> {tr("Add a number")}</button>
            </div>
          ))}
        </Card>
      </fieldset>
      {editable ? (
        <div className="dx-publish">
          <span className="dx-publish-text"><b>{dirty ? tr("Changes not saved") : tr("Everything is saved")}</b><small>{error ?? tr("Changes apply to every case right away.")}</small></span>
          <button data-command="admin.incident.view" type="button" className="dash-btn small ghost" disabled={!dirty} onClick={() => setDraft(null)}>{tr("Undo changes")}</button>
          <CommandButton command="admin.incident.settings" className="dash-btn small" targetId="incident settings" confirmTarget={false} before="saved" after="changed" sliceKey={INCIDENT_OPS_KEY} value={{ ...ops, draftRev: ops.draftRev + 1, settings }} expectedSliceRev={ops.draftRev} disabled={!dirty || Boolean(error)} onDone={() => setDraft(null)}>{tr("Save settings")}</CommandButton>
        </div>
      ) : null}
    </div>
  );
}
