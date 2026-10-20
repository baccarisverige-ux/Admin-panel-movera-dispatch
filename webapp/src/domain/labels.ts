/**
 * Display words for record statuses. Trip statuses are the contract names in readable form (Q35, X15), the
 * same words the rider and driver apps use: "driver_to_pickup" is "Driver to pickup", "in_trip" is "In trip".
 */
const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  quoted: "Quoted",
  requested: "Requested",
  searching: "Searching",
  offered: "Offered",
  accepted: "Accepted",
  driver_to_pickup: "Driver to pickup",
  arrived: "Arrived",
  rider_onboard: "Rider onboard",
  in_trip: "In trip",
  approaching_dropoff: "Approaching drop-off",
  completed: "Completed",
  cancelled_by_rider: "Cancelled by rider",
  cancelled_by_driver: "Cancelled by driver",
  cancelled_by_admin: "Cancelled by admin",
  cancelled_by_system: "Cancelled by system",
  no_show: "No show",
  expired: "Expired",
  failed: "Failed",
  pending: "Pending",
  authorized: "Authorized",
  captured: "Captured",
  refunded: "Refunded",
  active: "Active",
  inactive: "Inactive",
  offline: "Offline",
  going_online: "Going online",
  online: "Online",
  on_trip: "On a trip",
  on_hold: "On hold",
  suspended: "Suspended",
  in_review: "In review",
  approved: "Approved",
  rejected: "Rejected",
  needed: "Needed",
  expiring: "Expiring",
  queued: "Queued",
  waiting: "Waiting",
  booked: "Booked",
  assigned: "Assigned",
  cancelled: "Cancelled",
  resolved: "Resolved",
  sent: "Sent",
  delivered: "Delivered",
  committed: "Committed",
  denied: "Denied",
  conflict: "Conflict",
  pending_approval: "Pending approval",
};

export type StatusTone = "green" | "amber" | "red" | "muted";

const STATUS_TONES: Record<string, StatusTone> = {
  completed: "green",
  captured: "green",
  active: "green",
  online: "green",
  approved: "green",
  resolved: "green",
  delivered: "green",
  committed: "green",

  draft: "muted",
  quoted: "muted",
  offline: "muted",
  inactive: "muted",
  refunded: "muted",

  requested: "amber",
  searching: "amber",
  offered: "amber",
  accepted: "amber",
  driver_to_pickup: "amber",
  arrived: "amber",
  rider_onboard: "amber",
  in_trip: "amber",
  approaching_dropoff: "amber",
  pending: "amber",
  authorized: "amber",
  going_online: "amber",
  on_hold: "amber",
  in_review: "amber",
  needed: "amber",
  expiring: "amber",
  queued: "amber",
  waiting: "amber",
  booked: "amber",
  assigned: "amber",
  sent: "amber",
  pending_approval: "amber",

  cancelled_by_rider: "red",
  cancelled_by_driver: "red",
  cancelled_by_admin: "red",
  cancelled_by_system: "red",
  no_show: "red",
  expired: "red",
  failed: "red",
  suspended: "red",
  rejected: "red",
  cancelled: "red",
  denied: "red",
  conflict: "red",
};

export function statusLabel(code: string): string {
  return STATUS_LABELS[code] ?? code.replaceAll("_", " ");
}

export function statusPresentation(code: string): { label: string; tone: StatusTone } | null {
  const tone = STATUS_TONES[code];
  if (!tone) return null;
  return { label: statusLabel(code), tone };
}

export const ACTION_REASONS = [
  "Safety review",
  "Wrong document",
  "Name does not match",
  "Blurry",
  "Expired",
  "Cut off",
  "Other",
] as const;

/** Longest private note on a driver or rider, in characters (UI-13). */
export const NOTE_MAX = 2000;
