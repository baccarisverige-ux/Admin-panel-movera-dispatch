import { logExport } from "../reports/activityLog";
import { useMemo, useState } from "react";
import { CheckCircle2, Copy, Download, Mail, Repeat, Search, Timer, Trophy } from "lucide-react";
import { useSession } from "../auth/SessionContext";
import { useAlertsData } from "./AlertsContext";
import { agentName } from "./AlertActions";
import { LEVEL_ICON } from "./OpenView";
import { solvedHistory } from "./history";
import { historyCsv, kindDef, numbers, weeklySummary, type HistoryRow, type Level } from "./engine";
import { tr, trn, uiLocale, trx, trSentences } from "../i18n";

/** Solved alerts with both names, the numbers behind them, a CSV export and a weekly summary for managers. */
export function HistoryView() {
  const data = useAlertsData();
  const { agent } = useSession();
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<Level | "all">("all");
  const [notice, setNotice] = useState("");
  const rows = useMemo(() => solvedHistory(data.book, data.safety.value, (id) => data.facts.incidents.find((row) => row.id === id)?.zoneId ?? null, (id) => data.facts.incidents.find((row) => row.id === id)?.kind === "ride_check"), [data.book, data.safety.value, data.facts.incidents]);
  const shown = rows.filter((row) => (level === "all" || row.level === level) && (!query.trim() || `${row.title} ${row.note} ${agentName(row.solvedBy)} ${agentName(row.takenBy)}`.toLowerCase().includes(query.trim().toLowerCase())));
  const stats = numbers(rows);
  const label = (kind: HistoryRow["kind"]) => kindDef(kind)?.label ?? "Your rule";
  const summary = weeklySummary(rows, data.now, label);
  const time = (iso: string) => new Intl.DateTimeFormat(uiLocale(), { timeZone: data.market.timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  function exportCsv() {
    const blob = new Blob([historyCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `movera-alerts-${data.market.id}-${new Date(data.now).toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    logExport(agent?.id, `${rows.length} solved alerts (CSV)`);
    setNotice(tr("{0} solved alerts exported.", [rows.length]));
  }

  return (
    <div className="al-history">
      <section className="al-stats" aria-label={tr("Numbers")}>
        <div><CheckCircle2 size={16} aria-hidden="true" /><span><b>{stats.count}</b><small>{tr("Alerts solved")}</small></span></div>
        <div><Timer size={16} aria-hidden="true" /><span><b>{trn("{0} min", stats.avgTake)}</b><small>{tr("Average time to take")}</small></span></div>
        <div><Timer size={16} aria-hidden="true" /><span><b>{trn("{0} min", stats.avgSolve)}</b><small>{tr("Average time to solve")}</small></span></div>
        <div className="warn"><Repeat size={16} aria-hidden="true" /><span><b>{stats.repeats.length}</b><small>{tr("Problems that came back")}</small></span></div>
      </section>

      <div className="al-history-grid">
        <section className="dash-card" aria-labelledby="al-solved-title">
          <div className="card-head">
            <h3 id="al-solved-title">{trn("{0} Solved alerts", <CheckCircle2 size={16} aria-hidden="true" />)}</h3>
            <button data-command="admin.alerts.export" type="button" className="dash-btn small ghost" disabled={!rows.length} onClick={exportCsv}>{trn("{0} Export CSV", <Download size={13} aria-hidden="true" />)}</button>
          </div>
          <div className="al-filters">
            <label className="al-search"><Search size={13} aria-hidden="true" /><input aria-label={tr("Search solved alerts")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr("Search alert, note or admin")} /></label>
            <select aria-label={tr("Level")} value={level} onChange={(event) => setLevel(event.target.value as Level | "all")}>
              <option value="all">{tr("All levels")}</option><option value="critical">{tr("Critical")}</option><option value="important">{tr("Important")}</option><option value="info">{tr("Info")}</option>
            </select>
          </div>
          {notice ? <p className="pricing-notice" role="status">{trSentences(notice)}</p> : null}
          {shown.length === 0 ? <p className="dx-calm">{rows.length ? tr("Nothing matches.") : tr("No alert solved yet. Solved alerts show here with who took them and who solved them.")}</p> : (
            <ul className="al-done-list" aria-label={tr("Solved alerts")}>
              {shown.slice(0, 60).map((row) => {
                const Icon = LEVEL_ICON[row.level];
                return (
                  <li key={`${row.id}-${row.doneAt}`} className={row.level}>
                    <span className="al-level" aria-hidden="true"><Icon size={14} /></span>
                    <span className="al-done-text">
                      <b>{trx(row.title)}</b>
                      <small>{trn("{0} · {1} · {2} min", row.takenBy === row.solvedBy ? tr("Taken and solved by {0}", [agentName(row.solvedBy)]) : tr("Taken by {0} · solved by {1}", [agentName(row.takenBy), agentName(row.solvedBy)]), time(row.doneAt), row.solveMin)}</small>
                      {row.note && row.note !== "Solved" ? <em>“{row.note}”</em> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="al-side-cards">
          <section className="dash-card" aria-labelledby="al-week-title">
            <div className="card-head">
              <h3 id="al-week-title">{trn("{0} Weekly summary", <Mail size={16} aria-hidden="true" />)}</h3>
              <button data-command="admin.alerts.export" type="button" className="dash-btn small ghost" onClick={() => { void navigator.clipboard?.writeText(summary.join("\n")).catch(() => undefined); setNotice(tr("Weekly summary copied. Paste it in an email to managers.")); }}>{trn("{0} Copy", <Copy size={13} aria-hidden="true" />)}</button>
            </div>
            <ul className="al-summary" aria-label={tr("Weekly summary")}>{summary.map((line) => <li key={line}>{line}</li>)}</ul>
          </section>
          <section className="dash-card" aria-labelledby="al-kind-title">
            <div className="card-head"><h3 id="al-kind-title">{trn("{0} By kind", <Timer size={16} aria-hidden="true" />)}</h3></div>
            {stats.byKind.length ? <ul className="al-bars">{stats.byKind.slice(0, 6).map((row) => <li key={row.kind}><span>{label(row.kind)}</span><b>{row.count}</b><small>{trn("{0} min", row.avgSolve)}</small><i style={{ width: `${(row.count / stats.byKind[0].count) * 100}%` }} /></li>)}</ul> : <p className="dx-calm">{tr("No numbers yet.")}</p>}
          </section>
          <section className="dash-card" aria-labelledby="al-admin-title">
            <div className="card-head"><h3 id="al-admin-title">{trn("{0} By admin", <Trophy size={16} aria-hidden="true" />)}</h3></div>
            {stats.byAdmin.length ? <ul className="al-bars">{stats.byAdmin.slice(0, 6).map((row) => <li key={row.admin}><span>{agentName(row.admin)}</span><b>{row.count}</b><small>{trn("{0} min", row.avgSolve)}</small><i style={{ width: `${(row.count / stats.byAdmin[0].count) * 100}%` }} /></li>)}</ul> : <p className="dx-calm">{tr("No numbers yet.")}</p>}
          </section>
          {stats.repeats.length ? (
            <section className="dash-card" aria-labelledby="al-repeat-title">
              <div className="card-head"><h3 id="al-repeat-title">{trn("{0} Keeps coming back", <Repeat size={16} aria-hidden="true" />)}</h3></div>
              <ul className="al-bars">{stats.repeats.slice(0, 5).map((row) => <li key={row.key}><span>{trx(row.title)}</span><b>{row.count}×</b></li>)}</ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
