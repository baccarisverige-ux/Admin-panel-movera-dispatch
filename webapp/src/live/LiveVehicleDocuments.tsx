import { useQueryClient } from "@tanstack/react-query";
import { tr } from "../i18n";
import type { DemoRecord } from "../api/seed";
import { DocumentsTable } from "./DocumentsTable";
import { useLiveSessionMaybe } from "./LiveSessionContext";

/**
 * Live builds only, on the car page: the car's documents (registration, insurance, the four photos) with Open,
 * Approve (the expiry date typed for a type that expires, owner item 1) and Reject (POST /admin/documents/{id}/review).
 */
export function LiveVehicleDocuments({ record }: { record: DemoRecord }) {
  const live = useLiveSessionMaybe();
  const queryClient = useQueryClient();
  const docs = record.liveVehicleDocs;
  if (!live || !docs) return null;
  return (
    <div data-testid="live-vehicle-documents">
      <DocumentsTable title={tr("Car documents")} required={docs.required} documents={docs.documents} onChanged={() => void queryClient.invalidateQueries({ queryKey: ["records"] })} {...(docs.country ? { country: docs.country } : {})} />
    </div>
  );
}
