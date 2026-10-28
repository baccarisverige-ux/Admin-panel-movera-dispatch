import { useState } from "react";
import { CalendarClock, CarFront } from "lucide-react";
import { Card, Check, Num, Row } from "../dispatch/fields";
import type { MarketId } from "../markets/markets";
import { CommandButton } from "../ui/CommandButton";
import { CATEGORY_LABELS, FUELS, VEHICLE_RULES_KEY, rulesError, rulesImpact, type CarFacts, type CountryRules, type VehicleRules } from "./rules";
import { tr } from "../i18n";

/** Category rules per country, with how many cars gain or lose a category before saving. */
export function VehicleRulesView({ rules, country, cars, editable }: { rules: VehicleRules; country: MarketId; cars: readonly CarFacts[]; editable: boolean }) {
  const [draft, setDraft] = useState<CountryRules | null>(null);
  const saved = rules.countries[country];
  const current = draft ?? saved;
  const dirty = Boolean(draft) && JSON.stringify(draft) !== JSON.stringify(saved);
  const error = rulesError(current);
  const impact = rulesImpact(cars, saved, current);
  const patchRule = (category: string, next: Partial<CountryRules["categories"][number]>) => setDraft({ ...current, categories: current.categories.map((rule) => (rule.category === category ? { ...rule, ...next } : rule)) });
  return (
    <div className="vh-settings">
      {!editable ? <p className="dx-readonly">{tr("Only admins who can edit vehicles can change these rules.")}</p> : null}
      <fieldset className="vh-fieldset" disabled={!editable}>
        <Card title={tr("Which car fits which category")} icon={<CarFront size={18} />} tone="blue" help={tr("A car can drive every category it fits. The number shows how many cars in the country fit, with your changes.")}>
          {current.categories.map((rule) => {
            const count = impact.find((item) => item.category === rule.category);
            return (
              <Row key={rule.category} label={CATEGORY_LABELS[rule.category]} help={tr("{0} cars fit{1}.", [count?.after ?? 0, count && count.after !== count.before ? ` (now ${count.before})` : ""])} on={rule.on} onToggle={(on) => patchRule(rule.category, { on })}>
                <Num label={tr("{0} oldest year", [CATEGORY_LABELS[rule.category]])} before="From" value={rule.minYear} min={1990} max={2030} onChange={(value) => patchRule(rule.category, { minYear: value })} />
                <Num label={tr("{0} seats", [CATEGORY_LABELS[rule.category]])} before="Seats" value={rule.minSeats} min={1} max={9} onChange={(value) => patchRule(rule.category, { minSeats: value })} />
                <span className="vh-fuels">{FUELS.map((fuel) => <Check key={fuel.id} label={fuel.label} on={rule.fuels.includes(fuel.id)} onChange={(on) => patchRule(rule.category, { fuels: on ? [...rule.fuels, fuel.id] : rule.fuels.filter((item) => item !== fuel.id) })} />)}</span>
              </Row>
            );
          })}
        </Card>
        <Card title={tr("Papers and photos")} icon={<CalendarClock size={18} />} tone="orange">
          <Row label={tr("Warn before papers expire")} help={tr("Insurance and inspection show orange this many days before they run out.")}>
            <Num label={tr("Warning days")} value={current.warnDays} unit="days" min={1} max={120} onChange={(value) => setDraft({ ...current, warnDays: value })} />
          </Row>
          <Row label={tr("Take cars off the road when papers expire")} help={tr("A car with expired insurance or inspection is marked Should be on hold.")} on={current.autoHold} onToggle={(on) => setDraft({ ...current, autoHold: on })} />
          <Row label={tr("Photos must be approved")} help={tr("Front, back, side and inside photos are part of the checks.")} on={current.photosNeeded} onToggle={(on) => setDraft({ ...current, photosNeeded: on })} />
        </Card>
      </fieldset>
      {editable ? (
        <div className="dx-publish">
          <span className="dx-publish-text"><b>{dirty ? tr("Changes not saved") : tr("Everything is saved")}</b><small>{error ?? tr("Rules apply to every car in the country.")}</small></span>
          <button data-command="admin.vehicle.view" type="button" className="dash-btn small ghost" disabled={!dirty} onClick={() => setDraft(null)}>{tr("Undo changes")}</button>
          <CommandButton command="admin.vehicle.rules" className="dash-btn small" targetId={`vehicle rules ${country}`} scope="all" confirmTarget={false} before="saved" after="changed" sliceKey={VEHICLE_RULES_KEY} value={{ ...rules, draftRev: rules.draftRev + 1, countries: { ...rules.countries, [country]: current } }} expectedSliceRev={rules.draftRev} disabled={!dirty || Boolean(error)} onDone={() => setDraft(null)}>{tr("Save vehicle rules")}</CommandButton>
        </div>
      ) : null}
    </div>
  );
}
