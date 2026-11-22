import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { tr, trx } from "../i18n";
import { ApiError } from "../api/httpClient";
import { useMarketScope } from "../markets/useMarketScope";
import { useLiveSession } from "./LiveSessionContext";
import { liveMoney } from "./format";
import { ErrorLine } from "./ui";
import { zoneFilterOf } from "./zoneFilter";
import {
  COLUMN_INFO, DETAIL_CHOICES, FIELD_LABEL, TABLE_FIELDS, csvFileName, defaultYear, incomeQuery, listDetail, monthChoices, tripsNeedScope, yearChoices,
  type IncomeDetail, type IncomePage, type IncomeRow, type IncomeTotals,
} from "./driverIncome";

/**
 * v0.18.153 P29 (contract.json#driverIncomeYear, DAC7): the server's yearly income per payee (the driver's fleet, else the
 * driver), drill-down payee → months → month → days → day → trips, the accountant's CSV at the chosen level and Print.
 * Every amount is the server's (the panel adds nothing up). One read per page; no polling (a yearly report).
 */

/** The (i) text of a column (owner: English only). */
function Info({ text }: { text: string }) {
  return <span className="di-info" title={text} aria-label={text} role="img">ⓘ</span>;
}

function MoneyCells({ totals }: { totals: IncomeTotals }) {
  return (
    <>
      <td className="num">{totals.rides}</td>
      {TABLE_FIELDS.map((field) => <td key={field} className={`num${totals[field].amountMinor < 0 ? " minus" : ""}`}>{liveMoney(totals[field])}</td>)}
    </>
  );
}

function MoneyHead({ first }: { first: string }) {
  return (
    <thead>
      <tr>
        <th scope="col">{first}</th>
        <th scope="col" className="num">{tr("Rides")} <Info text={COLUMN_INFO.rides} /></th>
        {TABLE_FIELDS.map((field) => <th key={field} scope="col" className="num">{trx(FIELD_LABEL[field])} <Info text={COLUMN_INFO[field]} /></th>)}
      </tr>
    </thead>
  );
}

const reasonOf = (error: unknown) => (error instanceof ApiError ? error.reason : null);

