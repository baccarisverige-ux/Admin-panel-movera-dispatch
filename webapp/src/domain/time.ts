/**
 * A short, readable local date and time: "19 Oct 21:04" (Q22). Always in the time zone given (the record's
 * zone or market), never the browser's, so two admins in different places read the same time.
 */
export function shortDateTime(at: string | number | Date, timeZone: string): string {
  const date = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("day")} ${part("month")} ${part("hour")}:${part("minute")}`;
}
