import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock, Phone } from "lucide-react";
import { ApiError } from "../api/httpClient";
import { tr } from "../i18n";
import { useLiveSession } from "./LiveSessionContext";
import { ErrorLine } from "./ui";
import { readEmergencyContacts, type EmergencyContact, type IncidentEmergencyContacts } from "./emergencyContacts";

/**
 * BASE B13 (owner 2026-11-03 "Phone-only data: Yes, all to server"; contract v0.18.26 §47): a safety case shows the
 * driver's own emergency contacts, read-only. Private: read only when the admin presses Show (the server audits it).
 */
export function LiveEmergencyContacts({ incidentId, hasDriver, hasRider = false, open }: { incidentId: string; hasDriver: boolean; hasRider?: boolean; open: boolean }) {
  const { client, can } = useLiveSession();
  const [shown, setShown] = useState(false);
  const allowed = can("incidents.read");
  const contacts = useQuery({
    queryKey: ["live", "incident-emergency-contacts", incidentId],
    queryFn: () => readEmergencyContacts((path) => client.json<IncidentEmergencyContacts>(path), incidentId),
    enabled: shown && allowed && (hasDriver || hasRider) && open,
  });
  const refused = contacts.error instanceof ApiError && contacts.error.status === 403;
  const items = contacts.data?.items ?? [];
  return (
    <div data-testid="incident-emergency-contacts">
      <h4 className="op-sub"><Phone size={13} aria-hidden="true" /> {tr("Driver's emergency contacts")}</h4>
      {!hasDriver && !hasRider ? <p className="op-help">{tr("No driver on this case.")}</p>
        : !open ? <p className="op-help">{tr("Emergency contacts are shown only while the safety case is open.")}</p>
        : !allowed || refused ? <p className="op-help">{tr("Your role cannot see emergency contacts.")}</p>
        : !shown ? (
          <div className="op-locked">
            <Lock size={18} aria-hidden="true" />
            <p>{tr("Emergency contacts are private. Each time you show them it is saved in the audit.")}</p>
            <button type="button" className="dash-btn small" data-command="admin.server.emergencyContacts" onClick={() => setShown(true)}>{tr("Show contacts")}</button>
          </div>
        )
        : contacts.isLoading ? <p className="state-line">{tr("Loading.")}</p>
        : contacts.error ? <ErrorLine error={contacts.error} onRetry={() => void contacts.refetch()} />
        : (
          <>
            {items.length === 0 ? <p className="op-help">{tr("The driver has not added emergency contacts.")}</p> : <ContactList items={items} testId="incident-emergency-contacts-list" />}
            {contacts.data?.rider ? (
              <>
                <h4 className="op-sub"><Phone size={13} aria-hidden="true" /> {tr("Rider's emergency contacts")}</h4>
                {contacts.data.rider.items.length === 0 ? <p className="op-help">{tr("The rider has not added emergency contacts.")}</p> : <ContactList items={contacts.data.rider.items} testId="incident-rider-emergency-contacts" />}
              </>
            ) : null}
          </>
        )}
    </div>
  );
}

function ContactList({ items, testId }: { items: EmergencyContact[]; testId: string }) {
  return (
    <ul className="op-past" data-testid={testId}>
      {items.map((contact, index) => (
        <li key={`${contact.phone}-${index}`}>{contact.name}{contact.relation ? ` · ${contact.relation}` : ""} · <a href={`tel:${contact.phone}`}>{contact.phone}</a></li>
      ))}
    </ul>
  );
}
