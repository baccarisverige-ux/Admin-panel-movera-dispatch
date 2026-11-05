import { enA0Symbols } from "./en/a0-symbols.ts";
import { enA1A } from "./en/a1-a.ts";
import { enA2BC } from "./en/a2-b-c.ts";
import { enA3DE } from "./en/a3-d-e.ts";
import { enA4FL } from "./en/a4-f-l.ts";
import { enA5MN } from "./en/a5-m-n.ts";
import { enA6OP } from "./en/a6-o-p.ts";
import { enA7QR } from "./en/a7-q-r.ts";
import { enA8S } from "./en/a8-s.ts";
import { enA9T } from "./en/a9-t.ts";
import { enA10UZ } from "./en/a10-u-z.ts";
import { enB1LanguageSwitch } from "./en/b1-language-switch.ts";
import { enB2PickupPay } from "./en/b2-pickup-pay.ts";
import { enB3LiveMapPins } from "./en/b3-live-map-pins.ts";
import { enB4RadarExclusiveReservations } from "./en/b4-radar-exclusive-reservations.ts";
import { enB5HandlePanel } from "./en/b5-handle-panel.ts";
import { enB6AddMoneyOfferStatus } from "./en/b6-add-money-offer-status.ts";
import { enB7SurgeLiveMap } from "./en/b7-surge-live-map.ts";
import { enB8DriverMoneySupplyDemand } from "./en/b8-driver-money-supply-demand.ts";
import { enC1ContractV072Part1 } from "./en/c1-contract-v072-part1.ts";
import { enC1ContractV072Part2 } from "./en/c1-contract-v072-part2.ts";
import { enC1ContractV072Part3 } from "./en/c1-contract-v072-part3.ts";
import { enC1ContractV072Part4 } from "./en/c1-contract-v072-part4.ts";
import { enC4PhoneData } from "./en/c4-phone-data.ts";

/** English, the source language: every key is the English text itself. Generated from the tr()/trn() calls; fr.ts and sv.ts must have the same keys. */
/** Split by area (base job, rule 25) into ./en/*.ts with no text change; add a key to the area file it belongs to (see the PR note). */
export const en = {
  ...enA0Symbols,
  ...enA1A,
  ...enA2BC,
  ...enA3DE,
  ...enA4FL,
  ...enA5MN,
  ...enA6OP,
  ...enA7QR,
  ...enA8S,
  ...enA9T,
  ...enA10UZ,
  ...enB1LanguageSwitch,
  ...enB2PickupPay,
  ...enB3LiveMapPins,
  ...enB4RadarExclusiveReservations,
  ...enB5HandlePanel,
  ...enB6AddMoneyOfferStatus,
  ...enB7SurgeLiveMap,
  ...enB8DriverMoneySupplyDemand,
  ...enC1ContractV072Part1,
  ...enC1ContractV072Part2,
  ...enC1ContractV072Part3,
  ...enC1ContractV072Part4,
  ...enC4PhoneData,
} as const;

export type MessageKey = keyof typeof en;
