import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, Download, Search } from "lucide-react";
import { useSession } from "../auth/SessionContext";
import { useAudit, useRevision } from "../api/hooks";
import { EMPTY_FILTERS, RESULT_LABEL, areaOf, auditCounts, auditCsv, changeOf, filterAudit, type AuditFilters } from "../platform/audit";
import { logExport } from "../reports/activityLog";
import { Cards } from "../reports/ui";
import { DataTable } from "../ui/DataTable";
import { CommandButton } from "../ui/CommandButton";
import { tr, trn, trx } from "../i18n";
import { auditActionText, auditActorText, auditDetailText, auditValueText } from "../live/format";
import { DateInput } from "../ui/DateInput";

const PAGE = 50;

export function AuditPage() {
  const { agent, agents } = useSession();
  const navigate = useNavigate();
  const audit = useAudit();
  const revision = useRevision();
  const rows = useMemo(() => audit.data ?? [], [audit.data]);
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS);
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const shown = useMemo(() => filterAudit(rows, filters), [rows, filters]);
  const counts = auditCounts(rows);
  const areas = useMemo(() => [...new Set(rows.map((row) => areaOf(row.action)))].sort(), [rows]);
  const actors = useMemo(() => [...new Set(rows.map((row) => row.actorId))].sort(), [rows]);
  const nameOf = (id: string) => agents.find((item) => item.id === id)?.name ?? id;
  const patch = (next: Partial<AuditFilters>) => { setFilters({ ...filters, ...next }); setLimit(PAGE); };
  const filtered = Object.values(filters).some(Boolean);

  function exportCsv() {
    const blob = new Blob([auditCsv(shown)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `movera-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
    logExport(agent?.id, `${shown.length} audit rows (CSV)`);
  }

  return (
    <div className="dx-page pl-page">
      <div className="page-heading">
        <div className="pl-head">
          <button data-command="admin.auditLog.view" type="button" className="dash-btn ghost dx-back" onClick={() => (globalThis.history.length > 1 ? navigate(-1) : navigate("/"))}><ArrowLeft size={16} aria-hidden="true" />{" "}{tr("Back")}</button>
          <div>
            <h2>{tr("Audit")}</h2>
            <p>{trn("Generic command audit. Revision {0}. Every business command records actor, action, target, scope, before, after, reason and result.", revision.data ?? "…")}</p>
          </div>
        </div>
        {/* BASE B14 (owner Q1 "One admin always"): the demo "Refund 50 kr / 600 kr" second-admin buttons are gone. */}
      </div>

      <Cards
        compare={false}
        compareLabel=""
        fmt={(value) => String(value)}
        cards={[
          { id: "total", label: "Recorded actions", value: counts.total, previous: null, format: "count", info: "Every command an admin ran, with who, what and why." },
          { id: "today", label: "Today", value: counts.today, previous: null, format: "count", info: "Actions recorded today." },
          { id: "admins", label: "Admins", value: counts.admins, previous: null, format: "count", info: "Different admins who did something." },
          { id: "failed", label: "Stopped", value: counts.failed, previous: null, format: "count", info: "Not allowed, rejected or changed by someone else first." },
        ]}
      />

      {/* A2 leftovers (owner Q1 "One admin always"): no list of money waiting for approval; nothing waits for a second admin. */}
      <section className="panel pl-audit" aria-label={tr("Who did what")}>
        <h3>{tr("Who did what")}</h3>
        <div className="pl-filters">
          <label className="pl-search"><Search size={14} aria-hidden="true" /><input aria-label={tr("Search the audit")} placeholder={tr("Target, action, reason or value")} value={filters.query} onChange={(e) => patch({ query: e.target.value })} /></label>
          <select aria-label={tr("Admin")} value={filters.actor} onChange={(e) => patch({ actor: e.target.value })}><option value="">{tr("Every admin")}</option>{actors.map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}</select>
          <select aria-label={tr("Section")} value={filters.area} onChange={(e) => patch({ area: e.target.value })}><option value="">{tr("Every section")}</option>{areas.map((area) => <option key={area} value={area}>{area}</option>)}</select>
          <select aria-label={tr("Result")} value={filters.result} onChange={(e) => patch({ result: e.target.value })}><option value="">{tr("Any result")}</option>{Object.entries(RESULT_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
          <label className="pl-date"><span>{tr("From")}</span><DateInput aria-label={tr("From date")} value={filters.from} onChange={(e) => patch({ from: e.target.value })} /></label>
          <label className="pl-date"><span>{tr("To")}</span><DateInput aria-label={tr("To date")} value={filters.to} onChange={(e) => patch({ to: e.target.value })} /></label>
          {filtered ? <button data-command="admin.auditLog.view" type="button" className="dash-btn small ghost" onClick={() => patch(EMPTY_FILTERS)}>{tr("Clear filters")}</button> : null}
          <CommandButton command="admin.auditLog.export" className="dash-btn small" type="button" confirmTarget={false} disabled={!shown.length} onDone={exportCsv}><Download size={13} aria-hidden="true" />{" "}{trn(shown.length === 1 ? "Export {0} row" : "Export {0} rows", shown.length)}</CommandButton>
        </div>
        {audit.isLoading ? <p className="pl-help">{tr("Loading the audit.")}</p> : shown.length ? (
          <ol className="pl-log" aria-label={tr("Audit log")}>
            {shown.slice(0, limit).map((row) => {
              // G3-R1: a line the server wrote itself (driver.auto_offline) reads as words, not JSON.
              const change = auditDetailText(row) ?? changeOf(row);
              const system = row.actorId === "system";
              return (
                <li key={row.id} className={`pl-log-row ${row.result}`}>
                  <button data-command="admin.auditLog.view" type="button" aria-expanded={open === row.id} onClick={() => setOpen(open === row.id ? null : row.id)}>
                    <time dateTime={row.at}>{new Date(row.at).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}</time>
                    <span className="pl-who">{system ? auditActorText(row.actorId) : nameOf(row.actorId)}</span>
                    <span className="pl-what">{trn("{0} on {1}{2}", <b>{auditActionText(row.action)}</b>, row.targetId || "—", change ? <small className="pl-change">{change}</small> : null)}</span>
                    <span className={`pl-result ${row.result}`}>{RESULT_LABEL[row.result] ?? row.result}</span>
                  </button>
                  {open === row.id ? (
                    <dl className="pl-detail">
                      <dt>{tr("Admin")}</dt><dd>{system ? auditActorText(row.actorId) : <><Link to={`/team/${row.actorId}`}>{nameOf(row.actorId)}</Link> · <Link to={`/reports?tab=work&admin=${row.actorId}`}>{tr("All their work")}</Link></>}</dd>
                      <dt>{tr("Section")}</dt><dd>{trx(areaOf(row.action))}</dd>
                      <dt>{tr("Scope")}</dt><dd>{row.scope || "—"}</dd>
                      <dt>{tr("Before")}</dt><dd>{row.before ? auditValueText(row.before) : tr("(empty)")}</dd>
                      <dt>{tr("After")}</dt><dd>{row.after ? auditValueText(row.after) : tr("(empty)")}</dd>
                      <dt>{tr("Reason")}</dt><dd>{auditDetailText(row) ?? (row.reason || "—")}</dd>
                      <dt>{tr("Operation")}</dt><dd><code>{row.operationId}</code></dd>
                    </dl>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : <p className="dx-calm">{filtered ? tr("No action matches these filters.") : tr("Nothing recorded yet.")}</p>}
        {shown.length > limit ? <button data-command="admin.auditLog.view" type="button" className="dash-btn small ghost" onClick={() => setLimit(limit + PAGE)}>{trn("Show more ({0} left)", shown.length - limit)}</button> : null}
      </section>

      <article className="panel">
        <h3>{tr("Command audit")}</h3>
        <DataTable
          head={["When", "Operation", "Agent", "Action", "Target", "Scope", "Before", "After", "Reason", "Result"]}
          rowIds={rows.map((entry) => entry.id)}
          rows={rows.map((entry) => [entry.at, entry.operationId, auditActorText(entry.actorId), auditActionText(entry.action), entry.targetId, entry.scope, entry.before, auditDetailText(entry) ?? entry.after, auditDetailText(entry) ? auditDetailText(entry) ?? "" : entry.reason, entry.result])}
          state={audit.isLoading ? "loading" : audit.isError ? "error" : "ready"}
          onRetry={() => void audit.refetch()}
        />
      </article>
    </div>
  );
}
