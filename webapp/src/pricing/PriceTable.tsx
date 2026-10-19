import { Fragment } from "react";
import { NumberField } from "./NumberField";
import { PRICE_ROWS, currencySymbol, inputStep, priceMax, type CategoryDef, type CategoryPrice, type PriceField, type Problem, type ZoneBook } from "./zonePricing";
import type { MarketId } from "../markets/markets";

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
    <div className="price-table-wrap" role="region" aria-label={`Prices in ${zoneName}`} tabIndex={0}>
      <table className="price-table">
        <caption className="sr-only">Prices per category in {zoneName}, in {symbol}, VAT included</caption>
        <thead>
          <tr>
            <th scope="col" className="corner">
              <span>Price item</span>
              <small>All prices include VAT</small>
            </th>
            {categories.map((category) => {
              const enabled = book.prices[category.id]?.enabled ?? false;
              return (
                <th scope="col" key={category.id} className={enabled ? "cat-head" : "cat-head off"}>
                  <strong>{category.label}</strong>
                  <small>{category.line}</small>
                  <label className="mini-switch">
                    <input type="checkbox" aria-label={`${category.label} available in ${zoneName}`} checked={enabled} disabled={!canEdit} onChange={(event) => onChange(category.id, { enabled: event.target.checked })} />
                    <span aria-hidden="true"><i /></span>
                    {enabled ? "On" : "Off"}
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
                <th scope="rowgroup" colSpan={categories.length + 1}>{group}</th>
              </tr>
              {group === "Cancellation" ? (
                <tr className="note-row">
                  <td colSpan={categories.length + 1}>
                    <p className="price-note" data-testid="rider-cancel-fees-pointer">
                      <span>Rider cancel fees are set in Dispatch › Rides &amp; stops › Rider cancel fees.</span>
                      {onOpenCancelFees ? <button data-command="admin.dispatch.view" type="button" className="dash-btn small ghost" onClick={onOpenCancelFees}>Open Rider cancel fees</button> : null}
                    </p>
                  </td>
                </tr>
              ) : null}
              {PRICE_ROWS.filter((row) => row.group === group).map((row) => (
                <tr key={row.field}>
                  <th scope="row">
                    <span>{row.label}</span>
                    {row.hint ? <small>{row.hint}</small> : null}
                  </th>
                  {categories.map((category) => {
                    const price = book.prices[category.id];
                    const before = published.prices[category.id];
                    if (!price) return <td key={category.id} />;
                    const field = row.field as PriceField;
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
                          title={changed && before ? `Published: ${before[field]}` : undefined}
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
