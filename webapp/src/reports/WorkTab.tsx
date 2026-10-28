import { tr } from "../i18n";
import { isLiveData } from "../live/realData";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Link, useSearchParams } from "react-router";
import { ArrowLeft, Bell, Download, Eye, KeyRound, LogIn, LogOut, Pencil, ShieldCheck, Timer, UserRound } from "lucide-react";
import { useAudit } from "../api/hooks";
import { useAdminApi } from "../api/AdminApiContext";
import { useAlertsMaybe } from "../alerts/AlertsContext";
import { solvedHistory } from "../alerts/history";
import { AGENTS, ROLE_LABELS, type Role } from "../auth/permissions";
import { useSession } from "../auth/SessionContext";
import { commandById } from "../commands/registry";
import { CommandButton } from "../ui/CommandButton";
import { Check } from "../dispatch/fields";
import { readActivity, subscribeActivity } from "./activityLog";
import { adminSummaries, canSeeOthers, demoWork, REPORT_SETTINGS_KEY, sectionOf, workEvents, type ReportSettings, type WorkEvent, type WorkKind } from "./engine";
import { Bars, Cards, Notes, Panel, SortTable } from "./ui";
import type { TabProps } from "./Tabs";

const KIND_ICON: Record<WorkKind, typeof Pencil> = { save: Pencil, signin: LogIn, signout: LogOut, view: Eye, export: Download, alert: Bell };
const KIND_LABEL: Record<WorkKind, string> = { save: "Change", signin: "Sign in", signout: "Sign out", view: "Private data", export: "Download", alert: "Alert solved" };

function nameOf(id: string): string {
  return AGENTS.find((agent) => agent.id === id)?.name ?? id;
}

