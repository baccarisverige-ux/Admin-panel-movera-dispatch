import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock, Phone, PhoneMissed } from "lucide-react";
import { callLogLine, readTripCalls, type CallView } from "./tripCalls";
import { ApiError } from "../api/httpClient";
import { tr, trn, uiLocale } from "../i18n";
import { shortDateTime } from "./format";
import { useLiveSession } from "./LiveSessionContext";
import { ErrorLine } from "./ui";
import type { Page } from "./types";
import type { TripMessage } from "./LiveChat";
import { readTripMessages } from "./tripChat";

/**
 * v0.18.5 (owner G9: "Never store messages between rider or driver in driver app or rider app !!!!!!' Only admin
 * panel inside the ride details"): the trip details page shows the rider–driver chat of the trip, finished,
 * cancelled or still running, from the server (GET /trips/{tripId}/messages; admins keep it 90 days). Private: it is
 * read only when the admin presses Show messages. v0.18.38 §62 (fix job 8): the in-app calls of the trip from
 * GET /admin/trips/{tripId}/calls (trips.read): who called whom, when, how long, how it ended.
 */
export function LiveTripChat({ tripId, hadDriver, riderName, driverName }: { tripId: string; hadDriver: boolean; riderName: string; driverName: string }) {
  const { client, can } = useLiveSession();
  const [shown, setShown] = useState(false);
  const allowed = can("support.reply");
  const messages = useQuery({
    queryKey: ["live", "trip-chat", tripId],
    queryFn: () => readTripMessages((path) => client.json<Page<TripMessage>>(path), tripId),
    enabled: shown && allowed && hadDriver,
  });
  const callsAllowed = can("trips.read");
  const calls = useQuery({
    queryKey: ["live", "trip-calls", tripId],
    queryFn: () => readTripCalls((path) => client.json<{ items: CallView[] }>(path), tripId),
    enabled: callsAllowed && hadDriver,
  });
  const sender = (from: TripMessage["from"]) => (from === "rider" ? riderName : from === "driver" ? driverName : tr("Support"));
  const refused = messages.error instanceof ApiError && messages.error.status === 403;
  const items = messages.data ?? [];
  return (
    <div className="op-chat-grid" data-testid="trip-chat">
      <div>
        <h4 className="op-sub">{tr("Calls (in the app)")}</h4>
        {!hadDriver ? <p className="dx-calm" data-testid="trip-calls">{tr("No driver was assigned, so there were no calls.")}</p>
          : !callsAllowed ? <p className="dx-calm" data-testid="trip-calls">{tr("Your role cannot see the call log.")}</p>
          : calls.isLoading ? <p className="state-line">{tr("Loading.")}</p>
          : calls.error ? <ErrorLine error={calls.error} onRetry={() => void calls.refetch()} />
          : !calls.data?.length ? <p className="dx-calm" data-testid="trip-calls">{tr("No calls on this trip.")}</p>
          : (
            <ul className="op-calls" aria-label={tr("Calls between rider and driver")} data-testid="trip-calls">
              {calls.data.map((call) => {
                const line = callLogLine(call, riderName, driverName);
                return (
                  <li key={call.callId} className={line.answered ? "ok" : "missed"}>
                    {line.answered ? <Phone size={14} aria-hidden="true" /> : <PhoneMissed size={14} aria-hidden="true" />}
                    <span><b>{line.who}</b><small>{shortDateTime(call.startedAt, uiLocale())} · {line.detail}</small></span>
                  </li>
                );
              })}
            </ul>
          )}
        <p className="op-help">{tr("Calls in the app: rider and driver never see each other's number. Calls are not recorded.")}</p>
      </div>
      <div>
        <h4 className="op-sub">{trn("Messages in the app {0}", shown && items.length ? <span className="dx-count">{items.length}</span> : null)}</h4>
        {!hadDriver ? <p className="dx-calm">{tr("No driver was assigned, so there was no chat.")}</p>
          : !allowed ? <div className="op-locked"><Lock size={18} aria-hidden="true" /><p>{tr("Your role cannot see messages between riders and drivers.")}</p></div>
          : !shown ? (
            <div className="op-locked">
              <Lock size={18} aria-hidden="true" />
              <p>{tr("Messages are private. Show them only when you need them, for example for a complaint.")}</p>
              <button type="button" className="dash-btn small" data-command="admin.server.tripChat" onClick={() => setShown(true)}>{tr("Show messages")}</button>
            </div>
          )
          : messages.isLoading ? <p className="state-line">{tr("Loading.")}</p>
          : refused ? <p className="dx-calm">{tr("Your role cannot see messages between riders and drivers.")}</p>
          : messages.error ? <ErrorLine error={messages.error} onRetry={() => void messages.refetch()} />
          : items.length === 0 ? <p className="dx-calm">{tr("No messages on this trip.")}</p>
          : (
            <ol className="op-chat" aria-label={tr("Messages between rider and driver")} data-testid="trip-chat-messages">
              {items.map((message) => (
                <li key={message.messageId} className={message.from === "rider" ? "rider" : "driver"} data-from={message.from}>
                  <span>{message.text}</span>
                  <small>{sender(message.from)} · {shortDateTime(message.at, uiLocale())}</small>
                </li>
              ))}
            </ol>
          )}
        {shown && allowed ? <p className="op-help">{tr("Kept 90 days, only for admins. The rider and driver apps keep no copy after the trip.")}</p> : null}
      </div>
    </div>
  );
}
