import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tr, uiLocale } from "../i18n";
import { useLiveSession } from "./LiveSessionContext";
import { readUncounted } from "./listTotalParam";
import { ErrorLine } from "./ui";
import type { Page, ReadyReply, SupportSettings, SupportTicket } from "./types";
import { useMarketScope } from "../markets/useMarketScope";
import { zoneFilterOf } from "./zoneFilter";
import { deskCall, settingsIssue } from "./supportDesk";
import { adminLabel } from "./format";

/**
 * Live builds only (contract v0.9.0 §16; v0.18.15 §37 support desk, owner 2026-11-02 decisions/other-support-promos.md
 * QO-1 / QO-2 / QO-4 / QO-5): Admin › Support lists the tickets riders and drivers open in the apps, answers them
 * (the person answers back chat-style in the app), claims / assigns, changes the topic, marks waiting / solved,
 * reopens, opens a safety case, and keeps the topics and time limits per country (Support settings).
 */

const CATEGORY_LABEL: Record<string, string> = {
  ride_dispute: "Ride dispute",
  help: "Help",
  lost_item: "Lost item",
  payment: "Payment",
  account: "Account",
  safety: "Safety",
  other: "Other",
};
export const TOPIC_CODES = Object.keys(CATEGORY_LABEL);
const STATUS_LABEL: Record<SupportTicket["status"], string> = { open: "New", pending: "Waiting for them", resolved: "Solved", closed: "Closed" };

export function categoryLabel(code: string): string {
  const label = CATEGORY_LABEL[code];
  return label ? tr(label as Parameters<typeof tr>[0]) : code;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(uiLocale(), { dateStyle: "medium", timeStyle: "short" });
}

