import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserX } from "lucide-react";
import { tr, uiLocale } from "../i18n";
import { shortDateTime } from "./format";
import { useLiveSessionMaybe } from "./LiveSessionContext";
import { ErrorLine } from "./ui";
import { blockPairCall, blockedPairsKey, pairByText, readBlockedPairs, unblockPath, type BlockedPair, type PairPerson } from "./blockedPairs.ts";

/**
 * v0.18.40 §64 (fix job 10; owner G16 Q16-4, G15 "Never told", "No, only Support"). Trip page: Block this pair.
 * Rider and driver pages: Blocked pairs with Undo. Neither side is ever told; only Support (riders.block) undoes.
 */
export function LiveBlockPair({ tripId, hasDriver }: { tripId: string; hasDriver: boolean }) {
  const live = useLiveSessionMaybe();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  if (!live || !hasDriver) return null;
  const canEdit = live.can("riders.block");
  async function block() {
    setState("saving");
    try {
      const call = blockPairCall(tripId, reason);
      await live!.client.post(call.path, call.body);
      await queryClient.invalidateQueries({ queryKey: ["live", "blocked-pairs"] });
      setState("saved");
    } catch {
      setState("failed");
    }
  }
  return (
    <section className="fd-card" data-testid="block-pair">
      <h4><UserX size={14} aria-hidden="true" /> {tr("Block this pair")}</h4>
      <p className="fine">{tr("Never match this rider and driver again")}. {tr("Neither side is ever told. Only Support can undo a block.")}</p>
      <div className="fd-action-row">
        <label className="fd-reason"><span>{tr("Reason")}</span><input type="text" maxLength={300} aria-label={tr("Reason")} value={reason} disabled={!canEdit} onChange={(event) => { setReason(event.target.value); setState("idle"); }} /></label>
        <button type="button" className="dash-btn danger" data-command="admin.rider.block" disabled={!canEdit || state === "saving"} title={canEdit ? undefined : tr("Your role cannot change this.")} onClick={() => void block()}>{tr("Block this pair")}</button>
      </div>
      {state === "saved" ? <p role="status">{tr("Pair blocked. Neither side is told.")}</p> : null}
      {state === "failed" ? <p role="alert" className="pl-warn">{tr("Could not save. Try again.")}</p> : null}
    </section>
  );
}

export function LiveBlockedPairs({ person, nameOf }: { person: PairPerson; nameOf?: (pair: BlockedPair) => string }) {
  const live = useLiveSessionMaybe();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState("");
  const allowed = live?.can("riders.read") ?? false;
  const pairs = useQuery({
    queryKey: blockedPairsKey(person),
    queryFn: () => readBlockedPairs((path) => live!.client.json<{ items: BlockedPair[] }>(path), person),
    enabled: Boolean(live) && allowed,
  });
  if (!live || !allowed) return null;
  const canEdit = live.can("riders.block");
  async function undo(pairId: string) {
    try {
      await live!.client.del(unblockPath(pairId));
      setNotice(tr("Block removed."));
      await queryClient.invalidateQueries({ queryKey: ["live", "blocked-pairs"] });
    } catch {
      setNotice(tr("Could not save. Try again."));
    }
  }
  const other = (pair: BlockedPair) => nameOf?.(pair) ?? ("riderId" in person ? `${tr("Driver")} · ${pair.driverId}` : `${tr("Rider")} · ${pair.riderId}`);
  return (
    <section className="fd-card" data-testid="blocked-pairs">
      <h4><UserX size={14} aria-hidden="true" /> {tr("Blocked pairs")}</h4>
      {pairs.isLoading ? <p className="state-line">{tr("Loading.")}</p>
        : pairs.error ? <ErrorLine error={pairs.error} onRetry={() => void pairs.refetch()} />
        : !pairs.data?.length ? <p className="dx-calm">{tr("No blocked pairs.")}</p>
        : (
          <ul className="op-calls" aria-label={tr("Blocked pairs")}>
            {pairs.data.map((pair) => (
              <li key={pair.pairId} className="missed">
                <UserX size={14} aria-hidden="true" />
                <span><b>{other(pair)}</b><small>{pairByText(pair.by)} · {shortDateTime(pair.at, uiLocale())}{pair.reason ? ` · ${pair.reason}` : ""}</small></span>
                <button type="button" className="dash-btn small ghost" data-command="admin.rider.unblock" disabled={!canEdit} title={canEdit ? undefined : tr("Your role cannot change this.")} onClick={() => void undo(pair.pairId)}>{tr("Undo")}</button>
              </li>
            ))}
          </ul>
        )}
      <p className="op-help">{tr("Neither side is ever told. Only Support can undo a block.")}</p>
      {notice ? <p role="status">{notice}</p> : null}
    </section>
  );
}
