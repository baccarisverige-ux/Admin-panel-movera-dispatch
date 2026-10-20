import type { MarketId } from "../markets/markets";
import { NumberField } from "./NumberField";
import { money, type CategoryDef, type Problem, type ZoneBook } from "./zonePricing";
import { tr, trn, trx } from "../i18n";

type Props = {
  zoneName: string;
  currency: MarketId;
  categories: CategoryDef[];
  book: ZoneBook;
  published: ZoneBook;
  problems: Problem[];
  canEdit: boolean;
  onCommission: (categoryId: string, value: number) => void;
  onFleet: (value: number) => void;
};

/** What Movera keeps from each trip, per category, and what fleet owners get from their drivers. */
export function CommissionPanel({ zoneName, currency, categories, book, published, problems, canEdit, onCommission, onFleet }: Props) {
  const bad = new Set(problems.map((problem) => problem.path));
  const example = { SE: 200, FR: 20, TN: 60 }[currency];
  return (
    <>
      <div className="commission-grid">
        {categories.map((category) => {
          const pct = book.commission[category.id] ?? 0;
          const appFee = book.prices[category.id]?.appFeePct ?? 0;
          const driver = example * (1 - pct / 100);
          const fleet = driver * (book.fleetCommissionPct / 100);
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
                <div><dt>{tr("Fleet owner")}</dt><dd>{money(fleet, currency)}</dd></div>
              </dl>
            </div>
          );
        })}
      </div>
      <div className="fee-card fleet-share">
        <div>
          <strong>{tr("Fleet owner share")}</strong>
          <small>{trn("Part of their drivers' earnings that goes to the fleet owner in {0}", zoneName)}</small>
        </div>
        <NumberField label={tr("Fleet owner share")} value={book.fleetCommissionPct} unit="%" max={100} disabled={!canEdit} changed={book.fleetCommissionPct !== published.fleetCommissionPct} invalid={bad.has("commission.fleet")} onChange={onFleet} />
      </div>
    </>
  );
}