export function LiveDriverIncome() {
  const { client } = useLiveSession();
  const scope = useMarketScope();
  const zoneFilter = zoneFilterOf(scope.effective);
  const [now] = useState(() => new Date());
  const [year, setYear] = useState(() => defaultYear(now));
  const [detail, setDetail] = useState<IncomeDetail>("quarter");
  const [month, setMonth] = useState<string | null>(null);
  const [open, setOpen] = useState<{ payee: string; currency: string; month?: string; day?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const zoneParams = zoneFilter.params;
  const base = { year, detail: listDetail(detail), month, zoneParams };
  const list = useInfiniteQuery({
    queryKey: ["live", "driver-income", year, listDetail(detail), month, new URLSearchParams(zoneParams).toString()],
    enabled: !zoneFilter.denied,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => client.json<IncomePage>(`/admin/finance/driver-income?${incomeQuery({ ...base, cursor: pageParam, limit: 50 })}`),
    getNextPageParam: (last) => last.nextCursor,
  });
  const rows = (list.data?.pages ?? []).flatMap((page) => page.items);
  const row = open ? rows.find((r) => r.payeeId === open.payee && r.currency === open.currency) : undefined;
  // All trips per day: the trips of the opened payee's month, read when a month of a payee is opened.
  const tripsKey = detail === "trips" && open?.month ? open : null;
  const trips = useQuery({
    queryKey: ["live", "driver-income-trips", year, tripsKey?.payee, tripsKey?.month, new URLSearchParams(zoneParams).toString()],
    enabled: tripsKey !== null,
    queryFn: () => client.json<IncomePage>(`/admin/finance/driver-income?${incomeQuery({ year, detail: "trips", month: tripsKey!.month!, payeeId: tripsKey!.payee, zoneParams })}`),
  });
  const tripRow = trips.data?.items.find((r) => r.payeeId === open?.payee && r.currency === open?.currency);

  const csvPayee = open?.payee ?? null;
  const csvMonth = month ?? open?.month ?? null;
  async function download() {
    if (busy) return;
    if (tripsNeedScope(detail, csvMonth, csvPayee)) {
      setError(new Error(tr("Pick a month or open a payee to see all trips.")));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { blob } = await client.blob(`/admin/finance/driver-income.csv?${incomeQuery({ year, detail, month: csvMonth, payeeId: detail === "trips" && !csvMonth ? csvPayee : null, zoneParams })}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = csvFileName(year, detail, csvMonth);
      link.click();
      URL.revokeObjectURL(url);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  const resetTo = (next: Partial<{ year: number; detail: IncomeDetail; month: string | null }>) => {
    if (next.year !== undefined) setYear(next.year);
    if (next.detail !== undefined) setDetail(next.detail);
    if (next.month !== undefined) setMonth(next.month);
    setOpen(null);
  };
  const listError = list.error ? (reasonOf(list.error) === "income_detail_too_big" ? new Error(tr("Too many trips to show at once. Pick a month.")) : list.error) : null;
  const monthOf = row?.months?.find((m) => m.month === open?.month);
  const dayOf = (tripRow ?? row)?.months?.find((m) => m.month === open?.month)?.days?.find((d) => d.day === open?.day);
  const payeeCell = (r: IncomeRow) => (
    <th scope="row">
      <button data-command="admin.server.driverIncome" type="button" className="link-action" onClick={() => setOpen({ payee: r.payeeId, currency: r.currency })}>{r.name || r.payeeId}</button>
      <small> · {r.kind === "company" ? tr("Company") : tr("Driver")}{r.orgNumber ? ` · ${r.orgNumber}` : ""}{r.kind === "company" ? ` · ${tr("{0} drivers", [r.driverIds.length])}` : ""}</small>
      {r.partial ? <small className="di-partial" data-testid="driver-income-partial"> · {tr("Only your zones")} <Info text={COLUMN_INFO.partial} /></small> : null}
    </th>
  );

  return (
    <div className="live-driver-income" data-testid="live-driver-income">
      <div className="dx-filters di-controls no-print">
        <label>{tr("Year")}{/* info-skip: a report filter, not a setting */}
          <select value={year} onChange={(event) => resetTo({ year: Number(event.target.value), month: null })}>
            {yearChoices(now).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label>{tr("Details")}{/* info-skip: a report filter, not a setting */}
          <select value={detail} onChange={(event) => resetTo({ detail: event.target.value as IncomeDetail })}>
            {DETAIL_CHOICES.map((c) => <option key={c.id} value={c.id}>{trx(c.label)}</option>)}
          </select>
        </label>
        <label>{tr("Month")}{/* info-skip: a report filter, not a setting */}
          <select value={month ?? ""} onChange={(event) => resetTo({ month: event.target.value || null })}>
            <option value="">{tr("All months")}</option>
            {monthChoices(year).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <button data-command="admin.server.driverIncome" type="button" className="primary-btn" disabled={busy} onClick={() => void download()}>{busy ? tr("Downloading…") : tr("Download CSV for accountant")}</button>
        <button data-command="admin.server.driverIncome" type="button" className="secondary-btn" onClick={() => globalThis.print()}>{tr("Print")}</button>
      </div>
      {error ? <ErrorLine error={error} onRetry={() => setError(null)} /> : null}
      {listError ? <ErrorLine error={listError} onRetry={() => void list.refetch()} /> : null}
      {list.isLoading ? <p className="state-line">{tr("Loading…")}</p> : null}
      {!list.isLoading && !listError && rows.length === 0 ? <p className="state-line" data-testid="driver-income-empty">{tr("No earnings in this year.")}</p> : null}

      {!open && rows.length ? (
        <div className="table-wrap">
          <table className="data-table di-table" data-testid="driver-income-payees">
            <MoneyHead first={tr("Payee")} />
            <tbody>{rows.map((r) => <tr key={`${r.payeeId}|${r.currency}`}>{payeeCell(r)}<MoneyCells totals={r} /></tr>)}</tbody>
          </table>
          {list.hasNextPage ? <button data-command="admin.server.loadMore" type="button" className="secondary-btn no-print" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{tr("Load more")}</button> : null}
        </div>
      ) : null}

      {open && row ? (
        <section className="panel fn-panel" data-testid="driver-income-payee">
          <button data-command="admin.server.driverIncome" type="button" className="link-action no-print" onClick={() => setOpen(open.day ? { payee: open.payee, currency: open.currency, month: open.month! } : open.month ? { payee: open.payee, currency: open.currency } : null)}>
            {open.day ? tr("Back to the days") : open.month ? tr("Back to the months") : tr("Back to all payees")}
          </button>
          <h3>{row.name || row.payeeId}</h3>
          <p>{[row.kind === "company" ? tr("Company") : tr("Driver"), row.orgNumber, row.address, row.country, row.currency].filter(Boolean).join(" · ")}<Info text={COLUMN_INFO.payee} /></p>
          {row.partial ? <p className="di-partial">{tr("Only your zones")} <Info text={COLUMN_INFO.partial} /></p> : null}
          {!open.month ? (
            <table className="data-table di-table" data-testid="driver-income-months">
              <MoneyHead first={row.months ? tr("Month") : tr("Quarters")} />
              <tbody>
                {(row.months ?? []).map((m) => (
                  <tr key={m.month}>
                    <th scope="row">{detail === "month" ? m.month : <button data-command="admin.server.driverIncome" type="button" className="link-action" onClick={() => setOpen({ ...open, month: m.month })}>{m.month}</button>}</th>
                    <MoneyCells totals={m} />
                  </tr>
                ))}
                {!row.months ? row.quarters.map((q) => <tr key={q.quarter}><th scope="row">{tr("Q{0}", [q.quarter])}</th><MoneyCells totals={q} /></tr>) : null}
                <tr className="di-total"><th scope="row">{tr("Total")} {year}</th><MoneyCells totals={row} /></tr>
              </tbody>
            </table>
          ) : !open.day ? (
            <table className="data-table di-table" data-testid="driver-income-days">
              <MoneyHead first={tr("Day")} />
              <tbody>
                {(monthOf?.days ?? []).map((d) => (
                  <tr key={d.day}>
                    <th scope="row">{detail === "trips" ? <button data-command="admin.server.driverIncome" type="button" className="link-action" onClick={() => setOpen({ ...open, day: d.day })}>{d.day}</button> : d.day}</th>
                    <MoneyCells totals={d} />
                  </tr>
                ))}
                {monthOf ? <tr className="di-total"><th scope="row">{tr("Total")} {monthOf.month}</th><MoneyCells totals={monthOf} /></tr> : null}
              </tbody>
            </table>
          ) : (
            <>
              {trips.isLoading ? <p className="state-line">{tr("Loading…")}</p> : null}
              {trips.error ? <ErrorLine error={trips.error} onRetry={() => void trips.refetch()} /> : null}
              <table className="data-table di-table" data-testid="driver-income-trips">
                <MoneyHead first={tr("Trip")} />
                <tbody>
                  {(dayOf?.trips ?? []).map((t, index) => (
                    <tr key={`${t.tripId ?? "x"}-${index}`}>
                      <th scope="row">{t.localTime.slice(11)} · {t.lineKind === "payout" ? tr("Paid out") : (t.tripId ?? tr("Bonus campaign"))}<small> · {t.paymentMethod === "cash" ? tr("Pay in car") : (t.paymentMethod ?? "")}{t.zoneId ? ` · ${t.zoneId}` : ""}</small></th>
                      <MoneyCells totals={t} />
                    </tr>
                  ))}
                  {dayOf ? <tr className="di-total"><th scope="row">{tr("Total")} {dayOf.day}</th><MoneyCells totals={dayOf} /></tr> : null}
                </tbody>
              </table>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
