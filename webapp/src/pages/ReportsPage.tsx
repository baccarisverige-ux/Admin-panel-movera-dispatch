import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, Bookmark, CalendarClock, FileDown, FileText, Plus, Printer, Trash2 } from "lucide-react";
import { useRecords, useSlice } from "../api/hooks";
import { useSession } from "../auth/SessionContext";
import { PeriodPicker } from "../dashboard/PeriodPicker";
import { earningsReport } from "../dashboard/earnings";
import { parsePeriod, periodParams, periodWindow, type Period } from "../dashboard/period";
import { localDay } from "../dashboard/time";
import { CATEGORIES } from "../domain/contract";
import { formatMoney } from "../markets/markets";
import { zoneAllowed } from "../markets/scope";
import { useMarketScope } from "../markets/useMarketScope";
import { CommandButton } from "../ui/CommandButton";
import { Modal } from "../ui/Modal";
import { logExport } from "../reports/activityLog";
import { compareWindow, csvOf, emptyReportSettings, normalizeReportSettings, REPORT_SETTINGS_KEY, scheduleIssues, scheduleLine, TABS, type Compare, type Filters, type Format, type ReportSettings, type ReportTab, type Schedule } from "../reports/engine";
import { AlertsTab, DispatchTab, DriversTab, MoneyTab, OverviewTab, RidersTab, RidesTab, type CsvTable } from "../reports/Tabs";
import { TripExport } from "../reports/TripExport";
import { WorkTab } from "../reports/WorkTab";
import { CareTab, FleetsTab, PromosTab, SurgeTab, TaxesTab, ZonesTab } from "../reports/ExtraTabs";

const COMPARES: { id: Compare; label: string }[] = [
  { id: "previous", label: "vs the period before" },
  { id: "year", label: "vs same time last year" },
  { id: "none", label: "No compare" },
];

