/**
 * The words of the payout lines (contract.json#payouts.lines, PayoutLine.code), moved out of LivePayouts.tsx so a test
 * can read them. S5 J9 (v0.18.84 debtModel.driverOwes.paidMovera): paid_to_movera = money the driver paid Movera
 * another way ("Driver paid Movera"), contract texts.paidMoveraLabel. An unknown code shows as it is.
 */
import { tr } from "../i18n/index.ts";

export const PAYOUT_LINE_LABEL: Record<string, string> = {
  trips: "Trips",
  waiting: "Waiting",
  pickup_pay: "Pickup pay",
  bonus: "Bonus",
  tips: "Tips",
  cash_collected: "Cash collected",
  fees: "Cancel and no-show fees",
  paid_to_movera: "Paid to Movera",
  // v0.18.133 review S2 (contract.json#payoutLines.lines): a switched-on payout's stored lines carry the rest taken
  // from the last payout (minus) and the rest moved to the next one (plus), so the lines add up to the amount.
  carried_in: "Moved from last week",
  carried_out: "Moves to next week",
};

export function payoutLineLabel(code: string): string {
  const label = PAYOUT_LINE_LABEL[code];
  return label ? tr(label as Parameters<typeof tr>[0]) : code;
}
