import type { MessageKey } from "./en.ts";
import { svA0Symbols } from "./sv/a0-symbols.ts";
import { svA1A } from "./sv/a1-a.ts";
import { svA2BC } from "./sv/a2-b-c.ts";
import { svA3DE } from "./sv/a3-d-e.ts";
import { svA4FL } from "./sv/a4-f-l.ts";
import { svA5MN } from "./sv/a5-m-n.ts";
import { svA6OP } from "./sv/a6-o-p.ts";
import { svA7QR } from "./sv/a7-q-r.ts";
import { svA8S } from "./sv/a8-s.ts";
import { svA9T } from "./sv/a9-t.ts";
import { svA10UZ } from "./sv/a10-u-z.ts";
import { svB1LanguageSwitch } from "./sv/b1-language-switch.ts";
import { svB2PickupPay } from "./sv/b2-pickup-pay.ts";
import { svB3LiveMapPins } from "./sv/b3-live-map-pins.ts";
import { svB4RadarExclusiveReservations } from "./sv/b4-radar-exclusive-reservations.ts";
import { svB5HandlePanel } from "./sv/b5-handle-panel.ts";
import { svB6AddMoneyOfferStatus } from "./sv/b6-add-money-offer-status.ts";
import { svB7SurgeLiveMap } from "./sv/b7-surge-live-map.ts";
import { svB8DriverMoneySupplyDemand } from "./sv/b8-driver-money-supply-demand.ts";
import { svC1ContractV072Part1 } from "./sv/c1-contract-v072-part1.ts";
import { svC1ContractV072Part2 } from "./sv/c1-contract-v072-part2.ts";
import { svC1ContractV072Part3 } from "./sv/c1-contract-v072-part3.ts";
import { svC1ContractV072Part4 } from "./sv/c1-contract-v072-part4.ts";
import { svC2RequestLimits } from "./sv/c2-request-limits.ts";
import { svC3RealAppPreview } from "./sv/c3-real-app-preview.ts";
import { svC4PhoneData } from "./sv/c4-phone-data.ts";
import { svC5AfterTestRules } from "./sv/c5-after-test-rules.ts";
import { svC2RidersPaymentsPayouts } from "./sv/c2-riders-payments-payouts.ts";
import { svC2Job7SmallFixes } from "./sv/c2-job7-small-fixes.ts";
import { svC2ServerAlerts } from "./sv/c2-server-alerts.ts";
import { svC5BookedRideLive } from "./sv/c5-booked-ride-live.ts";
import { svC6InAppCalls } from "./sv/c6-in-app-calls.ts";

/** Swedish. Same keys as en.ts (the compiler checks it); placeholders like {0} are kept, a plural ending may be left out. */
/** Split by area (base job, rule 25) into ./sv/*.ts with no text change; add a key to the area file it belongs to (see the PR note). */
export const sv: Record<MessageKey, string> = {
  ...svA0Symbols,
  ...svA1A,
  ...svA2BC,
  ...svA3DE,
  ...svA4FL,
  ...svA5MN,
  ...svA6OP,
  ...svA7QR,
  ...svA8S,
  ...svA9T,
  ...svA10UZ,
  ...svB1LanguageSwitch,
  ...svB2PickupPay,
  ...svB3LiveMapPins,
  ...svB4RadarExclusiveReservations,
  ...svB5HandlePanel,
  ...svB6AddMoneyOfferStatus,
  ...svB7SurgeLiveMap,
  ...svB8DriverMoneySupplyDemand,
  ...svC1ContractV072Part1,
  ...svC1ContractV072Part2,
  ...svC1ContractV072Part3,
  ...svC1ContractV072Part4,
  ...svC2RequestLimits,
  ...svC3RealAppPreview,
  ...svC4PhoneData,
  ...svC5AfterTestRules,
  ...svC2RidersPaymentsPayouts,
  ...svC2Job7SmallFixes,
  ...svC2ServerAlerts,
  ...svC5BookedRideLive,
  ...svC6InAppCalls,
};