function LiveSupportSettings({ country }: { country: "SE" | "FR" | "TN" }) {
  const { client, can } = useLiveSession();
  const queryClient = useQueryClient();
  const saved = useQuery({ queryKey: ["live", "supportSettings", country], queryFn: () => client.json<SupportSettings>(`/admin/support/settings?country=${country}`) });

  const [draft, setDraft] = useState<SupportSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const current = draft ?? saved.data;
  if (saved.isLoading) return <p className="state-line">{tr("Loading.")}</p>;
  if (saved.error || !current) return <ErrorLine error={saved.error} onRetry={() => void saved.refetch()} />;
  const editable = can("settings.edit");
  const issue = settingsIssue(current);
  const patch = (next: Partial<SupportSettings>) => setDraft({ ...current, ...next });
  const setTopic = (code: string, next: Partial<SupportSettings["topics"][number]>) => patch({ topics: current.topics.map((t) => (t.code === code ? { ...t, ...next } : t)) });
  const setReply = (index: number, next: Partial<ReadyReply>) => patch({ replies: (current.replies ?? []).map((r, at) => (at === index ? { ...r, ...next } : r)) });
  async function save() {
    if (!current || issue) return;
    setBusy(true);
    setError(null);
    try {
      const { country: c, topics, replies } = current;
      // Checker LOW: the revision read; someone else's newer save gives a clear error to reload.
      await client.put(`/admin/support/settings`, { country: c, expectedRev: saved.data?.rev ?? 1, topics, replies: replies ?? [] });
      setDraft(null);
      setNotice(tr("Support settings saved."));
      void queryClient.invalidateQueries({ queryKey: ["live", "supportSettings", country] });
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel" data-testid="live-support-settings">
      <h3>{tr("Support settings")} · {country}</h3>
      <p className="op-help">{tr("Topics both apps show, and the time limits per topic. Late tickets are marked in the list.")}</p>
      {!editable ? <p className="dx-readonly">{tr("Only admins who can edit settings can change these.")}</p> : null}
      <fieldset className="sp-fieldset" disabled={!editable || busy}>
        <table className="op-table">
          <thead><tr><th>{tr("Topic")}</th><th>{tr("On")}</th><th>{tr("First answer (min)")}</th><th>{tr("Solve within (h)")}</th><th>{tr("New tickets go to")}</th></tr></thead>
          <tbody>
            {current.topics.map((t) => (
              <tr key={t.code}>
                <td>{categoryLabel(t.code)}</td>
                <td><input type="checkbox" aria-label={tr("{0} on", [categoryLabel(t.code)])} checked={t.on} onChange={(event) => setTopic(t.code, { on: event.target.checked })} /></td>
                <td><input type="number" min={1} max={10080} aria-label={tr("{0} first answer", [categoryLabel(t.code)])} value={t.firstReplyMin} onChange={(event) => setTopic(t.code, { firstReplyMin: Number(event.target.value) })} /></td>
                <td><input type="number" min={1} max={720} aria-label={tr("{0} solve", [categoryLabel(t.code)])} value={t.solveHours} onChange={(event) => setTopic(t.code, { solveHours: Number(event.target.value) })} /></td>
                <td>
                  <select aria-label={tr("{0} goes to", [categoryLabel(t.code)])} value={t.assignTo ?? ""} onChange={(event) => setTopic(t.code, { assignTo: event.target.value || undefined })}>
                    <option value="">{tr("Nobody")}</option>
                    {(saved.data?.agents ?? []).map((p) => <option key={p.adminId} value={p.adminId}>{adminLabel(p.name)}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <h4>{tr("Ready replies")}</h4>
        <p className="op-help">{tr("Agents pick one, change it and send it. One list per language.")}</p>
        <ul className="pm-list" data-testid="live-support-replies">
          {(current.replies ?? []).map((r, index) => (
            <li key={r.id} className="op-inline wrap">
              <select aria-label={tr("Reply {0} language", [index + 1])} value={r.lang} onChange={(event) => setReply(index, { lang: event.target.value as ReadyReply["lang"] })}>
                <option value="sv">{tr("Swedish")}</option><option value="fr">{tr("French")}</option><option value="en">{tr("English")}</option>
              </select>
              <input aria-label={tr("Reply {0} title", [index + 1])} value={r.title} maxLength={80} onChange={(event) => setReply(index, { title: event.target.value })} />
              <textarea aria-label={tr("Reply {0} text", [index + 1])} value={r.text} maxLength={2000} onChange={(event) => setReply(index, { text: event.target.value })} />
              <button type="button" className="dash-btn small ghost" data-command="admin.ticket.view" onClick={() => patch({ replies: (current.replies ?? []).filter((_, at) => at !== index) })}>{tr("Remove {0}", [r.title || r.id])}</button>
            </li>
          ))}
        </ul>
        <button type="button" className="dash-btn small ghost" data-command="admin.ticket.view" onClick={() => patch({ replies: [...(current.replies ?? []), { id: `r${Date.now().toString(36)}`, lang: country === "FR" ? "fr" : country === "SE" ? "sv" : "fr", title: "", text: "" }] })}>{tr("Add a reply")}</button>
      </fieldset>
      {issue ? <p className="error-line" role="alert">{issue}</p> : null}
      {error ? <ErrorLine error={error} onRetry={() => setError(null)} /> : null}
      {notice ? <p className="dx-calm" role="status">{notice}</p> : null}
      {editable ? (
        <div className="op-inline">
          <button type="button" className="secondary-btn" data-command="admin.ticket.view" disabled={!draft || busy} onClick={() => setDraft(null)}>{tr("Undo changes")}</button>
          <button type="button" className="primary-btn" data-command="admin.ticket.settings" disabled={!draft || busy || Boolean(issue)} onClick={() => void save()}>{tr("Save settings")}</button>
        </div>
      ) : null}
    </section>
  );
}

export function LiveSupport() {
  const { client, admin } = useLiveSession();
  const queryClient = useQueryClient();
  const scope = useMarketScope();
  const [view, setView] = useState<"tickets" | "settings">("tickets");
  const [status, setStatus] = useState<"" | SupportTicket["status"]>("");
  const [assigned, setAssigned] = useState<"" | "me" | "none">("");
  const [selected, setSelected] = useState("");
  const [text, setText] = useState("");
  const [after, setAfter] = useState<"pending" | "resolved" | "closed">("pending");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  // v0.17.2: the tickets of the country and zones picked in the top bar.
  const zoneFilter = zoneFilterOf(scope.effective);
  const zoneQuery = new URLSearchParams(zoneFilter.params).toString();
  const country = (["SE", "FR", "TN"] as const).find((c) => c === scope.market.id) ?? "SE";
  // v0.18.15 (owner "Yes"): the country's ready replies, picked into the answer box.
  const supportSettings = useQuery({ queryKey: ["live", "supportSettings", country], queryFn: () => client.json<SupportSettings>(`/admin/support/settings?country=${country}`) });
  const readyReplies = supportSettings.data?.replies ?? [];
  const list = useQuery({ queryKey: ["live", "tickets", status, assigned, zoneQuery], queryFn: () => (zoneFilter.denied ? Promise.resolve({ items: [], nextCursor: null } as Page<SupportTicket>) : readUncounted<Page<SupportTicket>>(client, `/admin/tickets?limit=100${status ? `&status=${status}` : ""}${assigned ? `&assignedTo=${assigned}` : ""}${zoneQuery ? `&${zoneQuery}` : ""}`)) });
  const items = list.data?.items ?? [];
  const current = items.find((item) => item.ticketId === selected) ?? items[0];
  const detail = useQuery({ queryKey: ["live", "ticket", current?.ticketId], queryFn: () => client.json<SupportTicket>(`/admin/tickets/${encodeURIComponent(current!.ticketId)}`), enabled: Boolean(current) });
  // Admins to hand a ticket to: me and the admins already working on tickets in this list (the Team list is its own area).
  const people = new Map<string, string>();
  if (admin) people.set(admin.adminId, adminLabel(admin.firstName));
  for (const item of items) if (item.assignedTo) people.set(item.assignedTo.adminId, adminLabel(item.assignedTo.name));

  async function run(call: () => Promise<unknown>, done: string) {
    if (!current || busy) return;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      await call();
      setNotice(done);
      void queryClient.invalidateQueries({ queryKey: ["live", "tickets"] });
      void queryClient.invalidateQueries({ queryKey: ["live", "ticket", current.ticketId] });
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  const desk = (verb: Parameters<typeof deskCall>[1], body: Record<string, unknown>, done: string) => {
    if (!current) return;
    const callIt = deskCall(current.ticketId, verb, body);
    void run(() => client.post(callIt.path, callIt.body), done);
  };
  const reply = () => void run(async () => { await client.post(`/admin/tickets/${encodeURIComponent(current!.ticketId)}/reply`, { text: text.trim(), status: after }); setText(""); }, tr("Answer sent. It shows in their app."));
  const ticket = detail.data ?? current;
  const solved = ticket ? ticket.status === "resolved" || ticket.status === "closed" : false;
  // Checker MED1 (owner "Never" + "Leave ticket"): another admin's claimed ticket is read-only here.
  const othersClaim = Boolean(ticket?.assignedTo && ticket.assignedTo.adminId !== admin?.adminId);

  return (
    <div className="dx-page sp-page" data-testid="live-support">
      <header className="dx-head">
        <div className="dx-head-text"><h2>{tr("Support")}</h2><p>{tr("Tickets riders and drivers open in the apps. Your answer shows in their app.")}</p></div>
        <div className="op-inline">
          <button type="button" className={view === "tickets" ? "primary-btn" : "secondary-btn"} data-command="admin.ticket.view" onClick={() => setView("tickets")}>{tr("Tickets")}</button>
          <button type="button" className={view === "settings" ? "primary-btn" : "secondary-btn"} data-command="admin.ticket.view" onClick={() => setView("settings")}>{tr("Settings")}</button>
        </div>
      </header>
      {view === "settings" ? <LiveSupportSettings country={country} /> : (
        <>
          <div className="op-inline wrap">
            <label className="field">{tr("Status")}
              <select aria-label={tr("Ticket status")} value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
                <option value="">{tr("All")}</option>
                {(Object.keys(STATUS_LABEL) as SupportTicket["status"][]).map((id) => <option key={id} value={id}>{tr(STATUS_LABEL[id] as Parameters<typeof tr>[0])}</option>)}
              </select>
            </label>
            <label className="field">{tr("Who works on it")}
              <select aria-label={tr("Who works on it")} value={assigned} onChange={(event) => setAssigned(event.target.value as typeof assigned)}>
                <option value="">{tr("Everyone")}</option>
                <option value="me">{tr("Mine")}</option>
                <option value="none">{tr("Nobody yet")}</option>
              </select>
            </label>
          </div>
          {list.isLoading ? <p className="state-line">{tr("Loading.")}</p> : list.error ? <ErrorLine error={list.error} onRetry={() => void list.refetch()} /> : items.length === 0 ? <p className="dx-calm">{tr("No tickets.")}</p> : (
            <div className="sp-grid">
              <ul className="pm-list" aria-label={tr("Tickets")} data-testid="live-ticket-list">
                {items.map((item) => (
                  <li key={item.ticketId} className={item.ticketId === current?.ticketId ? "selected" : undefined}>
                    <button type="button" className="link-action" data-command="admin.ticket.view" onClick={() => { setSelected(item.ticketId); setNotice(""); setError(null); }}>
                      <b>{item.subject}</b>
                      <small>
                        {categoryLabel(item.category)} · {item.openedBy === "rider" ? tr("Rider") : tr("Driver")} · {tr(STATUS_LABEL[item.status] as Parameters<typeof tr>[0])} · {when(item.updatedAt)}
                        {item.assignedTo ? <> · {adminLabel(item.assignedTo.name)}</> : null}
                        {item.late?.reply || item.late?.solve ? <> · <b className="danger-text">{tr("Late")}</b></> : null}
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
              {current && ticket ? (
                <article className="panel" data-testid="live-ticket">
                  <h3>{ticket.subject}</h3>
                  <p className="op-help">
                    {categoryLabel(ticket.category)} · {ticket.openedBy === "rider" && ticket.riderId ? <Link to={`/riders/${ticket.riderId}`}>{tr("Rider")} {ticket.riderId}</Link> : ticket.driverId ? <Link to={`/drivers/${ticket.driverId}`}>{tr("Driver")} {ticket.driverId}</Link> : null}
                    {ticket.tripId ? <> · <Link to={`/trips/${ticket.tripId}`}>{ticket.tripId}</Link></> : null} · {tr(STATUS_LABEL[ticket.status] as Parameters<typeof tr>[0])}
                  </p>
                  <p className="op-help" data-testid="live-ticket-desk">
                    {ticket.assignedTo ? tr("Works on it: {0}", [adminLabel(ticket.assignedTo.name)]) : tr("Nobody works on it yet.")}
                    {ticket.firstReplyDueAt && !ticket.firstReplyAt ? <> · {tr("Answer by {0}", [when(ticket.firstReplyDueAt)])}</> : null}
                    {ticket.solveDueAt && !solved ? <> · {tr("Solve by {0}", [when(ticket.solveDueAt)])}</> : null}
                    {ticket.late?.reply ? <> · <b className="danger-text">{tr("First answer late")}</b></> : null}
                    {ticket.late?.solve ? <> · <b className="danger-text">{tr("Solve late")}</b></> : null}
                    {ticket.incidentId ? <> · <Link to="/incidents">{tr("Safety case {0}", [ticket.incidentId])}</Link></> : null}
                  </p>
                  {detail.error ? <ErrorLine error={detail.error} onRetry={() => void detail.refetch()} /> : null}
                  {ticket.feedback ? <p className="op-help" data-testid="live-ticket-feedback"><b>{tr("Their comment after solving")}:</b> {ticket.feedback.text} · {when(ticket.feedback.at)}</p> : null}
                  <ol className="op-chat" aria-label={tr("Messages")}>
                    {(detail.data?.messages ?? []).map((message) => (
                      <li key={message.messageId} className={message.from === "support" ? "driver" : "rider"}>
                        <span>{message.text}</span>
                        <small>{message.from === "support" ? message.adminName ?? tr("Support") : message.from === "rider" ? tr("Rider") : tr("Driver")} · {when(message.at)}</small>
                      </li>
                    ))}
                  </ol>
                  {othersClaim ? <p className="dx-calm" data-testid="live-ticket-others">{tr("{0} works on this ticket. Only they can answer or change it until they leave it.", [adminLabel(ticket.assignedTo?.name)])}</p> : null}
                  <div className="op-inline wrap" aria-label={tr("Ticket tools")}>
                    <button type="button" className="secondary-btn" data-command="admin.support.claim" disabled={othersClaim || busy || solved || ticket.assignedTo?.adminId === admin?.adminId} onClick={() => desk("claim", {}, tr("Claimed. Other admins see that you work on it."))}>{tr("Claim")}</button>
                    {othersClaim && admin?.role === "super" && !solved ? <button type="button" className="secondary-btn" data-command="admin.support.claim" disabled={busy} onClick={() => desk("claim", {}, tr("You took over this ticket. It is written in the audit log."))}>{tr("Take over")}</button> : null}
                    {ticket.assignedTo?.adminId === admin?.adminId && !solved ? <button type="button" className="secondary-btn" data-command="admin.support.claim" disabled={othersClaim || busy} onClick={() => desk("leave", {}, tr("You left the ticket. It waits for any admin again."))}>{tr("Leave ticket")}</button> : null}
                    <label className="field">{tr("Hand to")}
                      <select aria-label={tr("Hand to")} value={assignee} onChange={(event) => setAssignee(event.target.value)}>
                        <option value="">{tr("Choose")}</option>
                        {[...people].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                        <option value="-">{tr("Nobody")}</option>
                      </select>
                    </label>
                    <button type="button" className="secondary-btn" data-command="admin.support.assign" disabled={othersClaim || busy || !assignee || !reason.trim()} title={!reason.trim() ? tr("Write a reason first.") : undefined} onClick={() => desk("assign", { adminId: assignee === "-" ? null : assignee, reason: reason.trim() }, tr("Ticket handed over."))}>{tr("Assign")}</button>
                    <label className="field">{tr("Topic")}
                      <select aria-label={tr("Ticket topic")} value={ticket.category} disabled={othersClaim || busy} onChange={(event) => desk("topic", { category: event.target.value }, tr("Topic changed to {0}.", [categoryLabel(event.target.value)]))} data-command="admin.ticket.topic">
                        {TOPIC_CODES.map((code) => <option key={code} value={code}>{categoryLabel(code)}</option>)}
                      </select>
                    </label>
                    {!solved ? <button type="button" className="secondary-btn" data-command="admin.ticket.waiting" disabled={othersClaim || busy} onClick={() => desk("waiting", { waiting: ticket.status !== "pending" }, ticket.status === "pending" ? tr("Back in the queue.") : tr("Waiting for their answer."))}>{ticket.status === "pending" ? tr("They answered") : tr("Waiting for them")}</button> : null}
                  </div>
                  <label className="field">{tr("Reason (assign, reopen, safety case)")}<input aria-label={tr("Reason")} value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} /></label>
                  <div className="op-inline wrap">
                    {!solved ? (
                      <>
                        <label className="field">{tr("Private note (not sent to the app)")}<input aria-label={tr("Private note")} value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} /></label>
                        <button type="button" className="primary-btn" data-command="admin.ticket.solve" disabled={othersClaim || busy} onClick={() => desk("solve", note.trim() ? { note: note.trim() } : {}, tr("Ticket solved."))}>{tr("Mark solved")}</button>
                      </>
                    ) : (
                      <button type="button" className="secondary-btn" data-command="admin.ticket.reopen" disabled={othersClaim || busy || !reason.trim()} title={!reason.trim() ? tr("Write a reason first.") : undefined} onClick={() => desk("reopen", { reason: reason.trim() }, tr("Ticket opened again."))}>{tr("Reopen")}</button>
                    )}
                    {ticket.tripId && !ticket.incidentId ? <button type="button" className="danger-btn" data-command="admin.ticket.case" disabled={othersClaim || busy || !reason.trim()} title={!reason.trim() ? tr("Write a reason first.") : undefined} onClick={() => desk("case", { reason: reason.trim() }, tr("Safety case opened. The safety team sees it in Incidents."))}>{tr("Open a safety case")}</button> : null}
                  </div>
                  {notice ? <p className="dx-calm" role="status">{notice}</p> : null}
                  {error ? <ErrorLine error={error} onRetry={() => setError(null)} /> : null}
                  {ticket.status === "closed" ? <p className="dx-calm">{tr("This ticket is closed.")}</p> : (
                    <div className="sp-reply">
                      {readyReplies.length ? (
                        <label className="field">{tr("Ready reply")}
                          <select aria-label={tr("Ready reply")} value="" onChange={(event) => { const picked = readyReplies.find((r) => r.id === event.target.value); if (picked) setText(picked.text); }}>
                            <option value="">{tr("Choose")}</option>
                            {readyReplies.map((r) => <option key={r.id} value={r.id}>{r.lang} · {r.title}</option>)}
                          </select>
                        </label>
                      ) : null}
                      <label className="field">{tr("Answer")}<textarea aria-label={tr("Answer")} value={text} maxLength={5000} onChange={(event) => setText(event.target.value)} /></label>
                      <label className="field">{tr("Then")}
                        <select aria-label={tr("Ticket status after the answer")} value={after} onChange={(event) => setAfter(event.target.value as typeof after)}>
                          <option value="pending">{tr("Waiting for them")}</option>
                          <option value="resolved">{tr("Solved")}</option>
                          <option value="closed">{tr("Closed")}</option>
                        </select>
                      </label>
                      <button type="button" className="primary-btn" data-command="admin.support.reply" disabled={othersClaim || busy || !text.trim()} onClick={reply}>{tr("Send answer")}</button>
                    </div>
                  )}
                </article>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  );
}
