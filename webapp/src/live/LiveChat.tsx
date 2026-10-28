import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tr } from "../i18n";
import { useLiveSession } from "./LiveSessionContext";
import { ErrorLine, Status } from "./ui";
import type { Page, Trip } from "./types";

/**
 * Live builds only (contract v0.13.0 §22, owner "chat only support roles in their zones"): the trip chat between a
 * trip's rider and driver, read and written by support (`support.reply`) for trips in the admin's zones. The server
 * scopes GET /admin/trips to the admin's zones and answers 403 zone_out_of_scope on any other trip's messages. The
 * chat closes for the rider and the driver at drop-off; support may still write. No phone numbers are shown.
 */

/** contract Message (GET|POST /trips/{tripId}/messages). */
export type TripMessage = { messageId: string; tripId: string; from: "rider" | "driver" | "support"; text: string; at: string };

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

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
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
  const list = useQuery({ queryKey: ["live", "chat-trips"], queryFn: () => client.json<Page<Trip>>("/admin/trips?limit=100"), refetchInterval: POLL_MS * 6 });
  const trips = chatTrips(list.data?.items ?? []);
  const current = trips.find((trip) => trip.tripId === selected) ?? trips[0];
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
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  const items = [...(messages.data?.items ?? [])].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <div className="dx-page sp-page" data-testid="live-chat">
      <header className="dx-head"><div className="dx-head-text"><h2>{tr("Chat")}</h2><p>{tr("Trip chats between rider and driver in your zones. Support can read and write; messages are kept 90 days.")}</p></div></header>
      {list.isLoading ? <p className="state-line">{tr("Loading.")}</p> : list.error ? <ErrorLine error={list.error} onRetry={() => void list.refetch()} /> : trips.length === 0 ? <p className="dx-calm">{tr("No trip chats in your zones.")}</p> : (
        <div className="sp-grid">
          <ul className="pm-list" aria-label={tr("Trips")} data-testid="live-chat-trips">
            {trips.map((trip) => (
              <li key={trip.tripId} className={trip.tripId === current?.tripId ? "selected" : undefined}>
                <button type="button" className="link-action" data-command="admin.ticket.view" onClick={() => { setSelected(trip.tripId); setError(null); }}>
                  <b>{trip.tripId}</b>
                  <small>{trip.pickup.address} → {trip.dropoff.address}</small>
                  <small><Status code={trip.status} /> · {chatOpen(trip.status) ? tr("Chat open") : tr("Chat closed for rider and driver")} · {when(trip.updatedAt)}</small>
                </button>
              </li>
            ))}
          </ul>
          {current ? (
            <article className="panel" data-testid="live-chat-thread">
              <h3>{current.tripId}</h3>
              <p className="op-help">
                <Link to={`/trips/${current.tripId}`}>{tr("Open trip")}</Link> · <Link to={`/riders/${current.riderId}`}>{tr("Rider")} {current.riderId}</Link>
                {current.driverId ? <> · <Link to={`/drivers/${current.driverId}`}>{tr("Driver")} {current.driver?.firstName ?? current.driverId}</Link></> : null}
                {" · "}{current.zoneId}
              </p>
              {messages.error ? <ErrorLine error={messages.error} onRetry={() => void messages.refetch()} /> : null}
              {messages.isLoading ? <p className="state-line">{tr("Loading.")}</p> : items.length === 0 ? <p className="dx-calm">{tr("No messages yet.")}</p> : (
                <ol className="op-chat" aria-label={tr("Messages")}>
                  {items.map((message) => (
                    <li key={message.messageId} className={message.from === "rider" ? "rider" : "driver"} data-from={message.from}>
                      <span>{message.text}</span>
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
