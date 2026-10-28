import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tr } from "../i18n";
import { DocumentsTable } from "./DocumentsTable";
import { useLiveSession, useLiveSessionMaybe } from "./LiveSessionContext";
import { requiredFor, splitDocuments } from "./format";
import { ErrorLine } from "./ui";
import type { Driver } from "./types";

/**
 * Live builds only, on the demo driver page's Documents tab: the files the driver uploaded (GET /admin/drivers/{id}),
 * Open (the file through the bearer token), Approve and Reject (POST /admin/documents/{id}/review).
 */
export function LiveDriverDocuments({ driverId }: { driverId: string }) {
  const live = useLiveSessionMaybe();
  if (!live) return null;
  return <Documents driverId={driverId} />;
}

function Documents({ driverId }: { driverId: string }) {
  const { client } = useLiveSession();
  const queryClient = useQueryClient();
  const key = ["live", "driver", driverId];
  const query = useQuery({ queryKey: key, queryFn: () => client.json<Driver>(`/admin/drivers/${encodeURIComponent(driverId)}`), enabled: Boolean(driverId) });
  const changed = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: ["records"] });
    void queryClient.invalidateQueries({ queryKey: ["live", "onboarding"] });
  };
  if (query.isLoading) return <p className="state-line">{tr("Loading driver.")}</p>;
  if (query.error || !query.data) return <ErrorLine error={query.error ?? new Error(tr("Something failed."))} onRetry={() => void query.refetch()} />;
  const driver = query.data;
  const required = requiredFor(driver);
  const split = splitDocuments(driver.documents, required);
  return (
    <div data-testid="live-documents">
      <DocumentsTable title={tr("Uploaded files")} required={required.person} documents={split.person} onChanged={changed} />
      {driver.accountType === "fleet" ? <DocumentsTable title={tr("Company documents")} required={required.company} documents={split.company} onChanged={changed} /> : null}
    </div>
  );
}
