import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tr } from "../i18n";
import { useLiveSession } from "./LiveSessionContext";
import { errorText, liveMoney } from "./format";
import { DELETION_DEFAULT, deletionSettingOf, deletionSettingProblem, ERASE_DAYS_MAX, ERASE_DAYS_MIN, readDeletionRequests, saveDeletionSetting, statusText } from "./accountDeletion";
import { readDraft } from "./configDocs";
import { DateText, ErrorLine } from "./ui";

const COUNTRIES = ["SE", "FR", "TN"] as const;

/**
 * contract v0.18.134 (contract.json#accountDeletion; owner button 2026-11-20 "Accept, keep debt (Rec.)"): Riders ›
 * "Account deletion requests" (riders and drivers, newest first, never a phone number) and the country setting
 * "Erase after N days" + "Erase on" (off = the server only counts). Live builds only.
 */
export function LiveDeletionRequests() {
  const { client, can } = useLiveSession();
  const queryClient = useQueryClient();
  const key = ["live", "deletion-requests"];
  const list = useQuery({ queryKey: key, queryFn: () => readDeletionRequests(client) });
  const editable = can("settings.edit") && can("settings.publish");
  const [country, setCountry] = useState<(typeof COUNTRIES)[number]>("SE");
  const setting = useQuery({ queryKey: ["live", "deletion-setting", country], queryFn: async () => deletionSettingOf((await readDraft(client, "country_rules", `standard-${country}`))?.document ?? null) });
  const [days, setDays] = useState<string>("");
  const [on, setOn] = useState<boolean | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const current = setting.data ?? DELETION_DEFAULT;
  const shownDays = days === "" ? String(current.eraseAfterDays) : days;
  const shownOn = on ?? current.eraseEnabled;
  const problem = deletionSettingProblem(Number(shownDays));

  async function save() {
    if (problem || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await saveDeletionSetting(client, country, { eraseEnabled: shownOn, eraseAfterDays: Number(shownDays) });
      setMessage(tr("Saved."));
      setDays("");
      setOn(null);
      void queryClient.invalidateQueries({ queryKey: ["live", "deletion-setting", country] });
      void queryClient.invalidateQueries({ queryKey: key });
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel fn-panel" aria-label={tr("Account deletion requests")} data-testid="live-deletion-requests">
      <h3>{tr("Account deletion requests")}</h3>
      <p className="op-help">{tr("A rider or driver who deletes the account is closed at once. A debt is kept as a record (name, number, amount) until it is paid or written off. Everything else is erased after the set days; money and trip records stay for the bookkeeping law.")}</p>
      {list.isLoading ? <p className="state-line">{tr("Loading.")}</p> : list.error ? <ErrorLine error={list.error} onRetry={() => void queryClient.invalidateQueries({ queryKey: key })} /> : (list.data?.items.length ?? 0) === 0 ? <p className="dx-calm">{tr("No deletion requests.")}</p> : (
        <table className="data-table" data-testid="live-deletion-list">
          <thead><tr><th scope="col">{tr("Account")}</th><th scope="col">{tr("Asked")}</th><th scope="col">{tr("Erase from")}</th><th scope="col">{tr("Status")}</th><th scope="col">{tr("Kept debt")}</th></tr></thead>
          <tbody>
            {list.data!.items.map((row) => (
              <tr key={`${row.accountKind}:${row.accountId}`} data-deletion={row.accountId}>
                <td>{row.accountKind === "rider" ? tr("Rider") : tr("Driver")} · {row.firstName || row.accountId}</td>
                <td><DateText value={row.requestedAt} /></td>
                <td><DateText value={row.eraseDueAt} /></td>
                <td>{statusText(row)}</td>
                <td>{row.debt ? `${liveMoney(row.debt.amount)}${row.debt.settled ? ` · ${tr("Paid or written off")}` : ""}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {list.data ? <small className="live-list-count" data-testid="deletion-due-now">{tr("Due now: {0}", [list.data.dueNow])}</small> : null}
      <form className="live-form" data-testid="deletion-setting" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <h4>{tr("Erase setting (country Standard)")}</h4>
        <label className="field"><span>{tr("Country")}</span>
          <select value={country} onChange={(event) => { setCountry(event.target.value as (typeof COUNTRIES)[number]); setDays(""); setOn(null); }}>{COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        </label>
        <label className="field"><span>{tr("Erase after (days)")}</span><input inputMode="numeric" min={ERASE_DAYS_MIN} max={ERASE_DAYS_MAX} value={shownDays} disabled={!editable} onChange={(event) => setDays(event.target.value)} /></label>
        <label className="field-check"><input type="checkbox" checked={shownOn} disabled={!editable} onChange={(event) => setOn(event.target.checked)} /> {tr("Erase on (off = count only, nothing is erased)")}</label>
        {problem ? <small className="fine">{problem}</small> : null}
        {message ? <p role="status">{message}</p> : null}
        {editable ? <div className="actions"><button type="submit" className="primary-btn" data-command="admin.server.accountDeletionSetting" disabled={busy || Boolean(problem)}>{busy ? tr("Saving.") : tr("Save")}</button></div> : null}
      </form>
    </section>
  );
}
