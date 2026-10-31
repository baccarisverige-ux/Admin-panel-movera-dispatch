import { useEffect, useState } from "react";
import { BadgeDollarSign, Gift, HandHeart, Plus, Save, TrendingUp } from "lucide-react";
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
import { currencySymbol, fromSek, money, tipMax } from "./zonePricing";
import { tr, trn, trx } from "../i18n";

/** The sections of this tab, so Dispatch and All features can jump to one (Q6: "a shortcut that jumps to that settings section"). */
export const EXTRAS_SECTIONS = ["tips", "raise-steps", "promo-cap", "driver-bonus"] as const;

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
export function CountryExtrasPanel({ country, canEdit, section, focus = null, onDirty, onNotice, targets, zoneId: shownZone }: Props) {
  const { book, loading: bookLoading } = useCountrySettings();
  const zoneId = targets ? (shownZone && targets.includes(shownZone) ? shownZone : targets[0]) : undefined;
  // v0.8.1 live: each zone's (or Standard's) own Tips & limits, read when this tab opens.
  const zoneRules = useSlice<Record<string, CountrySettings>>(ZONE_RULES_KEY, {}, { enabled: Boolean(targets) });
  const zoneBook = { ...book, zones: zoneRules.value };
  const loading = bookLoading || (Boolean(targets) && zoneRules.loading);
  const saved = zoneId ? zoneSettingsOf(zoneBook, country, zoneId) : countrySettingsOf(book, country);
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
    if (focus === "driverBonusLimit") node.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
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
              <NumberField label={tr("Driver bonus limit")} value={shown.driverBonusLimit} unit={symbol} step={moneyStep(country)} max={hardMax} disabled={!canEdit} changed={shown.driverBonusLimit !== saved.driverBonusLimit} onChange={(driverBonusLimit) => edit({ driverBonusLimit })} />
              <small data-testid="driver-bonus-hard-max">{trn("{0} Hard max {1}: the limit can never be higher.", <TrendingUp size={12} aria-hidden="true" />, money(hardMax, country))}</small>
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
            disabled={!canEdit || !dirty || issues.length > 0 || fieldErrors.count > 0}
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
