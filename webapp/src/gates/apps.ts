import { TRIP_STATUSES } from "../domain/contract.ts";

/** Frontends read on 5 October 2026. They are not connected to this admin. */
export const APPS = [
  {
    id: "rider",
    name: "Rider",
    repo: "baccarisverige-ux/-movera-rider",
    sha: "334cb5614529dca2b45714a0f064e5de08a83d0c",
    url: "https://baccarisverige-ux.github.io/-movera-rider/",
  },
  {
    id: "driver",
    name: "Driver",
    repo: "baccarisverige-ux/Movera-drider-",
    sha: "35ef72fc3a74fd03b4a87217a9988945537ea6b1",
    url: "https://baccarisverige-ux.github.io/Movera-drider-/",
  },
] as const;

/** Wire names both apps must ship: the shared contract v0.3.0 (contracts/contract.json#tripStatus.values). */
export const APP_TRIP_WIRE = [
  "draft",
  "quoted",
  "requested",
  "searching",
  "offered",
  "accepted",
  "driver_to_pickup",
  "arrived",
  "rider_onboard",
  "in_trip",
  "approaching_dropoff",
  "completed",
  "cancelled_by_rider",
  "cancelled_by_driver",
  "cancelled_by_admin",
  "cancelled_by_system",
  "no_show",
  "expired",
  "failed",
] as const;

export function tripContractMatchesApps(): boolean {
  return TRIP_STATUSES.length === APP_TRIP_WIRE.length && TRIP_STATUSES.every((status, index) => status === APP_TRIP_WIRE[index]);
}
