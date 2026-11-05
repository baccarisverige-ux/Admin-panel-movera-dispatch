import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { ApiError } from "../api/httpClient";
import { tr } from "../i18n";
import { useLiveSession } from "./LiveSessionContext";
import { ErrorLine } from "./ui";
import { categoryLabel, riderPlacesPath, driverPreferencesPath, type AdminDriverPreferences, type AdminRiderSavedPlaces } from "./emergencyContacts";

/**
 * Owner 2026-11-04 "Read-only on profile" (contract v0.18.26 §47): the rider's saved places and the driver's ride
 * preferences on their admin pages, read-only. Private: read only after Show (the server audits every view).
 */
function ShowBox({ title, testId, permission, button, children }: { title: string; testId: string; permission: string; button: (show: () => void) => React.ReactNode; children: (shown: boolean) => React.ReactNode }) {
  const { can } = useLiveSession();
  const [shown, setShown] = useState(false);
  return (
    <section className="op-section" data-testid={testId}>
      <h3>{title}</h3>
      {!can(permission) ? <p className="op-help">{tr("Your role cannot see this.")}</p>
        : !shown ? (
          <div className="op-locked">
            <Lock size={18} aria-hidden="true" />
            <p>{tr("Private. Each time you show it, it is saved in the audit.")}</p>
            {button(() => setShown(true))}
          </div>
        ) : children(shown)}
    </section>
  );
}

export function LiveRiderSavedPlaces({ riderId }: { riderId: string }) {
  const { client } = useLiveSession();
  return (
    <ShowBox title={tr("Saved places")} testId="rider-saved-places" permission="riders.read" button={(show) => <button type="button" className="dash-btn small" data-command="admin.server.riderSavedPlaces" onClick={show}>{tr("Show")}</button>}>
      {(shown) => <PlacesList riderId={riderId} enabled={shown} read={(path) => client.json<AdminRiderSavedPlaces>(path)} />}
    </ShowBox>
  );
}

function PlacesList({ riderId, enabled, read }: { riderId: string; enabled: boolean; read: (path: string) => Promise<AdminRiderSavedPlaces> }) {
  const q = useQuery({ queryKey: ["live", "rider-saved-places", riderId], queryFn: () => read(riderPlacesPath(riderId)), enabled });
  if (q.isLoading) return <p className="state-line">{tr("Loading.")}</p>;
  if (q.error) return q.error instanceof ApiError && q.error.status === 403 ? <p className="op-help">{tr("Your role cannot see this.")}</p> : <ErrorLine error={q.error} onRetry={() => void q.refetch()} />;
  const items = q.data?.items ?? [];
  if (!items.length) return <p className="op-help">{tr("No saved places.")}</p>;
  return <ul className="op-past">{items.map((p) => <li key={p.placeId}>{p.kind === "home" ? tr("Home") : p.kind === "work" ? tr("Work") : p.label} · {p.place.address}</li>)}</ul>;
}

export function LiveDriverPreferences({ driverId }: { driverId: string }) {
  const { client } = useLiveSession();
  return (
    <ShowBox title={tr("Ride preferences")} testId="driver-preferences" permission="drivers.read" button={(show) => <button type="button" className="dash-btn small" data-command="admin.server.driverPreferences" onClick={show}>{tr("Show")}</button>}>
      {(shown) => <PrefsList driverId={driverId} enabled={shown} read={(path) => client.json<AdminDriverPreferences>(path)} />}
    </ShowBox>
  );
}

function PrefsList({ driverId, enabled, read }: { driverId: string; enabled: boolean; read: (path: string) => Promise<AdminDriverPreferences> }) {
  const q = useQuery({ queryKey: ["live", "driver-preferences", driverId], queryFn: () => read(driverPreferencesPath(driverId)), enabled });
  if (q.isLoading) return <p className="state-line">{tr("Loading.")}</p>;
  if (q.error) return q.error instanceof ApiError && q.error.status === 403 ? <p className="op-help">{tr("Your role cannot see this.")}</p> : <ErrorLine error={q.error} onRetry={() => void q.refetch()} />;
  const off = q.data?.categoriesOff ?? [];
  return <p className="op-help">{off.length ? tr("Switched off by the driver: {0}", [off.map(categoryLabel).join(", ")]) : tr("The driver takes every ride type his car allows.")}</p>;
}
