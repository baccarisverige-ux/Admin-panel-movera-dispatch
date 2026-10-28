import { Fragment } from "react";
import { NumberField } from "./NumberField";
import { PRICE_ROWS, rowApplies, currencySymbol, inputStep, priceMax, type CategoryDef, type CategoryPrice, type PriceField, type Problem, type ZoneBook } from "./zonePricing";
import type { MarketId } from "../markets/markets";
import { tr, trn, trx } from "../i18n";

type Props = {
  zoneName: string;
  currency: MarketId;
  categories: CategoryDef[];
  book: ZoneBook;
  published: ZoneBook;
  problems: Problem[];
  canEdit: boolean;
  onChange: (categoryId: string, patch: Partial<CategoryPrice>) => void;
  /** Rider cancel fees are not set here: they live in Dispatch › Rides & stops › Rider cancel fees. Left out when the admin cannot open Dispatch. */
  onOpenCancelFees?: () => void;
};

/** Rows are price items, columns are categories; every cell edits one value for this zone. */
export function PriceTable({ zoneName, currency, categories, book, published, problems, canEdit, onChange, onOpenCancelFees }: Props) {
  const bad = new Set(problems.map((problem) => problem.path));
  const groups = Array.from(new Set(PRICE_ROWS.map((row) => row.group)));
  const symbol = currencySymbol(currency);
  const unitOf = (unit: "money" | "min" | "pct") => (unit === "money" ? symbol : unit === "min" ? "min" : "%");
  return (
    <div className="price-table-wrap" role="region" aria-label={tr("Prices in {0}", [zoneName])} tabIndex={0}>
      <table className="price-table">
        <caption className="sr-only">{trn("Prices per category in {0}, in {1}, VAT included", zoneName, symbol)}</caption>
        <thead>
          <tr>
            <th scope="col" className="corner">
              <span>{tr("Price item")}</span>
              <small>{tr("All prices include VAT")}</small>
            </th>
            {categories.map((category) => {
              const enabled = book.prices[category.id]?.enabled ?? false;
              return (
                <th scope="col" key={category.id} className={enabled ? "cat-head" : "cat-head off"}>
                  <strong>{trx(category.label)}</strong>
                  <small>{trx(category.line)}</small>
                  <label className="mini-switch">
                    <input type="checkbox" aria-label={tr("{0} available in {1}", [trx(category.label), zoneName])} checked={enabled} disabled={!canEdit} onChange={(event) => onChange(category.id, { enabled: event.target.checked })} />
                    <span aria-hidden="true"><i /></span>
                    {enabled ? tr("On") : tr("Off")}
                  </label>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragment key={group}>
              <tr className="group-row">
                <th scope="rowgroup" colSpan={categories.length + 1}>{trx(group)}</th>
              </tr>
              {group === "Cancellation" ? (
                <tr className="note-row">
                  <td colSpan={categories.length + 1}>
                    <p className="price-note" data-testid="rider-cancel-fees-pointer">
                      <span>{tr("Rider cancel fees are set in Dispatch › Rides & stops › Rider cancel fees.")}</span>
                      {onOpenCancelFees ? <button data-command="admin.dispatch.view" type="button" className="dash-btn small ghost" onClick={onOpenCancelFees}>{tr("Open Rider cancel fees")}</button> : null}
                    </p>
                  </td>
                </tr>
              ) : null}
              {PRICE_ROWS.filter((row) => row.group === group).map((row) => (
                <tr key={row.field}>
                  <th scope="row">
                    <span>{trx(row.label)}</span>
                    {row.hint ? <small>{trx(row.hint)}</small> : null}
                  </th>
                  {categories.map((category) => {
                    const price = book.prices[category.id];
                    const before = published.prices[category.id];
                    if (!price) return <td key={category.id} />;
                    const field = row.field as PriceField;
                    // Owner 2026-10-27: the seat fee exists only on Child Seat; every other car type shows a grey "—".
                    if (!rowApplies(field, category.id)) return <td key={category.id} className="na" aria-label={tr("{0}: not on {1}", [trx(row.label), trx(category.label)])}><span className="na-dash">—</span></td>;
                    const changed = before ? before[field] !== price[field] : false;
                    return (
                      <td key={category.id} className={price.enabled ? undefined : "off"}>
                        <NumberField
                          label={`${zoneName} ${category.label} ${row.label}`}
                          value={price[field]}
                          unit={unitOf(row.unit)}
                          step={row.unit === "money" ? inputStep(currency) : 1}
                          max={priceMax(field, currency)}
                          disabled={!canEdit}
                          changed={changed}
                          invalid={bad.has(`prices.${category.id}.${field}`)}
                          title={changed && before ? tr("Published: {0}", [before[field]]) : undefined}
                          onChange={(value) => onChange(category.id, { [field]: value })}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