export function ReportsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { agent } = useSession();
  const scope = useMarketScope();
  const market = scope.market;
  const tab: ReportTab = TABS.some((item) => item.id === params.get("tab")) ? (params.get("tab") as ReportTab) : "overview";
  const compare: Compare = COMPARES.some((item) => item.id === params.get("compare")) ? (params.get("compare") as Compare) : "previous";
  const filters: Filters = { category: params.get("category") ?? "", method: params.get("method") ?? "", driverId: params.get("driver") ?? "", fleetId: params.get("fleet") ?? "" };
  const period = parsePeriod(params);
  // "Today" runs up to now: rounded up to the next minute and refreshed, so work done after opening the page counts.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = globalThis.setInterval(() => setTick((value) => value + 1), 30_000);
    return () => globalThis.clearInterval(timer);
  }, []);
  const now = useMemo(() => Math.ceil(Date.now() / 60_000) * 60_000, [tick, tab, params.get("admin")]);
  const access = useMemo(() => agent?.scope ?? { zones: "all" as const }, [agent?.scope]);
  const zones = useMemo(() => market.zones.filter((zone) => zoneAllowed(access, zone.id) && (!scope.zones.length || scope.zones.includes(zone.id))), [market, access, scope.zones]);
  const window = useMemo(() => compareWindow(periodWindow(period, now, market.timeZone, market.locale), compare), [period.kind, period.on, period.from, period.to, now, market, compare]);
  const slice = useSlice<ReportSettings>(REPORT_SETTINGS_KEY, emptyReportSettings());
  const settings = normalizeReportSettings(slice.value);
  const drivers = useRecords("drivers");
  const fleets = useRecords("fleets");
  const [csv, setCsv] = useState<CsvTable | null>(null);
  const onCsv = useCallback((table: CsvTable) => setCsv(table), []);
  const [viewOpen, setViewOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const methods = useMemo(() => earningsReport(market.id, zones.map((zone) => zone.id), window).byMethod, [market.id, zones, window]);

  const money = (minor: number) => formatMoney(Math.round(minor), market.id);
  const fmt = (value: number, format: Format) => {
    if (format === "money") return money(value);
    if (format === "pct") return `${value}%`;
    if (format === "min") return `${value} min`;
    if (format === "sec") return `${value} s`;
    if (format === "hours") return `${new Intl.NumberFormat(market.locale).format(value)} h`;
    if (format === "stars") return `${value} / 5`;
    return new Intl.NumberFormat(market.locale).format(value);
  };

  function set(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  }

  function choosePeriod(next: Period) {
    setParams(periodParams(next, new URLSearchParams(params)), { replace: true });
  }

  function downloadCsv() {
    if (!csv) return;
    const blob = new Blob([csvOf(csv.head, csv.rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `movera-${csv.name}-${market.id}-${new Date(window.start).toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
    logExport(agent?.id, `${TABS.find((item) => item.id === tab)?.label} report (CSV)`);
    setNotice(`${TABS.find((item) => item.id === tab)?.label} report downloaded as CSV.`);
  }

  function printPdf() {
    logExport(agent?.id, `${TABS.find((item) => item.id === tab)?.label} report (PDF)`);
    globalThis.print?.();
  }

  const props = { market, zones, window, compare: compare !== "none", filters, fmt, money, onCsv };
  const views = settings.views.filter((view) => view.country === market.id && (view.by === agent?.id || view.shared));
  const countryDrivers = (drivers.data ?? []).filter((row) => zones.some((zone) => zone.id === row.zoneId));

  return (
    <div className="dx-page rp-page">
      <header className="dx-head">
        <button data-command="admin.reports.view" type="button" className="dash-btn ghost dx-back" aria-label="Go back" onClick={() => (params.get("admin") ? set({ admin: null }) : globalThis.history.length > 1 ? navigate(-1) : navigate("/"))}><ArrowLeft size={16} aria-hidden="true" /> Back</button>
        <div className="dx-head-text">
          <h2>Reports for {market.name}</h2>
          <p>{window.label} · {market.currency} · {market.timeZone.replace("_", " ")} time · Demo data until the backend is connected.</p>
        </div>
      </header>

      <div className="dash-tabs dx-views rp-tabs" role="tablist" aria-label="Report sections">
        {TABS.map((item) => (
          <button data-command="admin.reports.view" key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : undefined} onClick={() => set({ tab: item.id === "overview" ? null : item.id, admin: null })}>{item.label}</button>
        ))}
      </div>

      <section className="rp-bar" aria-label="Report settings">
        <PeriodPicker key={`${period.kind}-${period.on ?? ""}-${period.from ?? ""}`} period={period} today={localDay(now, market.timeZone)} onChange={choosePeriod} />
        <select aria-label="Compare" value={compare} onChange={(event) => set({ compare: event.target.value === "previous" ? null : event.target.value })}>
          {COMPARES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <select aria-label="Category" value={filters.category} onChange={(event) => set({ category: event.target.value })}>
          <option value="">All categories</option>
          {CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <select aria-label="Payment method" value={filters.method} onChange={(event) => set({ method: event.target.value })}>
          <option value="">All payment methods</option>
          {methods.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        {tab === "drivers" ? (
          <>
            <select aria-label="Driver" value={filters.driverId} onChange={(event) => set({ driver: event.target.value })}>
              <option value="">All drivers</option>
              {countryDrivers.slice(0, 200).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
            <select aria-label="Fleet" value={filters.fleetId} onChange={(event) => set({ fleet: event.target.value })}>
              <option value="">All fleets</option>
              {(fleets.data ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </>
        ) : null}
        <span className="rp-bar-actions">
          {views.length ? (
            <select aria-label="Saved views" value="" onChange={(event) => {
              const view = views.find((item) => item.id === event.target.value);
              if (!view) return;
              const next = new URLSearchParams(view.period);
              next.set("country", view.country);
              if (view.zones) next.set("scope", view.zones);
              if (view.tab !== "overview") next.set("tab", view.tab);
              if (view.compare !== "previous") next.set("compare", view.compare);
              for (const [key, value] of [["category", view.filters.category], ["method", view.filters.method], ["driver", view.filters.driverId], ["fleet", view.filters.fleetId]]) if (value) next.set(key, value);
              setParams(next, { replace: true });
              setNotice(`View ${view.name} opened.`);
            }}>
              <option value="">Saved views…</option>
              {views.map((view) => <option key={view.id} value={view.id}>{view.name}{view.shared && view.by !== agent?.id ? " (shared)" : ""}</option>)}
            </select>
          ) : null}
          <button data-command="admin.reports.saveView" type="button" className="dash-btn small ghost" onClick={() => setViewOpen(true)}><Bookmark size={13} aria-hidden="true" /> Save view</button>
          <button data-command="admin.reports.download" type="button" className="dash-btn small ghost" disabled={!csv} onClick={downloadCsv}><FileDown size={13} aria-hidden="true" /> CSV</button>
          <button data-command="admin.reports.download" type="button" className="dash-btn small ghost" onClick={printPdf}><Printer size={13} aria-hidden="true" /> PDF</button>
          <button data-command="admin.reports.view" type="button" className="dash-btn small" onClick={() => setScheduleOpen(true)}><CalendarClock size={13} aria-hidden="true" /> Schedule</button>
        </span>
      </section>

      <div className="rp-print-head" aria-hidden="true"><b>Movera · {TABS.find((item) => item.id === tab)?.label} report · {market.name}</b><span>{window.label} {compare !== "none" ? `· ${window.compareLabel}` : ""}</span></div>
      {notice || slice.message ? <p className="pricing-notice" role="status">{notice} {slice.message}</p> : null}

      {tab === "overview" ? <OverviewTab {...props} /> : null}
      {tab === "rides" ? <><RidesTab {...props} /><TripExport /></> : null}
      {tab === "money" ? <MoneyTab {...props} /> : null}
      {tab === "drivers" ? <DriversTab {...props} /> : null}
      {tab === "riders" ? <RidersTab {...props} /> : null}
      {tab === "dispatch" ? <DispatchTab {...props} /> : null}
      {tab === "alerts" ? <AlertsTab {...props} /> : null}
      {tab === "work" ? <WorkTab {...props} settings={settings} /> : null}
      {tab === "taxes" ? <TaxesTab {...props} /> : null}
      {tab === "fleets" ? <FleetsTab {...props} /> : null}
      {tab === "zones" ? <ZonesTab {...props} /> : null}
      {tab === "surge" ? <SurgeTab {...props} /> : null}
      {tab === "care" ? <CareTab {...props} /> : null}
      {tab === "promos" ? <PromosTab {...props} /> : null}

      <SaveViewDialog open={viewOpen} onClose={() => setViewOpen(false)} settings={settings} agentId={agent?.id ?? ""} build={(name, shared) => ({ id: `RV-${Date.now().toString(36)}`, name, by: agent?.id ?? "", shared, tab, period: periodParams(period, new URLSearchParams()).toString(), compare, filters, country: market.id, zones: scope.zones.join(",") })} onSaved={(name) => setNotice(`View ${name} saved.`)} />
      <ScheduleDialog key={`${tab}-${scheduleOpen}`} open={scheduleOpen} onClose={() => setScheduleOpen(false)} settings={settings} agentId={agent?.id ?? ""} tab={tab} country={market.id} onSaved={setNotice} />
    </div>
  );
}

function SaveViewDialog({ open, onClose, settings, agentId, build, onSaved }: { open: boolean; onClose: () => void; settings: ReportSettings; agentId: string; build: (name: string, shared: boolean) => ReportSettings["views"][number]; onSaved: (name: string) => void }) {
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const view = build(name.trim(), shared);
  const mine = settings.views.filter((item) => item.by === agentId);
  return (
    <Modal open={open} title="Save this view" onClose={onClose}>
      <p className="dx-modal-help">Saves the tab, the period, the compare, the zones and the filters, so you can open the same view again.</p>
      <div className="dx-modal-row">
        <label className="field">View name<input aria-label="View name" maxLength={40} value={name} onChange={(event) => setName(event.target.value)} placeholder="For example Stockholm nights" /></label>
      </div>
      <label className={shared ? "check-chip on" : "check-chip"}><input type="checkbox" checked={shared} onChange={(event) => setShared(event.target.checked)} />Share with other admins</label>
      {mine.length ? <ul className="rp-saved" aria-label="Your views">{mine.map((item) => <li key={item.id}><FileText size={13} aria-hidden="true" /> {item.name}{item.shared ? " · shared" : ""}</li>)}</ul> : null}
      <div className="dx-modal-actions">
        <button data-command="admin.reports.view" type="button" className="dash-btn ghost" onClick={onClose}>Cancel</button>
        <CommandButton command="admin.reports.saveView" className="dash-btn" targetId={name.trim() || "view"} confirmTarget={false} scope="all" before={`${settings.views.length} views`} after={`${settings.views.length + 1} views`} expectedSliceRev={settings.draftRev} sliceKey={REPORT_SETTINGS_KEY} value={{ ...settings, draftRev: settings.draftRev + 1, views: [...settings.views, view] }} disabled={!name.trim()} onDone={() => { onSaved(name.trim()); setName(""); onClose(); }}>
          Save view
        </CommandButton>
      </div>
    </Modal>
  );
}

function ScheduleDialog({ open, onClose, settings, agentId, tab, country, onSaved }: { open: boolean; onClose: () => void; settings: ReportSettings; agentId: string; tab: ReportTab; country: string; onSaved: (text: string) => void }) {
  const blank = (): Schedule => ({ id: `RS-${Date.now().toString(36)}`, name: "", by: agentId, on: true, tab, format: "pdf", every: "week", weekday: 0, time: "08:00", to: "", country });
  const [draft, setDraft] = useState<Schedule>(blank);
  const issues = scheduleIssues(draft);
  const list = settings.schedules.filter((item) => item.country === country);
  return (
    <Modal open={open} title="Scheduled reports" onClose={onClose}>
      <p className="dx-modal-help">The backend emails the report at the time you pick, in this country's time.</p>
      {list.length ? (
        <ul className="rp-saved" aria-label="Schedules">
          {list.map((item) => (
            <li key={item.id}>
              <CalendarClock size={13} aria-hidden="true" /> <span><b>{item.name}</b><small>{scheduleLine(item)}</small></span>
              <CommandButton command="admin.reports.schedule" className="icon-ghost" targetId={item.name} confirmTarget={false} scope="all" before="schedule" after="removed" expectedSliceRev={settings.draftRev} sliceKey={REPORT_SETTINGS_KEY} value={{ ...settings, draftRev: settings.draftRev + 1, schedules: settings.schedules.filter((entry) => entry.id !== item.id) }} aria-label={`Remove ${item.name}`} onDone={() => onSaved(`Schedule ${item.name} removed.`)}>
                <Trash2 size={13} aria-hidden="true" />
              </CommandButton>
            </li>
          ))}
        </ul>
      ) : null}
      <h5 className="dx-modal-h"><Plus size={12} aria-hidden="true" /> New schedule</h5>
      <div className="rp-schedule-form">
        <label className="field">Name<input aria-label="Schedule name" maxLength={50} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="For example Weekly money" /></label>
        <label className="field">Report<select aria-label="Schedule report" value={draft.tab} onChange={(event) => setDraft({ ...draft, tab: event.target.value as ReportTab })}>{TABS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label className="field">As<select aria-label="Schedule format" value={draft.format} onChange={(event) => setDraft({ ...draft, format: event.target.value as Schedule["format"] })}><option value="pdf">PDF</option><option value="csv">CSV</option></select></label>
        <label className="field">How often<select aria-label="Schedule every" value={draft.every} onChange={(event) => setDraft({ ...draft, every: event.target.value as Schedule["every"] })}><option value="day">Every day</option><option value="week">Every week</option><option value="month">Every month</option></select></label>
        {draft.every === "week" ? <label className="field">Day<select aria-label="Schedule day" value={draft.weekday} onChange={(event) => setDraft({ ...draft, weekday: Number(event.target.value) })}>{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label> : null}
        <label className="field">Time<input type="time" aria-label="Schedule time" value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} /></label>
        <label className="field wide">Send to<input aria-label="Schedule emails" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} placeholder="finance@movera.se, manager@movera.se" /></label>
      </div>
      {issues.length && (draft.name || draft.to) ? <p className="dx-issues" role="alert">{issues[0]}</p> : null}
      {!issues.length ? <p className="dx-note">{scheduleLine(draft)}</p> : null}
      <div className="dx-modal-actions">
        <button data-command="admin.reports.view" type="button" className="dash-btn ghost" onClick={onClose}>Close</button>
        <CommandButton command="admin.reports.schedule" className="dash-btn" targetId={draft.name.trim() || "schedule"} confirmTarget={false} scope="all" before={`${settings.schedules.length} schedules`} after={`${settings.schedules.length + 1} schedules`} expectedSliceRev={settings.draftRev} sliceKey={REPORT_SETTINGS_KEY} value={{ ...settings, draftRev: settings.draftRev + 1, schedules: [...settings.schedules, { ...draft, name: draft.name.trim() }] }} disabled={Boolean(issues.length)} onDone={() => { onSaved(`Schedule ${draft.name.trim()} saved: ${scheduleLine(draft)}.`); setDraft(blank()); }}>
          Save schedule
        </CommandButton>
      </div>
    </Modal>
  );
}
