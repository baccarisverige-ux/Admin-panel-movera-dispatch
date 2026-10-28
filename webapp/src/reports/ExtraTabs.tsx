import { tr, trx } from "../i18n";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Building2, Flame, Gift, Landmark, LifeBuoy, MapPin, ShieldAlert, Tags } from "lucide-react";
import { emptySafety, emptySupport, useRecords, useSlice, type SafetyBook, type SupportBook } from "../api/hooks";
import { isOnline } from "../api/presence";
import { useSession } from "../auth/SessionContext";
import { can } from "../auth/permissions";
import { earningsReport } from "../dashboard/earnings";
import { Card as SettingsCard, Num, Row, Switch } from "../dispatch/fields";
import { BONUS_KEY, emptyBonusBook, normalizeBonusBook, type BonusBook } from "../drivers/bonus";
import { driverOps, emptyDriverOpsBook, type DriverOpsBook } from "../drivers/ops";
import { driverPerformance } from "../fleet/performance";
import { PROMO_OPS_KEY, emptyPromoOps, hubItems, normalizePromoOps, type PromoOps } from "../growth/hub";
import { MARKETS, formatMoney, market, type MarketId } from "../markets/markets";
import { zoneDemand } from "../pricing/demand";
import { SLICE_KEY as PRICING_KEY, emptyPricingStore, normalizeStore, zoneBook, type PricingStore } from "../pricing/zonePricing";
import { CARE_KEY, emptyRiderCare, normalizeCare, type RiderCare } from "../riders/care";
import { INCIDENT_OPS_KEY, caseOf, emptyIncidentOps, normalizeIncidentOps, type IncidentOps } from "../safety/cases";
import { SUPPORT_DESK_KEY, TOPICS, emptyDesk, factsOf, normalizeDesk, type Desk } from "../support/desk";
import { CommandButton } from "../ui/CommandButton";
import { useDirtyWarning } from "../ui/useDirtyWarning";
import { notesFor, type Card } from "./engine";
import { TAX_RULES_KEY, companyTotals, compareZones, emptyTaxRules, fleetRows, normalizeTaxRules, promoReturn, supportSafety, surgeCards, surgeZone, taxLine, taxRulesError, toSekMinor, type CountryTax, type TaxRules } from "./extra";
import { useCsv, useZoneRows, type TabProps } from "./Tabs";
import { Bars, Cards, Delta, Notes, Panel, SortTable } from "./ui";

const count = (value: number) => new Intl.NumberFormat("en-GB").format(Math.round(value));
const sek = (minor: number) => formatMoney(minor, "SE");

