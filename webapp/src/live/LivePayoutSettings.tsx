import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tr } from "../i18n";
import { useLiveSession } from "./LiveSessionContext";
import { ErrorLine } from "./ui";
import { readDraft, standardKey, type ConfigHttp } from "./configDocs";
import { CommandButton } from "../ui/CommandButton";
import { DAYS, payoutSettingsOf, type PayoutScheduleValue } from "./payoutSettings";

/**
 * v0.18.39 A2 (fix job 0) (owner build-spec Q4 "Admin can set automatic or manual", G10-2 payout schedule; contract.json#payoutMode,
 * payouts.schedule): per country (its Standard country_rules) the payout mode and the schedule. Saved and published
 * at once (one admin, Q1). Everything else in the country's rules is kept as it is.
 */
const DAY_LABEL: Record<string, string> = { monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday" };

export function LivePayoutSettings({ country, countryName }: { country: string; countryName: string }) {
  const { client, can } = useLiveSession();
  const queryClient = useQueryClient();
  const http: ConfigHttp = { json: (path) => client.json(path), put: (path, body) => client.put(path, body), post: (path, body) => client.post(path, body), del: (path) => client.del(path) } as ConfigHttp;
  const key = standardKey(country);
  const draft = useQuery({ queryKey: ["live", "payout-settings", key], queryFn: () => readDraft(http, "country_rules", key) });
  const saved = payoutSettingsOf(draft.data?.document);
  const [value, setValue] = useState(saved);
  const [notice, setNotice] = useState("");
  const loadedKey = JSON.stringify(saved);
  useEffect(() => setValue(JSON.parse(loadedKey) as typeof saved), [loadedKey]);
  const editable = can("settings.publish") && can("settings.edit");
  const changed = JSON.stringify(value) !== loadedKey;
  return (
    <section className="panel fn-panel" aria-label={tr("Payout settings")} data-testid="live-payout-settings">
      <h3>{tr("Payout settings · {0}", [countryName])}</h3>
      {draft.isLoading ? <p className="state-line">{tr("Loading.")}</p> : draft.error ? <ErrorLine error={draft.error} onRetry={() => void draft.refetch()} /> : (
        <>
          <fieldset className="field-grid" disabled={!editable}>
            <legend>{tr("How payouts are made")}</legend>
            <label><input type="radio" name={`payout-mode-${country}`} checked={value.mode === "automatic"} onChange={() => setValue({ ...value, mode: "automatic" })} /> {tr("Automatic: on the schedule")}</label>
            <label><input type="radio" name={`payout-mode-${country}`} checked={value.mode === "manual"} onChange={() => setValue({ ...value, mode: "manual" })} /> {tr("Manual: an admin approves each run")}</label>
          </fieldset>
          <div className="field-grid">
            <label>{tr("How often")}
              <select aria-label={tr("How often")} value={value.schedule.frequency} disabled={!editable} onChange={(event) => setValue({ ...value, schedule: { ...value.schedule, frequency: event.target.value as PayoutScheduleValue["frequency"] } })}>
                <option value="weekly">{tr("Every week")}</option>
                <option value="every_2_weeks">{tr("Every 2 weeks")}</option>
              </select>
            </label>
            <label>{tr("Day")}
              <select aria-label={tr("Payout day")} value={value.schedule.day} disabled={!editable} onChange={(event) => setValue({ ...value, schedule: { ...value.schedule, day: event.target.value } })}>
                {DAYS.map((day) => <option key={day} value={day}>{tr(DAY_LABEL[day] as "Monday")}</option>)}
              </select>
            </label>
            <label>{tr("Time")}<input type="time" aria-label={tr("Payout time")} value={value.schedule.time} disabled={!editable} onChange={(event) => setValue({ ...value, schedule: { ...value.schedule, time: event.target.value } })} /></label>
          </div>
          <p className="op-help">{tr("Local time of the country. A change applies to the next run.")}</p>
          <CommandButton command="admin.payout.settings" className="secondary-btn" targetId={key} confirmTarget={false} before={`${saved.mode} · ${saved.schedule.frequency} ${saved.schedule.day} ${saved.schedule.time}`} after={`${value.mode} · ${value.schedule.frequency} ${value.schedule.day} ${value.schedule.time}`} value={{ country, mode: value.mode, schedule: value.schedule }} disabled={!editable || !changed} onDone={() => { setNotice(tr("Payout settings published.")); void queryClient.invalidateQueries({ queryKey: ["live", "payout-settings", key] }); }}>{tr("Publish payout settings")}</CommandButton>
        </>
      )}
      {notice ? <p className="state-line" role="status">{notice}</p> : null}
    </section>
  );
}
