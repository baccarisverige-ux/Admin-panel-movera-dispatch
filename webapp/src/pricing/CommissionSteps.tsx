import { useState, type ReactNode } from "react";
import { AlertTriangle, Calculator, Plus, Trash2 } from "lucide-react";
import { market, type MarketId } from "../markets/markets";
import { NumberField } from "./NumberField";
import { currencySymbol, money } from "./zonePricing";
import { addStep, removeStep, resultLines, setStepKind, stepWarnings, validateSteps, STEPS_CONTRACT, type CommissionStep, type StepProblem } from "./commissionSteps";
import { tr, trx, type MessageKey } from "../i18n";

/**
 * J5b (contract v0.18.86, contract.json#commissionSteps.adminPlacement / warn / adminCalculator; owner 2026-11-13
 * ~21:40 UTC "same place in admin which set commission per cathegories not global", "Yes, warn", ~22:46 UTC "Add
 * calculation machine"): the commission steps of ONE car type, inside its card of the zone's Commission panel, next
 * to its "% commission" field, plus ONE simple calculator (v0.18.88, owner 2026-11-14 "And why its complicate ?!":
 * a trip price → two result lines, amounts only: "Driver gets" / "Movera gets" = commission + app fee, owner 2026-11-14
 * 05:17 UTC). Every number comes from the shared pricing/commissionSteps.ts.
 */

type Props = {
  currency: MarketId;
  categoryLabel: string;
  /** The card's % (used when there are no steps). */
  pct: number;
  steps: readonly CommissionStep[];
  canEdit: boolean;
  changed: boolean;
  /** Trip price the calculator starts with (major units). */
  examplePrice: number;
  /** The card's app fee % (prices.<category>.appFeePct): the calculator shows what the rider pays on top. */
  appFeePct: number;
  onSteps: (steps: CommissionStep[]) => void;
};

/** A text with one {name} slot filled by a node (an input), so a translation can move it. */
function withSlot(text: string, name: string, node: ReactNode): ReactNode {
  const [before, after = ""] = text.split(`{${name}}`);
  return <>{before}{node}{after}</>;
}

/** The contract's text for a problem, in the panel's language. */
export function stepProblemLabel(problem: StepProblem): string {
  const english = STEPS_CONTRACT.texts.errors[problem.problem].en as MessageKey;
  return tr(english, { max: STEPS_CONTRACT.validation.maxSteps });
}

/** "Trip price up to 5.000 DT · 1.000 DT" / "Above 15.000 DT · 20 %" / "Commission % (no steps) · 20 %". */
export function stepLabel(steps: readonly CommissionStep[], index: number | null, pct: number, currency: MarketId): string {
  const unit = market(currency).minorUnits;
  if (index === null) return `${tr("Commission % (no steps)")} · ${pct} %`;
  const step = steps[index];
  const previous = steps.slice(0, index).reduce((top, item) => (item.upToMinor !== null ? item.upToMinor : top), 0);
  const where = step.upToMinor === null ? tr("Above {amount}", { amount: money(previous / unit, currency) }) : tr("Trip price up to {amount}", { amount: money(step.upToMinor / unit, currency) });
  const what = step.amountMinor !== undefined ? money(step.amountMinor / unit, currency) : `${step.pct ?? 0} %`;
  return `${where} · ${what}`;
}