/** Taxes: VAT and tax for a Swedish company working in Sweden, France and Tunisia. */
export function TaxesTab({ market: current, zones, window, compare, fmt, onCsv }: TabProps) {
  const { agent } = useSession();
  const finance = Boolean(agent && can(agent.role, "finance.read"));
  const slice = useSlice<TaxRules>(TAX_RULES_KEY, emptyTaxRules(), { enabled: finance });
  const rules = normalizeTaxRules(slice.value);
  const editable = Boolean(agent && can(agent.role, "approval.decide"));
  const [draft, setDraft] = useState<CountryTax | null>(null);
  const [notice, setNotice] = useState("");
  useDirtyWarning(Boolean(draft));
  const lines = useMemo(() => MARKETS.map((item) => {
    const ids = item.id === current.id ? zones.map((zone) => zone.id) : item.zones.map((zone) => zone.id);
    const report = earningsReport(item.id, ids, window);
    return { market: item, line: taxLine(item.id, report.totals, rules), previous: taxLine(item.id, report.previous, rules), netMinor: report.totals.netMinor, minorUnits: item.minorUnits };
  }), [current.id, zones, window, rules]);
  const here = lines.find((item) => item.market.id === current.id) ?? lines[0];
  const netSek = lines.reduce((sum, item) => sum + toSekMinor(item.netMinor, item.market.id, item.minorUnits, rules), 0);
  const company = companyTotals(lines, netSek, rules);
  const rule = draft ?? rules.countries[current.id];
  const error = taxRulesError({ ...rules, countries: { ...rules.countries, [current.id]: rule } });
  const cards: Card[] = [
    { id: "rideVat", label: "VAT in ride prices", value: here.line.rideVatMinor, previous: here.previous.rideVatMinor, format: "money", info: `${tr("VAT inside what riders paid, at {0}%.", [rules.countries[current.id].rideVat.pct])} ${here.line.rideVatBy === "Movera" ? tr("Movera sells the ride and pays it.") : here.line.rideVatBy === "Drivers" ? tr("The drivers or fleets pay it; Movera only shows it.") : tr("Switched off.")}` },
    { id: "commissionVat", label: "Swedish VAT on commission", value: here.line.commissionVatMinor, previous: here.previous.commissionVatMinor, format: "money", info: "Movera is a Swedish company and adds Swedish VAT on its commission. Paid to Skatteverket." },
    { id: "reverse", label: "Reverse charge", value: here.line.reverseChargeMinor, previous: here.previous.reverseChargeMinor, format: "money", info: "Commission billed abroad without Swedish VAT: the driver or fleet accounts for the VAT in their country." },
    { id: "withholding", label: "Tax kept from drivers", value: here.line.withholdingMinor, previous: here.previous.withholdingMinor, format: "money", info: "Tax kept back from driver payouts where the country asks for it." },
    { id: "owes", label: "Movera owes", value: here.line.moveraOwesMinor, previous: here.previous.moveraOwesMinor, format: "money", info: "What Movera pays the tax office for this country and period.", goodDown: true },
  ];
  useCsv(onCsv, { name: "taxes", head: ["Country", "Bookings", "Commission", "VAT in ride prices", "Ride VAT paid by", "Swedish VAT on commission", "Reverse charge", "Tax kept from drivers", "Movera owes", "Movera owes SEK"], rows: lines.map((item) => [item.market.name, item.line.grossMinor / item.minorUnits, item.line.commissionMinor / item.minorUnits, item.line.rideVatMinor / item.minorUnits, item.line.rideVatBy, item.line.commissionVatMinor / item.minorUnits, item.line.reverseChargeMinor / item.minorUnits, item.line.withholdingMinor / item.minorUnits, item.line.moveraOwesMinor / item.minorUnits, toSekMinor(item.line.moveraOwesMinor, item.market.id, item.minorUnits, rules) / 100]) });
  const patch = (next: Partial<CountryTax>) => setDraft({ ...rule, ...next });
  const rate = (label: string, key: "rideVat" | "commissionVat" | "withholding", help: string) => (
    <Row label={label} help={help} on={rule[key].on} onToggle={(on) => patch({ [key]: { ...rule[key], on } })} disabled={!editable}>
      <Num label={tr("{0} rate", [trx(label)])} value={rule[key].pct} unit="%" min={0} max={50} step={0.5} disabled={!editable || !rule[key].on} onChange={(pct) => patch({ [key]: { ...rule[key], pct } })} />
    </Row>
  );
  if (!finance) return <div className="rp-tab"><p className="dx-calm">{tr("Taxes are for admins who can see finance.")}</p></div>;
  return (
    <div className="rp-tab">
      <Notes notes={notesFor(cards)} />
      {notice ? <p role="status" className="pricing-notice">{notice}</p> : null}
      <Cards cards={cards} fmt={fmt} compareLabel={window.compareLabel} compare={compare} />
      <div className="rp-grid">
        <Panel title={tr("Whole company in SEK")} icon={<Landmark size={16} aria-hidden="true" />} wide aside={<span className="rp-tag">{tr("Movera AB · Sweden")}</span>}>
          <SortTable label={tr("Taxes by country")} rows={lines} rowKey={(item) => item.market.id} columns={[
            { id: "country", label: "Country", value: (item) => item.market.name, show: (item) => <b className={item.market.id === current.id ? "rp-now" : undefined}>{item.market.name}</b> },
            { id: "gross", label: "Bookings", value: (item) => item.line.grossMinor, show: (item) => formatMoney(item.line.grossMinor, item.market.id), numeric: true },
            { id: "rideVat", label: "VAT in rides", value: (item) => item.line.rideVatMinor, show: (item) => <>{formatMoney(item.line.rideVatMinor, item.market.id)} <small className="rp-muted">{item.line.rideVatBy === "Off" ? "off" : `by ${item.line.rideVatBy}`}</small></>, numeric: true },
            { id: "commission", label: "Commission", value: (item) => item.line.commissionMinor, show: (item) => formatMoney(item.line.commissionMinor, item.market.id), numeric: true },
            { id: "swedishVat", label: "Swedish VAT", value: (item) => item.line.commissionVatMinor, show: (item) => formatMoney(item.line.commissionVatMinor, item.market.id), numeric: true },
            { id: "reverse", label: "Reverse charge", value: (item) => item.line.reverseChargeMinor, show: (item) => formatMoney(item.line.reverseChargeMinor, item.market.id), numeric: true },
            { id: "owes", label: "Movera owes", value: (item) => item.line.moveraOwesMinor, show: (item) => formatMoney(item.line.moveraOwesMinor, item.market.id), numeric: true },
            { id: "owesSek", label: "In SEK", value: (item) => toSekMinor(item.line.moveraOwesMinor, item.market.id, item.minorUnits, rules), show: (item) => sek(toSekMinor(item.line.moveraOwesMinor, item.market.id, item.minorUnits, rules)), numeric: true },
          ]} />
          <p className="rp-foot">{tr("Movera owes in total")} <b>{sek(company.owesSekMinor)}</b> {tr("· Commission earned")} <b>{sek(company.commissionSekMinor)}</b>{company.companyTaxSekMinor !== null ? <> · Company tax about <b>{sek(company.companyTaxSekMinor)}</b> ({rules.companyTax.pct}% of net revenue, before costs)</> : null} · 1 EUR = {rules.sekPer.EUR} SEK · 1 TND = {rules.sekPer.TND} SEK</p>
        </Panel>
        <SettingsCard title={tr("Tax rules for {0}", [current.name])} icon={<Landmark size={15} />} tone="orange" help={tr("Rates and who pays. Change them when the accountant says so; every rule has a switch.")}>
          {rate("VAT in ride prices", "rideVat", "Passenger transport VAT, inside the price riders pay.")}
          <Row label={tr("Movera sells the ride")} help="On: Movera is the seller and pays the ride VAT. Off: the driver or fleet sells the ride; Movera only takes a commission."><Switch label={tr("Movera sells the ride")} on={rule.moveraSellsRide} disabled={!editable} onChange={(moveraSellsRide) => patch({ moveraSellsRide })} /></Row>
          {rate("VAT on commission", "commissionVat", "Swedish VAT Movera adds on its commission.")}
          {current.id !== "SE" ? <Row label={tr("Reverse charge")} help="On: commission to drivers abroad is billed without Swedish VAT; they account for it at home."><Switch label={tr("Reverse charge")} on={rule.reverseCharge} disabled={!editable} onChange={(reverseCharge) => patch({ reverseCharge })} /></Row> : null}
          {rate("Tax kept from drivers", "withholding", "Tax kept back from payouts where the country asks for it.")}
          {error ? <p role="alert" className="dx-issues">{error}</p> : null}
          <div className="actions">
            <CommandButton command="admin.tax.rules" confirmTarget={false} className="dash-btn small" sliceKey={TAX_RULES_KEY} value={{ ...rules, draftRev: rules.draftRev + 1, countries: { ...rules.countries, [current.id]: rule } }} expectedSliceRev={rules.draftRev} targetId={current.id} disabled={!editable || !draft || Boolean(error) || slice.loading} onDone={() => { setDraft(null); setNotice(tr("Tax rules for {0} saved.", [current.name])); }}>{tr("Save tax rules")}</CommandButton>
            {draft ? <button data-command="admin.reports.view" type="button" className="dash-btn small ghost" onClick={() => setDraft(null)}>{tr("Undo changes")}</button> : null}
          </div>
        </SettingsCard>
        <SettingsCard title={tr("Company")} icon={<Building2 size={15} />} tone="blue" help="Exchange rates to SEK and the company tax estimate.">
          <CompanyRules rules={rules} editable={editable} loading={slice.loading} onSaved={() => setNotice(tr("Company rules saved."))} />
          <p className="dx-note">{tr("Movera is a Swedish company. Money earned in France and Tunisia is shown in SEK with the rates above, so the accountant sees one total. Demo rides until the backend is connected.")}</p>
        </SettingsCard>
      </div>
    </div>
  );
}

