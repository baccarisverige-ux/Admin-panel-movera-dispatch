import { useMemo, useState } from "react";
import { formatCurrencyMoney } from "../markets/markets";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, Download, Search } from "lucide-react";
import { useSession } from "../auth/SessionContext";
import { can } from "../auth/permissions";
import { commandById } from "../commands/registry";
import { useApprovals, useAudit, useRevision } from "../api/hooks";
import { EMPTY_FILTERS, RESULT_LABEL, areaOf, auditCounts, auditCsv, changeOf, filterAudit, type AuditFilters } from "../platform/audit";
import { logExport } from "../reports/activityLog";
import { Cards } from "../reports/ui";
import { DataTable } from "../ui/DataTable";
import { CommandButton } from "../ui/CommandButton";
import { tr, trn } from "../i18n";

const PAGE = 50;

export function AuditPage() {
  const { agent, agents } = useSession();
  const navigate = useNavigate();
  const audit = useAudit();
  const approvals = useApprovals();
  const revision = useRevision();
  const rows = useMemo(() => audit.data ?? [], [audit.data]);
  const pending = (approvals.data ?? []).filter((item) => item.status === "pending");
  // The server refuses the requester and anyone whose role cannot do the action itself; say so on the button.
  const decideBlock = (item: { action: string; requestedBy: string }, verb: "approve" | "decide") =>
    item.requestedBy === agent?.id
      ? `The requester cannot ${verb} their own action.`
      : agent && !can(agent.role, commandById(item.action)?.permission ?? "*")
        ? `Your role cannot do this action, so it cannot ${verb} it.`
        : undefined;
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
            <h2>{tr("Audit and approvals")}</h2>
            <p>{trn("Generic command audit. Revision {0}. Every business command records actor, action, target, scope, before, after, reason and result.", revision.data ?? "…")}</p>
          </div>
        </div>
        <div className="actions">
          <CommandButton command="admin.audit.refund50" className="secondary-btn" type="button" targetId="RF-SMALL" before="open" after="refunded" amountOre={5_000}>{tr("Refund 50 kr")}</CommandButton>
          <CommandButton command="admin.audit.refund250" className="primary-btn" type="button" targetId="RF-LARGE" before="open" after="pending approval" amountOre={60_000}>{tr("Refund 600 kr")}</CommandButton>
        </div>
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
          { id: "waiting", label: "Waiting for a second admin", value: pending.length, previous: null, format: "count", info: "Money actions that need a second admin. Decide them below or in To confirm." },
        ]}
      />

      <article className="panel">
        <h3>{tr("Pending approvals")}</h3>
        {pending.length === 0 ? (
          <p className="state-line">{tr("No pending approvals.")}</p>
        ) : (
          <DataTable
            head={["Approval", "Action", "Target", "Requested by", "Amount", "Reason", "Status", "Decision"]}
            rowIds={pending.map((item) => item.id)}
            rows={pending.map((item) => [
              item.id,
              item.action,
              item.targetId,
              item.requestedBy,
              formatCurrencyMoney(item.amountOre, item.currency),
              item.reason,
              item.status,
              <div className="actions" key={`${item.id}-decision`}>
                <CommandButton command="admin.approval.approve" className="secondary-btn" type="button" targetId={item.id} confirmTarget={false} before="pending" after="approved" disabled={Boolean(decideBlock(item, "approve"))} title={decideBlock(item, "approve")}>{tr("Approve")}</CommandButton>
                <CommandButton command="admin.approval.reject" className="secondary-btn" type="button" targetId={item.id} confirmTarget={false} before="pending" after="rejected" disabled={Boolean(decideBlock(item, "decide"))} title={decideBlock(item, "decide")}>{tr("Reject")}</CommandButton>
              </div>,
            ])}
          />
        )}
      </article>

      <section className="panel pl-audit" aria-label={tr("Who did what")}>
        <h3>{tr("Who did what")}</h3>
        <div className="pl-filters">
          <label className="pl-search"><Search size={14} aria-hidden="true" /><input aria-label={tr("Search the audit")} placeholder={tr("Target, action, reason or value")} value={filters.query} onChange={(e) => patch({ query: e.target.value })} /></label>
          <select aria-label={tr("Admin")} value={filters.actor} onChange={(e) => patch({ actor: e.target.value })}><option value="">{tr("Every admin")}</option>{actors.map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}</select>
          <select aria-label={tr("Section")} value={filters.area} onChange={(e) => patch({ area: e.target.value })}><option value="">{tr("Every section")}</option>{areas.map((area) => <option key={area} value={area}>{area}</option>)}</select>
          <select aria-label={tr("Result")} value={filters.result} onChange={(e) => patch({ result: e.target.value })}><option value="">{tr("Any result")}</option>{Object.entries(RESULT_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
          <label className="pl-date"><span>{tr("From")}</span><input type="date" aria-label={tr("From date")} value={filters.from} onChange={(e) => patch({ from: e.target.value })} /></label>
          <label className="pl-date"><span>{tr("To")}</span><input type="date" aria-label={tr("To date")} value={filters.to} onChange={(e) => patch({ to: e.target.value })} /></label>
          {filtered ? <button data-command="admin.auditLog.view" type="button" className="dash-btn small ghost" onClick={() => patch(EMPTY_FILTERS)}>{tr("Clear filters")}</button> : null}
          <CommandButton command="admin.auditLog.export" className="dash-btn small" type="button" confirmTarget={false} disabled={!shown.length} onDone={exportCsv}><Download size={13} aria-hidden="true" />{" "}{trn("Export {0} rows", shown.length)}</CommandButton>
        </div>
        {audit.isLoading ? <p className="pl-help">{tr("Loading the audit.")}</p> : shown.length ? (
          <ol className="pl-log" aria-label={tr("Audit log")}>
            {shown.slice(0, limit).map((row) => {
              const change = changeOf(row);
              return (
                <li key={row.id} className={`pl-log-row ${row.result}`}>
                  <button data-command="admin.auditLog.view" type="button" aria-expanded={open === row.id} onClick={() => setOpen(open === row.id ? null : row.id)}>
                    <time dateTime={row.at}>{new Date(row.at).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}</time>
                    <span className="pl-who">{nameOf(row.actorId)}</span>
                    <span className="pl-what">{trn("{0} on {1}{2}", <b>{row.action}</b>, row.targetId || "—", change ? <small className="pl-change">{change}</small> : null)}</span>
                    <span className={`pl-result ${row.result}`}>{RESULT_LABEL[row.result] ?? row.result}</span>
                  </button>
                  {open === row.id ? (
                    <dl className="pl-detail">
                      <dt>{tr("Admin")}</dt><dd><Link to={`/team/${row.actorId}`}>{nameOf(row.actorId)}</Link> · <Link to={`/reports?tab=work&admin=${row.actorId}`}>{tr("All their work")}</Link></dd>
                      <dt>{tr("Section")}</dt><dd>{areaOf(row.action)}</dd>
                      <dt>{tr("Scope")}</dt><dd>{row.scope || "—"}</dd>
                      <dt>{tr("Before")}</dt><dd>{row.before || tr("(empty)")}</dd>
                      <dt>{tr("After")}</dt><dd>{row.after || tr("(empty)")}</dd>
                      <dt>{tr("Reason")}</dt><dd>{row.reason || "—"}</dd>
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
          rows={rows.map((entry) => [entry.at, entry.operationId, entry.actorId, entry.action, entry.targetId, entry.scope, entry.before, entry.after, entry.reason, entry.result])}
          state={audit.isLoading ? "loading" : audit.isError ? "error" : "ready"}
          onRetry={() => void audit.refetch()}
        />
      </article>
    </div>
  );
}