export function CommissionSteps({ currency, categoryLabel, pct, steps, canEdit, changed, examplePrice, appFeePct, onSteps }: Props) {
  const unit = market(currency).minorUnits;
  const symbol = currencySymbol(currency);
  const decimals = Math.round(Math.log10(unit));
  const show = (minor: number) => money(minor / unit, currency);
  const problem = validateSteps(steps);
  const warnings = stepWarnings(steps);
  const name = trx(categoryLabel);
  const set = (index: number, next: CommissionStep) => onSteps(steps.map((step, i) => (i === index ? next : { ...step })));
  const gap = { SE: 10000, FR: 1000, TN: 10000 }[currency];
  const warnText = (warning: { upToMinor: number; atLimit: number; justAbove: number }) => tr("Warning: a trip just above {limit} pays the driver less ({justAbove}) than a trip at {limit} ({atLimit}). You can still save.", { limit: show(warning.upToMinor), justAbove: show(warning.justAbove), atLimit: show(warning.atLimit) });
  return (
    <div className={changed ? "cs changed" : "cs"} data-testid="commission-steps">
      <div className="cs-head">
        <strong>{tr("Commission steps")}</strong>
        {canEdit && steps.length ? <button data-command="admin.pricing.edit" type="button" className="cs-link" onClick={() => onSteps([])}>{tr("Remove all steps")}</button> : null}
      </div>
      <small className="cs-help">{tr("Choose the commission by trip price (ride part + extras, without waiting). No steps = the commission % above.")}</small>
      {steps.length ? (
        <ol className="cs-rows">
          {steps.map((step, index) => {
            const previous = steps.slice(0, index).reduce((top, item) => (item.upToMinor !== null ? item.upToMinor : top), 0);
            const bad = problem?.step === index;
            const warning = warnings.find((item) => item.step === index);
            const kind = step.amountMinor !== undefined ? "amount" : "pct";
            return (
              <li key={index} className={bad ? "cs-row invalid" : "cs-row"}>
                <div className="cs-where">
                  {step.upToMinor === null
                    ? <span>{tr("Above {amount}", { amount: show(previous) })}</span>
                    : withSlot(tr("Trip price up to {amount}", { amount: "{amount}" }), "amount", (
                      <span data-testid="step-up-to">
                        <NumberField label={`${name} · ${tr("Trip price up to {amount}", { amount: "" }).trim()} ${index + 1}`} value={step.upToMinor / unit} unit={symbol} step={1 / unit} disabled={!canEdit} invalid={bad} onChange={(value) => set(index, { ...step, upToMinor: Math.round(value * unit) })} />
                      </span>
                    ))}
                </div>
                <div className="cs-what">
                  <select data-testid="step-kind" aria-label={`${name} · ${tr("Commission steps")} ${index + 1}`} value={kind} disabled={!canEdit} onChange={(event) => set(index, setStepKind(step, event.target.value as "pct" | "amount", pct))}>
                    <option value="pct">{tr("Percent (%)")}</option>
                    <option value="amount">{tr("Fixed amount")}</option>
                  </select>
                  <span data-testid="step-value">
                    {kind === "pct"
                      ? <NumberField label={`${name} · ${tr("Percent (%)")} ${index + 1}`} value={step.pct ?? 0} unit="%" max={STEPS_CONTRACT.validation.pctMax} step={0.1} disabled={!canEdit} invalid={bad} onChange={(value) => set(index, { upToMinor: step.upToMinor, pct: value })} />
                      : <NumberField label={`${name} · ${tr("Fixed amount")} ${index + 1}`} value={(step.amountMinor ?? 0) / unit} unit={symbol} step={1 / unit} disabled={!canEdit} invalid={bad} onChange={(value) => set(index, { upToMinor: step.upToMinor, amountMinor: Math.round(value * unit) })} />}
                  </span>
                  {canEdit ? <button data-command="admin.pricing.edit" type="button" className="icon-ghost danger" aria-label={`${tr("Remove step")} ${index + 1}`} title={tr("Remove step")} onClick={() => onSteps(removeStep(steps, index))}><Trash2 size={14} aria-hidden="true" /></button> : null}
                </div>
                {bad && problem ? <small className="cs-error" role="alert">{stepProblemLabel(problem)}</small> : null}
                {warning ? <p className="cs-warn" role="status" data-testid="step-warning"><AlertTriangle size={13} aria-hidden="true" /> <span>{warnText(warning)}</span></p> : null}
              </li>
            );
          })}
        </ol>
      ) : null}
      {problem && problem.step === null ? <small className="cs-error" role="alert">{stepProblemLabel(problem)}</small> : null}
      {canEdit ? <button data-command="admin.pricing.edit" type="button" data-testid="step-add" className="dash-btn small ghost cs-add" disabled={steps.length >= STEPS_CONTRACT.validation.maxSteps} onClick={() => onSteps(addStep(steps, pct, gap))}><Plus size={14} aria-hidden="true" /> {tr("Add step")}</button> : null}
      <CommissionCalculator currency={currency} name={name} pct={pct} steps={steps} decimals={decimals} examplePrice={examplePrice} appFeePct={appFeePct} show={show} />
    </div>
  );
}

function CommissionCalculator({ currency, name, pct, steps, decimals, examplePrice, appFeePct, show }: { currency: MarketId; name: string; pct: number; steps: readonly CommissionStep[]; decimals: number; examplePrice: number; appFeePct: number; show: (minor: number) => string }) {
  const unit = market(currency).minorUnits;
  const [price, setPrice] = useState(examplePrice);
  // The field takes the currency's decimals (TND 3, SEK and EUR 2); the calculator gets the exact minor units.
  const base = Math.round(price * unit);
  const result = resultLines({ pct, steps }, base, appFeePct);
  return (
    <div className="cs-calc" data-testid="commission-calculator">
      <strong className="cs-calc-title"><Calculator size={14} aria-hidden="true" /> {tr("Commission calculator")}</strong>
      <label className="cs-calc-price" data-testid="calc-price">
        <span>{tr("Trip price (without waiting)")}</span>
        <NumberField label={`${name} · ${tr("Trip price (without waiting)")}`} value={price} unit={currencySymbol(currency)} step={10 ** -decimals} onChange={(value) => setPrice(Number(value.toFixed(decimals)))} />
      </label>
      {result.ok ? (
        <dl className="split-facts cs-calc-facts" data-testid="calc-result">
          {/* Owner 2026-11-14: amounts only, never a percent in a result line; Movera gets = commission + app fee (one amount). */}
          <div><dt>{tr("Driver gets")}</dt><dd>{show(result.driverGets)}</dd></div>
          <div><dt>{tr("Movera gets")}</dt><dd>{show(result.moveraGets)}</dd></div>
        </dl>
      ) : <p className="cs-error" role="alert">{stepProblemLabel(result.problem)}</p>}
      <small className="cs-help">{tr("Waiting is added on top and goes fully to the driver.")}</small>
    </div>
  );
}