function CompanyRules({ rules, editable, loading, onSaved }: { rules: TaxRules; editable: boolean; loading: boolean; onSaved: () => void }) {
  const [draft, setDraft] = useState<Pick<TaxRules, "sekPer" | "companyTax"> | null>(null);
  useDirtyWarning(Boolean(draft));
  const value = draft ?? { sekPer: rules.sekPer, companyTax: rules.companyTax };
  const next = { ...rules, ...value };
  const error = taxRulesError(next);
  return (
    <>
      <Row label={tr("1 EUR in SEK")}><Num label={tr("SEK per EUR")} value={value.sekPer.EUR} unit="SEK" min={0.01} step={0.1} disabled={!editable} onChange={(EUR) => setDraft({ ...value, sekPer: { ...value.sekPer, EUR } })} /></Row>
      <Row label={tr("1 TND in SEK")}><Num label={tr("SEK per TND")} value={value.sekPer.TND} unit="SEK" min={0.01} step={0.1} disabled={!editable} onChange={(TND) => setDraft({ ...value, sekPer: { ...value.sekPer, TND } })} /></Row>
      <Row label={tr("Company tax estimate")} help="Swedish company tax on net revenue, before costs. A rough number for planning, not the tax return." on={value.companyTax.on} onToggle={(on) => setDraft({ ...value, companyTax: { ...value.companyTax, on } })} disabled={!editable}>
        <Num label={tr("Company tax rate")} value={value.companyTax.pct} unit="%" min={0} max={50} step={0.1} disabled={!editable || !value.companyTax.on} onChange={(pct) => setDraft({ ...value, companyTax: { ...value.companyTax, pct } })} />
      </Row>
      {error ? <p role="alert" className="dx-issues">{error}</p> : null}
      <div className="actions">
        <CommandButton command="admin.tax.rules" confirmTarget={false} className="dash-btn small" sliceKey={TAX_RULES_KEY} value={{ ...next, draftRev: rules.draftRev + 1 }} expectedSliceRev={rules.draftRev} targetId="company" disabled={!editable || !draft || Boolean(error) || loading} onDone={() => { setDraft(null); onSaved(); }}>{tr("Save company rules")}</CommandButton>
        {draft ? <button data-command="admin.reports.view" type="button" className="dash-btn small ghost" onClick={() => setDraft(null)}>{tr("Undo changes")}</button> : null}
      </div>
    </>
  );
}

