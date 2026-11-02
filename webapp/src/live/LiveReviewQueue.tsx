import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserSearch } from "lucide-react";
import { tr } from "../i18n";
import { Card } from "../dispatch/fields";
import { useLiveSession } from "./LiveSessionContext";
import { ErrorLine } from "./ui";

/** v0.18.15 GET /admin/reviews/queue (contract.json#reviewRules.queue): people the review rules put up for an admin. */
type Row = { who: "driver" | "rider"; personId: string; name?: string; country?: string; level: "review" | "block"; average: number; count: number; since: string };

export function LiveReviewQueue() {
  const { client, can } = useLiveSession();
  const queryClient = useQueryClient();
  const queue = useQuery({ queryKey: ["live", "reviewQueue"], queryFn: () => client.json<{ items: Row[] }>("/admin/reviews/queue") });
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<unknown>(null);
  async function done(row: Row) {
    const key = `${row.who}:${row.personId}`;
    setBusy(key);
    setError(null);
    try {
      await client.post(`/admin/reviews/queue/${row.who}/${encodeURIComponent(row.personId)}/done`, { note: (note[key] ?? "").trim() });
      void queryClient.invalidateQueries({ queryKey: ["live", "reviewQueue"] });
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy("");
    }
  }
  const items = queue.data?.items ?? [];
  return (
    <Card title={tr("Admin review")} icon={<UserSearch size={15} />} tone="orange" help={tr("People under the review or block line. A blocked account is let back in on the Drivers or Riders page.")}>
      <div data-testid="live-review-queue">
        {queue.isLoading ? <p className="state-line">{tr("Loading.")}</p> : queue.error ? <ErrorLine error={queue.error} onRetry={() => void queue.refetch()} /> : items.length === 0 ? <p className="gr-help">{tr("Nobody to review.")}</p> : (
          <ul className="pm-list">
            {items.map((row) => {
              const key = `${row.who}:${row.personId}`;
              return (
                <li key={key}>
                  <Link to={row.who === "driver" ? `/drivers/${row.personId}` : `/riders/${row.personId}`}>{row.name || row.personId}</Link>
                  {" · "}{row.who === "driver" ? tr("Driver") : tr("Rider")} · {row.average.toFixed(2)} ({row.count}) · {row.level === "block" ? tr("Blocked") : tr("To review")}
                  {can("riders.block") ? (
                    <span className="op-inline">
                      <input aria-label={tr("What was done")} value={note[key] ?? ""} maxLength={500} onChange={(event) => setNote({ ...note, [key]: event.target.value })} />
                      <button type="button" className="dash-btn small" data-command="admin.review.view" disabled={busy === key || !(note[key] ?? "").trim()} onClick={() => void done(row)}>{tr("Done")}</button>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {error ? <ErrorLine error={error} onRetry={() => setError(null)} /> : null}
      </div>
    </Card>
  );
}