function hours(minutes: number): string {
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

export function WorkTab({ market, zones, window, compare, fmt, onCsv, settings }: TabProps & { settings: ReportSettings }) {
  const api = useAdminApi();
  const { agent } = useSession();
  const [params, setParams] = useSearchParams();
  const audit = useAudit(30_000);
  const shared = useAlertsMaybe();
  const activity = useSyncExternalStore(subscribeActivity, readActivity, readActivity);
  const [kindFilter, setKindFilter] = useState<WorkKind | "all">("all");
  const others = Boolean(agent && canSeeOthers(agent.role, settings.access.roles));
  const zoneIds = useMemo(() => new Set(zones.map((zone) => zone.id)), [zones]);
  const history = useMemo(() => (shared ? solvedHistory(shared.book, shared.safety.value, (id) => shared.facts.incidents.find((row) => row.id === id)?.zoneId ?? null, (id) => shared.facts.incidents.find((row) => row.id === id)?.kind === "ride_check") : []), [shared?.book, shared?.safety.value, shared?.facts.incidents]);
  const [now] = useState(() => Date.now());
  const events = useMemo(() => {
    const label = (action: string) => `${sectionOf(action)}: ${commandById(action)?.label ?? action}`;
    const real = workEvents(audit.data ?? [], activity, history, label);
    const demo = api.demo ? demoWork(AGENTS.filter((item) => (item.scope.countries ? item.scope.countries.includes(market.id) : market.id === "SE") && (item.scope.zones === "all" || item.scope.zones.some((zone) => zoneIds.has(zone)))), now, zones.map((zone) => zone.id)) : [];
    // Only work in this country's zones (or not tied to a zone), and only other people's work for those allowed to see it.
    return [...real, ...demo]
      .filter((event) => event.scope === "all" || zoneIds.has(event.scope))
      .filter((event) => others || event.actorId === agent?.id)
      .sort((a, b) => b.at.localeCompare(a.at));
  }, [audit.data, activity, history, api.demo, zoneIds, zones, others, agent?.id, now, market.id]);
  const summaries = adminSummaries(events, history.filter((row) => others || row.solvedBy === agent?.id), window.start, window.end, Date.now());
  const previous = adminSummaries(events, history, window.prevStart, window.prevEnd, Date.now());
  const selected = params.get("admin");
  // Live: only saves come from the server's audit; sign-in time, solved alerts, reveals and downloads are kept in this
  // browser only, so they read "Not connected yet" rather than a partial number (owner rule, part 3).
  const liveData = isLiveData();
  const total = (key: "actions" | "alertsSolved" | "onlineMin" | "views" | "exports", list = summaries) => (liveData && key !== "actions" ? NaN : list.reduce((sum, row) => sum + row[key], 0));
  const cards = [
    { id: "actions", label: "Changes saved", value: total("actions"), previous: total("actions", previous), format: "count" as const, info: "Every save an admin made: rules, prices, drivers, rides and more. Rejected tries are not counted." },
    { id: "alerts", label: "Alerts solved", value: total("alertsSolved"), previous: total("alertsSolved", previous), format: "count" as const, info: "Alerts marked solved, SOS included." },
    { id: "online", label: "Time online", value: Math.round(total("onlineMin") / 60), previous: Math.round(total("onlineMin", previous) / 60), format: "hours" as const, info: "From sign-in to sign-out. A session still open counts until 15 min after the last action." },
    { id: "views", label: "Private data opened", value: total("views"), previous: total("views", previous), format: "count" as const, info: "Phone numbers or documents revealed, with the reason given." },
    { id: "exports", label: "Downloads", value: total("exports"), previous: total("exports", previous), format: "count" as const, info: "Reports, lists and files downloaded from the panel." },
  ];
  const csvRows = summaries.map((row) => [nameOf(row.actorId), ROLE_LABELS[(AGENTS.find((item) => item.id === row.actorId)?.role ?? "viewer") as Role], row.actions, row.alertsSolved, row.avgSolveMin, Math.round(row.onlineMin / 60 * 10) / 10, row.views, row.exports]);
  const csvKey = JSON.stringify(csvRows);
  useEffect(() => onCsv({ name: "admin-work", head: ["Admin", "Role", "Changes", "Alerts solved", "Minutes to solve", "Hours online", "Private data opened", "Downloads"], rows: JSON.parse(csvKey) as (string | number)[][] }), [csvKey, onCsv]);

  if (selected) {
    const person = AGENTS.find((item) => item.id === selected);
    if (!others && selected !== agent?.id) return <p className="dx-readonly" role="status">{tr("You can only see your own work.")}</p>;
    const mine = events.filter((event) => event.actorId === selected && Date.parse(event.at) >= window.start && Date.parse(event.at) < window.end && (kindFilter === "all" || event.kind === kindFilter));
    const summary = summaries.find((row) => row.actorId === selected);
    const days = new Map<string, WorkEvent[]>();
    const dayLabel = (iso: string) => new Intl.DateTimeFormat(market.locale, { timeZone: market.timeZone, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
    const time = (iso: string) => new Intl.DateTimeFormat(market.locale, { timeZone: market.timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
    for (const event of mine) days.set(dayLabel(event.at), [...(days.get(dayLabel(event.at)) ?? []), event]);
    return (
      <div className="rp-tab rp-person">
        <header className="rp-person-head">
          <button data-command="admin.reports.view" type="button" className="dash-btn small ghost" onClick={() => { const next = new URLSearchParams(params); next.delete("admin"); setParams(next, { replace: true }); }}><ArrowLeft size={14} aria-hidden="true" /> {tr("All admins")}</button>
          <span className="rp-avatar" aria-hidden="true">{nameOf(selected).slice(0, 2).toUpperCase()}</span>
          <span><h3>{nameOf(selected)}</h3><small>{person ? ROLE_LABELS[person.role] : ""} · {window.label}</small></span>
        </header>
        <Cards fmt={fmt} compare={false} compareLabel="" cards={[
          { id: "a", label: "Changes saved", value: summary?.actions ?? 0, previous: null, format: "count", info: "Saves in the period." },
          { id: "b", label: "Alerts solved", value: liveData ? NaN : summary?.alertsSolved ?? 0, previous: null, format: "count", info: tr("Average {0} min to solve.", [summary?.avgSolveMin ?? 0]) },
          { id: "c", label: "Time online", value: liveData ? NaN : Math.round((summary?.onlineMin ?? 0) / 60), previous: null, format: "hours", info: tr("{0} sessions in the period.", [summary?.sessions ?? 0]) },
          { id: "d", label: "Private data opened", value: liveData ? NaN : summary?.views ?? 0, previous: null, format: "count", info: "Phone numbers or documents revealed." },
          { id: "e", label: "Downloads", value: liveData ? NaN : summary?.exports ?? 0, previous: null, format: "count", info: "Files downloaded." },
        ]} />
        <div className="al-filters" role="group" aria-label={tr("Show")}>
          <span className="dx-choice" role="radiogroup" aria-label={tr("What to show")}>
            {(["all", "save", "alert", "view", "export", "signin"] as const).map((kind) => (
              <label key={kind} className={kindFilter === kind ? "on" : undefined}><input type="radio" name="rp-kind" checked={kindFilter === kind} onChange={() => setKindFilter(kind)} />{kind === "all" ? tr("Everything") : kind === "signin" ? tr("Sign in & out") : KIND_LABEL[kind]}</label>
            ))}
          </span>
        </div>
        {mine.length === 0 ? <p className="dx-calm">{tr("Nothing in this period.")}</p> : (
          <div className="rp-days" aria-label={tr("Day by day")}>
            {[...days.entries()].map(([day, list]) => (
              <section key={day} className="rp-day" aria-label={day}>
                <h4>{day} <small>{list.length === 1 ? tr("{0} item", [list.length]) : tr("{0} items", [list.length])}</small></h4>
                <ol className="rp-timeline">
                  {list.filter((event) => kindFilter !== "signin" || event.kind === "signin" || event.kind === "signout").map((event) => {
                    const Icon = KIND_ICON[event.kind];
                    return (
                      <li key={event.id} className={event.kind}>
                        <span className="rp-time">{time(event.at)}</span>
                        <span className="rp-kind" aria-hidden="true"><Icon size={13} /></span>
                        <span className="rp-what"><b>{event.text}</b>{event.detail ? <small>{event.detail}</small> : null}</span>
                        {event.demo ? <span className="rp-tag demo">{tr("Demo")}</span> : null}
                        {event.link ? <Link className="link-action" to={event.link}>{tr("Open")}</Link> : null}
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}
      </div>
    );
  }

  const open = (id: string) => { const next = new URLSearchParams(params); next.set("admin", id); setParams(next, { replace: true }); };
  const top = summaries[0];
  const notes = top && summaries.length > 1 && total("actions") ? [{ tone: "info" as const, text: tr("{0} made {1}% of all changes", [nameOf(top.actorId), Math.round((top.actions / Math.max(1, total("actions"))) * 100)]) }] : [];
  return (
    <div className="rp-tab">
      {!others ? <p className="dx-readonly" role="status">{tr("You see your own work. Super admin and Operations see everyone's.")}</p> : null}
      <Notes notes={notes} />
      <Cards cards={cards} fmt={fmt} compareLabel={window.compareLabel} compare={compare} />
      <div className="rp-grid">
        <Panel title={tr("Admins")} icon={<UserRound size={16} aria-hidden="true" />} wide>
          <SortTable label={tr("Admin work")} rows={summaries} rowKey={(row) => row.actorId} initial="actions" columns={[
            { id: "name", label: "Admin", value: (row) => nameOf(row.actorId), show: (row) => <button data-command="admin.reports.view" type="button" className="link-action" onClick={() => open(row.actorId)}>{nameOf(row.actorId)}</button> },
            { id: "role", label: "Role", value: (row) => ROLE_LABELS[(AGENTS.find((item) => item.id === row.actorId)?.role ?? "viewer") as Role] },
            { id: "actions", label: "Changes", value: (row) => row.actions, numeric: true },
            { id: "alerts", label: "Alerts solved", value: (row) => row.alertsSolved, show: (row) => liveData ? tr("Not connected yet") : <>{row.alertsSolved}{row.alertsSolved ? <small className="rp-sub"> · {row.avgSolveMin} min</small> : null}</>, numeric: true },
            { id: "online", label: "Online", value: (row) => row.onlineMin, show: (row) => liveData ? tr("Not connected yet") : hours(row.onlineMin), numeric: true },
            { id: "views", label: "Private data", value: (row) => row.views, show: (row) => liveData ? tr("Not connected yet") : row.views, numeric: true },
            { id: "exports", label: "Downloads", value: (row) => row.exports, show: (row) => liveData ? tr("Not connected yet") : row.exports, numeric: true },
            { id: "sections", label: "Most in", value: (row) => row.sections[0]?.section ?? "", show: (row) => row.sections.slice(0, 2).map((item) => item.section).join(", ") || "–" },
          ]} />
        </Panel>
        <Panel title={tr("Changes by section")} icon={<Timer size={16} aria-hidden="true" />}>
          {(() => {
            const map = new Map<string, number>();
            for (const row of summaries) for (const item of row.sections) map.set(item.section, (map.get(item.section) ?? 0) + item.count);
            const rows = [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
            return rows.length ? <Bars rows={rows} format={(value) => String(value)} /> : <p className="dx-calm">{tr("No change in this period.")}</p>;
          })()}
        </Panel>
        {agent?.role === "super" ? <AccessCard settings={settings} /> : null}
      </div>
      <p className="rp-foot"><KeyRound size={12} aria-hidden="true" />{" "}{tr("Sign-ins and downloads are recorded in this browser in the demo; the backend records them for real. Rows marked Demo are example history.")}</p>
    </div>
  );
}

function AccessCard({ settings }: { settings: ReportSettings }) {
  const [roles, setRoles] = useState<string[]>(settings.access.roles);
  const choices = (Object.keys(ROLE_LABELS) as Role[]).filter((role) => role !== "super" && role !== "ops");
  const dirty = JSON.stringify(roles) !== JSON.stringify(settings.access.roles);
  return (
    <Panel title={tr("Who sees other admins' work")} icon={<ShieldCheck size={16} aria-hidden="true" />}>
      <p className="dx-modal-help">{tr("Super admin and Operations always see everyone's work. Add roles here; they only see work in their own zones and country.")}</p>
      <div className="zn-chips">{choices.map((role) => <Check key={role} label={ROLE_LABELS[role]} on={roles.includes(role)} onChange={(on) => setRoles(on ? [...roles, role] : roles.filter((item) => item !== role))} />)}</div>
      <div className="dx-modal-actions">
        <CommandButton command="admin.reports.access" className="dash-btn small" targetId="report access" confirmTarget={false} scope="all" before={settings.access.roles.join(",") || "none"} after={roles.join(",") || "none"} expectedSliceRev={settings.draftRev} sliceKey={REPORT_SETTINGS_KEY} value={{ ...settings, draftRev: settings.draftRev + 1, access: { roles } }} disabled={!dirty}>{tr("Save who can see")}</CommandButton>
      </div>
    </Panel>
  );
}