/** Fleet owners: each fleet's drivers, rides and the drivers' earnings (owner 2026-10-28: no owners' share). */
export function FleetsTab({ market: current, zones, window, compare, fmt, money, onCsv }: TabProps) {
  const drivers = useRecords("drivers");
  const fleets = useRecords("fleets");
  const ops = useSlice<DriverOpsBook>("driverOps", emptyDriverOpsBook());
  const pricing = normalizeStore(useSlice<PricingStore>(PRICING_KEY, emptyPricingStore()).value);
  const ids = new Set(zones.map((zone) => zone.id));
  const rows = useMemo(() => {
    const list = (drivers.data ?? []).filter((row) => ids.has(row.zoneId) && row.fleetId).map((row) => {
      const o = driverOps(ops.value, { id: row.id, name: row.name, fleetId: row.fleetId ?? null, status: row.status, kind: row.kind });
      const perf = driverPerformance({ id: row.id, zoneId: row.zoneId, status: row.status, stars: o.ratings.stars, acceptancePct: o.ratings.acceptancePct, cancellationPct: o.ratings.cancellationPct }, window, false);
      return { id: row.id, fleetId: row.fleetId ?? null, zoneId: row.zoneId, trips: perf.current.trips, grossMinor: perf.current.grossMinor, netMinor: perf.current.netMinor, previousTrips: perf.previous.trips, rating: perf.current.rating, online: isOnline(row) };
    });
    return fleetRows(list, fleets.data ?? [], (zoneId) => zoneBook(pricing, zoneId).fleetCommissionPct);
  }, [drivers.data, fleets.data, ops.value, pricing, window, zones.map((zone) => zone.id).join(",")]);
  const trips = rows.reduce((sum, row) => sum + row.trips, 0);
  const cards: Card[] = [
    { id: "fleets", label: "Fleet owners", value: rows.length, previous: null, format: "count", info: "Fleets with at least one driver in these zones." },
    { id: "drivers", label: "Fleet drivers", value: rows.reduce((sum, row) => sum + row.drivers, 0), previous: null, format: "count", info: "Drivers who work for a fleet owner, not on their own." },
    { id: "rides", label: "Fleet rides", value: trips, previous: rows.reduce((sum, row) => sum + row.previousTrips, 0), format: "count", info: "Rides driven by fleet drivers." },
    { id: "earned", label: "Drivers earned", value: rows.reduce((sum, row) => sum + row.driverMinor, 0), previous: null, format: "money", info: "What fleet drivers earned." },
  ];
  useCsv(onCsv, { name: "fleet-owners", head: ["Fleet", "Drivers", "Online now", "Rides", "Rides before", "Bookings", "Drivers earned", "Rides per driver", "Rating"], rows: rows.map((row) => [row.name, row.drivers, row.online, row.trips, row.previousTrips, row.grossMinor / current.minorUnits, row.driverMinor / current.minorUnits, row.perDriverTrips, row.rating]) });
  return (
    <div className="rp-tab">
      <Notes notes={notesFor(cards)} />
      <Cards cards={cards} fmt={fmt} compareLabel={window.compareLabel} compare={compare} />
      <Panel title={tr("Fleet owners")} icon={<Building2 size={16} aria-hidden="true" />} wide aside={<Link className="link-action" to="/fleets">{tr("Fleet pages")}</Link>}>
        {rows.length ? (
          <SortTable label={tr("Fleet owners")} rows={rows} rowKey={(row) => row.id} initial="trips" columns={[
            { id: "name", label: "Fleet", value: (row) => row.name, show: (row) => <Link to={`/fleets/${row.id}`}>{row.name}</Link> },
            { id: "drivers", label: "Drivers", value: (row) => row.drivers, show: (row) => <>{row.drivers} <small className="rp-muted">{row.online} online</small></>, numeric: true },
            { id: "trips", label: "Rides", value: (row) => row.trips, show: (row) => <>{count(row.trips)} {compare ? <Delta now={row.trips} before={row.previousTrips} /> : null}</>, numeric: true },
            { id: "perDriver", label: "Per driver", value: (row) => row.perDriverTrips, numeric: true },
            { id: "gross", label: "Bookings", value: (row) => row.grossMinor, show: (row) => money(row.grossMinor), numeric: true },
            { id: "earned", label: "Drivers earned", value: (row) => row.driverMinor, show: (row) => money(row.driverMinor), numeric: true },
            { id: "rating", label: "Rating", value: (row) => row.rating, numeric: true },
          ]} />
        ) : <p className="dx-calm">{tr("No fleet drivers in these zones.")}</p>}
      </Panel>
      <p className="rp-foot">{tr("Payouts are in")} <Link to="/payouts">{tr("Payouts")}</Link>.</p>
    </div>
  );
}

