import type { MarketId } from "../markets/markets";
import { NumberField } from "./NumberField";
import { money, type CategoryDef, type Problem, type ZoneBook } from "./zonePricing";
import { tr, trn, trx } from "../i18n";

type Props = {
  currency: MarketId;
  categories: CategoryDef[];
  book: ZoneBook;
  published: ZoneBook;
  problems: Problem[];
  canEdit: boolean;
  onCommission: (categoryId: string, value: number) => void;
};

/**
 * What Movera keeps from each trip, per category. No fleet-owner % (owner 2026-10-29, contract v0.18.88 fleetPayoutWhole):
 * a fleet driver's whole earnings are paid to his fleet owner, who settles with his drivers outside Movera.
 */
export function CommissionPanel({ currency, categories, book, published, problems, canEdit, onCommission }: Props) {
  const bad = new Set(problems.map((problem) => problem.path));
  const example = { SE: 200, FR: 20, TN: 60 }[currency];
  return (
    <div className="commission-grid">
      {categories.map((category) => {
        const pct = book.commission[category.id] ?? 0;
        const appFee = book.prices[category.id]?.appFeePct ?? 0;
        const driver = example * (1 - pct / 100);
        return (
          <div key={category.id} className={book.prices[category.id]?.enabled ? "commission-card" : "commission-card off"}>
            <div className="commission-head">
              <strong>{trx(category.label)}</strong>
              <NumberField label={tr("{0} commission", [trx(category.label)])} value={pct} unit="%" max={100} disabled={!canEdit} changed={pct !== published.commission[category.id]} invalid={bad.has(`commission.${category.id}`)} onChange={(value) => onCommission(category.id, value)} />
            </div>
            <div className="split-bar" aria-hidden="true">
              <i className="driver" style={{ width: `${100 - pct}%` }} />
              <i className="movera" style={{ width: `${pct}%` }} />
            </div>
            <dl className="split-facts">
              <div className="split-title"><dt>{trn("On a {0} trip", money(example, currency))}</dt></div>
              <div><dt>{tr("Driver gets")}</dt><dd>{money(driver, currency)}</dd></div>
              <div><dt>{tr("Movera keeps")}</dt><dd>{trn("{0} + {1}% app fee", money(example - driver, currency), appFee)}</dd></div>
            </dl>
          </div>
        );
      })}
    </div>
  );
}
