/** English dictionary, area c39-parked-geofence: S4 B1.1 SF-1 (contract v0.18.121, contract.json#alertDesk.serverDetection.kindDefaults.system_health.rule; owner 2026-11-16 "Yes, same as drop-off (Rec.)", Rules decisions/session-2026-11-06.md): the name of a parked pickup_geofence job and its alert line (alerts/parkedJobs.ts). Add new keys at the end of this file. Merged in ../en.ts in this order. */
export const enC39ParkedGeofence = {
  "Automatic arrival check (pickup, waiting clock, stops)": "Automatic arrival check (pickup, waiting clock, stops)",
  "{0} stopped on the server for {1}. It runs once more by itself after 1 min; if it fails again it stays stopped. The driver's own taps still work.": "{0} stopped on the server for {1}. It runs once more by itself after 1 min; if it fails again it stays stopped. The driver's own taps still work.",
  // S4 B1.1 SF-2, round 4 (a session decision under the owner's night rule, 2026-11-16; the owner reviews it): a parked trip_eta job.
  "Live arrival time (ETA) update": "Live arrival time (ETA) update",
  "{0} stopped on the server for {1}. It runs once more by itself after 1 min; if it fails again it stays stopped. Meanwhile the apps show an estimated time, and the rider's \"almost there\" message and the late check of booked rides wait.": "{0} stopped on the server for {1}. It runs once more by itself after 1 min; if it fails again it stays stopped. Meanwhile the apps show an estimated time, and the rider's \"almost there\" message and the late check of booked rides wait.",
} as const;
