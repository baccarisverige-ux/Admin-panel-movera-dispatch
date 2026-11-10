import { ArrowDown, ArrowUp, Plus, Siren, Trash2 } from "lucide-react";
import { EMERGENCY_KINDS, EMERGENCY_MAX_ROWS, KIND_LABEL, type EmergencyNumber } from "../config/emergencyNumbers";
import { tr, trn } from "../i18n";

type Props = { rows: EmergencyNumber[]; canEdit: boolean; onStandard: boolean; onChange: (rows: EmergencyNumber[]) => void };
const LANGS = [["sv", "Name in Swedish"], ["fr", "Name in French"], ["en", "Name in English"]] as const;

/**
 * v0.18.57 §79 (contract.json#emergencyNumbers, owner 2026-11-10): Admin › Pricing › Tips & limits › Emergency numbers.
 * 1–6 rows (kind, number, name in sv / fr / en); the first row is the main number (SOS dials it). Country standard only:
 * on a zone the list is shown read-only.
 */
export function EmergencyNumbersEditor({ rows, canEdit, onStandard, onChange }: Props) {
  const editable = canEdit && onStandard;
  const set = (index: number, patch: Partial<EmergencyNumber>) => onChange(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));
  const move = (index: number, by: -1 | 1) => {
    const next = [...rows];
    const [row] = next.splice(index, 1);
    next.splice(index + by, 0, row!);
    onChange(next);
  };
  return (
    <div className="fee-card" data-testid="emergency-numbers">
      <div>
        <strong>{trn("{0} Emergency numbers", <Siren size={14} aria-hidden="true" />)}</strong>
        <small>{tr("The call buttons on the safety screens of the rider and driver apps, and on the safety case page. The first number is the main one: SOS dials it.")}</small>
        {onStandard ? null : <small className="dx-note" data-testid="emergency-numbers-country-only">{tr("Emergency numbers are set for the whole country, on the Standard.")}</small>}
      </div>
      {rows.map((row, index) => (
        <div key={index} className="op-emergency" data-testid={`emergency-row-${index}`}>
          <label className="field"><span>{tr("Kind")}</span>
            <select aria-label={tr("Emergency number {0} kind", [index + 1])} value={row.kind} disabled={!editable} onChange={(event) => set(index, { kind: event.target.value as EmergencyNumber["kind"] })}>
              {EMERGENCY_KINDS.map((kind) => <option key={kind} value={kind}>{tr(KIND_LABEL[kind])}</option>)}
            </select>
          </label>
          <label className="field"><span>{tr("Number")}</span>
            <input aria-label={tr("Emergency number {0}", [index + 1])} className="short" inputMode="tel" value={row.number} disabled={!editable} onChange={(event) => set(index, { number: event.target.value.trim() })} />
          </label>
          {LANGS.map(([lang, title]) => (
            <label key={lang} className="field"><span>{tr(title)}</span>
              <input aria-label={tr("Emergency number {0}: {1}", [index + 1, tr(title)])} maxLength={40} value={row.label[lang]} disabled={!editable} onChange={(event) => set(index, { label: { ...row.label, [lang]: event.target.value } })} />
            </label>
          ))}
          {editable ? (
            <span className="op-inline">
              <button type="button" data-command="admin.pricing.edit" className="dash-btn small ghost icon" aria-label={tr("Move emergency number {0} up", [index + 1])} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={13} aria-hidden="true" /></button>
              <button type="button" data-command="admin.pricing.edit" className="dash-btn small ghost icon" aria-label={tr("Move emergency number {0} down", [index + 1])} disabled={index === rows.length - 1} onClick={() => move(index, 1)}><ArrowDown size={13} aria-hidden="true" /></button>
              <button type="button" data-command="admin.pricing.edit" className="dash-btn small ghost icon" aria-label={tr("Remove emergency number {0}", [index + 1])} disabled={rows.length <= 1} onClick={() => onChange(rows.filter((_, at) => at !== index))}><Trash2 size={13} aria-hidden="true" /></button>
            </span>
          ) : null}
        </div>
      ))}
      {editable && rows.length < EMERGENCY_MAX_ROWS ? (
        <button type="button" data-command="admin.pricing.edit" className="dash-btn small ghost" data-testid="emergency-add" onClick={() => onChange([...rows, { kind: "general", number: "", label: { sv: "", fr: "", en: "" } }])}><Plus size={13} aria-hidden="true" /> {tr("Add an emergency number")}</button>
      ) : null}
    </div>
  );
}
