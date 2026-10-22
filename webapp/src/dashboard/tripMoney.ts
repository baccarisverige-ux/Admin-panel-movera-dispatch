import type { MoneySplit } from "../trips/file.ts";

/**
 * One ride's money for the driver pop-up's Money tab: what the rider pays, what the driver gets
 * (fare share + pickup pay + added money, tips apart) and what Movera keeps or covers.
 * Built on the trip's own split (trips/file.ts moneySplit), so it matches the Trip page;
 * pickup pay is paid by Movera out of its share and is added on top. Every amount is in minor units.
 */
export type TripMoney = {
  riderPays: number;
  /** The driver's share of the fare, after commission and any fleet share, without tips, bonus or pickup pay. */
  fareShare: number;
  pickupPay: number;
  addedMoney: number;
  tip: number;
  /** Fare share + pickup pay + added money (tips are shown apart). */
  driverGets: number;
  fleet: number;
  commission: number;
  /** Movera's result on the ride: negative when it covers more than its commission. */
  moveraKeeps: number;
  covers: boolean;
  estimate: boolean;
};

export function tripMoney(split: MoneySplit, pickupPayMinor: number | null): TripMoney {
  const pickupPay = Math.max(0, Math.round(pickupPayMinor ?? 0));
  const tip = split.tip;
  const addedMoney = split.driverBonus;
  // moneySplit's driverGets already holds the tip and the bonus.
  const fareShare = split.driverGets - tip - addedMoney;
  const driverGets = fareShare + pickupPay + addedMoney;
  const moveraKeeps = split.moveraKeeps - pickupPay;
  return {
    riderPays: split.riderPaid,
    fareShare,
    pickupPay,
    addedMoney,
    tip,
    driverGets,
    fleet: split.fleet,
    commission: split.commission,
    moveraKeeps,
    covers: moveraKeeps < 0,
    estimate: split.state === "estimate",
  };
}
