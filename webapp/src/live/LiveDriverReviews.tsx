import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareQuote } from "lucide-react";
import { tr } from "../i18n";
import { Card } from "../dispatch/fields";
import { useLiveSession } from "./LiveSessionContext";
import { ErrorLine } from "./ui";
import { driverReviewsPath, moderatePath, reviewLine, type AdminDriverReview, type DriverReviewStatus } from "./driverReviews";

/** v0.18.147 Reviews › Driver reviews: approve or hide each short review (shown on the profile only after approval). */
export function LiveDriverReviews() {
  const { client, can } = useLiveSession();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<DriverReviewStatus>("pending");
  const list = useQuery({ queryKey: ["live", "driverReviews", status], queryFn: () => client.json<{ items: AdminDriverReview[]; nextCursor: string | null }>(driverReviewsPath(status, null)) });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<unknown>(null);
  async function moderate(id: string, approve: boolean) {
    setBusy(id);
    setError(null);
    try {
      await client.post(moderatePath(id, approve), {});
      void queryClient.invalidateQueries({ queryKey: ["live", "driverReviews"] });
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy("");
    }
  }
  const items = (list.data?.items ?? []).map((r) => ({ ...reviewLine(r), driverId: r.driverId }));
  const editable = can("settings.publish");
  return (
    <Card title={tr("Driver reviews")} icon={<MessageSquareQuote size={15} />} tone="blue" help={tr("Short reviews riders wrote about a driver. A review shows on the driver's profile only after you approve it. Reviews under 4 stars are never kept. No rider details are shown: only the first name the rider allowed, or Anonymous.")}>
      <div data-testid="live-driver-reviews">
        <div className="seg" role="tablist">
          {(["pending", "approved", "hidden"] as const).map((s) => (
            <button key={s} type="button" role="tab" aria-selected={status === s} className={status === s ? "active" : undefined} data-command="admin.review.view" onClick={() => setStatus(s)}>
              {s === "pending" ? tr("Waiting") : s === "approved" ? tr("Approved") : tr("Hidden")}
            </button>
          ))}
        </div>
        {list.isLoading ? <p className="state-line">{tr("Loading.")}</p> : list.error ? <ErrorLine error={list.error} onRetry={() => void list.refetch()} /> : items.length === 0 ? <p className="gr-help">{tr("No reviews here.")}</p> : (
          <ul className="pm-list">
            {items.map((r) => (
              <li key={r.id}>
                <Link to={`/drivers/${r.driverId}`}>{r.driver}</Link>
                {" · "}{"★".repeat(r.stars)} · {r.month} · {r.by ?? tr("Anonymous")}
                <div>“{r.text}”</div>
                {editable ? (
                  <span className="op-inline">
                    {r.status !== "approved" ? <button type="button" className="dash-btn small" data-command="admin.review.driverReview" disabled={busy === r.id} onClick={() => void moderate(r.id, true)}>{tr("Approve")}</button> : null}
                    {r.status !== "hidden" ? <button type="button" className="dash-btn small" data-command="admin.review.driverReview" disabled={busy === r.id} onClick={() => void moderate(r.id, false)}>{tr("Hide")}</button> : null}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {error ? <ErrorLine error={error} onRetry={() => setError(null)} /> : null}
      </div>
    </Card>
  );
}