/** Zones side by side. */
export function ZonesTab({ market: current, zones, window, compare, fmt, money, onCsv }: TabProps) {
  const zoneRows = useZoneRows(current, zones, window);
  const now = useMemo(() => Date.now(), [window]);
  const data = useMemo(() => compareZones(zoneRows, Object.fromEntries(zones.map((zone) => [zone.id, zoneDemand(zone.id, now).ratio]))), [zoneRows, zones, now]);
  const best = [...data.rows].sort((a, b) => b.perRideMinor - a.perRideMinor)[0];
  const cards: Card[] = [
    { id: "zones", label: "Zones", value: data.rows.length, previous: null, format: "count", info: "Zones in the country or the ones picked in the top bar." },
    { id: "active", label: "Zones with rides", value: data.rows.filter((row) => row.trips).length, previous: null, format: "count", info: "Zones with at least one ride in the period." },
    { id: "perRide", label: "Best money per ride", value: best?.perRideMinor ?? 0, previous: null, format: "money", info: best ? tr("{0}: bookings ÷ rides.", [best.name]) : "Bookings ÷ rides for the best zone." },
    { id: "wait", label: "Longest wait", value: Math.max(0, ...data.rows.map((row) => row.waitMin)), previous: null, format: "min", info: "The zone where riders wait longest for a driver.", goodDown: true },
    { id: "cancel", label: "Highest cancel rate", value: Math.max(0, ...data.rows.map((row) => row.cancelPct)), previous: null, format: "pct", info: "The zone with the most cancelled rides, as a share.", goodDown: true },
  ];
  useCsv(onCsv, { name: "zones", head: ["Zone", "Rides", "Share %", "Growth %", "Bookings", "Per ride", "Net revenue", "Cancel %", "Wait min", "Requests per free driver now"], rows: data.rows.map((row) => [row.name, row.trips, row.ridesShare, row.growthPct ?? "", row.grossMinor / current.minorUnits, row.perRideMinor / current.minorUnits, row.netMinor / current.minorUnits, row.cancelPct, row.waitMin, row.ratio]) });
  return (
    <div className="rp-tab">
      <Notes notes={data.notes} />
      <Cards cards={cards} fmt={fmt} compareLabel={window.compareLabel} compare={compare} />
      <div className="rp-grid">
        <Panel title={tr("Share of rides")} icon={<MapPin size={16} aria-hidden="true" />}>
          <Bars rows={data.rows.map((row) => ({ label: row.name, value: row.trips, hint: `${row.ridesShare}%` }))} format={count} />
        </Panel>
        <Panel title={tr("Money per ride")} icon={<Tags size={16} aria-hidden="true" />}>
          <Bars rows={data.rows.map((row) => ({ label: row.name, value: row.perRideMinor }))} format={money} />
        </Panel>
        <Panel title={tr("Side by side")} icon={<MapPin size={16} aria-hidden="true" />} wide aside={<Link className="link-action" to="/zones">{tr("Zones")}</Link>}>
          <SortTable label={tr("Zones side by side")} rows={data.rows} rowKey={(row) => row.id} initial="trips" columns={[
            { id: "name", label: "Zone", value: (row) => row.name, show: (row) => <Link to={`/zones/${row.id}`}>{row.name}</Link> },
            { id: "trips", label: "Rides", value: (row) => row.trips, show: (row) => <>{count(row.trips)} {compare ? <Delta now={row.trips} before={row.previousTrips} /> : null}</>, numeric: true },
            { id: "share", label: "Share", value: (row) => row.ridesShare, show: (row) => `${row.ridesShare}%`, numeric: true },
            { id: "gross", label: "Bookings", value: (row) => row.grossMinor, show: (row) => money(row.grossMinor), numeric: true },
            { id: "perRide", label: "Per ride", value: (row) => row.perRideMinor, show: (row) => money(row.perRideMinor), numeric: true },
            { id: "cancel", label: "Cancel rate", value: (row) => row.cancelPct, show: (row) => <>{row.cancelPct}% {compare ? <Delta now={row.cancelPct} before={row.previousCancelPct} goodDown /> : null}</>, numeric: true },
            { id: "wait", label: "Wait", value: (row) => row.waitMin, show: (row) => `${row.waitMin} min`, numeric: true },
            { id: "ratio", label: "Busy now", value: (row) => row.ratio, show: (row) => <span className={row.ratio > 1.4 ? "rp-hot" : undefined}>{row.ratio} per free driver</span>, numeric: true },
          ]} />
        </Panel>
      </div>
    </div>
  );
}

