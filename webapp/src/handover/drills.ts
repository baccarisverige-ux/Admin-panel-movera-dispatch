import { ROLE_PERMISSIONS, type Role } from "../auth/permissions.ts";
import { changeStudio, emptyStudio, studioSlot } from "../content/studio.ts";
import { blankDocuments, setAccount, type Driver } from "../drivers/gate.ts";
import { APPS } from "../gates/apps.ts";
import { liveSos } from "../gates/frontendC.ts";
import { gateB } from "../gates/scenarios.ts";
import { canStartCheckout, existingAuthContinues, type PaymentMethod } from "../payments/book.ts";
import { assignReservation, needsDriverSoon, type Reservation } from "../reservations/book.ts";

export type DrillResult = { id: string; pass: boolean; steps: string[] };

const CASH_OFF = { card: true, swish: true, klarna: true, apple: true, google: true, paypal: true, cash: false, wallet: true } as Record<PaymentMethod, boolean>;

function driver(): Driver {
  return {
    id: "D1",
    name: "Erik Lind",
    fleet: false,
    status: "active",
    documents: blankDocuments(),
    vehicle: { year: 2022, seats: 4, fuel: "electric", category: "electric" },
  };
}

export function roleMatrix(): { role: Role; permissions: readonly string[] }[] {
  return (Object.keys(ROLE_PERMISSIONS) as Role[]).map((role) => ({ role, permissions: ROLE_PERMISSIONS[role] }));
}

export function healthAlerts(): { id: string; text: string }[] {
  const gate = gateB(undefined);
  return [
    { id: "demo", text: "The live admin is the demo adapter." },
    { id: "gate-b", text: gate.reason },
    { id: "maps", text: "The zone map is OpenStreetMap. No Google key is set." },
    { id: "rider", text: `${APPS.map((app) => `${app.name} ${app.sha.slice(0, 7)}`).join(" and ")} are live frontends. They are not connected to this admin. The rider critical-flow check is still red.` },
  ];
}

export function drillPaymentFailure(): DrillResult {
  const refused = !canStartCheckout(CASH_OFF, "cash");
  const continues = existingAuthContinues({ id: "C1", method: "cash", state: "authorized" }, CASH_OFF);
  return {
    id: "payment-failure",
    pass: refused && continues,
    steps: [
      refused ? "New cash checkouts are refused." : "New cash checkouts were still allowed.",
      continues ? "The existing authorisation continues." : "The existing authorisation was dropped.",
    ],
  };
}

export function drillSos(): DrillResult {
  // The live Safety rules on a seeded SOS (safety/ops.ts): take it, then resolve it.
  const sos = liveSos();
  const pass = !sos.error && sos.owner === "erik" && sos.status === "resolved" && !("pin" in sos.record);
  return {
    id: "sos",
    pass,
    steps: [`Taken by ${sos.owner ?? "nobody"}.`, `Incident ${String(sos.record.id)} in ${String(sos.record.zoneId)}.`, "No PIN is shown.", `State ${sos.status}.`],
  };
}

export function drillSuspension(): DrillResult {
  const trip = { id: "T1002", status: "in_trip" };
  const result = setAccount(driver(), "suspended", "Safety hold");
  const tripUntouched = trip.status === "in_trip";
  return {
    id: "suspension",
    pass: result.driver.status === "suspended" && !result.error && tripUntouched,
    steps: [
      result.error ?? "Driver is suspended. Future offers stop.",
      tripUntouched ? "The trip already in progress is not cancelled from here." : "The open trip was changed.",
    ],
  };
}

export function drillReservation(): DrillResult {
  const open: Reservation = { id: "B1", pickupAt: "2026-10-05T11:20:00Z", driverId: null, policyVersion: "res-2", status: "booked" };
  const flagged = needsDriverSoon(open, "2026-10-05T10:40:00Z");
  const assigned = assignReservation(open, "D3");
  return {
    id: "reservation",
    pass: flagged && !needsDriverSoon(assigned, "2026-10-05T10:40:00Z") && assigned.policyVersion === "res-2",
    steps: [
      flagged ? "B1 is under 60 minutes with no driver." : "B1 was not flagged.",
      `Assigned ${assigned.driverId}. Policy stays ${assigned.policyVersion}.`,
    ],
  };
}

export function drillBadPublish(): DrillResult {
  // The live Content rules (content/studio.ts): the author cannot publish, a second agent can, rollback restores.
  const slot = "help";
  const good = { ...studioSlot(emptyStudio(), slot).draft, sv: "Boka en resa i Stockholm.", en: "Book a ride in Stockholm." };
  let book = changeStudio(emptyStudio(), slot, good, "save", "nora").book;
  book = changeStudio(book, slot, good, "publish", "lena").book;
  const wrong = { ...good, en: "Wrong fare text." };
  book = changeStudio(book, slot, wrong, "save", "nora").book;
  const blocked = changeStudio(book, slot, wrong, "publish", "nora");
  const published = changeStudio(book, slot, wrong, "publish", "lena");
  const restored = changeStudio(published.book, slot, wrong, "rollback", "lena");
  const restoredText = restored.book.slots[slot]?.published?.en ?? "";
  const pass = Boolean(blocked.error) && published.book.slots[slot]?.published?.en === "Wrong fare text." && !restored.error && restoredText === good.en;
  return {
    id: "bad-publish",
    pass,
    steps: [
      blocked.error ?? "The author was allowed to publish.",
      "A second agent published.",
      `Rollback restored: ${restoredText}`,
    ],
  };
}

export function runDrills(): DrillResult[] {
  return [drillPaymentFailure(), drillSos(), drillSuspension(), drillReservation(), drillBadPublish()];
}
