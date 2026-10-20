import { DRIVER_TEXT_KEYS, driverAppTexts, emptyDriverTextBook, emptyTexts, normalizeDriverTextBook, saveTexts, textChanges, textIssue, textKey, textOf } from "./driverTexts.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

// The old content/book.ts checks (author cannot publish, rollback) moved to studio.test.ts (C-21); the phone preview is checked in e2e/content.spec.ts.

// Q30: driver app texts. The keys and defaults are the driver app's; empty means the app's default.
assert(DRIVER_TEXT_KEYS.length === 67 && new Set(DRIVER_TEXT_KEYS.map((key) => key.id)).size === 67, "67 keys from the driver app, each once");
assert(textKey("island.leaveNow")?.english === "Leave now for {time} pickup" && textKey("trip.collectCash")?.english === "Collect cash" && textKey("offer.yourShare")?.area === "offer", "the app's keys and English defaults");
assert(["island", "offer", "trip"].every((area) => DRIVER_TEXT_KEYS.some((key) => key.area === area)) && DRIVER_TEXT_KEYS.some((key) => key.group === "scheduled"), "island, offer, trip and scheduled ride texts");
const svTexts = { ...emptyTexts(), sv: { "island.online": "Radar på", "island.leaveNow": "Åk nu till {time}" } };
assert(textOf(svTexts, "sv", "island.online").text === "Radar på" && textOf(svTexts, "fr", "island.online").text === "Radar online" && !textOf(svTexts, "ar", "trip.arrived").own, "empty uses the app's default");
assert(textOf(svTexts, "sv", "island.leaveNow", { time: "07:40" }).text === "Åk nu till 07:40", "values are filled in");
assert(textIssue(textKey("island.leaveNow")!, "Åk nu") === "Keep {time}. The app fills it in." && textIssue(textKey("island.online")!, "Online {area}")!.startsWith("This text has no values") && textIssue(textKey("trip.start")!, "x".repeat(29))!.startsWith("Keep it to 28 characters"), "values and length are checked");
const savedTexts = saveTexts(emptyDriverTextBook(), { ...svTexts, ar: { "trip.complete": "  " } }, "nora", "2026-10-15T10:00:00Z");
assert(!savedTexts.error && savedTexts.book.draftRev === 2 && savedTexts.book.log.length === 2 && savedTexts.book.log[0].line === "Swedish · Radar online: default → “Radar på”" && !("trip.complete" in savedTexts.book.texts.ar), "saving keeps only written texts with a change log");
assert(saveTexts(savedTexts.book, savedTexts.book.texts, "nora", "now").error === "Nothing changed." && saveTexts(emptyDriverTextBook(), { ...emptyTexts(), en: { "island.pickupIn": "{time}" } }, "nora", "now").error === "Keep {left}. The app fills it in.", "nothing to save, or a missing value");
assert(textChanges(savedTexts.book.texts, emptyTexts()).includes("Swedish · Leave now for {time} pickup: “Åk nu till {time}” → default"), "clearing a text goes back to the default");
assert(JSON.stringify(driverAppTexts(savedTexts.book).byLanguage.sv) === JSON.stringify({ "island.online": "Radar på", "island.leaveNow": "Åk nu till {time}" }) && normalizeDriverTextBook({ texts: { sv: { "no.key": "x" }, de: { "island.online": "y" } } }).texts.sv["no.key"] === undefined, "the app gets its byLanguage shape, unknown keys and languages are dropped");

console.log("content ok");
