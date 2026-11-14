import { DRIVER_BONUS_LIMIT_INPUT_ID } from "../live/tripLive";
import { useEffect, useState } from "react";
import { BadgeDollarSign, Gift, HandHeart, Phone, Plus, Save, TrendingUp } from "lucide-react";
import { CALL_FIELDS, CALL_RANGES, callModeText } from "../config/callSettings";
import { DONT_MATCH_STARS, dontMatchStarsText } from "../config/dontMatchSettings";
import { market, zoneById, type MarketId } from "../markets/markets";
import { PublishTargetsLine } from "../live/StandardBar";
import {
  COUNTRY_SETTINGS_KEY,
  MAX_AMOUNTS,
  addAmount,
  countrySettingsIssues,
  countrySettingsLines,
  countrySettingsOf,
  zoneSettingsOf,
  mixedTipAcross,
  TIP_CASH_IN_CAR_MINUTES,
  TIP_FLAGS,
  type MixedTipRules,
  ZONE_RULES_KEY,
  driverBonusHardMax,
  largeCountryChanges,
  moneyStep,
  pricingSummary,
  promoCapMax,
  raiseStepMax,
  sectionPart,
  type AmountOption,
  type CountrySettings,
} from "../config/countrySettings";
import { useCountrySettings } from "../config/useCountrySettings";
import { useSlice } from "../api/hooks";
import { CommandButton } from "../ui/CommandButton";
import { FieldErrorScope, useFieldErrors } from "../ui/fieldErrors";
import { NumberField } from "./NumberField";
import { EmergencyNumbersEditor } from "./EmergencyNumbersEditor";
import { ChatSettingsCard } from "./ChatSettingsCard";
import { currencySymbol, fromSek, money, tipMax } from "./zonePricing";
import { tr, trn, trx } from "../i18n";

/** The sections of this tab, so Dispatch and All features can jump to one (Q6: "a shortcut that jumps to that settings section"). */
export const EXTRAS_SECTIONS = ["tips", "raise-steps", "promo-cap", "driver-bonus", "calls", "chat", "dont-match"] as const;

type ListProps = {
  title: string;
  help: string;
  item: string;
  prefix: string;
  plus?: boolean;
  list: AmountOption[];
  saved: AmountOption[];
  max: number;
  country: MarketId;
  canEdit: boolean;
  onChange: (list: AmountOption[]) => void;
};

