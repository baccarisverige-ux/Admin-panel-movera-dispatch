import { MessageSquareText } from "lucide-react";
import { SMS_DAILY_CAP, type SmsSignIn } from "../config/smsSignIn";
import { tr, trn } from "../i18n";
import { SettingInfo } from "../ui/SettingInfo";
import { NumberField } from "./NumberField";

type Props = { value: SmsSignIn; saved: SmsSignIn; canEdit: boolean; onStandard: boolean; onChange: (value: SmsSignIn) => void };

/**
 * Contract v0.18.135 (contract.json#smsSignIn; owner 2026-11-19 "Yes, build it now (Rec.)"): Pricing › Tips & limits ›
 * "Real SMS sign-in codes" — the switch and the daily SMS limit of one country (CountryRules.smsSignIn), on the country
 * Standard only like the emergency numbers; read-only on a zone. Default off. The SMS company's keys are on the server
 * (the owner sets them there); the panel never sees them.
 */
export function SmsSignInCard({ value, saved, canEdit, onStandard, onChange }: Props) {
  const editable = canEdit && onStandard;
  return (
    <div className="fee-card" data-testid="sms-sign-in">
      <div>
        <strong>{trn("{0} Real SMS sign-in codes", <MessageSquareText size={14} aria-hidden="true" />)}</strong>
        <small>{tr("On: real riders and drivers with a phone number of this country get their sign-in code by SMS. Off: only the test numbers can sign in; everyone else is told sign-in is not open yet. Works only when the SMS company's keys are also set on the server. Each SMS costs money.")}</small>
        {!onStandard ? <small className="dx-note">{tr("Set for the whole country: choose the country Standard at the top to change it.")}</small> : null}
      </div>
      <label className="mini-switch big">
        <input type="checkbox" aria-label={tr("Real SMS sign-in codes")} data-testid="sms-sign-in-on" checked={value.enabled} disabled={!editable} onChange={(event) => onChange({ ...value, enabled: event.target.checked })} /><SettingInfo id="tips.smsSignIn.enabled" label={tr("Real SMS sign-in codes")} />
        <span aria-hidden="true"><i /></span>
        {value.enabled ? tr("On") : tr("Off")}
      </label>
      <div data-testid="sms-sign-in-cap">
        <NumberField info="tips.smsSignIn.dailyCap" label={tr("Sign-in SMS per day, at most")} value={value.dailyCap} step={1} min={SMS_DAILY_CAP.min} max={SMS_DAILY_CAP.max} disabled={!editable} changed={value.dailyCap !== saved.dailyCap} onChange={(dailyCap) => onChange({ ...value, dailyCap: Math.round(dailyCap) })} />
      </div>
    </div>
  );
}
