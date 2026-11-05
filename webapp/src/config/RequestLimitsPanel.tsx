import { useEffect, useState } from "react";
import { useLiveSessionMaybe } from "../live/LiveSessionContext";
import { readDraft, savePublish, type Draft } from "../live/configDocs";
import { NumberField } from "../pricing/NumberField";
import { OPEN } from "../drivers/onboardingSettings";
import { COUNTRY_LABEL } from "../i18n/countries";
import type { MarketId } from "../markets/markets";
import { tr, trx } from "../i18n";
import { REQUEST_LIMIT_FIELDS, REQUEST_LIMIT_LABEL, REQUEST_LIMIT_RANGES, requestLimitIssue, requestLimitsOf, withRequestLimits, type RequestLimits } from "./requestLimits";

const COUNTRIES = (Object.keys(OPEN) as MarketId[]).filter((country) => OPEN[country]);

/**
 * Settings › Request limits (contract v0.18.24, owner 2026-11-04 "Yes, admin setting"): how many changes a person may
 * send per minute, per country. Saved in the country's Standard; the server uses it within about a minute.
 * Live server only: the demo has no server limit to set.
 */
export default function RequestLimitsPanel({ editable }: { editable: boolean }) {
  const live = useLiveSessionMaybe();
  const [country, setCountry] = useState<MarketId>(COUNTRIES[0] ?? "SE");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [shown, setShown] = useState<RequestLimits | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!live) return;
    let alive = true;
    setShown(null);
    setMessage(null);
    readDraft(live.client, "country_rules", `standard-${country}`)
      .then((found) => {
        if (!alive) return;
        setDraft(found);
        setShown(requestLimitsOf(found?.document ?? null));
      })
      .catch(() => alive && setMessage(tr("Could not read the request limits. Try again.")));
    return () => {
      alive = false;
    };
  }, [live, country]);

  const saved = requestLimitsOf(draft?.document ?? null);
  const issues = shown
    ? REQUEST_LIMIT_FIELDS.flatMap((field) => {
        const issue = requestLimitIssue(field, shown[field]);
        if (issue === null) return [];
        const [min, max] = REQUEST_LIMIT_RANGES[field];
        return [`${trx(REQUEST_LIMIT_LABEL[field])}: ${issue === "Enter a whole number." ? tr("Enter a whole number.") : tr("Between {0} and {1}.", [min, max])}`];
      })
    : [];
  const dirty = shown !== null && REQUEST_LIMIT_FIELDS.some((field) => shown[field] !== saved[field]);

  async function save() {
    if (!live || !shown || !draft || issues.length) return;
    setBusy(true);
    try {
      await savePublish(live.client, "country_rules", `standard-${country}`, draft, withRequestLimits(draft.document, shown));
      const fresh = await readDraft(live.client, "country_rules", `standard-${country}`);
      setDraft(fresh);
      setShown(requestLimitsOf(fresh?.document ?? null));
      setMessage(tr("Saved. The server uses the new limits within a minute."));
    } catch (error) {
      setMessage((error as Error).message || tr("Could not save. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="panel" id="request-limits" data-testid="request-limits">
      <h3>{tr("Request limits")}</h3>
      <p className="dx-calm">{tr("How many changes (book, cancel, send, save) one person may send per minute. Above it the apps say “wait a moment” and try again by themselves.")}</p>
      {!live ? (
        <p className="dx-calm">{tr("Only on the live server.")}</p>
      ) : (
        <>
          <label>
            {tr("Country")}{" "}
            <select value={country} onChange={(event) => setCountry(event.target.value as MarketId)}>
              {COUNTRIES.map((id) => <option key={id} value={id}>{trx(COUNTRY_LABEL[id])}</option>)}
            </select>
          </label>
          {shown === null ? (
            message ? null : <p className="dx-calm">{tr("Loading…")}</p>
          ) : !draft ? (
            <p className="dx-calm">{tr("This country has no published Standard yet.")}</p>
          ) : (
            REQUEST_LIMIT_FIELDS.map((field) => (
              <NumberField
                key={field}
                label={trx(REQUEST_LIMIT_LABEL[field])}
                value={shown[field]}
                min={REQUEST_LIMIT_RANGES[field][0]}
                max={REQUEST_LIMIT_RANGES[field][1]}
                step={1}
                disabled={!editable || busy}
                changed={shown[field] !== saved[field]}
                invalid={requestLimitIssue(field, shown[field]) !== null}
                onChange={(value) => setShown({ ...shown, [field]: value })}
              />
            ))
          )}
          {issues.length ? <p className="pl-warn" role="alert">{issues[0]}</p> : null}
          {message ? <p role="status">{message}</p> : null}
          <button type="button" data-command="admin.config.publish" className="dash-btn publish" disabled={!editable || !dirty || busy || issues.length > 0} onClick={() => void save()}>
            {tr("Save request limits")}
          </button>
        </>
      )}
    </article>
  );
}
