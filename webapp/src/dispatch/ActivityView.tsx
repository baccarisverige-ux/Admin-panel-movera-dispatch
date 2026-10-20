import { useMemo, useState, useSyncExternalStore } from "react";
import { Link } from "react-router";
import { Download, Search } from "lucide-react";
import { useAudit } from "../api/hooks";
import { useSession } from "../auth/SessionContext";
import { commandById } from "../commands/registry";
import { logExport, readActivity, subscribeActivity } from "../reports/activityLog";
import { ACTIVITY_VISIBLE_DAYS, STATUS_LABEL, activityCsv, activityItems, sessionStart, visibleActivity, type ActivityItem, type ActivityStatus } from "../platform/myActivity";
import { tr, trn, uiLocale, trx } from "../i18n";

const PAGE = 50;

function download(name: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "My activity" (Q31, Q32): what this admin did, this session and before; a super admin sees every admin. */
export function ActivityView({ timeZone }: { timeZone: string }) {
  const { agent, agents } = useSession();
  const audit = useAudit();
  const log = useSyncExternalStore(subscribeActivity, readActivity, readActivity);
  const seeAll = agent?.role === "super";
  const [actorId, setActorId] = useState("");
  const [status, setStatus] = useState<ActivityStatus | "">("");
  const [text, setText] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [now] = useState(() => Date.now());
  const items = useMemo(() => activityItems(audit.data ?? [], log, (action) => commandById(action)?.label ?? action), [audit.data, log]);
  const { visible, archived } = visibleActivity(items, { viewerId: agent?.id ?? "", seeAll, actorId, status, text, now });
  const actors = useMemo(() => [...new Set(items.map((item) => item.actorId))].sort(), [items]);
  const nameOf = (id: string) => agents.find((item) => item.id === id)?.name ?? id;
  const started = agent ? sessionStart(log, agent.id) : null;
  const when = (iso: string) => new Intl.DateTimeFormat(uiLocale(), { timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
  const sessionOf = (item: ActivityItem) => (item.actorId === agent?.id && started !== null && Date.parse(item.at) >= started ? "This session" : "Earlier session");

  function exportCsv(rows: readonly ActivityItem[], what: string) {
    download(`movera-activity-${what}-${new Date(now).toISOString().slice(0, 10)}.csv`, activityCsv(rows, nameOf));
    logExport(agent?.id, `${rows.length} activity rows (${what}, CSV)`);
  }

  return (
    <section className="panel pl-audit dx-activity" aria-label={tr("My activity")}>
      <h3>{seeAll ? tr("Activity of every admin") : tr("My activity")}</h3>
      <p className="pl-help">{trn("{0}, in this session and earlier ones, with the result and full details. The last {1} days are shown; older entries are archived{2}.", seeAll ? tr("Everything admins did") : tr("Everything you did"), ACTIVITY_VISIBLE_DAYS, seeAll ? tr(" and can be exported") : "")}</p>
      <div className="pl-filters">
        <label className="pl-search"><Search size={14} aria-hidden="true" /><input aria-label={tr("Search activity")} placeholder={tr("Action, record, reason or value")} value={text} onChange={(event) => { setText(event.target.value); setLimit(PAGE); }} /></label>
        {seeAll ? (
          <select aria-label={tr("Admin")} value={actorId} onChange={(event) => { setActorId(event.target.value); setLimit(PAGE); }}>
            <option value="">{tr("Every admin")}</option>
            {actors.map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}
          </select>
        ) : null}
        <select aria-label={tr("Status")} value={status} onChange={(event) => { setStatus(event.target.value as ActivityStatus | ""); setLimit(PAGE); }}>
          <option value="">{tr("Any status")}</option>
          {(Object.keys(STATUS_LABEL) as ActivityStatus[]).map((id) => <option key={id} value={id}>{trx(STATUS_LABEL[id])}</option>)}
        </select>
        {seeAll ? (
          <>
            <button data-command="admin.reports.download" type="button" className="dash-btn small" disabled={!visible.length} onClick={() => exportCsv(visible, "last-120-days")}>{trn("{0} Export CSV ({1})", <Download size={13} aria-hidden="true" />, visible.length)}</button>
            <button data-command="admin.reports.download" type="button" className="dash-btn small ghost" disabled={!archived.length} onClick={() => exportCsv(archived, "archive")}>{trn("{0} Export archive ({1})", <Download size={13} aria-hidden="true" />, archived.length)}</button>
          </>
        ) : null}
      </div>
      {audit.isLoading ? <p className="pl-help">{tr("Loading activity.")}</p> : visible.length ? (
        <ol className="pl-log" aria-label={tr("Activity list")}>
          {visible.slice(0, limit).map((item) => (
            <li key={item.id} className={`pl-log-row ${item.status === "done" ? "committed" : item.status === "waiting" ? "pending_approval" : "rejected"}`}>
              <button data-command="admin.dispatch.view" type="button" aria-expanded={open === item.id} onClick={() => setOpen(open === item.id ? null : item.id)}>
                <time dateTime={item.at}>{when(item.at)}</time>
                <span className="pl-who">{seeAll ? nameOf(item.actorId) : sessionOf(item)}</span>
                <span className="pl-what"><b>{trx(item.what)}</b>{item.target ? <>{" "}{trn("on {0}", item.target)}</> : null}<small className="pl-change">{trx(item.section)}</small></span>
                <span className={`pl-result ${item.status === "done" ? "committed" : item.status === "waiting" ? "pending_approval" : "rejected"}`}>{trx(STATUS_LABEL[item.status])}</span>
              </button>
              {open === item.id ? (
                <dl className="pl-detail">
                  <dt>{tr("Admin")}</dt><dd>{nameOf(item.actorId)} · {sessionOf(item)}</dd>
                  <dt>{tr("When")}</dt><dd>{when(item.at)} ({item.at})</dd>
                  <dt>{tr("Section")}</dt><dd>{trx(item.section)}</dd>
                  <dt>{tr("Result")}</dt><dd>{trx(item.result)}</dd>
                  <dt>{tr("Scope")}</dt><dd>{item.scope || "—"}</dd>
                  <dt>{tr("Before")}</dt><dd>{item.before || tr("(empty)")}</dd>
                  <dt>{tr("After")}</dt><dd>{item.after || tr("(empty)")}</dd>
                  <dt>{tr("Reason")}</dt><dd>{item.reason || "—"}</dd>
                  {item.operationId ? <><dt>{tr("Operation")}</dt><dd><code>{item.operationId}</code></dd></> : null}
                  {item.link ? <><dt>{tr("Open")}</dt><dd><Link to={item.link}>{tr("Go to the record")}</Link></dd></> : null}
                </dl>
              ) : null}
            </li>
          ))}
        </ol>
      ) : <p className="dx-calm">{text || status || actorId ? tr("No activity matches these filters.") : tr("Nothing recorded yet.")}</p>}
      {visible.length > limit ? <button data-command="admin.dispatch.view" type="button" className="dash-btn small ghost" onClick={() => setLimit(limit + PAGE)}>{trn("Show more ({0} left)", visible.length - limit)}</button> : null}
      {archived.length ? <p className="pl-help" data-testid="activity-archived">{trn("{0} older entr{1} archived (more than {2} days old).", archived.length, archived.length === 1 ? tr("y is") : tr("ies are"), ACTIVITY_VISIBLE_DAYS)}</p> : null}
    </section>
  );
}
