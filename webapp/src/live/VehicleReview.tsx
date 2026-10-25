import { useState } from "react";
import { tr, trn, type MessageKey } from "../i18n";
import { useLiveSession } from "./LiveSessionContext";
import { DecisionDialog, Status, isVersionMismatch } from "./ui";
import type { ReviewStatus, Vehicle } from "./types";

export type ReviewDecision = Exclude<ReviewStatus, "pending">;

export const REVIEW_ACTIONS: readonly { to: ReviewDecision; label: MessageKey; danger: boolean }[] = [
  { to: "approved", label: "Approve", danger: false },
  { to: "rejected", label: "Reject", danger: true },
  { to: "blocked", label: "Block", danger: true },
];

export function vehicleLabel(vehicle: Pick<Vehicle, "make" | "model" | "year" | "plate">): string {
  return `${vehicle.make} ${vehicle.model} ${vehicle.year} · ${vehicle.plate}`;
}

/**
 * Approve / Reject / Block one car: POST /api/v1/admin/vehicles/{vehicleId}/review { expectedVersion, decision, note? }
 * (vehicles.edit). A block asks for a note; a 409 version_mismatch reloads the owner and says so.
 */
export function VehicleReviewButtons({ vehicle, onChanged, onStale }: { vehicle: Vehicle; onChanged: (next: Vehicle) => void; onStale: () => void }) {
  const { client, can } = useLiveSession();
  const [action, setAction] = useState<(typeof REVIEW_ACTIONS)[number] | null>(null);
  if (!can("vehicles.edit")) return null;
  const available = REVIEW_ACTIONS.filter((item) => item.to !== vehicle.status);
  return (
    <>
      {available.map((item) => (
        <button key={item.to} data-command="admin.server.vehicleReview" type="button" className={item.danger ? "link-action live-danger-link" : "link-action"} onClick={() => setAction(item)}>
          {tr(item.label)}
        </button>
      ))}
      <DecisionDialog
        open={Boolean(action)}
        title={tr("Decide vehicle")}
        summary={action ? trn("{0}: {1} → {2}.", <strong>{vehicleLabel(vehicle)}</strong>, <Status code={vehicle.status} />, <Status code={action.to} />) : null}
        confirmLabel={action ? tr(action.label) : ""}
        note={action?.to === "blocked" ? "required" : "optional"}
        danger={Boolean(action?.danger)}
        onClose={() => setAction(null)}
        onConfirm={async ({ note }) => {
          if (!action) return;
          try {
            const next = await client.post<Vehicle>(`/admin/vehicles/${encodeURIComponent(vehicle.vehicleId)}/review`, { expectedVersion: vehicle.version, decision: action.to, ...(note ? { note } : {}) });
            onChanged(next);
          } catch (error) {
            if (isVersionMismatch(error)) onStale();
            throw error;
          }
        }}
      />
    </>
  );
}
