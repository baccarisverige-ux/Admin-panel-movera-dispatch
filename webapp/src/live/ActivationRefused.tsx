import { AlertTriangle } from "lucide-react";
import { ApiError } from "../api/httpClient";
import { tr } from "../i18n";
import { DOCUMENTS_NOT_APPROVED, groupMissing } from "./activation";
import { documentTypeName } from "./format";

/** The missing items of a 409 documents_not_approved, or null for any other error. */
export function refusedDetails(error: unknown): string[] | null {
  if (!(error instanceof ApiError) || error.status !== 409 || (error.code as string) !== DOCUMENTS_NOT_APPROVED) return null;
  return [...error.details];
}

/**
 * Contract v0.10.1: the server refused Activate because required documents are not approved. Lists them grouped as
 * Driver / Company / Car with the contract's document names in the panel's language.
 */
export function ActivationRefused({ details, country }: { details: readonly string[]; country?: string }) {
  const groups = groupMissing(details);
  const sections = [
    { id: "driver", title: tr("Driver"), types: groups.driver },
    { id: "fleet", title: tr("Company"), types: groups.fleet },
    { id: "vehicle", title: tr("Car"), types: groups.vehicle },
  ].filter((section) => section.types.length > 0);
  return (
    <div className="fd-banner amber live-activation-refused" role="alert" data-testid="activation-refused">
      <p><AlertTriangle size={16} aria-hidden="true" /> <strong>{tr("The account can't be activated yet.")}</strong> {tr("Every required document must be approved first. Still missing or not approved:")}</p>
      {sections.length === 0 ? <p>{tr("The server did not say which documents.")}</p> : sections.map((section) => (
        <div key={section.id} data-missing-scope={section.id}>
          <strong>{section.title}</strong>
          <ul>{section.types.map((type) => <li key={type} data-document-type={type}>{documentTypeName(type, undefined, country)}</li>)}</ul>
        </div>
      ))}
    </div>
  );
}

/** A car whose required documents are not all approved: nobody can pick or drive it. */
export function VehicleBlocked({ missing, country }: { missing: readonly string[] | undefined; country?: string }) {
  if (!missing?.length) return null;
  return (
    <p className="live-vehicle-blocked" data-testid="vehicle-blocked">
      <AlertTriangle size={14} aria-hidden="true" /> <strong>{tr("Can't be driven – documents missing")}</strong>{" "}
      {tr("Upload and approve:")} {missing.map((type) => documentTypeName(type, undefined, country)).join(", ")}
    </p>
  );
}
