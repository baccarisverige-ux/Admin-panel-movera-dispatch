import { SMS_PROVIDER_ORDERS, orderKey, providerOrderLabel, type SmsCompany } from "../config/smsSignIn";
import { tr } from "../i18n";
import { SettingInfo } from "../ui/SettingInfo";

type Props = { info: string; testId: string; value: SmsCompany[]; saved: SmsCompany[]; disabled: boolean; onChange: (value: SmsCompany[]) => void };

/**
 * Contract v0.18.168 (contract.json#smsProviders.admin; owner 2026-11-26 "Infobip + 46elks en secours (Recommandé)"):
 * "SMS company order" on both SMS sign-in cards. The server tries the first company; only when it does not take the
 * SMS does the second send it. Default Infobip, then 46elks.
 */
export function SmsProviderOrderField({ info, testId, value, saved, disabled, onChange }: Props) {
  const changed = orderKey(value) !== orderKey(saved);
  return (
    <label className={`check-row${changed ? " changed" : ""}`} data-testid={testId}>
      {tr("SMS company order")}
      <SettingInfo id={info} />{" "}
      <select aria-label={tr("SMS company order")} value={orderKey(value)} disabled={disabled} onChange={(event) => onChange(SMS_PROVIDER_ORDERS.find((order) => orderKey(order) === event.target.value) ?? value)}>
        {SMS_PROVIDER_ORDERS.map((order) => (
          <option key={orderKey(order)} value={orderKey(order)}>
            {providerOrderLabel(order)}
          </option>
        ))}
      </select>
    </label>
  );
}
