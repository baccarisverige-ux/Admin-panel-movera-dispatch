/**
 * Base split (rule 25): en.ts, sv.ts and fr.ts were split into per-area files under ./en, ./sv and ./fr, and
 * dispatch/rules.ts into ../dispatch/rules/*.ts. These checks prove nothing visible changed: the merged dictionaries
 * hold exactly the same key → value pairs, in the same order, as the snapshot taken before the split, and rules.ts
 * still exports the same values.
 * A PR that adds or changes texts updates the snapshot with: UPDATE_I18N_SNAPSHOT=1 node --experimental-strip-types --test src/i18n/split.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import test from "node:test";
import { en } from "./en.ts";
import { fr } from "./fr.ts";
import { sv } from "./sv.ts";

const DICTIONARIES = { en, sv, fr } as const;

for (const [lang, dictionary] of Object.entries(DICTIONARIES)) {
  test(`${lang}: the merged area files hold exactly the snapshot's key → value pairs, in order`, () => {
    const url = new URL(`./snapshot/${lang}.json`, import.meta.url);
    const entries = Object.entries(dictionary);
    if (process.env.UPDATE_I18N_SNAPSHOT === "1") writeFileSync(url, JSON.stringify(entries).replace(/\],\[/g, "],\n[") + "\n");
    const snapshot = JSON.parse(readFileSync(url, "utf8")) as [string, string][];
    assert.equal(entries.length, snapshot.length);
    assert.deepEqual(entries, snapshot);
  });
}

test("dispatch/rules.ts keeps every value export after the split", async () => {
  const rules = await import("../dispatch/rules.ts");
  assert.deepEqual(Object.keys(rules).sort(), ["ALERTS","BOOKING_LABELS","BOOKING_LIMITS","BOOKING_WINDOW_DEFAULT","BUILT_IN_PRESETS","DISPATCH_KEY","EARLY_END_DEFAULT","EARLY_END_LIMITS","EXTRAS","FACTORS","HOME_POPUP_TO","LATE_ETA_REASSIGN_TO","MAX_TRIP_KM_LIMIT","OFFER_TABS","PICKUP_MOVE_MAX_METERS","RAISE_CAP_SEK","RESERVATION_CANCEL_TO","RESERVATION_LIST_TO","RESERVATION_STEP_LABEL","RIDER_FREE_CANCEL_MAX_MIN","RIDE_CHECK_LIMITS","RIDE_TYPES","TABS","WAIT_KINDS","applyPreset","approve","cancelDecision","changeLines","completeBookingWindow","completeCountry","completeEarlyEnd","completeReservation","completeRideCheck","copyParts","countryDefault","countryIssues","countryLines","decline","defaultZone","distanceKm","draftCountry","draftRules","emptyDispatchBook","feeDefaults","homePopupSkippedBelowMin","inTime","insideRing","isBigChange","leaveNowBeforeMin","liveCountry","liveRules","mainMode","modeLabel","modeNow","normalizeDispatchBook","pendingChanges","presetFrom","publish","raiseCap","raiseSplit","rankDrivers","requestControl","reservationStepAt","reservationTimeline","rideCheckDefault","rideCheckIssues","riderCancelFee","riderScheduledRules","ridesClash","rulesFile","saveDraft","simulate","smartGapMin","stepAfterDriverCancel","undoTo","withEvent","zoneDefault","zoneIssues"]);
});
