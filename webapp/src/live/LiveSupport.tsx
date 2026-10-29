import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tr, uiLocale } from "../i18n";
import { useLiveSession } from "./LiveSessionContext";
import { ErrorLine } from "./ui";
import type { Page, SupportTicket } from "./types";
import { useMarketScope } from "../markets/useMarketScope";
import { zoneFilterOf } from "./zoneFilter";

/**
 * Live builds only (contract v0.9.0 §16, owner decision 3 of part 3): Admin › Support lists the tickets riders and
 * drivers open in the apps (ride disputes, help), shows the messages and answers; the person reads the answer in
 * the app. Topics, templates, owners and late timers of the demo desk have no server source yet.
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
const STATUS_LABEL: Record<SupportTicket["status"], string> = { open: "New", pending: "Waiting for them", resolved: "Solved", closed: "Closed" };

export function categoryLabel(code: string): string {
  const label = CATEGORY_LABEL[code];
  return label ? tr(label as Parameters<typeof tr>[0]) : code;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(uiLocale(), { dateStyle: "medium", timeStyle: "short" });
}

export function LiveSupport() {
  const { client } = useLiveSession();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"" | SupportTicket["status"]>("");
  const [selected, setSelected] = useState("");
  const [text, setText] = useState("");
  const [after, setAfter] = useState<"pending" | "resolved" | "closed">("pending");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // v0.17.2: the tickets of the country and zones picked in the top bar.
  const zoneFilter = zoneFilterOf(useMarketScope().effective);
  const zoneQuery = new URLSearchParams(zoneFilter.params).toString();
  const list = useQuery({ queryKey: ["live", "tickets", status, zoneQuery], queryFn: () => (zoneFilter.denied ? Promise.resolve({ items: [], nextCursor: null } as Page<SupportTicket>) : client.json<Page<SupportTicket>>(`/admin/tickets?limit=100${status ? `&status=${status}` : ""}${zoneQuery ? `&${zoneQuery}` : ""}`)) });
  const items = list.data?.items ?? [];
  const current = items.find((item) => item.ticketId === selected) ?? items[0];
  const detail = useQuery({ queryKey: ["live", "ticket", current?.ticketId], queryFn: () => client.json<SupportTicket>(`/admin/tickets/${encodeURIComponent(current!.ticketId)}`), enabled: Boolean(current) });
  async function reply() {
    if (!current || busy || !text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await client.post(`/admin/tickets/${encodeURIComponent(current.ticketId)}/reply`, { text: text.trim(), status: after });
      setText("");
      void queryClient.invalidateQueries({ queryKey: ["live", "tickets"] });
      void queryClient.invalidateQueries({ queryKey: ["live", "ticket", current.ticketId] });
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  const ticket = detail.data;
  return (
    <div className="dx-page sp-page" data-testid="live-support">
      <header className="dx-head"><div className="dx-head-text"><h2>{tr("Support")}</h2><p>{tr("Tickets riders and drivers open in the apps. Your answer shows in their app.")}</p></div></header>
      <div className="op-inline wrap">
        <label className="field">{tr("Status")}
          <select aria-label={tr("Ticket status")} value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
            <option value="">{tr("All")}</option>
            {(Object.keys(STATUS_LABEL) as SupportTicket["status"][]).map((id) => <option key={id} value={id}>{tr(STATUS_LABEL[id] as Parameters<typeof tr>[0])}</option>)}
          </select>
        </label>
      </div>
      {list.isLoading ? <p className="state-line">{tr("Loading.")}</p> : list.error ? <ErrorLine error={list.error} onRetry={() => void list.refetch()} /> : items.length === 0 ? <p className="dx-calm">{tr("No tickets.")}</p> : (
        <div className="sp-grid">
          <ul className="pm-list" aria-label={tr("Tickets")} data-testid="live-ticket-list">
            {items.map((item) => (
              <li key={item.ticketId} className={item.ticketId === current?.ticketId ? "selected" : undefined}>
                <button type="button" className="link-action" data-command="admin.ticket.view" onClick={() => setSelected(item.ticketId)}>
                  <b>{item.subject}</b>
                  <small>{categoryLabel(item.category)} · {item.openedBy === "rider" ? tr("Rider") : tr("Driver")} · {tr(STATUS_LABEL[item.status] as Parameters<typeof tr>[0])} · {when(item.updatedAt)}</small>
                </button>
              </li>
            ))}
          </ul>
          {current ? (
            <article className="panel" data-testid="live-ticket">
              <h3>{current.subject}</h3>
              <p className="op-help">
                {categoryLabel(current.category)} · {current.openedBy === "rider" && current.riderId ? <Link to={`/riders/${current.riderId}`}>{tr("Rider")} {current.riderId}</Link> : current.driverId ? <Link to={`/drivers/${current.driverId}`}>{tr("Driver")} {current.driverId}</Link> : null}
                {current.tripId ? <> · <Link to={`/trips/${current.tripId}`}>{current.tripId}</Link></> : null} · {tr(STATUS_LABEL[current.status] as Parameters<typeof tr>[0])}
              </p>
              {detail.error ? <ErrorLine error={detail.error} onRetry={() => void detail.refetch()} /> : null}
              <ol className="op-chat" aria-label={tr("Messages")}>
                {(ticket?.messages ?? []).map((message) => (
                  <li key={message.messageId} className={message.from === "support" ? "driver" : "rider"}>
                    <span>{message.text}</span>
                    <small>{message.from === "support" ? message.adminName ?? tr("Support") : message.from === "rider" ? tr("Rider") : tr("Driver")} · {when(message.at)}</small>
                  </li>
                ))}
              </ol>
              {current.status === "closed" ? <p className="dx-calm">{tr("This ticket is closed.")}</p> : (
                <div className="sp-reply">
                  <label className="field">{tr("Answer")}<textarea aria-label={tr("Answer")} value={text} maxLength={5000} onChange={(event) => setText(event.target.value)} /></label>
                  <label className="field">{tr("Then")}
                    <select aria-label={tr("Ticket status after the answer")} value={after} onChange={(event) => setAfter(event.target.value as typeof after)}>
                      <option value="pending">{tr("Waiting for them")}</option>
                      <option value="resolved">{tr("Solved")}</option>
                      <option value="closed">{tr("Closed")}</option>
                    </select>
                  </label>
                  {error ? <ErrorLine error={error} onRetry={() => setError(null)} /> : null}
                  <button type="button" className="primary-btn" data-command="admin.support.reply" disabled={busy || !text.trim()} onClick={() => void reply()}>{tr("Send answer")}</button>
                </div>
              )}
              <p className="op-help">{tr("Topics, templates and owners")}: {tr("Not connected yet")}</p>
            </article>
          ) : null}
        </div>
      )}
    </div>
  );
}
