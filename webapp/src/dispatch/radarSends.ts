import { useSyncExternalStore } from "react";

/**
 * v0.18.6 (owner G4-F4 "Repeat until taken"): a radar sent to a radar zone whose rule sends again by itself keeps going
 * on the server (every rule interval, to whoever is free inside then) until a driver accepts, an admin stops it or the
 * rider's search ends. The server answers the send with its RadarZoneSend; the panel keeps the running one per trip
 * here (this browser session) to show "Sending again every N s · Stop", and the names of the sends (a driver group, a
 * radar zone) so "Offers sent" can say where each radar went.
 */
export type ActiveRadarSend = { tripId: string; sendId: string; radarZoneName: string; seconds: number; maxDrivers: number; rounds: number; startedAt: string };

const active = new Map<string, ActiveRadarSend>();
const targets = new Map<string, { target: string; maxDrivers?: number }>();
const listeners = new Set<() => void>();
let stamp = 0;

const notify = () => {
  stamp += 1;
  for (const listener of listeners) listener();
};

export function setActiveRadarSend(send: ActiveRadarSend | null, tripId: string): void {
  if (send) active.set(tripId, send);
  else active.delete(tripId);
  notify();
}

export function activeRadarSend(tripId: string): ActiveRadarSend | null {
  return active.get(tripId) ?? null;
}

/** Remembers where a radar group (the server's groupId of the offers) was sent: "group Night drivers", "radar Södermalm". */
export function rememberSendTarget(groupId: string, target: string, maxDrivers?: number): void {
  targets.set(groupId, { target, ...(maxDrivers ? { maxDrivers } : {}) });
  notify();
}

export function sendTarget(groupId: string): { target: string; maxDrivers?: number } | null {
  return targets.get(groupId) ?? null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** The running repeat of a trip, re-rendered when it starts or stops. */
export function useActiveRadarSend(tripId: string): ActiveRadarSend | null {
  useSyncExternalStore(subscribe, () => stamp, () => stamp);
  return activeRadarSend(tripId);
}
