import { useEffect, useState } from "react";
import { MARKETS, type MarketId } from "../markets/markets";
import { isLargePriceChange } from "../pricing/zonePricing";
import { CommandButton } from "../ui/CommandButton";
import { DEFAULT_REFUND_ABOVE, REFUND_ABOVE_MAX, REFUND_POLICY_KEY, refundPolicyError } from "./refundPolicy";
import { useRefundPolicy } from "./useRefundPolicy";

const SYMBOL: Record<MarketId, string> = { SE: "kr", FR: "€", TN: "DT" };

/**
 * Settings › Refunds (Q25): the one "refund needs a second admin" limit per country. Nothing is saved
 * until Save (Q33); a change of more than 50 % asks "Are you sure?" (Q29).
 */
export function RefundPolicyPanel({ editable, onDirty }: { editable: boolean; onDirty?: (dirty: boolean) => void }) {
  const { policy, loading } = useRefundPolicy();
  const [draft, setDraft] = useState<Record<MarketId, string> | null>(null);
  const [notice, setNotice] = useState("");
  const shown = draft ?? (Object.fromEntries(MARKETS.map((item) => [item.id, String(policy.aboveMajor[item.id])])) as Record<MarketId, string>);
  const values = Object.fromEntries(MARKETS.map((item) => [item.id, shown[item.id].trim() === "" ? Number.NaN : Number(shown[item.id].replace(",", "."))])) as Record<MarketId, number>;
  const dirty = Boolean(draft) && MARKETS.some((item) => values[item.id] !== policy.aboveMajor[item.id]);
  const error = dirty ? refundPolicyError({ draftRev: policy.draftRev, aboveMajor: values }) : null;
  const large = MARKETS.filter((item) => isLargePriceChange(policy.aboveMajor[item.id], values[item.id])).map((item) => `${item.name}: above ${policy.aboveMajor[item.id]} → ${values[item.id]} ${SYMBOL[item.id]}`);
  // A link to Settings#refunds (from Trips, Riders or Team) lands on this panel once it is drawn.
  useEffect(() => {
    if (globalThis.location?.hash === "#refunds") document.getElementById("refunds")?.scrollIntoView({ block: "start" });
  }, []);
  useEffect(() => {
    onDirty?.(dirty);
    return () => onDirty?.(false);
  }, [dirty, onDirty]);
  return (
    <article className="panel" id="refunds" data-testid="refund-policy">
      <h3>Refunds: second admin</h3>
      <p className="state-line">A refund, or a driver pay change, above this amount waits for a second admin. One limit per country, used by Payments, Trips, Riders and the server. Defaults: above {DEFAULT_REFUND_ABOVE.SE} kr, {DEFAULT_REFUND_ABOVE.FR} € and {DEFAULT_REFUND_ABOVE.TN} DT.</p>
      <div className="field-grid">
        {MARKETS.map((item) => (
          <label key={item.id}>
            {item.name}: second admin above ({SYMBOL[item.id]})
            <input
              aria-label={`${item.name} second admin above`}
              inputMode="decimal"
              value={shown[item.id]}
              disabled={!editable || loading}
              max={REFUND_ABOVE_MAX[item.id]}
              onChange={(event) => setDraft({ ...shown, [item.id]: event.target.value })}
            />
          </label>
        ))}
      </div>
      {error ? <p className="pl-warn" role="alert">{error}</p> : null}
      {notice ? <p className="state-line" role="status">{notice}</p> : null}
      <div className="actions">
        <CommandButton
          command="admin.refundPolicy.save"
          className="primary-btn"
          targetId="refund limits"
          confirmTarget={false}
          before={MARKETS.map((item) => `${item.id} ${policy.aboveMajor[item.id]}`).join(", ")}
          after={MARKETS.map((item) => `${item.id} ${values[item.id]}`).join(", ")}
          sliceKey={REFUND_POLICY_KEY}
          value={{ draftRev: policy.draftRev + 1, aboveMajor: values }}
          expectedSliceRev={policy.draftRev}
          disabled={!editable || !dirty || Boolean(error)}
          title={!editable ? "Your role cannot change this." : !dirty ? "No unsaved change." : error ?? undefined}
          largeChanges={large}
          onDone={() => { setDraft(null); setNotice("Refund limits saved. They apply at once."); }}
        >
          Save refund limits
        </CommandButton>
        <button data-command="admin.card.action" type="button" className="secondary-btn" disabled={!draft} onClick={() => setDraft(null)}>Discard</button>
      </div>
    </article>
  );
}
