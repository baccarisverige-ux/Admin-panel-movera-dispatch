import type { MarketId } from "../markets/markets";
import { NumberField } from "./NumberField";
import { APP_FEE_MAX_PCT, commissionCardLines, money, type CategoryDef, type Problem, type ZoneBook } from "./zonePricing";
import { CommissionSteps } from "./CommissionSteps";
import { sameSteps, type CommissionStep } from "./commissionSteps";
import { tr, trn, trx } from "../i18n";

type Props = {
  currency: MarketId;
  categories: CategoryDef[];
  book: ZoneBook;
  published: ZoneBook;
  problems: Problem[];
  canEdit: boolean;
  onCommission: (categoryId: string, value: number) => void;
  /** Owner 2026-11-14 "Yes add app fee in same card": the SAME prices.<category>.appFeePct as Pricing › Limits › App fee. */
  onAppFee: (categoryId: string, value: number) => void;
  /** J5b: the car type's commission steps as edited ([] = none). */
  onSteps: (categoryId: string, steps: CommissionStep[]) => void;
};

/**
 * What Movera gets from each trip, per category. No fleet-owner line or field (owner 2026-10-29 "if there is any % u
 * delete that", 2026-11-14 "What the fuck is fleet owner keep !???"; contract v0.18.88 fleetPayoutWhole).
 */
export function CommissionPanel({ currency, categories, book, published, problems, canEdit, onCommission, onAppFee, onSteps }: Props) {
  const bad = new Set(problems.map((problem) => problem.path));
  const example = { SE: 200, FR: 20, TN: 60 }[currency];
  return (
    <div className="commission-grid">
      {categories.map((category) => {
        const pct = book.commission[category.id] ?? 0;
        const appFee = book.prices[category.id]?.appFeePct ?? 0;
        const steps = book.commissionSteps?.[category.id] ?? [];
        // J5b: the example split uses the card's steps (ONE shared function; the % when there are none or they are not valid yet).
        const { driverGets, moveraGets } = commissionCardLines(example, pct, appFee, currency, steps);
        const moveraShare = driverGets + moveraGets > 0 ? (moveraGets / (driverGets + moveraGets)) * 100 : 0;
        return (
          <div key={category.id} className={book.prices[category.id]?.enabled ? "commission-card" : "commission-card off"}>
            <div className="commission-head">
              <strong>{trx(category.label)}</strong>
              <NumberField label={tr("{0} commission", [trx(category.label)])} value={pct} unit="%" max={100} disabled={!canEdit} changed={pct !== published.commission[category.id]} invalid={bad.has(`commission.${category.id}`)} onChange={(value) => onCommission(category.id, value)} />
            </div>
            <div className="commission-head commission-fee" data-testid="card-app-fee">
              <span>{tr("App fee")}</span>
              <NumberField label={tr("{0} app fee", [trx(category.label)])} value={appFee} unit="%" max={APP_FEE_MAX_PCT} step={0.1} disabled={!canEdit} changed={appFee !== published.prices[category.id]?.appFeePct} invalid={bad.has(`prices.${category.id}.appFeePct`)} onChange={(value) => onAppFee(category.id, value)} />
            </div>
            <div className="split-bar" aria-hidden="true">
              <i className="driver" style={{ width: `${100 - moveraShare}%` }} />
              <i className="movera" style={{ width: `${moveraShare}%` }} />
            </div>
            <p className="split-title">{trn("On a {0} trip", money(example, currency))}</p>
            {/* Owner 2026-11-14: amounts only, never a percent in a result line; Movera gets = commission + app fee. */}
            <dl className="split-facts" data-testid="card-split">
              <div><dt>{tr("Driver gets")}</dt><dd>{money(driverGets, currency)}</dd></div>
              <div><dt>{tr("Movera gets")}</dt><dd>{money(moveraGets, currency)}</dd></div>
            </dl>
            <CommissionSteps currency={currency} categoryLabel={category.label} pct={pct} steps={steps} canEdit={canEdit} changed={!sameSteps(steps, published.commissionSteps?.[category.id])} examplePrice={example} appFeePct={appFee} onSteps={(next) => onSteps(category.id, next)} />
          </div>
        );
      })}
    </div>
  );
}
