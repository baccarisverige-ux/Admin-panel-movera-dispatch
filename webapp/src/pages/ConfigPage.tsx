import { useEffect, useMemo, useState } from "react";
import { useLiveSessionMaybe } from "../live/LiveSessionContext";
import { NotConnected } from "../live/NotConnected";
import { CopyToAllZones, PublishTargetsLine } from "../live/StandardBar";
import { zoneById as zoneNameOf } from "../markets/markets";
import { publishTargets } from "../markets/scope";
import { useMarketScope } from "../markets/useMarketScope";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { CompareVersions, FindSetting, PanelSettings, SettingsElsewhere } from "../platform/SettingsParts";
import { useSession } from "../auth/SessionContext";
import {
  advanceConfigClock,
  approveConfig,
  configDiff,
  effectiveValue,
  emptyConfig,
  impactPreview,
  missingTranslations,
  normalizeConfig,
  publishConfig,
  removeOverride,
  REASON_GROUPS,
  rollbackConfig,
  setAppUpdate,
  setAppVersion,
  setEnvironment,
  setExpiry,
  setOverride,
  setReason,
  setSchedule,
  setSwitch,
  setZoneOverride,
  submitConfigApproval,
  useRecords,
  useSlice,
  type ConfigBook,
  type EffectiveContext,
  type FeatureKey,
  type OverrideLevel,
} from "../api/hooks";
import { CATEGORIES } from "../domain/contract";
import { coreZones, stockholmZones } from "../zones/releases";
import { CommandButton } from "../ui/CommandButton";
import { useDirtyWarning } from "../ui/useDirtyWarning";
import { RefundPolicyPanel } from "../payments/RefundPolicyPanel";
import { CountryAppsPanel } from "../config/CountryAppsPanel";
import { can } from "../auth/permissions";
import { tr, trn, trx, trSentences } from "../i18n";
import { LanguageQuickSwitch } from "../i18n/LanguageQuickSwitch";

const LEVELS: OverrideLevel[] = ["market", "zone", "category", "app", "platform", "appVersion", "cohort"];

function platformName(app: string, platform: string): string {
  return `${app === "rider" ? tr("Rider") : tr("Driver")} ${platform === "ios" ? "iOS" : "Android"}`;
}

function defaultTarget(level: OverrideLevel, zoneId: string, book: ConfigBook): string {
  if (level === "market") return "SE-STO";
  if (level === "zone") return zoneId;
  if (level === "category") return "economy";
  if (level === "app") return "rider";
  if (level === "platform") return "ios";
  if (level === "appVersion") return book.draft.versions.rider;
  return "beta";
}

function targetOptions(level: OverrideLevel, book: ConfigBook): { value: string; label: string }[] {
  if (level === "market") return [{ value: "SE-STO", label: tr("Stockholm market") }];
  if (level === "zone") return coreZones(stockholmZones()).map((zone) => ({ value: zone.id, label: zone.name }));
  if (level === "category") return CATEGORIES.map((item) => ({ value: item.id, label: item.label }));
  if (level === "app") return [{ value: "rider", label: tr("Rider") }, { value: "driver", label: tr("Driver") }];
  if (level === "platform") return [{ value: "ios", label: tr("iOS") }, { value: "android", label: tr("Android") }];
  if (level === "appVersion") {
    return [
      { value: book.draft.versions.rider, label: `Rider ${book.draft.versions.rider}` },
      { value: book.draft.versions.driver, label: `Driver ${book.draft.versions.driver}` },
    ];
  }
  return [{ value: "beta", label: tr("beta") }, { value: "staff", label: tr("staff") }, { value: "new-riders", label: tr("new-riders") }];
}

