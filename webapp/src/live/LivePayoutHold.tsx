import { PauseCircle } from "lucide-react";
import { CommandButton } from "../ui/CommandButton";
import { tr, uiLocale } from "../i18n/core";
import { shortDate } from "./format";
import { useLiveSessionMaybe } from "./LiveSessionContext";

/**
 * v0.18.16 A2 (owner build-spec Q4, contract.json#payoutHold): pause or release this driver's scheduled payouts from
 * his profile, always with a reason. POST /admin/drivers/{driverId}/payout-hold (finance.edit).
 */
export function LivePayoutHold({ driverId, hold }: { driverId: string; hold: { reason: string; at: string } | null }) {
  const session = useLiveSessionMaybe();
  const canEdit = session?.can("finance.edit") ?? false;
  return (
    <section className="fd-box" data-testid="payout-hold">
      <h3><PauseCircle size={15} aria-hidden="true" /> {tr("Payouts")}</h3>
      <p data-testid="payout-hold-state">{hold ? <><strong>{tr("Payouts paused")}</strong> · {hold.reason} · {shortDate(hold.at, uiLocale())}</> : tr("Payouts run on the country's schedule.")}</p>
      <CommandButton
        command="admin.driver.payoutHold"
        className={hold ? "dash-btn" : "dash-btn ghost"}
        targetId={driverId}
        before={hold ? tr("Payouts paused") : tr("On schedule")}
        after={hold ? tr("On schedule") : tr("Payouts paused")}
        value={{ held: !hold }}
        disabled={!canEdit}
      >
        {hold ? tr("Release payouts") : tr("Pause payouts")}
      </CommandButton>
    </section>
  );
}