/** A list of amounts: change one, add one, or switch one off (it stays in the list, so it can come back). */
function AmountList({ title, help, item, prefix, plus, list, saved, max, country, canEdit, onChange }: ListProps) {
  const symbol = currencySymbol(country);
  const active = list.filter((entry) => entry.enabled);
  const set = (id: string, patch: Partial<AmountOption>) => onChange(list.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  return (
    <div className="fee-card cx-list" role="group" aria-label={title}>
      <div>
        <strong>{trx(title)}</strong>
        <small>{trn("{0} Up to {1} amounts, each at most {2}.", help, MAX_AMOUNTS, money(max, country))}</small>
      </div>
      <ul className="cx-amounts">
        {list.map((entry, index) => {
          const before = saved.find((old) => old.id === entry.id);
          return (
            <li key={entry.id} className={entry.enabled ? undefined : "off"}>
              <span className="cx-index" aria-hidden="true">{index + 1}</span>
              <NumberField label={`${trx(item)} ${index + 1}`} value={entry.amount} unit={symbol} step={moneyStep(country)} max={max} disabled={!canEdit} changed={!before || before.amount !== entry.amount} onChange={(amount) => set(entry.id, { amount })} />
              <label className="mini-switch">
                <input type="checkbox" aria-label={tr("{0} {1} active", [trx(item), index + 1])} checked={entry.enabled} disabled={!canEdit} onChange={(event) => set(entry.id, { enabled: event.target.checked })} />
                <span aria-hidden="true"><i /></span>
                {entry.enabled ? tr("Active") : tr("Off")}
              </label>
            </li>
          );
        })}
      </ul>
      <button data-command="admin.pricing.edit" type="button" className="link-action" disabled={!canEdit || list.length >= MAX_AMOUNTS} onClick={() => onChange(addAmount(list, prefix, country))}>{trn("{0} Add an amount", <Plus size={13} aria-hidden="true" />)}</button>
      <div className="tip-preview" aria-label={tr("{0} the rider sees", [title])}>
        {active.length ? active.map((entry) => <span key={entry.id}>{plus ? "+" : ""}{money(entry.amount, country)}</span>) : <small>{tr("None active: the rider sees no buttons.")}</small>}
      </div>
    </div>
  );
}

type Props = {
  country: MarketId;
  canEdit: boolean;
  /** The section to scroll to when the tab opens (from the Dispatch shortcut or All features). */
  section: string | null;
  /** "driverBonusLimit": that field gets the focus once the section is in view (the trip page's Change limit). */
  focus?: string | null;
  onDirty: (dirty: boolean) => void;
  onNotice: (text: string) => void;
  /**
   * Live panel (contract v0.8.1, owner 2026-10-28): the zones (or the Standard) chosen at the top. Tips & limits are
   * shown for the first and saved to all of them; no other zone changes. Absent in the demo: one setting per country.
   */
  targets?: readonly string[];
  /** Live: the zone the page shows (the one the Standard line names); else the first chosen. */
  zoneId?: string;
};

/**
 * Pricing › Tips & limits: the money settings that are one per country (contract v0.4.0): tips and raise-offer steps
 * (Q5, Q6), the promo cap (Q10) and the driver bonus limit (Q17). Nothing is saved until Save; a change of more than
 * 50 % asks "Are you sure?" (Q29). The rider and driver app configs read the saved values.
 */
/** The mixed tip switches without `flag` (set by the admin now); undefined when none is left. */
function withoutTipFlag(mixed: MixedTipRules | undefined, flag: (typeof TIP_FLAGS)[number]): MixedTipRules | undefined {
  if (!mixed?.[flag]) return mixed;
  const rest = { ...mixed };
  delete rest[flag];
  return Object.keys(rest).length ? rest : undefined;
}

export function CountryExtrasPanel({ country, canEdit, section, focus = null, onDirty, onNotice, targets, zoneId: shownZone }: Props) {
  const { book, loading: bookLoading } = useCountrySettings();
  const zoneId = targets ? (shownZone && targets.includes(shownZone) ? shownZone : targets[0]) : undefined;
  const onStandard = !zoneId || zoneId === `standard-${country}`;
  // v0.8.1 live: each zone's (or Standard's) own Tips & limits, read when this tab opens.
  const zoneRules = useSlice<Record<string, CountrySettings>>(ZONE_RULES_KEY, {}, { enabled: Boolean(targets) });
  const zoneBook = { ...book, zones: zoneRules.value };
  const loading = bookLoading || (Boolean(targets) && zoneRules.loading);
  const first = zoneId ? zoneSettingsOf(zoneBook, country, zoneId) : countrySettingsOf(book, country);
  // Live G8 round 3 item 1: the chosen zones that disagree on a tip switch show it mixed, with the zones where it is off.
  const mixedTip = targets && targets.length > 1 ? mixedTipAcross(targets.map((id) => [zoneById(id)?.name ?? id, zoneSettingsOf(zoneBook, country, id).tipRules] as const)) : first.mixedTipRules;
  const saved: CountrySettings = { ...first, mixedTipRules: mixedTip, tipRules: { ...first.tipRules, ...Object.fromEntries(TIP_FLAGS.filter((flag) => mixedTip?.[flag]).map((flag) => [flag, false])) } };
  const [draft, setDraft] = useState<CountrySettings | null>(null);
  const shown = draft ?? saved;
  const dirty = draft !== null && JSON.stringify(sectionPart(draft, "pricing")) !== JSON.stringify(sectionPart(saved, "pricing"));
  const fieldErrors = useFieldErrors();
  const issues = dirty ? countrySettingsIssues(country, shown) : [];
  const lines = dirty ? countrySettingsLines(country, saved, shown) : [];
  const large = dirty ? largeCountryChanges(country, saved, shown) : [];
  const symbol = currencySymbol(country);
  const name = market(country).name;
  const zoneNames = (targets ?? []).map((id) => zoneById(id)?.name ?? id).join(", ");
  const hardMax = driverBonusHardMax(country);
  const edit = (patch: Partial<CountrySettings>) => setDraft({ ...shown, ...patch });

  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  useEffect(() => {
    if (!section || loading) return;
    const node = document.getElementById(`extras-${section}`);
    if (!node) return;
    node.scrollIntoView({ block: "start" });
    if (focus === "driverBonusLimit") document.getElementById(DRIVER_BONUS_LIMIT_INPUT_ID)?.focus({ preventScroll: true });
    node.classList.add("pl-flash");
    const timer = window.setTimeout(() => node.classList.remove("pl-flash"), 1600);
    return () => window.clearTimeout(timer);
  }, [section, focus, loading]);

  if (loading) return <p className="state-line">{tr("Loading the country settings.")}</p>;

  return (
    <FieldErrorScope value={fieldErrors.report}>
      <section className="dash-card" aria-labelledby="extras-title" data-testid="pricing-extras">
        <div className="card-head">
          {targets ? (
            <>
              <h3 id="extras-title">{trn("{0} Tips & limits · {1}", <HandHeart size={16} aria-hidden="true" />, zoneNames || name)}</h3>
              <span className="fine-print">{trn("Only for the zones chosen at the top, in {0}. Saved with Save, not with Publish.", symbol)}</span>
            </>
          ) : (
            <>
              <h3 id="extras-title">{trn("{0} Tips & limits · all of {1}", <HandHeart size={16} aria-hidden="true" />, name)}</h3>
              <span className="fine-print">{trn("One setting per country, in {0}. Saved with Save, not with Publish.", symbol)}</span>
            </>
          )}
        </div>
        <div className="fee-grid">
          <div id="extras-tips" className="cx-anchor">
            <AmountList title={tr("Tips")} help={tr("Buttons the rider sees after the ride.")} item="Tip" prefix="tip" list={shown.tips} saved={saved.tips} max={tipMax(country)} country={country} canEdit={canEdit} onChange={(tips) => edit({ tips })} />
            <div className="fee-card" aria-label={tr("Tip rules")}>
              <p className="dx-note">{tr("The whole tip goes to the driver.")}</p>
              <label className="check-row"><input type="checkbox" data-testid="tip-cashAfterTrip" checked={shown.tipRules.cashAfterTrip} ref={(node) => { if (node) node.indeterminate = Boolean(shown.mixedTipRules?.cashAfterTrip?.length); }} aria-checked={shown.mixedTipRules?.cashAfterTrip?.length ? "mixed" : undefined} aria-describedby={shown.mixedTipRules?.cashAfterTrip?.length ? "tip-mixed-cashAfterTrip" : undefined} disabled={!canEdit} onChange={(e) => edit({ tipRules: { ...shown.tipRules, cashAfterTrip: e.target.checked }, mixedTipRules: withoutTipFlag(shown.mixedTipRules, "cashAfterTrip") })} /> {tr("Allow cash tips after the trip")}</label>
              {shown.mixedTipRules?.cashAfterTrip?.length ? <small className="dx-note" id="tip-mixed-cashAfterTrip" data-testid="tip-mixed-cashAfterTrip">{tr("Off in: {0} — Save makes it the same in the chosen zones", [shown.mixedTipRules.cashAfterTrip.join(", ")])}</small> : null}
              <p className="dx-note">{tr("Off: a cash tip is only possible in the car, in the first {0} minutes after the trip.", [String(shown.tipRules.cashInCarMinutes)])}</p>
              {/* v0.18.91 job C8 (owner "Anything admin can adjust becomes an admin setting"): RiderAppConfig.tipRules.cashInCarMinutes. */}
              {!shown.tipRules.cashAfterTrip ? <div data-testid="tip-cashInCarMinutes"><NumberField label={tr("Cash tip time in the car")} value={shown.tipRules.cashInCarMinutes} unit="min" step={1} min={TIP_CASH_IN_CAR_MINUTES.min} max={TIP_CASH_IN_CAR_MINUTES.max} disabled={!canEdit} changed={shown.tipRules.cashInCarMinutes !== saved.tipRules.cashInCarMinutes} onChange={(cashInCarMinutes) => edit({ tipRules: { ...shown.tipRules, cashInCarMinutes: Math.round(cashInCarMinutes) } })} /></div> : null}
              <label className="check-row"><input type="checkbox" data-testid="tip-customAmount" checked={shown.tipRules.customAmount} ref={(node) => { if (node) node.indeterminate = Boolean(shown.mixedTipRules?.customAmount?.length); }} aria-checked={shown.mixedTipRules?.customAmount?.length ? "mixed" : undefined} aria-describedby={shown.mixedTipRules?.customAmount?.length ? "tip-mixed-customAmount" : undefined} disabled={!canEdit} onChange={(e) => edit({ tipRules: { ...shown.tipRules, customAmount: e.target.checked }, mixedTipRules: withoutTipFlag(shown.mixedTipRules, "customAmount") })} /> {tr("Rider may type an amount")}</label>
              {shown.mixedTipRules?.customAmount?.length ? <small className="dx-note" id="tip-mixed-customAmount" data-testid="tip-mixed-customAmount">{tr("Off in: {0} — Save makes it the same in the chosen zones", [shown.mixedTipRules.customAmount.join(", ")])}</small> : null}
              {shown.tipRules.customAmount ? <NumberField label={tr("Highest typed tip")} value={shown.tipRules.customMax} unit={symbol} step={moneyStep(country)} max={tipMax(country) * 10} disabled={!canEdit} changed={shown.tipRules.customMax !== saved.tipRules.customMax} onChange={(customMax) => edit({ tipRules: { ...shown.tipRules, customMax } })} /> : null}
            </div>
          </div>
          <div id="extras-raise-steps" className="cx-anchor">
            <AmountList title={tr("Raise-offer quick steps")} help={tr("Quick “+” buttons while the rider waits for a driver.")} item="Raise step" prefix="raise" plus list={shown.raiseSteps} saved={saved.raiseSteps} max={raiseStepMax(country)} country={country} canEdit={canEdit} onChange={(raiseSteps) => edit({ raiseSteps })} />
          </div>
          <div id="extras-promo-cap" className="cx-anchor">
            <div className="fee-card">
              <div>
                <strong>{trn("{0} Promo cap", <Gift size={14} aria-hidden="true" />)}</strong>
                <small>{trn("The highest promo discount on one ride, shown to the rider in {0}. At most {1}.", symbol, money(promoCapMax(country), country))}</small>
              </div>
              <label className="mini-switch big">
                <input type="checkbox" aria-label={tr("Cap promo discounts")} checked={shown.promoCap !== null} disabled={!canEdit} onChange={(event) => edit({ promoCap: event.target.checked ? saved.promoCap ?? fromSek(100, country) : null })} />
                <span aria-hidden="true"><i /></span>
                {shown.promoCap === null ? tr("No cap") : tr("Capped")}
              </label>
              {shown.promoCap !== null ? <NumberField label={tr("Promo cap")} value={shown.promoCap} unit={symbol} step={moneyStep(country)} max={promoCapMax(country)} disabled={!canEdit} changed={shown.promoCap !== saved.promoCap} onChange={(promoCap) => edit({ promoCap })} /> : null}
            </div>
          </div>
          <div id="extras-driver-bonus" className="cx-anchor">
            <div className="fee-card">
              <div>
                <strong>{trn("{0} Driver bonus limit", <BadgeDollarSign size={14} aria-hidden="true" />)}</strong>
                <small>{tr("The most an admin can add to one trip for the driver. Movera pays it; the rider never does. Above it the admin sees “adjust the limit in Pricing”.")}</small>
              </div>
              <NumberField id={DRIVER_BONUS_LIMIT_INPUT_ID} label={tr("Driver bonus limit")} value={shown.driverBonusLimit} unit={symbol} step={moneyStep(country)} max={hardMax} disabled={!canEdit} changed={shown.driverBonusLimit !== saved.driverBonusLimit} onChange={(driverBonusLimit) => edit({ driverBonusLimit })} />
              <NumberField label={tr("Largest change of a driver's pay on one trip")} value={shown.driverPayChangeMax} unit={symbol} step={moneyStep(country)} max={hardMax * 10} disabled={!canEdit} changed={shown.driverPayChangeMax !== saved.driverPayChangeMax} onChange={(driverPayChangeMax) => edit({ driverPayChangeMax })} />
              {/* Fix job 0 (owner A2-1 "Per country, in Pricing"): one limit per country, set on the country Standard; a zone shows it read-only. */}
              <NumberField label={tr("Largest Add money to wallet at one time")} value={shown.walletCreditMax} unit={symbol} step={moneyStep(country)} max={1000000} disabled={!canEdit || !onStandard} changed={shown.walletCreditMax !== saved.walletCreditMax} onChange={(walletCreditMax) => edit({ walletCreditMax })} />
              {onStandard ? null : <small data-testid="wallet-credit-max-country">{tr("One limit per country: change it on the country Standard.")}</small>}
              <small data-testid="driver-bonus-hard-max">{trn("{0} Hard max {1}: the limit can never be higher.", <TrendingUp size={12} aria-hidden="true" />, money(hardMax, country))}</small>
            </div>
          </div>
          <div id="extras-on-trip-offers" className="cx-anchor">
            <div className="fee-card" data-testid="on-trip-offers">
              <div>
                <strong>{tr("Offers on a trip")}</strong>
                <small>{tr("A driver on a trip gets only Exclusive offers (a ride now or a booked ride), and only after he has driven this share of his route to the drop-off.")}</small>
              </div>
              <NumberField label={tr("Offers on a trip from (% of the route to the drop-off)")} value={shown.onTripMinDonePct} step={1} max={100} disabled={!canEdit} changed={shown.onTripMinDonePct !== saved.onTripMinDonePct} onChange={(value) => edit({ onTripMinDonePct: value })} />
              <NumberField label={tr("Rider of a next trip may cancel free after (min)")} value={shown.chainLateFreeCancelMin} step={1} max={120} disabled={!canEdit} changed={shown.chainLateFreeCancelMin !== saved.chainLateFreeCancelMin} onChange={(value) => edit({ chainLateFreeCancelMin: value })} />
            </div>
          </div>
          {/* v0.18.38 §62 (fix job 8, owner G15 "In-app calls only", "Both rider and driver"): CountryRules.calls. */}
          <div id="extras-calls" className="cx-anchor">
            <div className="fee-card" data-testid="call-settings">
              <div>
                <strong>{trn("{0} Calls (in the app)", <Phone size={14} aria-hidden="true" />)}</strong>
                <small>{tr("Rider and driver call each other in the app, during the trip and for this many minutes after the drop-off. Nobody sees a phone number. Calls are not recorded.")}</small>
              </div>
              <label className="mini-switch big">
                <input type="checkbox" aria-label={tr("Calls on")} data-testid="calls-on" checked={shown.calls.on} disabled={!canEdit} onChange={(event) => edit({ calls: { ...shown.calls, on: event.target.checked } })} />
                <span aria-hidden="true"><i /></span>
                {shown.calls.on ? tr("On") : tr("Off")}
              </label>
              <label className="check-row">{tr("Call mode")}{" "}
                <select data-testid="calls-mode" value={shown.calls.mode} disabled={!canEdit || !shown.calls.on} onChange={(event) => edit({ calls: { ...shown.calls, mode: event.target.value === "phone" ? "phone" : "in_app" } })}>
                  <option value="in_app">{callModeText("in_app")}</option>
                  <option value="phone">{callModeText("phone")}</option>
                </select>
              </label>
              <small className="dx-note">{tr("In the app: free internet calls. Phone mode needs a phone company; until one is chosen calls stay in the app.")}</small>
              {CALL_FIELDS.map((field) => (
                <label key={field.key} className="field"><span>{tr(field.label)}</span><NumberField label={tr(field.label)} value={shown.calls[field.key]} step={1} min={CALL_RANGES[field.key][0]} max={CALL_RANGES[field.key][1]} disabled={!canEdit || !shown.calls.on} changed={shown.calls[field.key] !== saved.calls[field.key]} onChange={(value) => edit({ calls: { ...shown.calls, [field.key]: value } })} /></label>
              ))}
            </div>
          </div>
          {/* v0.18.56 §78 (G9 part 2, owner Q79–Q85): CountryRules.chat. */}
          <ChatSettingsCard shown={shown.chat} saved={saved.chat} canEdit={canEdit} onChange={(chat) => edit({ chat })} />
          {/* v0.18.43 §64 (fix job 10, owner G16 Q16-4, "Never told"): CountryRules.dontMatchAgain. */}
          <div id="extras-dont-match" className="cx-anchor">
            <div className="fee-card" data-testid="dont-match-settings">
              <div>
                <strong>{tr("Don't match again")}</strong>
                <small>{tr("On a low rating the rider and the driver can tick \"Don't match me again\". They are never matched again. Neither side is ever told. Only Support can undo a block.")}</small>
              </div>
              <label className="mini-switch big">
                <input type="checkbox" aria-label={tr("Don't match again")} data-testid="dont-match-on" checked={shown.dontMatchAgain.on} disabled={!canEdit} onChange={(event) => edit({ dontMatchAgain: { ...shown.dontMatchAgain, on: event.target.checked } })} />
                <span aria-hidden="true"><i /></span>
                {shown.dontMatchAgain.on ? tr("On") : tr("Off")}
              </label>
              <label className="check-row">{tr("Offer the tick at")}{" "}
                <select data-testid="dont-match-stars" value={shown.dontMatchAgain.atStars} disabled={!canEdit || !shown.dontMatchAgain.on} onChange={(event) => edit({ dontMatchAgain: { ...shown.dontMatchAgain, atStars: Number(event.target.value) } })}>
                  {DONT_MATCH_STARS.map((n) => <option key={n} value={n}>{dontMatchStarsText(n)}</option>)}
                </select>
              </label>
            </div>
          </div>
          {/* v0.18.57 §79 (owner 2026-11-10): CountryRules.emergencyNumbers, country standard only. */}
          <div id="extras-emergency-numbers" className="cx-anchor">
            <EmergencyNumbersEditor rows={onStandard ? shown.emergencyNumbers : countrySettingsOf(book, country).emergencyNumbers} canEdit={canEdit} onStandard={onStandard} onChange={(emergencyNumbers) => edit({ emergencyNumbers })} />
          </div>
          <div id="extras-person-limits" className="cx-anchor">
            <div className="fee-card" data-testid="person-limits">
              <div>
                <strong>{tr("Limits per person")}</strong>
                <small>{tr("Per person, in this country: how many saved places one rider can keep, and how many emergency contacts one rider or one driver can keep. Keeps the server traffic small.")}</small>
              </div>
              <NumberField label={tr("Saved places per person")} value={shown.personLimits.savedPlacesPerPerson} step={1} max={500} disabled={!canEdit} changed={shown.personLimits.savedPlacesPerPerson !== saved.personLimits.savedPlacesPerPerson} onChange={(value) => edit({ personLimits: { ...shown.personLimits, savedPlacesPerPerson: value } })} />
              <NumberField label={tr("Emergency contacts per person")} value={shown.personLimits.emergencyContactsPerPerson} step={1} max={50} disabled={!canEdit} changed={shown.personLimits.emergencyContactsPerPerson !== saved.personLimits.emergencyContactsPerPerson} onChange={(value) => edit({ personLimits: { ...shown.personLimits, emergencyContactsPerPerson: value } })} />
            </div>
          </div>
        </div>
        {issues.length ? <p className="pl-warn" role="alert">{issues[0]}</p> : null}
        {dirty && !issues.length ? <ul className="cx-lines" aria-label={tr("Unsaved changes")}>{lines.map((line) => <li key={line}>{line}</li>)}</ul> : null}
        <div className="actions">
          <CommandButton
            command="admin.pricing.saveCountry"
            className="dash-btn publish"
            targetId={`${country} tips and limits`}
            confirmTarget={false}
            scope={targets ? targets.join(",") : country}
            summary={targets ? <PublishTargetsLine zoneIds={targets} /> : undefined}
            before={pricingSummary(country, saved)}
            after={pricingSummary(country, shown)}
            sliceKey={COUNTRY_SETTINGS_KEY}
            value={targets ? { ...book, draftRev: book.draftRev + 1, zones: { ...zoneRules.value, ...Object.fromEntries(targets.map((id) => [id, shown])) } } : { ...book, draftRev: book.draftRev + 1, countries: { ...book.countries, [country]: shown } }}
            expectedSliceRev={book.draftRev}
            disabled={loading || !canEdit || !dirty || issues.length > 0 || fieldErrors.count > 0}
            title={!canEdit ? tr("Your role cannot change this.") : !dirty ? tr("No unsaved change.") : fieldErrors.first ?? issues[0]}
            largeChanges={large}
            onDone={() => { setDraft(null); if (targets) void zoneRules.refetch(); onNotice(targets ? tr("Tips & limits saved for {0}. No other zone changed.", [zoneNames]) : tr("Tips & limits saved for {0}. The rider and driver apps get them with the next app config.", [name])); }}
          >{trn("{0} Save tips & limits", <Save size={15} aria-hidden="true" />)}</CommandButton>
          <button data-command="admin.pricing.discard" type="button" className="dash-btn ghost" disabled={!draft} onClick={() => setDraft(null)}>{tr("Discard")}</button>
        </div>
      </section>
    </FieldErrorScope>
  );
}
