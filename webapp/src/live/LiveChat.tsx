import { useState } from "react";
import { Link } from "react-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { tr, uiLocale } from "../i18n";
import { shortDateTime } from "./format";
import { useLiveSession } from "./LiveSessionContext";
import { ErrorLine, Status } from "./ui";
import type { Page, Trip } from "./types";
import { readAdminChats, joinChatPages, chatRowLabel, lastFromText, messageCountText, type AdminChatPage } from "./adminChats";
import { useMarketScope } from "../markets/useMarketScope";
import { zoneFilterOf } from "./zoneFilter";
import { MessageBody } from "./MessageBody";

/**
 * Live builds only (contract v0.13.0 §22, owner "chat only support roles in their zones"): the trip chat between a
 * trip's rider and driver, read and written by support (`support.reply`) for trips in the admin's zones. The server
 * scopes GET /admin/trips to the admin's zones and answers 403 zone_out_of_scope on any other trip's messages. The
 * chat closes for the rider and the driver at drop-off; support may still write. No phone numbers are shown.
 * v0.18.56 §78 (G9-2.16): the list is GET /admin/chats (open trips with messages, newest message first, cursor paging),
 * not the newest 100 trips of any status; a row shows counts, last time, who wrote last and first names, never a text.
 */

/** contract Message (GET|POST /trips/{tripId}/messages). */
/** v0.18.66 §87: one translation the server already keeps for a message (admin reads only). */
export type MessageTranslation = { to: string; text: string };
/** v0.18.66 §87: `translations` comes only on an admin read, oldest first, [] when none. */
export type TripMessage = { messageId: string; tripId: string; from: "rider" | "driver" | "support"; text: string; at: string; translations?: MessageTranslation[] };

/** contract.json#tripStatus.driverAssigned: the statuses the chat is open in. */
export const CHAT_OPEN = ["accepted", "driver_to_pickup", "arrived", "rider_onboard", "in_trip", "approaching_dropoff"] as const;

/** The chat poll while a trip is shown (the admin has no trip event stream). */
const POLL_MS = 5000;

export function chatOpen(status: string): boolean {
  return (CHAT_OPEN as readonly string[]).includes(status);
}

/** Open chats first, then the newest. Only trips that had a driver have a chat. */
export function chatTrips(trips: Trip[]): Trip[] {
  return trips
    .filter((trip) => Boolean(trip.driverId))
    .sort((a, b) => Number(chatOpen(b.status)) - Number(chatOpen(a.status)) || b.updatedAt.localeCompare(a.updatedAt));
}

/** In the admin's language (sv/fr/en locale), like the rest of the live pages. */
function when(iso: string): string {
  return shortDateTime(iso, uiLocale());
}

function sender(from: TripMessage["from"]): string {
  return from === "support" ? tr("Support") : from === "rider" ? tr("Rider") : tr("Driver");
}

export function LiveChat() {
  const { client } = useLiveSession();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // v0.17.2: the trips of the country and zones picked in the top bar.
  const zoneFilter = zoneFilterOf(useMarketScope().effective);
  const zoneQuery = new URLSearchParams(zoneFilter.params).toString();
  const list = useInfiniteQuery({
    queryKey: ["live", "admin-chats", zoneQuery],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => (zoneFilter.denied ? Promise.resolve({ items: [], nextCursor: null } as AdminChatPage) : readAdminChats((path) => client.json<AdminChatPage>(path), zoneFilter.params, pageParam)),
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: POLL_MS * 6,
  });
  const rows = joinChatPages(list.data?.pages ?? []);
  const current = rows.find((row) => row.tripId === selected) ?? rows[0];
  const messages = useQuery({
    queryKey: ["live", "trip-messages", current?.tripId],
    queryFn: () => client.json<Page<TripMessage>>(`/trips/${encodeURIComponent(current!.tripId)}/messages?limit=200`),
    enabled: Boolean(current),
    refetchInterval: POLL_MS,
  });
  async function send() {
    if (!current || busy || !text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await client.post(`/trips/${encodeURIComponent(current.tripId)}/messages`, { text: text.trim() });
      setText("");
      void queryClient.invalidateQueries({ queryKey: ["live", "trip-messages", current.tripId] });
      void queryClient.invalidateQueries({ queryKey: ["live", "admin-chats"] });
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  const items = [...(messages.data?.items ?? [])].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <div className="dx-page sp-page" data-testid="live-chat">
      <header className="dx-head"><div className="dx-head-text"><h2>{tr("Chat")}</h2><p>{tr("Open trip chats between rider and driver in your zones, newest message first. Support can read and write.")}</p></div></header>
      {list.isLoading ? <p className="state-line">{tr("Loading.")}</p> : list.error ? <ErrorLine error={list.error} onRetry={() => void list.refetch()} /> : rows.length === 0 ? <p className="dx-calm">{tr("No trip chats in your zones.")}</p> : (
        <div className="sp-grid">
          <div>
            <ul className="pm-list" aria-label={tr("Trips")} data-testid="live-chat-trips">
              {rows.map((row) => (
                <li key={row.tripId} className={row.tripId === current?.tripId ? "selected" : undefined}>
                  <button type="button" className="link-action" data-command="admin.ticket.view" onClick={() => { setSelected(row.tripId); setError(null); }}>
                    <b>{chatRowLabel(row).title}</b>
                    <small title={row.tripId}>{tr("Trip {0}", [chatRowLabel(row).ref])} · {row.zoneId}</small>
                    <small><Status code={row.status} /> · {messageCountText(row.messageCount)} · {lastFromText(row)} · {when(row.lastMessageAt)}</small>
                  </button>
                </li>
              ))}
            </ul>
            {list.hasNextPage ? <button type="button" className="dash-btn small" data-command="admin.server.loadMore" data-testid="live-chat-more" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{tr("Show more")}</button> : null}
          </div>
          {current ? (
            <article className="panel" data-testid="live-chat-thread">
              <h3 title={current.tripId}>{chatRowLabel(current).title}</h3>
              <p className="op-help">
                <Link to={`/trips/${current.tripId}`}>{tr("Open trip")} ({chatRowLabel(current).ref})</Link>{" · "}{current.zoneId}
              </p>
              {messages.error ? <ErrorLine error={messages.error} onRetry={() => void messages.refetch()} /> : null}
              {messages.isLoading ? <p className="state-line">{tr("Loading.")}</p> : items.length === 0 ? <p className="dx-calm">{tr("No messages yet.")}</p> : (
                <ol className="op-chat" aria-label={tr("Messages")}>
                  {items.map((message) => (
                    <li key={message.messageId} className={message.from === "rider" ? "rider" : "driver"} data-from={message.from}>
                      <MessageBody message={message} />
                      <small>{sender(message.from)} · {when(message.at)}</small>
                    </li>
                  ))}
                </ol>
              )}
              {chatOpen(current.status) ? null : <p className="op-help">{tr("The trip has ended: the rider and the driver can no longer write. Support can still answer.")}</p>}
              <div className="sp-reply">
                <label className="field">{tr("Message as Support")}<textarea aria-label={tr("Message as Support")} value={text} maxLength={2000} onChange={(event) => setText(event.target.value)} /></label>
                {error ? <ErrorLine error={error} onRetry={() => setError(null)} /> : null}
                <button type="button" className="primary-btn" data-command="admin.support.reply" disabled={busy || !text.trim()} onClick={() => void send()}>{tr("Send")}</button>
              </div>
            </article>
          ) : null}
        </div>
      )}
    </div>
  );
}