function isoFromLocal(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function localFromIso(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function sameBook(a: ConfigBook, b: ConfigBook): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Switches Dispatch owns (Q26, X18): scheduled rides. Shown read-only here, with a link to the real setting. */
const DISPATCH_SWITCHES = new Set(["scheduled", "bookLater", "scheduledRides"]);
/** Payment method switches (Q7 FINAL): one setting per country in "Payment methods and languages per country" below. */
const PAYMENT_SWITCHES = new Set(["cash", "applePay", "googlePay"]);

function SwitchRow({ item, onChange }: { item: { id: string; label: string; on: boolean }; onChange: (on: boolean) => void }) {
  if (DISPATCH_SWITCHES.has(item.id)) {
    return <p className="check-row op-help" data-testid={`config-switch-moved-${item.id}`}>{trn("{0}: set per zone in Dispatch › Reservations. {1}", trx(item.label), <Link to="/dispatch?tab=reservations">{tr("Edit in Dispatch")}</Link>)}</p>;
  }
  if (PAYMENT_SWITCHES.has(item.id)) {
    return <p className="check-row op-help" data-testid={`config-switch-moved-${item.id}`}>{trn("{0}: set per country in Payment methods and languages. {1}", trx(item.label), <a href="#country-apps" onClick={(event) => { event.preventDefault(); document.getElementById("country-apps")?.scrollIntoView({ block: "start" }); }}>{tr("Edit per country")}</a>)}</p>;
  }
  return (
    <label className="check-row">
      <input type="checkbox" checked={item.on} onChange={(event) => onChange(event.target.checked)} />
      {trx(item.label)}
    </label>
  );
}

function ConfigAll({ onDirty }: { onDirty?: (dirty: boolean) => void }) {
  const { agent } = useSession();
  const liveAdmin = Boolean(useLiveSessionMaybe());
  const store = useSlice<ConfigBook>("config", emptyConfig());
  const persisted = useMemo(() => normalizeConfig(store.value), [store.value]);
  const [book, setBook] = useState<ConfigBook>(() => emptyConfig());
  const [notice, setNotice] = useState(tr("Draft is not live."));
  const [zoneId, setZoneId] = useState("op-norrmalm");
  const [featureKey, setFeatureKey] = useState<FeatureKey>("wallet");
  const [level, setLevel] = useState<OverrideLevel>("market");
  const [target, setTarget] = useState("SE-STO");
  const [overrideValue, setOverrideValue] = useState(true);
  const [startsAt, setStartsAt] = useState("");
  const [ruleExpiresAt, setRuleExpiresAt] = useState("");
  const [context, setContext] = useState<EffectiveContext>({
    market: "SE-STO",
    zoneId: "op-norrmalm",
    category: "economy",
    app: "rider",
    platform: "ios",
    appVersion: "1.0.0",
    cohort: "beta",
  });

  // C-17 / Q33: opening Settings saves nothing. A schedule or expiry that is due is applied on read (as the app
  // config export does), shown here, and stored only with Save draft or "Apply due schedule / expiry".
  const [openedAt] = useState(() => new Date().toISOString());
  const base = useMemo(() => advanceConfigClock(persisted, openedAt), [persisted, openedAt]);
  const lifecycleDue = !sameBook(base, persisted);
  useEffect(() => {
    if (store.loading) return;
    setBook(base);
  }, [base, store.loading]);

  const dirty = !sameBook(book, base);
  const [refundDirty, setRefundDirty] = useState(false);
  const [countryDirty, setCountryDirty] = useState(false);
  useDirtyWarning(dirty || refundDirty || countryDirty);
  useEffect(() => {
    onDirty?.(dirty || refundDirty || countryDirty);
    return () => onDirty?.(false);
  }, [dirty, refundDirty, countryDirty, onDirty]);
  const missing = missingTranslations(book.draft.reasons);
  const staff = useRecords("staff", null);
  const diff = configDiff(book.published, book.draft);
  const zones = coreZones(stockholmZones());
  const legacyOverride = book.draft.zoneOverrides[zoneId] ?? {};
  const preview = useMemo(() => impactPreview(book), [book]);
  const reservations = effectiveValue(book.draft, "reservations", context);
  const wallet = effectiveValue(book.draft, "wallet", context);
  const options = targetOptions(level, book);

  function edit(build: (current: ConfigBook) => ConfigBook, text = "Unsaved draft changes.") {
    setBook((current) => build(current));
    setNotice(text);
  }

  function changeLevel(next: OverrideLevel) {
    setLevel(next);
    setTarget(defaultTarget(next, zoneId, book));
  }

  // v0.8.0 (owner 2026-10-27): live publishes at once; scheduled publish, expiry and overrides have no server field yet.
  const liveSession = useLiveSessionMaybe();
  // Owner 2026-10-27: a Settings publish reaches only the zones chosen at the top (the Standard when chosen).
  const settingsTargets = publishTargets(useMarketScope());
  const review = agent ? submitConfigApproval(book, agent.id) : null;
  const approval = agent ? approveConfig(book, agent.id) : null;
  const publication = agent ? publishConfig(book, agent.id, new Date().toISOString(), { direct: Boolean(liveSession) }) : null;
  const rollback = agent ? rollbackConfig(book, agent.id, new Date().toISOString()) : book;

  if (store.loading) return <p className="state-line">{tr("Loading configuration.")}</p>;

  return (
    <div className="pl-settings-all">
      <div className="page-heading">
        <div>
          <h2>{tr("Configuration")}</h2>
          <p>{trn("Published version {0}. Config revision {1}. Status {2}. Rider {3}. Driver {4}. Staff {5}. Languages: English, French and Swedish (default per country below).", book.rev, book.draftRev, book.status, book.published.versions.rider, book.published.versions.driver, staff.data?.length ?? "…")}</p>
        </div>
        <Link to="/confirm">{tr("Open to confirm")}</Link>
      </div>

      <p className="state-line" data-config-dirty={dirty ? "yes" : "no"}>
        {trSentences(notice)}
        {store.message ? ` ${store.message}` : ""}
        {missing.length > 0 ? tr(" Missing translation: {0}.", [missing.join(", ")]) : ""}
        {dirty ? tr(" Unsaved changes.") : tr(" Saved draft.")}
        {lifecycleDue && !dirty ? tr(" A scheduled change is due: it is shown here and is stored with the next save.") : ""}
      </p>

      {/* Owner 2026-10-28: one admin is enough everywhere, so the live panel has no second-admin limit. */}
      {liveAdmin ? null : <RefundPolicyPanel editable={Boolean(agent && can(agent.role, "settings.publish"))} onDirty={setRefundDirty} />}

      {/* G3-D8: one zone (or the Standard) chosen at the top: its driver app settings can be copied to every zone. */}
      {liveSession && settingsTargets.length === 1 ? <CopyToAllZones zoneId={settingsTargets[0]} zoneName={zoneNameOf(settingsTargets[0])?.name ?? settingsTargets[0]} canEdit={Boolean(agent && can(agent.role, "settings.publish"))} /> : null}

      <CountryAppsPanel editable={Boolean(agent && can(agent.role, "settings.publish"))} onDirty={setCountryDirty} />

      <article className="panel" data-testid="config-impact">
        <h3>{tr("Impact preview")}</h3>
        <div className="field-grid">
          <label>{trn("Changed items{0}", <input readOnly value={preview.changed} />)}</label>
          <label>{trn("Affected scopes{0}", <input readOnly value={preview.scopes.join(", ")} />)}</label>
          <label>{trn("Scheduled for{0}", <input readOnly value={preview.scheduledFor ?? "Now after approval"} />)}</label>
          <label>{trn("Expires at{0}", <input readOnly value={preview.expiresAt ?? "No expiry"} />)}</label>
        </div>
        <p className="state-line" data-impact-scopes>{trn("Affected scopes: {0}.", preview.scopes.join(", "))}</p>
        <p className="state-line">
          {preview.missingTranslations.length
            ? tr("Publish blocked: missing {0}.", [preview.missingTranslations.join(", ")])
            : tr("Translation coverage is complete.")}
        </p>
        <ul aria-label={tr("Configuration diff")}>
          {diff.length === 0 ? <li>{tr("No unpublished changes.")}</li> : diff.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </article>

      <article className="panel">
        <h3>{tr("Draft controls")}</h3>
        <div className="actions">
          <CommandButton
            command="admin.config.save"
            confirmTarget={false}
            className="primary-btn"
            type="button"
            targetId="configuration"
            before={`config ${persisted.draftRev}`}
            after={`config ${book.draftRev}`}
            disabled={!dirty}
            title={dirty ? undefined : tr("No unsaved configuration changes.")}
            expectedSliceRev={persisted.draftRev}
            sliceKey="config"
            value={book}
            onDone={() => setNotice(tr("Draft saved through AdminApi."))}
          >{tr("Save draft")}</CommandButton>
          <button
            data-command="admin.card.action"
            className="secondary-btn"
            type="button"
            disabled={!dirty}
            onClick={() => {
              setBook(base);
              setNotice(tr("Unsaved draft changes discarded."));
            }}
          >{tr("Discard unsaved")}</button>
        </div>
      </article>

      <article className="panel">
        <h3>{tr("Features")}</h3>
        <p className="state-line">{tr("Rider app")}</p>
        {book.draft.switches.filter((item) => item.app === "rider").map((item) => <SwitchRow key={item.id} item={item} onChange={(on) => agent && edit((current) => setSwitch(current, item.id, on, agent.id))} />)}
        <p className="state-line">{tr("Driver app")}</p>
        {book.draft.switches.filter((item) => item.app === "driver").map((item) => <SwitchRow key={item.id} item={item} onChange={(on) => agent && edit((current) => setSwitch(current, item.id, on, agent.id))} />)}
      </article>

      <article className="panel">
        <h3>{tr("App versions and lifecycle")}</h3>
        <div className="field-grid">
          <label>{trn("Rider app{0}", <input
              value={book.draft.versions.rider}
              onChange={(event) => {
                if (!agent) return;
                edit((current) => setAppVersion(current, "rider", event.target.value, agent.id));
                setContext((current) => ({ ...current, appVersion: event.target.value }));
              }}
            />)}</label>
          <label>{trn("Driver app{0}", <input
              value={book.draft.versions.driver}
              onChange={(event) => agent && edit(
                (current) => setAppVersion(current, "driver", event.target.value, agent.id),
              )}
            />)}</label>

          {book.draft.updates.map((item) => {
            const name = platformName(item.app, item.platform);
            return (
              <div key={`${item.app}-${item.platform}`}>
                <label>{trn("{0} minimum{1}", name, <input
                    value={item.minimumVersion}
                    onChange={(event) => agent && edit(
                      (current) => setAppUpdate(current, item.app, item.platform, { minimumVersion: event.target.value }, agent.id),
                    )}
                  />)}</label>
                <label>{trn("{0} latest{1}", name, <input
                    value={item.latestVersion}
                    onChange={(event) => agent && edit(
                      (current) => setAppUpdate(current, item.app, item.platform, { latestVersion: event.target.value }, agent.id),
                    )}
                  />)}</label>
                <label>{trn("{0} message{1}", name, <input
                    value={item.message}
                    onChange={(event) => agent && edit(
                      (current) => setAppUpdate(current, item.app, item.platform, { message: event.target.value }, agent.id),
                    )}
                  />)}</label>
                <label className="check-row">{trn("{0}{1} mandatory", <input
                    type="checkbox"
                    checked={item.mandatory}
                    onChange={(event) => agent && edit(
                      (current) => setAppUpdate(current, item.app, item.platform, { mandatory: event.target.checked }, agent.id),
                    )}
                  />, name)}</label>
              </div>
            );
          })}

          <label>{trn("Publish schedule{0}", <input
              aria-label={tr("Publish schedule")}
              type="datetime-local"
              value={localFromIso(book.draft.scheduleAt)}
              onChange={(event) => {
                if (!agent) return;
                const scheduleAt = isoFromLocal(event.target.value);
                edit((current) => setSchedule(current, scheduleAt, agent.id));
              }}
            />)}{liveSession ? <NotConnected control /> : null}</label>
          <label>{trn("Expiry{0}", <input
              aria-label={tr("Configuration expiry")}
              type="datetime-local"
              value={localFromIso(book.draft.expiresAt)}
              onChange={(event) => {
                if (!agent) return;
                const expiresAt = isoFromLocal(event.target.value);
                edit((current) => setExpiry(current, expiresAt, agent.id));
              }}
            />)}{liveSession ? <NotConnected control /> : null}</label>
        </div>
      </article>

      <article className="panel">
        <h3>{tr("Advanced precedence overrides")}{liveSession ? <NotConnected control /> : null}</h3>
        <p className="state-line">{tr("Winning order: global → market → zone → category → app → platform → app version → cohort.")}</p>
        <div className="field-grid">
          <label>{trn("Feature{0}", <select aria-label={tr("Override feature")} value={featureKey} onChange={(event) => setFeatureKey(event.target.value as FeatureKey)}>
              <option value="wallet">{tr("Wallet")}</option>
            </select>)}</label>
          <label>{trn("Level{0}", <select aria-label={tr("Override level")} value={level} onChange={(event) => changeLevel(event.target.value as OverrideLevel)}>
              {LEVELS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>)}</label>
          <label>{trn("Target{0}{1}", <input aria-label={tr("Override target")} list="override-target-options" value={target} onChange={(event) => setTarget(event.target.value)} />, <datalist id="override-target-options">
              {options.map((item) => <option key={item.value} value={item.value}>{trx(item.label)}</option>)}
            </datalist>)}</label>
          <label>{trn("Value{0}", <select aria-label={tr("Override value")} value={overrideValue ? "on" : "off"} onChange={(event) => setOverrideValue(event.target.value === "on")}>
              <option value="on">{tr("On")}</option>
              <option value="off">{tr("Off")}</option>
            </select>)}</label>
          <label>{trn("Starts at{0}", <input aria-label={tr("Override starts at")} type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />)}</label>
          <label>{trn("Expires at{0}", <input aria-label={tr("Override expires at")} type="datetime-local" value={ruleExpiresAt} onChange={(event) => setRuleExpiresAt(event.target.value)} />)}</label>
        </div>

        <button
          data-command="admin.card.action"
          className="primary-btn"
          type="button"
          onClick={() => {
            if (!agent || !target.trim()) return;
            const id = `${featureKey}-${level}-${target.trim()}`;
            edit((current) => setOverride(current, {
              id,
              key: featureKey,
              level,
              target: target.trim(),
              value: overrideValue,
              startsAt: isoFromLocal(startsAt),
              expiresAt: isoFromLocal(ruleExpiresAt),
            }, agent.id));
            setNotice(tr("Override {0} added to the unsaved draft.", [id]));
          }}
        >{tr("Add or replace override")}</button>

        {book.draft.overrides.length === 0 ? (
          <p className="state-line">{tr("No advanced overrides in this draft.")}</p>
        ) : (
          <ul className="version-list" aria-label={tr("Advanced overrides")}>
            {book.draft.overrides.map((rule) => (
              <li key={rule.id}>
                <strong>{rule.key}</strong> · {rule.level}:{rule.target} · {rule.value ? tr("on") : tr("off")}
                {rule.startsAt ? tr(" · starts {0}", [rule.startsAt]) : ""}
                {rule.expiresAt ? tr(" · expires {0}", [rule.expiresAt]) : ""}
                {" "}
                <button
                  data-command="admin.card.action"
                  className="link-action"
                  type="button"
                  onClick={() => {
                    if (!agent) return;
                    edit((current) => removeOverride(current, rule.id, agent.id));
                    setNotice(tr("Override {0} removed from the unsaved draft.", [rule.id]));
                  }}
                >{tr("Remove")}</button>
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="panel">
        <h3>{tr("Effective value viewer")}</h3>
        <div className="field-grid">
          <label>{trn("Preview market{0}", <input value={context.market ?? ""} onChange={(event) => setContext((current) => ({ ...current, market: event.target.value }))} />)}</label>
          <label>{trn("Preview zone{0}", <select value={context.zoneId ?? ""} onChange={(event) => setContext((current) => ({ ...current, zoneId: event.target.value }))}>
              {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
            </select>)}</label>
          <label>{trn("Preview category{0}", <select value={context.category ?? "economy"} onChange={(event) => setContext((current) => ({ ...current, category: event.target.value }))}>
              {CATEGORIES.map((item) => <option key={item.id} value={item.id}>{trx(item.label)}</option>)}
            </select>)}</label>
          <label>{trn("Preview app{0}", <select aria-label={tr("Preview app")} value={context.app ?? "rider"} onChange={(event) => setContext((current) => ({ ...current, app: event.target.value as "rider" | "driver" }))}>
              <option value="rider">{tr("Rider")}</option>
              <option value="driver">{tr("Driver")}</option>
            </select>)}</label>
          <label>{trn("Preview platform{0}", <select value={context.platform ?? "ios"} onChange={(event) => setContext((current) => ({ ...current, platform: event.target.value as "ios" | "android" }))}>
              <option value="ios">{tr("iOS")}</option>
              <option value="android">{tr("Android")}</option>
            </select>)}</label>
          <label>{trn("Preview app version{0}", <input value={context.appVersion ?? ""} onChange={(event) => setContext((current) => ({ ...current, appVersion: event.target.value }))} />)}</label>
          <label>{trn("Preview cohort{0}", <input value={context.cohort ?? ""} onChange={(event) => setContext((current) => ({ ...current, cohort: event.target.value }))} />)}</label>
        </div>
        <p className="state-line" data-effective={reservations.level}>{trn("Effective reservations: {0}. Winning level: {1}. {2}", reservations.value, reservations.level, reservations.chain.join(" · "))}</p>
        <p className="state-line" data-testid="effective-precedence" data-effective-wallet={wallet.level}>{trn("Effective wallet: {0}. Winning level: {1}. {2}", wallet.value, wallet.level, wallet.chain.join(" · "))}</p>
      </article>

      <article className="panel">
        <h3>{tr("Legacy per-zone feature switches")}</h3>
        <label>{trn("Zone override{0}", <select
            aria-label={tr("Zone override")}
            value={zoneId}
            onChange={(event) => {
              setZoneId(event.target.value);
              if (level === "zone") setTarget(event.target.value);
            }}
          >
            {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
          </select>)}</label>
        {/* Q26 / X18: scheduled rides are set per zone in Dispatch; shown here read-only. */}
        <p className="op-help" data-testid="config-reservations-moved">{trn("Reservations per zone: set in Dispatch. {0}", <Link to="/dispatch?tab=reservations">{tr("Edit in Dispatch")}</Link>)}</p>
        <label className="check-row">{trn("{0}Wallet in this zone", <input
            type="checkbox"
            checked={legacyOverride.wallet ?? book.draft.features.wallet}
            onChange={(event) => agent && edit(
              (current) => setZoneOverride(current, zoneId, "wallet", event.target.checked, agent.id),
            )}
          />)}</label>
      </article>

      <article className="panel">
        <h3>{tr("Reasons")}</h3>
        <p className="op-help" data-testid="config-reasons-moved">{trn("Cancel reasons are edited in one place: {0}. The cancel groups below are kept read-only for reference.", <Link to="/dispatch?view=reasons">{tr("Dispatch › Cancel reasons")}</Link>)}</p>
        {REASON_GROUPS.map((group) => {
          const editable = group.id === "rider_support";
          return (
            <details key={group.id} open={editable}>
              <summary>{trx(group.label)}{editable ? "" : tr(" (read-only, edit in Dispatch)")}</summary>
              {book.draft.reasons.filter((reason) => reason.group === group.id).map((reason) => editable ? (
                <div className="field-grid" key={reason.id}>
                  <label>{trn("{0} Swedish{1}", reason.id, <input value={reason.sv} onChange={(event) => agent && edit(
                      (current) => setReason(current, reason.id, "sv", event.target.value, agent.id),
                    )} />)}</label>
                  <label>{trn("{0} English{1}", reason.id, <input value={reason.en} onChange={(event) => agent && edit(
                      (current) => setReason(current, reason.id, "en", event.target.value, agent.id),
                    )} />)}</label>
                </div>
              ) : (
                <p className="op-help" key={reason.id}><code>{reason.id}</code> · {reason.en} · {reason.sv}</p>
              ))}
            </details>
          );
        })}
      </article>

      <article className="panel">
        <h3>{tr("Booking rules")}</h3>
        {/* Q26 / X18: max stops is set per zone in Dispatch › Rides & stops (the value the apps get). */}
        <p className="op-help" data-testid="config-stops-moved">{trn("Max stops: set per zone in Dispatch › Rides & stops. {0}", <Link to="/dispatch?tab=rides">{tr("Edit in Dispatch")}</Link>)}</p>
      </article>

      <article className="panel">
        <h3>{tr("Environment (test only)")}</h3>
        {([
          ["simulatedArrival", "Simulated arrival (test only)"],
          ["skipActivation", "Skip activation (test only)"],
          ["demoPopup", "Preview popup (test only)"],
          ["demoHint", "Preview hint (test only)"],
        ] as const).map(([key, label]) => (
          <label className="check-row" key={key}>
            <input
              type="checkbox"
              checked={book.draft.environment[key]}
              onChange={(event) => agent && edit(
                (current) => setEnvironment(current, key, event.target.checked, agent.id),
              )}
            />
            {trx(label)}
          </label>
        ))}
      </article>

      <article className="panel">
        <h3>{tr("Scheduled versions")}{liveSession ? <NotConnected control /> : null}</h3>
        {book.scheduled.length === 0 ? (
          <p className="state-line">{tr("No scheduled configuration.")}</p>
        ) : (
          <ol className="version-list" aria-label={tr("Scheduled configuration")}>
            {book.scheduled.map((item) => (
              <li key={item.rev}>{trn("Version {0} · effective {1} · expires {2} · by {3}", item.rev, item.effectiveAt, item.expiresAt ?? tr("never"), item.actorId)}</li>
            ))}
          </ol>
        )}
      </article>

      <article className="panel">
        <h3>{tr("Publish history")}</h3>
        <ol aria-label={tr("Publish history")}>
          {book.publications.length === 0 ? <li>{tr("No publishes yet.")}</li> : book.publications.map((item, index) => (
            <li key={`${item.rev}-${item.kind ?? "publish"}-${index}`}>{trn("Version {0} · {1} by {2}{3}{4}{5}", item.rev, item.kind ?? tr("publish"), item.actorId, item.effectiveAt ? tr(" · effective {0}", [item.effectiveAt]) : "", item.expiresAt ? tr(" · expires {0}", [item.expiresAt]) : "", item.diff.length ? `: ${item.diff.join("; ")}` : tr(": no diff"))}</li>
          ))}
        </ol>
      </article>

      <article className="panel">
        <h3>{tr("Review and publish")}</h3>
        <div className="actions">
          {liveSession ? null : <>
          <CommandButton
            command="admin.config.review"
            confirmTarget={false}
            className="secondary-btn"
            type="button"
            targetId="configuration"
            before={book.status}
            after="in_review"
            disabled={dirty || !review || !!review.error}
            title={dirty ? tr("Save the draft first.") : review?.error}
            expectedSliceRev={persisted.draftRev}
            sliceKey="config"
            value={review?.book}
            onDone={() => {
              if (!review || review.error) return;
              setBook(review.book);
              setNotice(tr("Sent for approval."));
            }}
          >{tr("Send for approval")}</CommandButton>

          <CommandButton
            command="admin.config.approve"
            confirmTarget={false}
            className="secondary-btn"
            type="button"
            targetId="configuration"
            before={book.status}
            after="approved"
            disabled={dirty || !approval || !!approval.error}
            title={dirty ? tr("Save the draft first.") : approval?.error}
            expectedSliceRev={persisted.draftRev}
            sliceKey="config"
            value={approval?.book}
            onDone={() => {
              if (!approval || approval.error) return;
              setBook(approval.book);
              setNotice(tr("Approved. A second agent can publish."));
            }}
          >{tr("Approve")}</CommandButton>
          </>}

          <CommandButton
            command="admin.config.publish"
            confirmTarget={false}
            summary={liveSession ? <PublishTargetsLine zoneIds={settingsTargets} /> : undefined}
            scope={liveSession ? settingsTargets.join(",") : undefined}
            className="primary-btn"
            type="button"
            targetId="configuration"
            before={book.status}
            after={book.draft.scheduleAt ? "scheduled" : "published"}
            disabled={dirty || !publication || !!publication.error}
            title={dirty ? tr("Save the draft first.") : publication?.error}
            expectedSliceRev={persisted.draftRev}
            sliceKey="config"
            value={publication?.book}
            onDone={() => {
              if (!publication || publication.error) return;
              setBook(publication.book);
              setNotice(publication.scheduled
                  ? tr("Scheduled configuration version {0}.", [publication.book.rev])
                  : tr("Published version {0}.", [publication.book.rev]));
            }}
          >{tr("Publish")}</CommandButton>

          <CommandButton
            command="admin.config.rollback"
            confirmTarget={false}
            className="secondary-btn"
            type="button"
            targetId="configuration"
            before={`version ${book.rev}`}
            after="previous snapshot as new version"
            disabled={dirty || book.history.length < 2}
            title={dirty ? tr("Discard or save unsaved changes first.") : book.history.length < 2 ? tr("No previous published version exists.") : undefined}
            expectedSliceRev={persisted.draftRev}
            sliceKey="config"
            value={rollback}
            onDone={() => {
              setBook(rollback);
              setNotice(tr("Rolled back as version {0}.", [rollback.rev]));
            }}
          >{tr("Roll back")}</CommandButton>

          <CommandButton
            command="admin.config.save"
            confirmTarget={false}
            className="secondary-btn"
            type="button"
            targetId="configuration"
            before={`config ${persisted.draftRev}`}
            after={`config ${base.draftRev}`}
            disabled={dirty || !lifecycleDue}
            title={dirty ? tr("Save or discard unsaved changes first.") : lifecycleDue ? undefined : tr("No schedule or expiry is due.")}
            expectedSliceRev={persisted.draftRev}
            sliceKey="config"
            value={base}
            onDone={() => {
              setBook(base);
              setNotice(tr("Due schedule or expiry applied."));
            }}
          >{tr("Apply due schedule / expiry")}</CommandButton>
        </div>
      </article>
    </div>
  );
}

type SettingsTab = "all" | "compare" | "elsewhere" | "panel";
const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: "all", get label() { return tr("All settings"); } },
  { id: "compare", get label() { return tr("Compare versions"); } },
  { id: "elsewhere", get label() { return tr("Settings in other sections"); } },
  { id: "panel", get label() { return tr("Admin panel"); } },
];

export function ConfigPage() {
  const { agent } = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (SETTINGS_TABS.find((item) => item.id === params.get("tab"))?.id ?? "all") as SettingsTab;
  const [notice, setNotice] = useState("");
  const [unsaved, setUnsaved] = useState(false);
  // Leaving the settings with unsaved changes asks first (Q33), for tabs and Back as for links.
  const leave = () => !unsaved || window.confirm("You have unsaved changes. Leave this page?");
  const selectTab = (id: SettingsTab) => leave() && setParams(() => {
    const next = new URLSearchParams(globalThis.location.search);
    if (id === "all") next.delete("tab");
    else next.set("tab", id);
    return next;
  }, { replace: true });
  function jump(heading: string) {
    const node = [...document.querySelectorAll<HTMLHeadingElement>(".pl-settings-all article.panel > h3")].find((item) => item.textContent === heading);
    node?.parentElement?.scrollIntoView({ behavior: "smooth", block: "start" });
    node?.parentElement?.classList.add("pl-flash");
    setTimeout(() => node?.parentElement?.classList.remove("pl-flash"), 1600);
  }
  return (
    <div className="dx-page pl-page">
      <div className="pl-top">
        <button data-command="admin.panel.view" type="button" className="dash-btn ghost dx-back" onClick={() => { if (!leave()) return; if (globalThis.history.length > 1) navigate(-1); else navigate("/"); }}>{trn("{0} Back", <ArrowLeft size={16} aria-hidden="true" />)}</button>
        <div className="dash-tabs dx-views" role="tablist" aria-label={tr("Settings sections")}>
          {SETTINGS_TABS.map((item) => <button data-command="admin.panel.view" key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : undefined} onClick={() => selectTab(item.id)}>{trx(item.label)}</button>)}
        </div>
      </div>
      <section className="pl-language" aria-labelledby="pl-language-title">
        <div>
          <h3 id="pl-language-title">{tr("Panel language")}</h3>
          <p>{tr("Switch the panel to English, French or Swedish. The choice is saved for you only, as in My profile.")}</p>
        </div>
        <LanguageQuickSwitch />
      </section>
      {notice ? <p role="status" className="pl-status">{trSentences(notice)}</p> : null}
      {tab === "all" ? <><FindSetting onPick={jump} /><ConfigAll onDirty={setUnsaved} /></> : null}
      {tab === "compare" ? <CompareVersions /> : null}
      {tab === "elsewhere" ? <SettingsElsewhere /> : null}
      {tab === "panel" ? <PanelSettings isSuper={agent?.role === "super"} onNotice={setNotice} /> : null}
    </div>
  );
}
