/** French dictionary, area c11-booked-waiting: contract v0.18.51 §73 (contract.json#bookedRide0_18_51.texts.adminWaitFrom): the trip page's waiting box shows when the free waiting starts; a booked ride's cancel after arrival is the booking fee (texts.cancelAfterArrived). Add new keys at the end of this file. Merged in ../fr.ts in this order. */
import type { enC11BookedWaiting } from "../en/c11-booked-waiting.ts";

export const frC11BookedWaiting: Record<keyof typeof enC11BookedWaiting, string> = {
  "Free waiting from": "Attente gratuite à partir de",
  "Booked ride: cancelling after the driver has arrived costs the booked-ride cancel fee": "Course programmée : une annulation après l’arrivée du chauffeur coûte les frais d’annulation de la réservation",
};
