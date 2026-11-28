import { useEffect, useState } from "react";
import { useLiveSessionMaybe } from "../live/LiveSessionContext";
import { NumberField } from "../pricing/NumberField";
import { tr, trx } from "../i18n";
import {
  budgetErrorText,
  budgetIssue,
  coversAllCountries,
  DAILY_LIMIT_RANGE,
  readGoogleBudget,
  roadLinesPerDay,
  saveGoogleBudget,
  type GoogleBudget,
  type GoogleBudgetInput,
} from "./googleBudget";

/**
 * Settings › Google budget (contract v0.18.171, contract.json#googleRoadLines.budgetSetting; owner 2026-11-27 split
 * 1,400 / 600, 2026-11-28 "admin must be able to change the maximum number of Google calls per day"): one global
 * budget. Any settings.read admin sees it; only a settings.publish admin who covers every country saves. The admin
 * makes no Google call. Live server only.
 */
export default function GoogleBudgetPanel({ editable }: { editable: boolean }) {
  const live = useLiveSessionMaybe();
  const [saved, setSaved] = useState<GoogleBudget | null>(null);
  const [shown, setShown] = useState<GoogleBudgetInput | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const allCountries = coversAllCountries(live?.admin?.scope);
  const canSave = editable && allCountries;

  useEffect(() => {
    if (!live) return;
    let alive = true;
    readGoogleBudget(live.client)
      .then((b) => {
        if (!alive) return;
        setSaved(b);
        setShown({ dailyLimit: b.dailyLimit, quotesPerDay: b.quotesPerDay });
      })
      .catch(() => alive && setMessage(tr("Could not read the Google budget. Try again.")));
    return () => {
      alive = false;
    };
  }, [live]);

  const issue = shown ? budgetIssue(shown) : null;
  const dirty = Boolean(shown && saved && (shown.dailyLimit !== saved.dailyLimit || shown.quotesPerDay !== saved.quotesPerDay));

  async function save() {
    if (!live || !shown || issue) return;
    setBusy(true);
    try {
      const fresh = await saveGoogleBudget(live.client, shown);
      setSaved(fresh);
      setShown({ dailyLimit: fresh.dailyLimit, quotesPerDay: fresh.quotesPerDay });
      setMessage(tr("Saved. The server uses it at once."));
    } catch (error) {
      setMessage(trx(budgetErrorText(error)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="panel" id="google-budget" data-testid="google-budget">
      <h3>{tr("Google budget")}</h3>
      <p className="dx-calm">{tr("One daily budget for all countries: prices (quotes) first, road lines get the rest. Over it, prices and lines use the estimate until tomorrow (Los Angeles midnight).")}</p>
      <p className="pl-warn">{tr("Keep this at or below your Google Cloud daily quota.")}</p>
      {!live ? (
        <p className="dx-calm">{tr("Only on the live server.")}</p>
      ) : shown === null || saved === null ? (
        message ? <p role="alert" className="pl-warn">{message}</p> : <p className="dx-calm">{tr("Loading…")}</p>
      ) : (
        <>
          <div className="field-grid">
            <label>
              {tr("Daily limit (Google calls)")}{" "}
              <NumberField label={tr("Daily limit (Google calls)")} value={shown.dailyLimit} min={DAILY_LIMIT_RANGE[0]} max={DAILY_LIMIT_RANGE[1]} disabled={!canSave || busy} onChange={(dailyLimit: number) => setShown({ ...shown, dailyLimit })} />
            </label>
            <label>
              {tr("Quotes per day")}{" "}
              <NumberField label={tr("Quotes per day")} value={shown.quotesPerDay} min={0} max={shown.dailyLimit} disabled={!canSave || busy} onChange={(quotesPerDay: number) => setShown({ ...shown, quotesPerDay })} />
            </label>
            <label>
              {tr("Road lines per day")}{" "}
              <input readOnly aria-label={tr("Road lines per day")} value={roadLinesPerDay(shown)} />
            </label>
          </div>
          <p className="state-line" data-testid="google-budget-today">
            {tr("Today {0}: {1} quotes, {2} road lines ({3} of {4} Google calls used).", [saved.today.day, saved.today.quotes, saved.today.roadLines, saved.today.quotes + saved.today.roadLines, saved.dailyLimit])}
          </p>
          {issue ? <p className="pl-warn" role="alert">{trx(issue)}</p> : null}
          {!allCountries ? <p className="dx-calm">{tr("Only an admin who covers every country can change the Google budget.")}</p> : null}
          {message ? <p role="status">{message}</p> : null}
          <button type="button" data-command="admin.config.publish" className="dash-btn publish" disabled={!canSave || !dirty || busy || issue !== null} onClick={() => void save()}>
            {tr("Save Google budget")}
          </button>
        </>
      )}
    </article>
  );
}
