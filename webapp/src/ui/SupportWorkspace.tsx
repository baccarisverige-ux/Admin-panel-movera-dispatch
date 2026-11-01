import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { AlarmClock, ArrowLeft, CarFront, CheckCircle2, Clock3, Inbox, Languages, Layers, MessageSquareText, RotateCcw, Settings2, Siren, Star, UserRound, Users } from "lucide-react";
import { emptySupport, supportChange, ticketOps, useRecords, useSlice, type SupportBook } from "../api/hooks";
import { AGENTS, can, canUseZone } from "../auth/permissions";
import { useSession } from "../auth/SessionContext";
import { useMarketScope } from "../markets/useMarketScope";
import { Cards, SortTable } from "../reports/ui";
import { SupportSettings } from "../support/SupportSettings";
import { LANGS, SUPPORT_DESK_KEY, TOPICS, emptyDesk, factsOf, linkCase, normalizeDesk, reopen, setTopic, setWaiting, solve, teamNumbers, templatesFor, type Desk, type Facts, type TopicId } from "../support/desk";
import { CommandButton } from "./CommandButton";
import { NotFoundRecord } from "./NotFoundRecord";
import { shortDateTime } from "../domain/time";
import { statusLabel } from "../domain/labels";
import { zoneTimeZone } from "../markets/markets";
import { tr, trn, trx } from "../i18n";

type Filter = "all" | "mine" | "new" | "late" | "waiting" | "solved";
const FILTERS: { id: Filter; label: string; icon: ReactNode; tone: string }[] = [
  { id: "all", label: "All open", icon: <Inbox size={16} />, tone: "blue" },
  { id: "mine", label: "Mine", icon: <UserRound size={16} />, tone: "violet" },
  { id: "new", label: "Nobody yet", icon: <Layers size={16} />, tone: "orange" },
  { id: "late", label: "Late", icon: <AlarmClock size={16} />, tone: "red" },
  { id: "waiting", label: "Waiting for them", icon: <Clock3 size={16} />, tone: "grey" },
  { id: "solved", label: "Solved", icon: <CheckCircle2 size={16} />, tone: "green" },
];

const agentName = (id: string | null | undefined) => AGENTS.find((item) => item.id === id)?.name ?? id ?? "";