/** Pricing and surge: how often surge was on, how high, and what it added. */
export function SurgeTab({ market: current, zones, window, compare, fmt, money, onCsv }: TabProps) {
  const zoneRows = useZoneRows(current, zones, window);
  const end = Math.min(window.end, Date.now());
  const rows = useMemo(() => zoneRows.map((zone) => surgeZone(zone, (at) => zoneDemand(zone.id, at).ratio, window.start, end)), [zoneRows, window.start, end]);
  const cards = surgeCards(rows);
  useCsv(onCsv, { name: "surge", head: ["Zone", "Time with surge %", "Average surge", "Highest surge", "Rides with surge", "Added by surge"], rows: rows.map((row) => [row.name, row.surgePct, row.avgMultiplier, row.peakMultiplier, row.ridesInSurge, row.extraMinor / current.minorUnits]) });
  const top = [...rows].sort((a, b) => b.surgePct - a.surgePct)[0];
  return (
    <div className="rp-tab">
      <Notes notes={top && top.surgePct >= 25 ? [{ tone: "info", text: tr("{0} had surge {1}% of the time", [top.name, top.surgePct]) }] : []} />
      <Cards cards={cards} fmt={fmt} compareLabel={window.compareLabel} compare={compare} />
      <div className="rp-grid">
        <Panel title={tr("Time with surge")} icon={<Flame size={16} aria-hidden="true" />}>
          <Bars rows={rows.map((row) => ({ label: row.name, value: row.surgePct, hint: `peak ${row.peakMultiplier}×` }))} format={(value) => `${value}%`} />
        </Panel>
        <Panel title={tr("Added by surge")} icon={<Tags size={16} aria-hidden="true" />}>
          <Bars rows={rows.map((row) => ({ label: row.name, value: row.extraMinor }))} format={money} />
        </Panel>
        <Panel title={tr("By zone")} icon={<Flame size={16} aria-hidden="true" />} wide aside={<Link className="link-action" to="/pricing?tab=surge">{tr("Surge settings")}</Link>}>
          <SortTable label={tr("Surge by zone")} rows={rows} rowKey={(row) => row.id} initial="surgePct" columns={[
            { id: "name", label: "Zone", value: (row) => row.name },
            { id: "surgePct", label: "Time with surge", value: (row) => row.surgePct, show: (row) => `${row.surgePct}%`, numeric: true },
            { id: "avg", label: "Average", value: (row) => row.avgMultiplier, show: (row) => `${row.avgMultiplier}×`, numeric: true },
            { id: "peak", label: "Highest", value: (row) => row.peakMultiplier, show: (row) => `${row.peakMultiplier}×`, numeric: true },
            { id: "rides", label: "Rides with surge", value: (row) => row.ridesInSurge, numeric: true },
            { id: "extra", label: "Added", value: (row) => row.extraMinor, show: (row) => money(row.extraMinor), numeric: true },
          ]} />
        </Panel>
      </div>
      <p className="rp-foot">{tr("Demo: surge here comes from how busy each zone was (requests per free driver). When the backend logs real surge, this report reads the log.")}</p>
    </div>
  );
}

