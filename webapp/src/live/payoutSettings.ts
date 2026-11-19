/** v0.18.29 A2 (fix job 0) (owner Q4, contract.json#payoutMode + payouts.schedule): the payout settings of a country Standard. */
export type PayoutMode = "automatic" | "manual";
export type PayoutScheduleValue = { frequency: "weekly" | "every_2_weeks"; day: string; time: string };
export const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export const DEFAULT_SCHEDULE: PayoutScheduleValue = { frequency: "weekly", day: "monday", time: "08:00" };

/**
 * v0.18.133 (contract.json#payoutLines.switch, owner 2026-11-19 "switch on after the Monday payout check"):
 * CountryRules.payoutLinesOn, default off: payouts show Earned / Owed to Movera / Paid out and a week below zero moves on.
 */
export function payoutSettingsOf(document: Record<string, unknown> | null | undefined): { mode: PayoutMode; schedule: PayoutScheduleValue; linesOn: boolean } {
  const raw = (document?.["payoutSchedule"] ?? {}) as Partial<PayoutScheduleValue>;
  const schedule: PayoutScheduleValue = {
    frequency: raw.frequency === "every_2_weeks" ? "every_2_weeks" : "weekly",
    day: typeof raw.day === "string" && (DAYS as readonly string[]).includes(raw.day) ? raw.day : DEFAULT_SCHEDULE.day,
    time: typeof raw.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.time) ? raw.time : DEFAULT_SCHEDULE.time,
  };
  return { mode: document?.["payoutMode"] === "manual" ? "manual" : "automatic", schedule, linesOn: document?.["payoutLinesOn"] === true };
}

