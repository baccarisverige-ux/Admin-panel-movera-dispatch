/**
 * S4 B1.1 SF-2, round 4 (OQ-B101-2 "Yes, restart once + urgent alert (Rec.)": a SESSION decision under the owner's night
 * rule, 2026-11-16 17:53 UTC, Rules decisions/session-2026-11-06.md, the owner reviews it; contract v0.18.121
 * contract.json#alertDesk.serverDetection.kindDefaults.system_health.rule): a parked trip_eta job (the trip's live ETA
 * tick, which also sends the rider's "almost there" message and runs the late check of booked rides) now runs once more
 * after 1 min and its server alert is critical. The server's detail is the bare "trip_eta: <trip ids>"; the panel shows
 * a plain line with the job's name, what happens next and what waits meanwhile, in sv / fr / en. The pickup_geofence
 * line (SF-1) is unchanged. Fails before: the detail was the raw kind name, and no dictionary had the texts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { alertsFromServer, type FoundAlert } from "./engine.ts";
import { registerDictionary, setLanguage } from "../i18n/core.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";

const LABEL = "Live arrival time (ETA) update";
const TEXT = "{0} stopped on the server for {1}. It runs once more by itself after 1 min; if it fails again it stays stopped. Meanwhile the apps show an estimated time, and the rider's \"almost there\" message and the late check of booked rides wait.";

const parked = (detail: string): FoundAlert => ({
  alertId: "alr_1",
  kind: "system_health",
  level: "critical",
  title: "1 background jobs failed on the server",
  titleT: { t: "{0} background jobs failed on the server", a: [1] },
  detail,
  detailT: { t: "{0}", a: [detail] },
  since: "2026-11-16T10:00:00Z",
  state: "open",
} as FoundAlert);
const found = (item: FoundAlert) => alertsFromServer([item], [])[0];
const detailOf = (item: FoundAlert) => found(item)?.detail;

test("SF-2: a parked trip_eta alert names the job, says it restarts once and what waits meanwhile (en); it stays critical", () => {
  setLanguage("en");
  assert.equal(detailOf(parked("trip_eta: trp_A, trp_B")), `${LABEL} stopped on the server for trp_A, trp_B. It runs once more by itself after 1 min; if it fails again it stays stopped. Meanwhile the apps show an estimated time, and the rider's "almost there" message and the late check of booked rides wait.`);
  assert.equal(detailOf(parked("trip_eta: trp_A, trp_B, trp_C, …")), `${LABEL} stopped on the server for trp_A, trp_B, trp_C, …. It runs once more by itself after 1 min; if it fails again it stays stopped. Meanwhile the apps show an estimated time, and the rider's "almost there" message and the late check of booked rides wait.`);
  assert.equal(found(parked("trip_eta: trp_A"))?.level, "critical");
});

test("SF-2: the pickup_geofence line (SF-1) is unchanged; other kinds and other alerts are shown as the server sent them", () => {
  setLanguage("en");
  assert.equal(detailOf(parked("pickup_geofence: trp_A")), "Automatic arrival check (pickup, waiting clock, stops) stopped on the server for trp_A. It runs once more by itself after 1 min; if it fails again it stays stopped. The driver's own taps still work.");
  assert.equal(detailOf(parked("near_dropoff: trp_A")), "near_dropoff: trp_A");
  assert.equal(detailOf(parked("trip_eta_x: trp_A")), "trip_eta_x: trp_A");
  assert.equal(detailOf({ ...parked("trip_eta: trp_A"), kind: "ticket_open" }), "trip_eta: trp_A");
});

test("SF-2: the label and the line in sv and fr; English is the key", () => {
  const dict = (d: object) => d as Record<string, string>;
  assert.equal(dict(en)[LABEL], LABEL);
  assert.equal(dict(en)[TEXT], TEXT);
  assert.equal(dict(sv)[LABEL], "Uppdatering av ankomsttid (ETA)");
  assert.equal(dict(fr)[LABEL], "Mise à jour de l’heure d’arrivée (ETA)");
  registerDictionary("sv", sv);
  registerDictionary("fr", fr);
  setLanguage("sv");
  assert.equal(detailOf(parked("trip_eta: trp_A")), "Uppdatering av ankomsttid (ETA) stoppade på servern för trp_A. Den körs en gång till av sig själv efter 1 min; misslyckas den igen förblir den stoppad. Under tiden visar apparna en uppskattad tid, och resenärens meddelande ”nästan framme” och förseningskontrollen för bokade resor väntar.");
  setLanguage("fr");
  assert.equal(detailOf(parked("trip_eta: trp_A")), "Mise à jour de l’heure d’arrivée (ETA) s’est arrêtée sur le serveur pour trp_A. Elle repart une fois toute seule après 1 min ; si elle échoue encore, elle reste arrêtée. En attendant, les apps affichent une heure estimée ; le message « presque arrivé » du passager et le contrôle de retard des courses programmées attendent.");
  setLanguage("en");
});