/** Support and safety: tickets, answer times, ratings, incidents and how fast they were handled. */
export function CareTab({ market: current, zones, window, compare, fmt, onCsv }: TabProps) {
  const { agent } = useSession();
  const tickets = useRecords("tickets");
  const incidents = useRecords("incidents");
  const support = useSlice<SupportBook>("supportOps", emptySupport(), { enabled: Boolean(agent && can(agent.role, "support.reply")) });
  const desk = normalizeDesk(useSlice<Desk>(SUPPORT_DESK_KEY, emptyDesk()).value);
  const safety = useSlice<SafetyBook>("safetyOps", emptySafety(), { enabled: Boolean(agent && can(agent.role, "incidents.read")) });
  const incidentOps = normalizeIncidentOps(useSlice<IncidentOps>(INCIDENT_OPS_KEY, emptyIncidentOps(), { enabled: Boolean(agent && can(agent.role, "incidents.read")) }).value);
  const now = useMemo(() => Date.now(), [window]);
  const ids = new Set(zones.map((zone) => zone.id));
  const facts = useMemo(() => (tickets.data ?? []).map((row, index) => factsOf(row, support.value, desk, now, index % 4 === 3 ? "driver" : "rider")).filter((row) => ids.has(row.zoneId)), [tickets.data, support.value, desk, now, zones.map((zone) => zone.id).join(",")]);
  const cases = useMemo(() => (incidents.data ?? []).filter((row) => ids.has(row.zoneId)).map((row) => caseOf(row, safety.value, incidentOps, now)), [incidents.data, safety.value, incidentOps, now, zones.map((zone) => zone.id).join(",")]);
  // Demo tickets open within the last 36 hours; the period cannot reach further back than the data.
  const start = Math.min(window.start, now - 36 * 3_600_000);
  const data = supportSafety(facts, cases, start, Math.max(window.end, now + 1));
  const topicLabel = (id: string) => TOPICS.find((topic) => topic.id === id)?.label ?? id;
  useCsv(onCsv, { name: "support-safety", head: ["Topic", "Tickets"], rows: data.topics.map((row) => [topicLabel(row.label), row.value]) });
  return (
    <div className="rp-tab">
      <Notes notes={data.notes} />
      <Cards cards={data.cards} fmt={fmt} compareLabel={window.compareLabel} compare={compare} />
      <div className="rp-grid">
        <Panel title={tr("Tickets by topic")} icon={<LifeBuoy size={16} aria-hidden="true" />} aside={<Link className="link-action" to={`/support?country=${current.id}`}>{tr("Support")}</Link>}>
          {data.topics.length ? <Bars rows={data.topics.map((row) => ({ label: topicLabel(row.label), value: row.value }))} format={count} /> : <p className="dx-calm">{tr("No tickets in this period.")}</p>}
        </Panel>
        <Panel title={tr("Incidents by level")} icon={<ShieldAlert size={16} aria-hidden="true" />} aside={<Link className="link-action" to={`/incidents?country=${current.id}`}>{tr("Incidents")}</Link>}>
          {data.levels.length ? <Bars rows={data.levels.map((row) => ({ label: row.label, value: row.value }))} format={count} /> : <p className="dx-calm">{tr("No incidents in this period.")}</p>}
        </Panel>
      </div>
      <p className="rp-foot">{tr("Demo tickets and incidents only reach back about a day and a half, so longer periods show the same numbers.")}</p>
    </div>
  );
}

