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
  if (split.live) return liveTripMoney(split);
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

/**
 * S5 J5a (contract moneyBase.commission, v0.18.82): a live trip shows only the server's numbers. The server's commission
 * and Movera's part of who-gets-what already have pickup pay and bonuses taken off, and the driver's total already holds
 * them, so nothing is added or taken off here (before: the pop-up's own pickup estimate was taken off Movera again).
 */
function liveTripMoney(split: MoneySplit): TripMoney {
  const facts = split.live!;
  const pickupPay = facts.pickupPay ?? 0;
  const addedMoney = facts.driverBonus ?? 0;
  const tip = Number.isFinite(split.tip) ? split.tip : 0;
  // Who-gets-what: the driver's total minus the tip; an older server: the driver's lines.
  const driverGets = facts.split ? split.driverGets - tip : (facts.driverEarnings ?? NaN) + pickupPay + addedMoney;
  return {
    riderPays: split.riderPaid,
    fareShare: driverGets - pickupPay - addedMoney,
    pickupPay,
    addedMoney,
    tip,
    driverGets,
    fleet: Number.isFinite(split.fleet) ? split.fleet : 0,
    commission: split.commission,
    moveraKeeps: split.moveraKeeps,
    covers: split.moveraKeeps < 0,
    estimate: split.state === "estimate",
  };
}
