/**
 * S4 B1.1 SF-1 (owner 2026-11-16 "Yes, same as drop-off (Rec.)", Rules decisions/session-2026-11-06.md; contract v0.18.121
 * contract.json#alertDesk.serverDetection.kindDefaults.system_health.rule): a parked pickup_geofence job (the automatic
 * arrival at the pickup, the waiting clock's away / back, the automatic arrival at middle stops) now runs once more after
 * 1 min and its server alert is critical. The server's detail is the bare "pickup_geofence: <trip ids>"; the panel shows
 * it as a plain line with the job's name and what happens next, in sv / fr / en. Other parked kinds stay as the server
 * sent them. Fails before: the detail was the raw kind name, and no dictionary had the texts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { alertsFromServer, type FoundAlert } from "./engine.ts";
import { registerDictionary, setLanguage } from "../i18n/core.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";

const LABEL = "Automatic arrival check (pickup, waiting clock, stops)";
const TEXT = "{0} stopped on the server for {1}. It runs once more by itself after 1 min; if it fails again it stays stopped. The driver's own taps still work.";

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
const detailOf = (item: FoundAlert) => alertsFromServer([item], [])[0]?.detail;

test("SF-1: a parked pickup_geofence alert names the job and says it restarts once (en)", () => {
  setLanguage("en");
  assert.equal(detailOf(parked("pickup_geofence: trp_A, trp_B")), `${LABEL} stopped on the server for trp_A, trp_B. It runs once more by itself after 1 min; if it fails again it stays stopped. The driver's own taps still work.`);
  assert.equal(detailOf(parked("pickup_geofence: trp_A, trp_B, trp_C, …")), `${LABEL} stopped on the server for trp_A, trp_B, trp_C, …. It runs once more by itself after 1 min; if it fails again it stays stopped. The driver's own taps still work.`);
});

test("SF-1: other parked kinds and other system alerts are shown as the server sent them", () => {
  setLanguage("en");
  assert.equal(detailOf(parked("near_dropoff: trp_A")), "near_dropoff: trp_A");
  assert.equal(detailOf(parked("x_test: x_1")), "x_test: x_1");
  assert.equal(detailOf({ ...parked("pickup_geofence: trp_A"), kind: "ticket_open" }), "pickup_geofence: trp_A");
});

test("SF-1: the label and the line in sv and fr; English is the key", () => {
  const dict = (d: object) => d as Record<string, string>;
  assert.equal(dict(en)[LABEL], LABEL);
  assert.equal(dict(en)[TEXT], TEXT);
  assert.equal(dict(sv)[LABEL], "Automatisk ankomstkontroll (upphämtning, väntetidsklocka, stopp)");
  assert.equal(dict(fr)[LABEL], "Contrôle d’arrivée automatique (prise en charge, compteur d’attente, arrêts)");
  registerDictionary("sv", sv);
  registerDictionary("fr", fr);
  setLanguage("sv");
  assert.equal(detailOf(parked("pickup_geofence: trp_A")), "Automatisk ankomstkontroll (upphämtning, väntetidsklocka, stopp) stoppade på servern för trp_A. Den körs en gång till av sig själv efter 1 min; misslyckas den igen förblir den stoppad. Förarens egna tryck fungerar fortfarande.");
  setLanguage("fr");
  assert.equal(detailOf(parked("pickup_geofence: trp_A")), "Contrôle d’arrivée automatique (prise en charge, compteur d’attente, arrêts) s’est arrêté sur le serveur pour trp_A. Il repart une fois tout seul après 1 min ; s’il échoue encore, il reste arrêté. Les actions du chauffeur dans l’app fonctionnent toujours.");
  setLanguage("en");
});
