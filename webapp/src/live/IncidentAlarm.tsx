import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { BellRing, Car, Siren, Volume2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUrgentAlarm } from "../dashboard/useAlertSignals";
import { tr } from "../i18n/core";
import { zoneById } from "../markets/markets";
import { applyEvent, connectIncidentFeed, ringing, type FeedMode, type ServerIncident } from "./incidents";
import { useLiveSession } from "./LiveSessionContext";

/**
 * Live builds, on every page: the SOS and car-lost alarm (owner safety part 1, 2026-10-27). The server's incident
 * feed says what is open; the zone's safety admins hear it first and every signed-in admin once nobody took it in
 * 2 minutes. A red bar per case and a repeating alarm until someone takes it; "Turn on alarm sound" until the browser
 * lets the page play sound.
 */
export function IncidentAlarm() {
  const { client } = useLiveSession();
  const queryClient = useQueryClient();
  const [known, setKnown] = useState<Map<string, ServerIncident>>(() => new Map());
  const [mode, setMode] = useState<FeedMode>("connecting");
  useEffect(() => {
    return connectIncidentFeed(
      client,
      (event) => {
        setKnown((current) => applyEvent(current, event));
        // Incidents, Alerts and Dispatch read the list again at once, not at their next 10 s refresh.
        void queryClient.invalidateQueries({ predicate: (query) => (query.queryKey[0] === "records" && query.queryKey[1] === "incidents") || (query.queryKey[0] === "slice" && query.queryKey[1] === "safetyOps") });
      },
      setMode,
    );
  }, [client, queryClient]);
  const open = useMemo(() => ringing(known.values()), [known]);
  const alarm = useUrgentAlarm(open.length > 0);
  return (
    <div className="incident-alarm" data-feed={mode}>
      {!alarm.soundAllowed ? (
        <p className="incident-sound" role="note">
          <Volume2 size={15} aria-hidden="true" /> {tr("The browser plays the SOS alarm only after you allow it.")}
          <button data-command="admin.alarm.sound" type="button" className="dash-btn small danger" onClick={alarm.allowSound}>{tr("Turn on alarm sound")}</button>
        </p>
      ) : null}
      {open.map((incident) => {
        const lost = incident.kind === "driver_silent";
        return (
          <p key={incident.incidentId} className="incident-ring" role="alert" data-kind={incident.kind}>
            {lost ? <Car size={16} aria-hidden="true" /> : <Siren size={16} aria-hidden="true" />}
            <b>{lost ? tr("Car lost") : tr("SOS")}</b>
            <span>
              {zoneById(incident.zoneId ?? "")?.name ?? incident.zoneId} · {incident.incidentId} · {tr("Nobody has taken it yet.")}
              {incident.escalatedAt ? <> <BellRing size={13} aria-hidden="true" /> {tr("Every admin is alerted.")}</> : null}
            </span>
            <Link className="dash-btn small" to={`/incidents?case=${encodeURIComponent(incident.incidentId)}`}>{tr("Open the case")}</Link>
          </p>
        );
      })}
    </div>
  );
}
