import { useEffect, useState } from "react";
import { useLiveSessionMaybe } from "../live/LiveSessionContext";
import { readDraft, savePublish, type Draft } from "../live/configDocs";
import { OPEN } from "../drivers/onboardingSettings";
import { COUNTRY_LABEL } from "../i18n/countries";
import { marketZoneIds, standardZoneId, zoneById, type MarketId } from "../markets/markets";
import { tr, trx } from "../i18n";
import { SettingInfo } from "../ui/SettingInfo";
import {
  MIN_APPS,
  MIN_APP_DOC,
  MIN_PLATFORMS,
  minFieldIssue,
  minFieldsIssues,
  minVersionFieldsOf,
  sameMinFields,
  withMinVersion,
  type MinApp,
  type MinFieldKind,
  type MinPlatform,
  type MinVersionFields,
} from "./appUpdateMin";

const COUNTRIES = (Object.keys(OPEN) as MarketId[]).filter((country) => OPEN[country]);
const APP_LABEL: Record<MinApp, string> = { rider: "Rider app", driver: "Driver app" };
const FIELD_LABEL: Record<MinFieldKind, Record<MinPlatform, string>> = {
  minVersion: { android: "Android minimum", ios: "iOS minimum" },
  storeUrls: { android: "Android store link", ios: "iOS store link" },
};

type Loaded = { draft: Draft | null; fields: MinVersionFields };

/**
 * Settings › Minimum app version (contract v0.18.154 P16c, contract.json#appUpdate; owner 2026-11-21 20:30 "Yes, build it
 * now (Recommended)"): per scope (a country Standard or a zone), for the rider app and the driver app, the Android and iOS
 * minimum (empty = off) and store links. Save publishes only appUpdate.minVersion and appUpdate.storeUrls of the scope's
 * rider_app_config and driver_app_config, starting from the server's document. Live server only.
 */
export default function AppUpdatePanel({ editable }: { editable: boolean }) {
  const live = useLiveSessionMaybe();
  const [country, setCountry] = useState<MarketId>(COUNTRIES[0] ?? "SE");
  const [scope, setScope] = useState<string>(standardZoneId(COUNTRIES[0] ?? "SE"));
  const [loaded, setLoaded] = useState<Record<MinApp, Loaded> | null>(null);
  const [shown, setShown] = useState<Record<MinApp, MinVersionFields> | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function read(id: string): Promise<Record<MinApp, Loaded>> {
    const out = {} as Record<MinApp, Loaded>;
    for (const app of MIN_APPS) {
      const draft = await readDraft(live!.client, MIN_APP_DOC[app], id);
      out[app] = { draft, fields: minVersionFieldsOf(draft?.document ?? null) };
    }
    return out;
  }

  useEffect(() => {
    if (!live) return;
    let alive = true;
    setLoaded(null);
    setShown(null);
    setMessage(null);
    read(scope)
      .then((found) => {
        if (!alive) return;
        setLoaded(found);
        setShown({ rider: found.rider.fields, driver: found.driver.fields });
      })
      .catch(() => alive && setMessage(tr("Could not read the minimum app version. Try again.")));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, scope]);

  const issues = shown ? MIN_APPS.flatMap((app) => minFieldsIssues(shown[app])) : [];
  const dirty = Boolean(shown && loaded && MIN_APPS.some((app) => !sameMinFields(shown[app], loaded[app].fields)));
  const usesStandard = Boolean(loaded && MIN_APPS.some((app) => loaded[app].draft?.usesStandard === true));

  async function save() {
    if (!live || !shown || !loaded || issues.length) return;
    setBusy(true);
    try {
      for (const app of MIN_APPS) {
        if (sameMinFields(shown[app], loaded[app].fields)) continue;
        const draft = loaded[app].draft;
        const base = draft?.document ?? { zoneId: scope };
        await savePublish(live.client, MIN_APP_DOC[app], scope, draft, withMinVersion(base, shown[app]));
      }
      const fresh = await read(scope);
      setLoaded(fresh);
      setShown({ rider: fresh.rider.fields, driver: fresh.driver.fields });
      setMessage(tr("Saved. Phones get it with the next settings update."));
    } catch (error) {
      setMessage((error as Error).message || tr("Could not save. Try again."));
    } finally {
      setBusy(false);
    }
  }

  const edit = (app: MinApp, kind: MinFieldKind, platform: MinPlatform, value: string) =>
    shown && setShown({ ...shown, [app]: { ...shown[app], [kind]: { ...shown[app][kind], [platform]: value } } });

  return (
    <article className="panel" id="app-update" data-testid="app-update">
      <h3>{tr("Minimum app version")}</h3>
      <p className="dx-calm">{tr("A phone below the minimum sees one screen, “Update Movera to continue”, with a button to its store. A driver on a trip is never stopped mid-trip. Empty = off.")}</p>
      <p className="pl-warn">{tr("Phones below this version must update before they can book or go online.")}</p>
      {!live ? (
        <p className="dx-calm">{tr("Only on the live server.")}</p>
      ) : (
        <>
          <label>
            {tr("Country")}{" "}
            {/* info-skip: picks which country's scopes are listed, not a setting */}
            <select value={country} onChange={(event) => { const next = event.target.value as MarketId; setCountry(next); setScope(standardZoneId(next)); }}>
              {COUNTRIES.map((id) => <option key={id} value={id}>{trx(COUNTRY_LABEL[id])}</option>)}
            </select>
          </label>{" "}
          <label>
            {tr("Where")}{" "}
            {/* info-skip: picks which scope's values are shown, not a setting */}
            <select value={scope} onChange={(event) => setScope(event.target.value)}>
              <option value={standardZoneId(country)}>{tr("Standard (every zone that has no own settings)")}</option>
              {marketZoneIds(country).map((id) => <option key={id} value={id}>{zoneById(id)?.name ?? id}</option>)}
            </select>
          </label>
          {usesStandard ? <p className="dx-calm">{tr("This zone uses its country Standard now; saving here gives it its own value.")}</p> : null}
          {shown === null ? (
            message ? null : <p className="dx-calm">{tr("Loading…")}</p>
          ) : (
            MIN_APPS.map((app) => (
              <fieldset key={app} className="cx-min-version">
                <legend>{trx(APP_LABEL[app])}</legend>
                {(["minVersion", "storeUrls"] as const).flatMap((kind) =>
                  MIN_PLATFORMS.map((platform) => {
                    const value = shown[app][kind][platform];
                    const issue = minFieldIssue(kind, value);
                    const label = trx(FIELD_LABEL[kind][platform]);
                    return (
                      <label key={`${kind}.${platform}`} className="cx-min-row">
                        {label}<SettingInfo id={`settings.appUpdate.${kind}.${platform}`} label={label} />{" "}
                        <input type="text" inputMode={kind === "minVersion" ? "decimal" : "url"} aria-label={`${trx(APP_LABEL[app])} ${label}`} placeholder={kind === "minVersion" ? tr("Off") : tr("The app's own link")} value={value} disabled={!editable || busy} aria-invalid={issue !== null} onChange={(event) => edit(app, kind, platform, event.target.value)} />
                        {issue ? <small className="pl-warn" role="alert">{trx(issue)}</small> : null}
                      </label>
                    );
                  }),
                )}
              </fieldset>
            ))
          )}
          {message ? <p role="status">{message}</p> : null}
          <button type="button" data-command="admin.config.publish" className="dash-btn publish" disabled={!editable || !dirty || busy || issues.length > 0} onClick={() => void save()}>
            {tr("Save minimum app version")}
          </button>
        </>
      )}
    </article>
  );
}
