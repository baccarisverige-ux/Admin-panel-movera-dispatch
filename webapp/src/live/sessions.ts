import { tr } from "../i18n/core.ts";

/** Contract v0.18.149 (contract.json#adminSessions): the Sessions card's pure parts (live/LiveSessions.tsx). */
export type AdminSession = { sessionId: string; app: "rider" | "driver"; device: string | null; platform: "ios" | "android" | "web" | "unknown"; appVersion: string | null; lastSeenAt: string; createdAt: string };

export const SESSION_PERMISSIONS = {
  rider: { read: "riders.read", signOut: "riders.block", command: "admin.rider.signOut", list: "riders" },
  driver: { read: "drivers.read", signOut: "drivers.activate", command: "admin.driver.signOut", list: "drivers" },
} as const;

export function sessionsPath(kind: "rider" | "driver", id: string): string {
  return `/admin/${SESSION_PERMISSIONS[kind].list}/${encodeURIComponent(id)}/sessions`;
}

export function platformLabel(platform: AdminSession["platform"]): string {
  return platform === "ios" ? "iOS" : platform === "android" ? "Android" : platform === "web" ? tr("Web") : tr("Unknown platform");
}

/** "iPhone · iOS · 1.4.2", with "Unknown device" when the app sent nothing to go by. */
export function deviceLine(session: AdminSession): string {
  return [session.device ?? tr("Unknown device"), platformLabel(session.platform), session.appVersion].filter(Boolean).join(" · ");
}

/** What the confirm step says will happen (contract.json#adminSessions.signOut.effect + apps.show + driverOnTrip). */
export function signOutDetails(kind: "rider" | "driver"): string[] {
  return [
    tr("The phone is signed out at once. Its app returns to Sign in and shows \"You were signed out by Movera\"."),
    tr("The person can sign in again with an SMS code. Your reason is kept in the audit and is not shown to them."),
    ...(kind === "driver" ? [tr("A driver on a trip is signed out only after the trip ends.")] : []),
  ];
}

