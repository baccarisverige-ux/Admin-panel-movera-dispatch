import { useQuery } from "@tanstack/react-query";
import { MapPin, CalendarDays } from "lucide-react";
import { tr } from "../i18n";
import { formatMoney, isCurrency } from "../domain/money";
import { zoneById } from "../markets/markets";
import type { PeriodWindow } from "../dashboard/period";
import type { Card, Format } from "../reports/engine";
import { Cards, Panel, SortTable } from "../reports/ui";
import { useLiveSession } from "./LiveSessionContext";
import { daysOf, localDay, moneyGroups, type MoneyLine } from "./kpis";
import { ErrorLine } from "./ui";
import type { KpiDay } from "./types";

/**
 * Live Reports › Money (owner decisions of 2026-10-27 and 2026-10-28, contract v0.10.3 kpis.money): Movera's real
 * money per zone and zone-local day, summed by the server (GET /admin/kpis: today live, earlier days from the nightly
 * summary). The same cards and zone table as the demo; each currency on its own, never added together. A total with
 * a day or a field the server has not sent reads "Not connected yet", never zero.
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
  const groups = moneyGroups(days, dates);
  return (
    <div className="rp-tab" data-testid="live-money-report">
      {groups.some((group) => group.missing) ? <p className="dx-note">{tr("Some days are not summed yet; they show “Not connected yet”.")}</p> : null}
      {!groups.length ? <p className="state-line">{tr("Not connected yet")}</p> : null}
      {groups.map((group) => {
        const money = (minor: number) => (!Number.isFinite(minor) ? tr("Not connected yet") : isCurrency(group.currency) ? formatMoney({ amountMinor: Math.round(minor), currency: group.currency }) : `${minor} ${group.currency}`);
        const fmt = (value: number, format: Format) => (format === "money" ? money(value) : Number.isFinite(value) ? String(value) : tr("Not connected yet"));
        const t = group.total;
        const cards: Card[] = [
          { id: "gross", label: "Bookings", value: t.bookings, previous: null, format: "money", info: "Ride prices plus cancel and no-show fees, VAT included. Tips are not in it." },
          { id: "movera", label: "Movera earnings", value: t.moveraEarnings, previous: null, format: "money", info: "What Movera keeps: commission and fees, minus pickup pay and the driver bonuses Movera paid. Can be negative." },
          { id: "drivers", label: "Driver earnings", value: t.driverEarnings, previous: null, format: "money", info: "What drivers earned: their part of the rides, pickup pay and bonuses. Tips are apart." },
          { id: "tips", label: "Tips", value: t.tips, previous: null, format: "money", info: "Tips riders gave drivers. All of it goes to the driver." },
          { id: "refunds", label: "Refunds", value: t.refunds, previous: null, format: "money", info: "Money given back to riders, counted on the day of the trip.", goodDown: true },
          { id: "net", label: "Net revenue", value: t.net, previous: null, format: "money", info: "Movera earnings minus refunds." },
        ];
        return (
          <section key={group.currency} className="rp-currency" aria-label={group.currency} data-testid={`live-money-${group.currency}`}>
            {groups.length > 1 ? <h3>{group.currency}</h3> : null}
            <Cards cards={cards} fmt={fmt} compareLabel="" compare={false} />
            <div className="rp-grid">
              <Panel title="By zone" icon={<MapPin size={16} aria-hidden="true" />} wide>
                <SortTable<MoneyLine> label={tr("Money by zone")} rows={group.zones} rowKey={(row) => row.key} initial="gross" columns={[
                  { id: "name", label: "Zone", value: (row) => zoneById(row.key)?.name ?? row.key },
                  { id: "gross", label: "Bookings", value: (row) => row.bookings, show: (row) => money(row.bookings), numeric: true },
                  { id: "movera", label: "Movera earnings", value: (row) => row.moveraEarnings, show: (row) => money(row.moveraEarnings), numeric: true },
                  { id: "drivers", label: "Driver earnings", value: (row) => row.driverEarnings, show: (row) => money(row.driverEarnings), numeric: true },
                  { id: "tips", label: "Tips", value: (row) => row.tips, show: (row) => money(row.tips), numeric: true },
                  { id: "refunds", label: "Refunds", value: (row) => row.refunds, show: (row) => money(row.refunds), numeric: true },
                  { id: "net", label: "Net revenue", value: (row) => row.net, show: (row) => money(row.net), numeric: true },
                  { id: "trips", label: "Rides", value: (row) => row.trips, show: (row) => (Number.isFinite(row.trips) ? row.trips : tr("Not connected yet")), numeric: true },
                ]} />
              </Panel>
              <Panel title="By day" icon={<CalendarDays size={16} aria-hidden="true" />} wide>
                <SortTable<MoneyLine> label={tr("Money by day")} rows={group.days} rowKey={(row) => row.key} initial="day" limit={60} columns={[
                  { id: "day", label: "Day", value: (row) => row.key },
                  { id: "gross", label: "Bookings", value: (row) => row.bookings, show: (row) => money(row.bookings), numeric: true },
                  { id: "movera", label: "Movera earnings", value: (row) => row.moveraEarnings, show: (row) => money(row.moveraEarnings), numeric: true },
                  { id: "tips", label: "Tips", value: (row) => row.tips, show: (row) => money(row.tips), numeric: true },
                  { id: "refunds", label: "Refunds", value: (row) => row.refunds, show: (row) => money(row.refunds), numeric: true },
                  { id: "source", label: "Source", value: (row) => row.source ?? "", show: (row) => (row.source === "live" ? tr("Live today") : row.source === "summary" ? tr("Nightly summary") : tr("Not connected yet")) },
                ]} />
              </Panel>
            </div>
          </section>
        );
      })}
      <p className="rp-foot">{tr("Amounts include VAT. A day is the zone's own local day.")}</p>
    </div>
  );
}
