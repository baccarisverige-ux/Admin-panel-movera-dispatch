import { useQuery } from "@tanstack/react-query";
import { tr } from "../i18n";
import { formatMoney, isCurrency } from "../domain/money";
import { zoneById } from "../markets/markets";
import type { PeriodWindow } from "../dashboard/period";
import { useLiveSession } from "./LiveSessionContext";
import { daysOf, localDay } from "./kpis";
import { ErrorLine } from "./ui";
import type { KpiDay } from "./types";

/**
 * Live Reports › Money (owner decision 10 and part 3): Movera's real money per zone and day, summed from the trips by
 * the server (GET /admin/kpis: today live, earlier days from the nightly summary). A day not summarized yet is
 * marked, never shown as zero.
 */
export function LiveMoneyReport({ window, timeZone, zoneIds }: { window: PeriodWindow; timeZone: string; zoneIds: readonly string[] }) {
  const { client } = useLiveSession();
  const fromDate = localDay(window.start, timeZone);
  const toDate = localDay(Math.max(window.start, window.end - 1), timeZone);
  const query = useQuery({ queryKey: ["live", "kpis", fromDate, toDate], queryFn: () => client.json<{ days: KpiDay[] }>(`/admin/kpis?fromDate=${fromDate}&toDate=${toDate}`) });
  if (query.isLoading) return <p className="state-line">{tr("Loading.")}</p>;
  if (query.error) return <ErrorLine error={query.error} onRetry={() => void query.refetch()} />;
  const dates = daysOf(window.start, window.end, timeZone);
  const days = (query.data?.days ?? []).filter((day) => !zoneIds.length || zoneIds.includes(day.zoneId));
  const money = (minor: number, currency: string) => (isCurrency(currency) ? formatMoney({ amountMinor: minor, currency }) : `${minor} ${currency}`);
  const missing = dates.length * Math.max(1, new Set(days.map((day) => day.zoneId)).size) - days.length;
  return (
    <div className="rp-tab" data-testid="live-money-report">
      {missing > 0 ? <p className="dx-note">{tr("Some days are not summed yet; they show “Not connected yet”.")}</p> : null}
      <table className="data-table">
        <thead><tr><th scope="col">{tr("Day")}</th><th scope="col">{tr("Zone")}</th><th scope="col">{tr("Completed trips")}</th><th scope="col">{tr("Gross bookings")}</th><th scope="col">{tr("Movera commission")}</th><th scope="col">{tr("Driver earnings")}</th><th scope="col">{tr("Driver pickup pay · paid by Movera")}</th><th scope="col">{tr("Cash collected")}</th><th scope="col">{tr("Paid from the wallet")}</th><th scope="col">{tr("Source")}</th></tr></thead>
        <tbody>
          {dates.flatMap((date) => {
            const rows = days.filter((day) => day.date === date);
            if (!rows.length) return [<tr key={date}><td>{date}</td><td colSpan={9}>{tr("Not connected yet")}</td></tr>];
            return rows.map((day) => (
              <tr key={`${date}-${day.zoneId}`}>
                <td>{date}</td>
                <td>{zoneById(day.zoneId)?.name ?? day.zoneId}</td>
                <td>{day.completedTrips}</td>
                <td>{money(day.gross, day.currency)}</td>
                <td>{money(day.commission, day.currency)}</td>
                <td>{money(day.driverEarnings, day.currency)}</td>
                <td>{money(day.pickupPay, day.currency)}</td>
                <td>{money(day.cashCollected, day.currency)}</td>
                <td>{money(day.walletApplied, day.currency)}</td>
                <td>{day.source === "live" ? tr("Live today") : tr("Nightly summary")}</td>
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
}
