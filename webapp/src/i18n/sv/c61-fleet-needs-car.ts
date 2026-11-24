/** Swedish dictionary, area c61-fleet-needs-car: v0.18.159 fleet needs a car (contract.json#fleetNeedsCar, owner 2026-11-24 "No but in sheet must see that it's missing to add car"): the fleet review sheet Cars line, Approve locked, the 409 fleet_has_no_car text and the Drivers › Onboarding setting. Add new keys at the end of this file. Merged in ../sv.ts in this order. */
import type { enC61FleetNeedsCar } from "../en/c61-fleet-needs-car.ts";

export const svC61FleetNeedsCar: Record<keyof typeof enC61FleetNeedsCar, string> = {
  "✕ Car missing: no car added": "✕ Bil saknas: ingen bil tillagd",
  "Approve is locked until the owner adds at least 1 car.": "Godkänn är låst tills ägaren lagt till minst 1 bil.",
  "✓ {0} car": "✓ {0} bil",
  "✓ {0} cars": "✓ {0} bilar",
  "Fleet approval": "Godkännande av åkeri",
  "Fleet needs at least 1 car before approval": "Åkeriet behöver minst 1 bil före godkännande",
  "On: Movera cannot approve a fleet until its owner has added at least one car.": "På: Movera kan inte godkänna ett åkeri förrän ägaren har lagt till minst en bil.",
};