/** Promotions return: what promotions cost and what came back. */
export function PromosTab({ market: current, window, compare, fmt, money, onCsv }: TabProps) {
  const care = normalizeCare(useSlice<RiderCare>(CARE_KEY, emptyRiderCare()).value);
  const bonuses = normalizeBonusBook(useSlice<BonusBook>(BONUS_KEY, emptyBonusBook()).value);
  const ops = normalizePromoOps(useSlice<PromoOps>(PROMO_OPS_KEY, emptyPromoOps()).value);
  const country: MarketId = current.id;
  const items = useMemo(() => hubItems({ promotions: care.promotions, bonuses: bonuses.bonuses, ops, country, today: new Date().toISOString().slice(0, 10) }), [care.promotions, bonuses.bonuses, ops, country]);
  const KIND: Record<string, string> = { rider: "Rider promotions", driver: "Driver bonuses", voucher: "Voucher codes", referral: "Invite a friend" };
  const rows = items.map((item) => ({ id: item.id, kind: KIND[item.kind] ?? item.kind, title: item.title, cost: item.cost, rides: item.rides, newRiders: item.newRiders, revenue: item.revenue, status: item.status }));
  const data = promoReturn(rows);
  const units = market(country).minorUnits;
  const cards = data.cards.map((card) => (card.format === "money" ? { ...card, value: card.value * units } : card));
  useCsv(onCsv, { name: "promotions", head: ["Promotion", "Kind", "Status", "Spent", "Rides", "New riders", "Brought in", "Back per 1 spent"], rows: rows.map((row) => [row.title, row.kind, row.status, row.cost, row.rides, row.newRiders, row.revenue, row.cost ? Math.round((row.revenue / row.cost) * 10) / 10 : 0]) });
  return (
    <div className="rp-tab">
      <Notes notes={data.best ? [{ tone: "good", text: tr("{0} brings back the most: {1} per 1 spent", [data.best.title, Math.round((data.best.revenue / data.best.cost) * 10) / 10]) }] : []} />
      <Cards cards={cards} fmt={fmt} compareLabel={window.compareLabel} compare={compare} />
      <div className="rp-grid">
        <Panel title={tr("Spent by kind")} icon={<Gift size={16} aria-hidden="true" />}>
          <Bars rows={data.byKind.map((row) => ({ label: row.label, value: row.cost * units, hint: tr("{0}× back", [row.cost ? Math.round((row.revenue / row.cost) * 10) / 10 : 0]) }))} format={money} />
        </Panel>
        <Panel title={tr("Brought in by kind")} icon={<Tags size={16} aria-hidden="true" />}>
          <Bars rows={data.byKind.map((row) => ({ label: row.label, value: row.revenue * units }))} format={money} />
        </Panel>
        <Panel title={tr("Every promotion")} icon={<Gift size={16} aria-hidden="true" />} wide aside={<Link className="link-action" to={`/promotions?country=${country}`}>{tr("Promotions")}</Link>}>
          <SortTable label={tr("Promotions return")} rows={rows} rowKey={(row) => row.id} initial="back" columns={[
            { id: "title", label: "Promotion", value: (row) => row.title },
            { id: "kind", label: "Kind", value: (row) => row.kind },
            { id: "status", label: "Status", value: (row) => row.status },
            { id: "cost", label: "Spent", value: (row) => row.cost, show: (row) => money(row.cost * units), numeric: true },
            { id: "rides", label: "Rides", value: (row) => row.rides, numeric: true },
            { id: "new", label: "New riders", value: (row) => row.newRiders, numeric: true },
            { id: "revenue", label: "Brought in", value: (row) => row.revenue, show: (row) => money(row.revenue * units), numeric: true },
            { id: "back", label: "Back per 1", value: (row) => (row.cost ? row.revenue / row.cost : 0), show: (row) => `${row.cost ? Math.round((row.revenue / row.cost) * 10) / 10 : 0}×`, numeric: true },
          ]} />
        </Panel>
      </div>
      <p className="rp-foot">{tr("Demo results for the whole life of each promotion, not only this period, until rides are counted per promotion.")}</p>
    </div>
  );
}
