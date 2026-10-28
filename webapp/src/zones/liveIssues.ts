import { validateZones, type ZoneIssue, type ZoneShape } from "./releases.ts";

/**
 * Live (contract v0.11.0 §20): only what the server refuses blocks — an outline of fewer than 3 points or one that
 * crosses itself. The demo's own rules (overlaps, service areas, schedules) are not server rules and are not shown.
 */
const SERVER_RULE = /needs at least 3 points\.$|crosses itself\.$|is not a closed polygon\.$/;

export function liveIssues(zones: ZoneShape[]): ZoneIssue[] {
  return validateZones(zones).filter((issue) => issue.level === "error" && SERVER_RULE.test(issue.message));
}
