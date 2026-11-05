import type { MessageKey } from "./en.ts";
import { frA0Symbols } from "./fr/a0-symbols.ts";
import { frA1A } from "./fr/a1-a.ts";
import { frA2BC } from "./fr/a2-b-c.ts";
import { frA3DE } from "./fr/a3-d-e.ts";
import { frA4FL } from "./fr/a4-f-l.ts";
import { frA5MN } from "./fr/a5-m-n.ts";
import { frA6OP } from "./fr/a6-o-p.ts";
import { frA7QR } from "./fr/a7-q-r.ts";
import { frA8S } from "./fr/a8-s.ts";
import { frA9T } from "./fr/a9-t.ts";
import { frA10UZ } from "./fr/a10-u-z.ts";
import { frB1LanguageSwitch } from "./fr/b1-language-switch.ts";
import { frB2PickupPay } from "./fr/b2-pickup-pay.ts";
import { frB3LiveMapPins } from "./fr/b3-live-map-pins.ts";
import { frB4RadarExclusiveReservations } from "./fr/b4-radar-exclusive-reservations.ts";
import { frB5HandlePanel } from "./fr/b5-handle-panel.ts";
import { frB6AddMoneyOfferStatus } from "./fr/b6-add-money-offer-status.ts";
import { frB7SurgeLiveMap } from "./fr/b7-surge-live-map.ts";
import { frB8DriverMoneySupplyDemand } from "./fr/b8-driver-money-supply-demand.ts";
import { frC1ContractV072Part1 } from "./fr/c1-contract-v072-part1.ts";
import { frC1ContractV072Part2 } from "./fr/c1-contract-v072-part2.ts";
import { frC1ContractV072Part3 } from "./fr/c1-contract-v072-part3.ts";
import { frC1ContractV072Part4 } from "./fr/c1-contract-v072-part4.ts";
import { frC2RequestLimits } from "./fr/c2-request-limits.ts";
import { frC3RealAppPreview } from "./fr/c3-real-app-preview.ts";
import { frC4PhoneData } from "./fr/c4-phone-data.ts";
import { frC5AfterTestRules } from "./fr/c5-after-test-rules.ts";

/** French. Same keys as en.ts (the compiler checks it); placeholders like {0} are kept, a plural ending may be left out. */
/** Split by area (base job, rule 25) into ./fr/*.ts with no text change; add a key to the area file it belongs to (see the PR note). */
export const fr: Record<MessageKey, string> = {
  ...frA0Symbols,
  ...frA1A,
  ...frA2BC,
  ...frA3DE,
  ...frA4FL,
  ...frA5MN,
  ...frA6OP,
  ...frA7QR,
  ...frA8S,
  ...frA9T,
  ...frA10UZ,
  ...frB1LanguageSwitch,
  ...frB2PickupPay,
  ...frB3LiveMapPins,
  ...frB4RadarExclusiveReservations,
  ...frB5HandlePanel,
  ...frB6AddMoneyOfferStatus,
  ...frB7SurgeLiveMap,
  ...frB8DriverMoneySupplyDemand,
  ...frC1ContractV072Part1,
  ...frC1ContractV072Part2,
  ...frC1ContractV072Part3,
  ...frC1ContractV072Part4,
  ...frC2RequestLimits,
  ...frC3RealAppPreview,
  ...frC4PhoneData,
  ...frC5AfterTestRules,
};
