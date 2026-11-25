import { Globe } from "lucide-react";
import { SMS_DAILY_CAP, SMS_PER_CODE_CAP, SMS_PER_MINUTE_CAP, parseCallingCodes, type SmsOther } from "../config/smsSignIn";
import { tr, trn } from "../i18n";
import { SettingInfo } from "../ui/SettingInfo";
import { NumberField } from "./NumberField";

type Props = { value: SmsOther; saved: SmsOther; canEdit: boolean; onChange: (value: SmsOther) => void };

/**
 * Contract v0.18.157 (contract.json#smsSignIn.otherCountries.admin): Pricing › Tips & limits, Sweden Standard, shown to
 * super admins only. One switch and one daily limit for rider sign-in SMS to numbers of every other country.
 */
export function SmsOtherCountriesCard({ value, saved, canEdit, onChange }: Props) {
  return (
    <div className="fee-card" data-testid="sms-other-countries">
      <div>
        <strong>{trn("{0} SMS sign-in for numbers from other countries", <Globe size={14} aria-hidden="true" />)}</strong>
        <small>{tr("For visitors with a foreign number (for example Tunisian, German or US). Each code is an international SMS and costs more than a Swedish one. Foreign numbers are the usual target of SMS fraud, so keep the limit low and raise it only when real visitors need it. At the limit, new codes for these numbers stop until the next day. Sweden keeps its own switch and limit.")}</small>
      </div>
      <label className="mini-switch big">
        <input type="checkbox" aria-label={tr("Send sign-in codes to rider numbers from all other countries")} data-testid="sms-other-on" checked={value.enabled} disabled={!canEdit} onChange={(event) => onChange({ ...value, enabled: event.target.checked })} /><SettingInfo id="tips.smsOther.enabled" label={tr("SMS sign-in for numbers from other countries")} />
        <span aria-hidden="true"><i /></span>
        {value.enabled ? tr("On") : tr("Off")}
      </label>
      <div data-testid="sms-other-cap">
        <NumberField info="tips.smsOther.dailyCap" label={tr("Daily limit (SMS per 24 hours, all other countries together)")} value={value.dailyCap} step={1} min={SMS_DAILY_CAP.min} max={SMS_DAILY_CAP.max} disabled={!canEdit} changed={value.dailyCap !== saved.dailyCap} onChange={(dailyCap) => onChange({ ...value, dailyCap: Math.round(dailyCap) })} />
      </div>
      <div data-testid="sms-other-per-code">
        <NumberField info="tips.smsOther.perCodeDailyCap" label={tr("Per calling code (SMS per 24 hours)")} value={value.perCodeDailyCap} step={1} min={SMS_PER_CODE_CAP.min} max={SMS_PER_CODE_CAP.max} disabled={!canEdit} changed={value.perCodeDailyCap !== saved.perCodeDailyCap} onChange={(perCodeDailyCap) => onChange({ ...value, perCodeDailyCap: Math.round(perCodeDailyCap) })} />
      </div>
      <div data-testid="sms-other-per-minute">
        <NumberField info="tips.smsOther.perMinuteCap" label={tr("All sign-in SMS per minute, at most")} value={value.perMinuteCap} step={1} min={SMS_PER_MINUTE_CAP.min} max={SMS_PER_MINUTE_CAP.max} disabled={!canEdit} changed={value.perMinuteCap !== saved.perMinuteCap} onChange={(perMinuteCap) => onChange({ ...value, perMinuteCap: Math.round(perMinuteCap) })} />
      </div>
      <label className="check-row" data-testid="sms-other-blocked">{tr("Blocked calling codes (for example +882)")}<SettingInfo id="tips.smsOther.blockedCallingCodes" />{" "}
        <input type="text" aria-label={tr("Blocked calling codes (for example +882)")} defaultValue={value.blockedCallingCodes.join(", ")} disabled={!canEdit} onBlur={(event) => onChange({ ...value, blockedCallingCodes: parseCallingCodes(event.target.value) })} />
      </label>
    </div>
  );
}