export function SupportWorkspace({ chat = false }: { chat?: boolean }) {
  const { agent } = useSession();
  const navigate = useNavigate();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const scope = useMarketScope();
  const rows = useRecords("tickets");
  const riders = useRecords("riders");
  const drivers = useRecords("drivers");
  const trips = useRecords("trips");
  const store = useSlice<SupportBook>("supportOps", emptySupport());
  const deskSlice = useSlice<Desk>(SUPPORT_DESK_KEY, emptyDesk());
  const desk = normalizeDesk(deskSlice.value);
  const settings = desk.settings[scope.market.id];
  const [selected, setSelected] = useState(id ?? "");
  const [thread, setThread] = useState("rider");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [owner, setOwner] = useState("");
  const [attachment, setAttachment] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [topicFilter, setTopicFilter] = useState("");
  const [langFilter, setLangFilter] = useState("");
  const [solveNote, setSolveNote] = useState("");
  const [now] = useState(() => Date.now());
  const view = params.get("view");

  const all = useMemo(() => (rows.data ?? []).map((row, index) => {
    const who: "rider" | "driver" = chat ? (index % 2 === 0 ? "rider" : "driver") : index % 4 === 3 ? "driver" : "rider";
    return { row, index, facts: factsOf(row, store.value, desk, now, who) };
  }), [rows.data, store.value, desk, now, chat]);
  const inThread = all.filter((item) => !chat || (thread === "rider" ? item.index % 2 === 0 : item.index % 2 === 1));
  const passes = (facts: Facts, id: Filter) => {
    if (id === "solved") return facts.state === "solved";
    if (facts.state === "solved") return false;
    if (id === "mine") return facts.owner === agent?.id;
    if (id === "new") return facts.state === "new";
    if (id === "late") return facts.replyLate || facts.solveLate;
    if (id === "waiting") return facts.state === "waiting";
    return true;
  };
  const list = inThread.filter((item) => passes(item.facts, filter) && (!topicFilter || item.facts.topic === topicFilter) && (!langFilter || item.facts.lang === langFilter) && `${item.row.id} ${item.row.name}`.toLowerCase().includes(query.toLowerCase()));
  const current = list.find((item) => item.row.id === selected) ?? list[0];
  const row = current?.row;
  const facts = current?.facts;
  const ops = row ? ticketOps(store.value, row) : null;
  const key = `${agent?.id}:${row?.id}`;
  const text = draft[key] ?? store.value.drafts[key] ?? "";
  const eligible = AGENTS.filter((item) => item.active && can(item.role, "support.reply") && row && canUseZone(item, row.zoneId));
  const chosen = owner || eligible[0]?.id || "";
  function prepared(kind: Parameters<typeof supportChange>[3]) {
    return row ? supportChange(store.value, row, agent?.id ?? "", kind, text, crypto.randomUUID(), chosen, attachment) : { book: store.value, error: "Choose a ticket." };
  }
  const set = (patch: Record<string, string | null>) => setParams(() => {
    const next = new URLSearchParams(globalThis.location.search);
    for (const [name, value] of Object.entries(patch)) {
      if (!value) next.delete(name);
      else next.set(name, value);
    }
    return next;
  }, { replace: true });

  const header = (
    <header className="dx-head">
      <button data-command="admin.ticket.view" type="button" className="dash-btn ghost dx-back" onClick={() => (view ? set({ view: null }) : globalThis.history.length > 1 ? navigate(-1) : navigate("/"))}><ArrowLeft size={16} aria-hidden="true" />{" "}{tr("Back")}</button>
      <div className="dx-head-text">
        <h2>{view === "settings" ? tr("{0} settings", [chat ? "Chat" : "Support"]) : view === "team" ? tr("Support team numbers") : chat ? tr("Chat") : tr("Support")}</h2>
        <p>{tr("Scoped ticket queue, 3-day ownership and isolated Rider/Driver threads. Replies are simulated; attachment names are metadata only.")}</p>
      </div>
      {!view ? (
        <span className="sp-head-actions">
          <button data-command="admin.ticket.view" type="button" className="dash-btn small ghost" onClick={() => set({ view: "team" })}><Users size={14} aria-hidden="true" />{" "}{tr("Team numbers")}</button>
          <button data-command="admin.ticket.view" type="button" className="dash-btn small ghost" onClick={() => set({ view: "settings" })}><Settings2 size={14} aria-hidden="true" />{" "}{tr("Settings")}</button>
        </span>
      ) : null}
    </header>
  );

  // An unknown ticket address says so (Q23), instead of quietly opening the first ticket.
  if (id && !view && rows.data && !all.some((item) => item.row.id === id)) return <div className="dx-page sp-page">{header}<NotFoundRecord kind="Ticket" id={id} list={chat ? "/chat" : "/support"} back={chat ? tr("Back to chat") : tr("Back to support")} /></div>;
  if (view === "settings") return <div className="dx-page sp-page">{header}<SupportSettings desk={desk} country={scope.market.id} editable={Boolean(agent && can(agent.role, "settings.edit"))} /></div>;
  if (view === "team") {
    const team = teamNumbers(all.map((item) => item.facts));
    return (
      <div className="dx-page sp-page">
        {header}
        <section className="dash-card rp-panel" aria-label={tr("Team numbers")}>
          <SortTable label={tr("Support team")} rowKey={(item) => item.agentId} rows={team} initial="solved" columns={[
            { id: "agent", label: "Admin", value: (item) => agentName(item.agentId) },
            { id: "solved", label: "Solved", value: (item) => item.solved, numeric: true },
            { id: "open", label: "Open now", value: (item) => item.open, numeric: true },
            { id: "reply", label: "First answer", value: (item) => item.avgFirstReplyMin ?? -1, show: (item) => (item.avgFirstReplyMin === null ? "–" : `${item.avgFirstReplyMin} min`), numeric: true },
            { id: "rating", label: "Rating", value: (item) => item.avgRating ?? 0, show: (item) => (item.avgRating === null ? "–" : `${item.avgRating} of 5`), numeric: true },
          ]} />
          <p className="sp-help">{tr("Every reply, note and solve is also in Reports → Admin work with the admin's name.")}</p>
        </section>
      </div>
    );
  }

  const open = inThread.filter((item) => item.facts.state !== "solved");
  const ratings = inThread.map((item) => item.facts.rating).filter((value): value is number => value !== null);
  const person = facts ? (facts.who === "driver" ? (drivers.data ?? []).find((item) => item.zoneId === row?.zoneId) : (riders.data ?? []).find((item) => item.phone === row?.phone) ?? (riders.data ?? []).find((item) => item.name === row?.name)) : undefined;
  const trip = row ? (trips.data ?? []).find((item) => item.name === row.name && item.zoneId === row.zoneId) : undefined;
  const replies = facts ? templatesFor(settings, facts.topic, facts.lang) : [];
  const time = (ms: number) => new Intl.DateTimeFormat(scope.market.locale, { timeZone: scope.market.timeZone, dateStyle: "short", timeStyle: "short" }).format(new Date(ms));
  const ago = (ms: number) => { const minutes = Math.round((now - ms) / 60_000); return minutes < 60 ? `${minutes} min` : minutes < 1440 ? `${Math.round(minutes / 60)} h` : `${Math.round(minutes / 1440)} d`; };
  const solveTry = row ? solve(desk, row.id, agent?.id ?? "", solveNote, new Date().toISOString(), settings.rating) : null;
  const incidentId = row ? `INC-${row.id}` : "";

  return (
    <div className="dx-page sp-page">
      {header}
      <p role="status" className={notice ? "dx-note sp-status" : "sp-status"}>{notice}</p>
      {rows.error ? <p role="alert">{rows.error.message}</p> : null}

      <Cards
        compare={false}
        compareLabel=""
        fmt={(value, format) => (format === "min" ? `${value} min` : String(value))}
        cards={[
          { id: "open", label: "Open", value: open.length, previous: null, format: "count", info: "Tickets not solved yet." },
          { id: "new", label: "Nobody yet", value: open.filter((item) => item.facts.state === "new").length, previous: null, format: "count", info: "Nobody has taken these. Take the oldest first.", goodDown: true },
          { id: "late", label: "Late", value: open.filter((item) => item.facts.replyLate || item.facts.solveLate).length, previous: null, format: "count", info: "Past the first answer or solve time of their topic.", goodDown: true },
          { id: "solved", label: "Solved", value: inThread.filter((item) => item.facts.state === "solved").length, previous: null, format: "count", info: "Solved tickets, with who solved them." },
          { id: "rating", label: "Rating", value: ratings.length ? Math.round((ratings.reduce((sum, value) => sum + value, 0) / ratings.length) * 10) / 10 : 0, previous: null, format: "count", info: "What people gave after their ticket was solved, out of 5." },
        ]}
      />

      {chat ? <div className="actions sp-threads">{["rider", "driver"].map((item) => <button type="button" key={item} data-command="admin.tabs.select" className={thread === item ? "dash-btn small" : "dash-btn small ghost"} onClick={() => { setThread(item); setSelected(""); setAttachment(""); }}>{item === "rider" ? tr("Rider thread") : tr("Driver thread")}</button>)}</div> : null}

      <nav className="sp-filters" aria-label={tr("Ticket groups")}>
        {FILTERS.map((item) => (
          <button key={item.id} data-command="admin.ticket.view" type="button" className={`sp-filter ${item.tone}${filter === item.id ? " active" : ""}`} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
            <span aria-hidden="true">{item.icon}</span><b>{trx(item.label)}</b><small>{inThread.filter((entry) => passes(entry.facts, item.id)).length}</small>
          </button>
        ))}
      </nav>

      <div className="sp-grid">
        <aside className="sp-list" aria-label={tr("Tickets")}>
          <label className="sp-field"><span>{tr("Search tickets")}</span><input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <div className="sp-list-filters">
            <select aria-label={tr("Topic")} value={topicFilter} onChange={(event) => setTopicFilter(event.target.value)}><option value="">{tr("Every topic")}</option>{TOPICS.map((item) => <option key={item.id} value={item.id}>{trx(item.label)}</option>)}</select>
            <select aria-label={tr("Language")} value={langFilter} onChange={(event) => setLangFilter(event.target.value)}><option value="">{tr("Every language")}</option>{Object.entries(LANGS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select>
          </div>
          <label className="sp-field sr-only"><span>{tr("Ticket")}</span><select value={row?.id ?? ""} onChange={(event) => { setSelected(event.target.value); setAttachment(""); setOwner(""); }}>{list.map((item) => <option key={item.row.id} value={item.row.id}>{item.row.id} · {item.row.name} · {item.row.status}</option>)}</select></label>
          <ul>
            {list.map((item) => (
              <li key={item.row.id}>
                <button data-command="admin.ticket.view" type="button" className={`sp-ticket${row?.id === item.row.id ? " active" : ""}${item.facts.replyLate || item.facts.solveLate ? " late" : ""}`} onClick={() => { setSelected(item.row.id); setAttachment(""); setOwner(""); setSolveNote(""); }}>
                  <span className="sp-ticket-top"><b>{item.row.name}</b><small>{ago(item.facts.openedAt)}</small></span>
                  <small className="sp-ticket-text">{item.facts.text}</small>
                  <span className="sp-ticket-tags">
                    <span className={`sp-topic ${item.facts.topic}`}>{trx(TOPICS.find((topic) => topic.id === item.facts.topic)?.label)}</span>
                    <span className="sp-tag">{item.facts.lang.toUpperCase()}</span>
                    <span className="sp-tag">{item.facts.who === "driver" ? tr("Driver") : tr("Rider")}</span>
                    {item.facts.state === "solved" ? <span className="sp-tag good">{trn("Solved by {0}", agentName(item.facts.solvedBy))}</span> : item.facts.owner ? <span className="sp-tag">{agentName(item.facts.owner)}</span> : <span className="sp-tag warn">{tr("Nobody yet")}</span>}
                    {item.facts.replyLate ? <span className="sp-tag bad">{tr("Answer late")}</span> : item.facts.solveLate ? <span className="sp-tag bad">{tr("Solve late")}</span> : null}
                  </span>
                </button>
              </li>
            ))}
            {!list.length ? <li className="dx-calm">{rows.isLoading ? tr("Loading tickets…") : tr("No tickets here.")}</li> : null}
          </ul>
        </aside>

        {row && ops && facts ? (
          <article className="sp-conversation panel" aria-label={tr("Ticket {0}", [row.id])}>
            <header className="sp-conv-head">
              <h3>{row.id} · {row.name}</h3>
              {/* Q22 / UI-14: who opened it and when, in the zone's local time; the owner is the same one the list shows. */}
              <p data-testid="ticket-opened">{facts.who === "driver" ? tr("Driver") : tr("Rider")} {row.name} · {shortDateTime(facts.openedAt, zoneTimeZone(row.zoneId))}</p>
              <p className="sp-help" data-testid="ticket-owner">{trn("{0} · Due {1} · Priority {2}", facts.owner ? tr("{0} is working on it{1}", [agentName(facts.owner), ops.ownerUntil ? ` until ${shortDateTime(ops.ownerUntil, zoneTimeZone(row.zoneId))}` : ""]) : tr("Nobody is working on it yet"), shortDateTime(ops.dueAt, zoneTimeZone(row.zoneId)), ops.priority)}</p>
              <span className="sp-conv-meta">
                <span className={`sp-topic ${facts.topic}`}>{trx(TOPICS.find((item) => item.id === facts.topic)?.label)}</span>
                <small className="sp-help">{tr("Not right? Move it to")}</small>
                {TOPICS.filter((item) => item.id !== facts.topic && item.for.includes(facts.who)).slice(0, 3).map((item) => (
                  <CommandButton key={item.id} command="admin.ticket.topic" className="dash-btn small ghost" sliceKey={SUPPORT_DESK_KEY} value={setTopic(desk, row.id, item.id as TopicId)} expectedSliceRev={desk.draftRev} targetId={row.id} confirmTarget={false} before={facts.topic} after={item.id} onDone={() => setNotice(tr("Topic changed to {0}.", [trx(item.label)]))}>{trx(item.label)}</CommandButton>
                ))}
                <span className="sp-tag"><Languages size={11} aria-hidden="true" /> {LANGS[facts.lang]}</span>
                <span className={facts.replyLate || facts.solveLate ? "sp-tag bad" : "sp-tag"}>{trn("Answer within {0} min · solve within {1} h", settings.limits[facts.topic].firstReplyMin, settings.limits[facts.topic].solveHours)}</span>
              </span>
            </header>
            <div className="actions sp-actions">
              <CommandButton command="admin.support.claim" className="dash-btn small" targetId={row.id} scope={row.zoneId} sliceKey="supportOps" expectedSliceRev={store.value.draftRev} value={prepared("claim").book} disabled={store.loading} onDone={() => setNotice(tr("Claimed for 3 days."))}>{tr("Claim")}</CommandButton>
              <label className="sp-inline">{tr("Assign agent")}<select value={chosen} onChange={(event) => setOwner(event.target.value)}>{eligible.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <CommandButton command="admin.support.assign" className="dash-btn small ghost" targetId={row.id} scope={row.zoneId} sliceKey="supportOps" value={prepared("assign").book} expectedSliceRev={store.value.draftRev} confirmTarget={false} disabled={!chosen || store.loading}>{tr("Assign")}</CommandButton>
              {["normal", "urgent"].map((priority) => <CommandButton key={priority} command="admin.support.metadata" className="dash-btn small ghost" targetId={row.id} scope={row.zoneId} sliceKey="supportOps" value={supportChange(store.value, row, agent?.id ?? "", "metadata", "", "", undefined, undefined, { priority: priority as "normal" | "urgent" }).book} expectedSliceRev={store.value.draftRev} confirmTarget={false}>{trn("Priority {0}", priority)}</CommandButton>)}
            </div>
            <ol className="sp-thread">
              <li className="them"><span>{facts.text}</span><small>{row.name} · {time(facts.openedAt)}</small></li>
            </ol>
            <ul aria-label={tr("Ticket messages")} className="sp-thread mine">{ops.messages.map((message) => <li key={message.id} className={message.kind === "note" ? "note" : "us"}><span>{message.actor}: {message.text} · {message.kind === "note" ? tr("Private note") : message.delivery}{message.attachment ? tr(" · Attachment metadata: {0}", [message.attachment]) : ""}</span></li>)}</ul>
            <div className="sp-compose">
              <label className="sp-field"><span>{tr("Ready-made reply")}</span>
                <select aria-label={tr("Ready-made reply")} value="" onChange={(event) => { const pick = replies.find((item) => item.id === event.target.value); if (pick) setDraft({ ...draft, [key]: pick.text }); }}>
                  <option value="">{tr("Choose a reply…")}</option>
                  {replies.map((item) => <option key={item.id} value={item.id}>{item.title} ({LANGS[item.lang]})</option>)}
                </select>
              </label>
              <label className="sp-field"><span>{tr("Message")}</span><textarea aria-label={tr("Message")} value={text} rows={3} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} /></label>
              <label className="sp-field"><span>{tr("Attachment name (metadata only)")}</span><input value={attachment} onChange={(event) => setAttachment(event.target.value)} /></label>
              <div className="actions">
                <button type="button" data-command="admin.message.useText" className="dash-btn small ghost" onClick={() => setDraft({ ...draft, [key]: ops.language === "sv" ? "Vi undersöker ditt ärende." : "We are reviewing your request." })}>{tr("Use response macro")}</button>
                {(["reply", "note", "draft"] as const).map((kind) => {
                  const result = prepared(kind);
                  return <CommandButton key={kind} command={`admin.support.${kind}`} className={kind === "reply" ? "dash-btn small" : "dash-btn small ghost"} targetId={row.id} scope={row.zoneId} sliceKey="supportOps" expectedSliceRev={store.value.draftRev} value={result.book} confirmTarget={false} disabled={store.loading || Boolean(result.error)} title={result.error} onDone={() => { if (kind !== "draft") setDraft({ ...draft, [key]: "" }); setNotice(kind === "reply" ? tr("Reply saved once to this simulated thread.") : kind === "note" ? tr("Private note saved. It is not sent to the app.") : tr("Draft saved.")); }}>{kind === "reply" ? tr("Send reply") : kind === "note" ? tr("Private note") : tr("Save draft")}</CommandButton>;
                })}
              </div>
            </div>
          </article>
        ) : <p className="dx-calm">{rows.isLoading ? tr("Loading tickets…") : tr("No tickets in this scope.")}</p>}

        {row && facts ? (
          <aside className="sp-side" aria-label={tr("About this ticket")}>
            <section className="sp-card">
              <h4>{facts.who === "driver" ? <CarFront size={14} aria-hidden="true" /> : <UserRound size={14} aria-hidden="true" />} {facts.who === "driver" ? tr("Driver") : tr("Rider")}</h4>
              <b>{row.name}</b>
              {person ? <Link to={`/${facts.who === "driver" ? "drivers" : "riders"}/${person.id}`}>{trn("Open the {0} page", facts.who)}</Link> : null}
            </section>
            <section className="sp-card">
              <h4><MessageSquareText size={14} aria-hidden="true" />{" "}{tr("Trip")}</h4>
              {trip ? <><b>{trip.id}</b><small>{statusLabel(trip.status)}</small><Link to={`/trips/${trip.id}`}>{tr("Open the trip: route, chat, calls, refund")}</Link></> : <small>{tr("No trip found for this ticket.")}</small>}
            </section>
            <section className="sp-card">
              <h4><Siren size={14} aria-hidden="true" />{" "}{tr("Safety")}</h4>
              {desk.tickets[row.id]?.caseIds?.length ? <Link to="/incidents">{tr("Incident opened. Open Incidents")}</Link> : (
                <CommandButton command="admin.ticket.case" className="dash-btn small danger-ghost" sliceKey={SUPPORT_DESK_KEY} value={linkCase(desk, row.id, incidentId)} expectedSliceRev={desk.draftRev} targetId={row.id} confirmTarget={false} before="" after="incident opened" onDone={() => setNotice(tr("Incident opened. The safety team sees it in Incidents."))}>{tr("Open an incident")}</CommandButton>
              )}
            </section>
            <section className={facts.state === "solved" ? "sp-card solved" : "sp-card"}>
              <h4><CheckCircle2 size={14} aria-hidden="true" /> {facts.state === "solved" ? tr("Solved by {0}", [agentName(facts.solvedBy)]) : facts.owner ? tr("{0} is working on it", [agentName(facts.owner)]) : tr("Nobody is working on it")}</h4>
              {facts.state === "solved" ? (
                <>
                  <small>{desk.tickets[row.id]?.note}</small>
                  {facts.rating ? <span className="sp-stars" aria-label={tr("Rated {0} of 5", [facts.rating])}>{Array.from({ length: 5 }, (_, index) => <Star key={index} size={14} className={index < (facts.rating ?? 0) ? "on" : undefined} aria-hidden="true" />)}</span> : settings.rating ? <small>{tr("Waiting for a rating.")}</small> : null}
                  <CommandButton command="admin.ticket.reopen" className="dash-btn small ghost" sliceKey={SUPPORT_DESK_KEY} value={reopen(desk, row.id)} expectedSliceRev={desk.draftRev} targetId={row.id} confirmTarget={false} before="solved" after="open" onDone={() => setNotice(tr("Ticket opened again."))}><RotateCcw size={13} aria-hidden="true" />{" "}{tr("Reopen")}</CommandButton>
                </>
              ) : (
                <>
                  <CommandButton command="admin.ticket.waiting" className="dash-btn small ghost" sliceKey={SUPPORT_DESK_KEY} value={setWaiting(desk, row.id, facts.state !== "waiting")} expectedSliceRev={desk.draftRev} targetId={row.id} confirmTarget={false} before={facts.state} after={facts.state === "waiting" ? "open" : "waiting"} onDone={() => setNotice(facts.state === "waiting" ? tr("Back in the queue.") : tr("Waiting for their answer."))}>{facts.state === "waiting" ? tr("They answered") : tr("Waiting for them")}</CommandButton>
                  <textarea aria-label={tr("What did you do")} rows={2} value={solveNote} placeholder={tr("What you did, for the next admin")} onChange={(event) => setSolveNote(event.target.value)} />
                  <CommandButton command="admin.ticket.solve" className="dash-btn small" sliceKey={SUPPORT_DESK_KEY} value={solveTry?.desk} expectedSliceRev={desk.draftRev} targetId={row.id} confirmTarget={false} before={facts.state} after="solved" disabled={Boolean(solveTry?.error)} title={solveTry?.error} onDone={() => { setSolveNote(""); setNotice(tr("Solved by {0}.{1}", [agentName(agent?.id), settings.rating ? " The person is asked to rate the help." : ""])); }}>{tr("Mark solved")}</CommandButton>
                </>
              )}
            </section>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
