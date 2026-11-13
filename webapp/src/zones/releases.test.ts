import {
  addHole,
  coreZones,
  effectiveZonesAt,
  emptyBook,
  kmlToZones,
  mergeZones,
  patchZone,
  priorityZones,
  publishZones,
  reorderZonePriorities,
  rollbackZones,
  rotateZone,
  splitZone,
  stockholmZones,
  submitReview,
  updateDraft,
  validateZones,
  zoneImpact,
  ZONE_TYPES,
  zonesAt,
  zonesToGeoJSON,
} from "./releases.ts";
import { zoneDrawModes } from "./drawModes.ts";
import { cityById } from "./cities.ts";
import {
  createZoneIn,
  deleteZone,
  displayName,
  launchChecklist,
  seedZones,
  suggestCode,
} from "./releases.ts";
import { activityInside, circleRing, cityGaps, clipToCity, firstShapeFromFile, goLiveState, joinShapes, lineKm, removeOverlaps, ringAreaKm, shapeChecks, suggestedShape, zoneChanges } from "./studioTools.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

const seed = stockholmZones();
const modes = zoneDrawModes().map((mode) => mode.mode);
assert(modes.includes("render"), "terra draw render mode is named");
assert(modes.includes("circle") && modes.includes("select") && modes.includes("polygon"), "circle, select and polygon tools exist");
assert(modes.includes("freehand"), "freehand drawing exists");
for (const type of ZONE_TYPES) assert(seed.some((zone) => zone.kind === type.id), `seed has ${type.id}`);
assert(seed.filter((zone) => zone.kind === "operating").length === 9, "9 operating zones");
assert(coreZones(seed).length === 12, "12 core zones");
assert(seed.some((zone) => zone.name === "Arlanda"), "Arlanda");
assert(seed.some((zone) => zone.name === "Bromma airport"), "Bromma");
assert(validateZones(seed).every((issue) => issue.level !== "error"), `seed has no blocking errors: ${validateZones(seed).map((issue) => issue.message).join("; ")}`);
assert(validateZones(seed).some((issue) => issue.level === "warn"), "large service area warns");

const bowtie = updateDraft(emptyBook("nora"), "op-norrmalm", [[59.33, 18.05], [59.34, 18.07], [59.33, 18.07], [59.34, 18.05]], "nora");
assert(validateZones(bowtie.draft).some((issue) => issue.message.includes("crosses itself")), "self-crossing is blocked");

const outside = updateDraft(emptyBook("nora"), "op-norrmalm", [[60.5, 18], [60.5, 18.1], [60.6, 18.1], [60.6, 18]], "nora");
assert(validateZones(outside.draft).some((issue) => issue.message.includes("outside")), "operating zone must sit in the service area");

const holed = addHole(emptyBook("nora"), "op-norrmalm", [[59.332, 18.07], [59.332, 18.09], [59.342, 18.09], [59.342, 18.07]], "nora");
assert(!holed.error && holed.book.draft.find((zone) => zone.id === "op-norrmalm")?.holes.length === 1, "a hole inside the zone is kept");
const badHole = addHole(emptyBook("nora"), "op-norrmalm", [[59.1, 17.5], [59.1, 17.6], [59.12, 17.6]], "nora");
assert(badHole.error, "a hole outside the zone is rejected");

const impact = zoneImpact(seed, seed);
assert(impact.deltaKm === 0 && impact.drivers > 0 && impact.trips > 0, "impact counts drivers and trips inside the draft");

const split = splitZone(emptyBook("nora"), "op-norrmalm", "nora");
assert(!split.error && !!split.newId, "rectangular operating zone splits");
assert(split.book.draft.length === emptyBook("nora").draft.length + 1, "split creates a sibling");
assert(!validateZones(split.book.draft).some((issue) => issue.level === "error" && issue.message.includes("overlaps")), "split siblings may share a border without being treated as overlapping");
const merged = mergeZones(split.book, "op-norrmalm", split.newId!, "nora");
assert(!merged.error, "adjacent split siblings merge again");
assert(merged.book.draft.find((zone) => zone.id === split.newId)?.archived === true, "merged source is archived instead of deleted");

const rotated = rotateZone(emptyBook("nora"), "event-1", 15, "nora");
assert(
  JSON.stringify(rotated.draft.find((zone) => zone.id === "event-1")?.points)
    !== JSON.stringify(emptyBook("nora").draft.find((zone) => zone.id === "event-1")?.points),
  "rotate changes the geometry",
);

const priorityBook = reorderZonePriorities(emptyBook("nora"), ["event-1", "boost-1", "restricted-1"], "nora");
const priority = priorityZones(priorityBook.draft);
assert(priority[0]?.id === "event-1", "drag order becomes effective priority order");
const eventCenter = effectiveZonesAt(priorityBook.draft, 59.234, 18.05);
assert(eventCenter[0]?.priority >= (eventCenter[1]?.priority ?? -Infinity), "effective rules are sorted by priority");

const kml = `<kml><Document><Placemark><name><![CDATA[Norrmalm]]></name><Polygon><outerBoundaryIs><LinearRing><coordinates>
18.060,59.325,0 18.100,59.325,0 18.100,59.345,0 18.060,59.345,0 18.060,59.325,0
</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>`;
const imported = kmlToZones(kml, emptyBook("nora"), "nora");
assert(!imported.error, "KML matching an existing zone imports");
assert(imported.book.draft.find((zone) => zone.id === "op-norrmalm")?.points[1]?.[1] === 18.1, "KML coordinates replace the matched shape");

const badSchedule = patchZone(emptyBook("nora"), "event-1", { schedule: "weekly", hours: "" }, "nora");
assert(validateZones(badSchedule.draft).some((issue) => issue.message.includes("weekly schedule needs hours")), "weekly schedule requires hours");

const badSubarea = patchZone(
  emptyBook("nora"),
  "air-arlanda",
  { pickupArea: [[60, 19], [60, 19.1], [60.1, 19.1], [60.1, 19]] },
  "nora",
);
assert(validateZones(badSubarea.draft).some((issue) => issue.message.includes("pickup area must stay inside")), "airport pickup area must stay inside its zone");

const custom = patchZone(emptyBook("nora"), "event-1", { color: "#123456" }, "nora");
const eventFeature = zonesToGeoJSON(custom.draft).features.find((feature) => feature.properties?.id === "event-1");
assert(eventFeature?.properties?.color === "#123456", "GeoJSON export preserves configured zone colour");

let book = emptyBook("nora");
book = updateDraft(book, "op-norrmalm", [[59.326, 18.061], [59.326, 18.08], [59.34, 18.08], [59.34, 18.061]], "nora");
// BASE B14 (owner Q1 "One admin always"): no review step and no second agent; the author publishes at once.
const published = publishZones(book, "nora");
assert(!published.error && published.book.versions.length === 2, "the author publishes at once");
book = published.book;
const rolled = rollbackZones(book, "lena");
assert(rolled.versions.length === 3, "rollback creates a new immutable version");
assert(JSON.stringify(rolled.published) === JSON.stringify(book.versions[0]), "rollback republishes the previous snapshot");
assert(JSON.stringify(rolled.draft) === JSON.stringify(rolled.published), "rollback draft follows the restored publication");
assert(zonesAt(seed, 59.334, 18.063).some((zone) => zone.name === "Norrmalm"), "test point hits Norrmalm");
assert(zonesAt(seed, 59.334, 18.063).some((zone) => zone.kind === "service"), "test point hits the service area");


// Countries, cities and new zones.
const all = seedZones();
assert(all.some((zone) => zone.country === "FR" && zone.name === "Paris Centre") && all.some((zone) => zone.country === "TN" && zone.kind === "airport"), "Paris and Tunis are seeded");
assert(validateZones(all).every((issue) => issue.level !== "error"), "all countries seed without errors");
assert(all.filter((zone) => zone.marketZoneId).length === 11 + 10 + 9, "seed zones link to the zone ids other sections use");
const paris = cityById("paris")!;
assert(displayName({ name: "Paris Centre", city: "paris" }) === "Paris · Paris Centre" && displayName({ name: "Paris · Batignolles", city: "paris" }) === "Paris · Batignolles", "names start with the city");
assert(suggestCode(paris, "Batignolles", all) === "PAR-BAT" && suggestCode(cityById("stockholm")!, "Kista Nord", all) === "STO-KN", "codes come from the city code");
const bat = paris.districts.find((item) => item.name === "Batignolles")!.ring;
const mon = paris.districts.find((item) => item.name === "Montmartre–Nord")!.ring;
assert(!joinShapes([bat, mon]).error && joinShapes([bat, mon]).points.length >= 4, "touching districts join");
assert(joinShapes([bat, paris.districts.find((item) => item.name === "Vincennes")!.ring]).error, "districts apart do not join");
assert(shapeChecks(mon, paris, "operating", all).some((issue) => issue.message === "The shape overlaps Montmartre–Nord. Operating zones cannot overlap."), "an identical shape is an overlap");
assert(!shapeChecks(bat, paris, "operating", all).some((issue) => issue.level === "error"), "a shape next to a zone is fine");
const station = circleRing(59.3303, 18.0586, 1);
assert(Math.abs(ringAreaKm(station) - Math.PI) < 0.1, "a 1 km circle is about 3.14 km²");
assert(shapeChecks(station, cityById("stockholm")!, "operating", all).some((issue) => issue.message.includes("overlaps")), "the circle overlaps Norrmalm");
assert(!shapeChecks(removeOverlaps(station, all).points, cityById("stockholm")!, "operating", all).some((issue) => issue.message.includes("overlaps")), "removing overlaps fixes it");
assert(clipToCity(circleRing(59.51, 18.26, 3), cityById("stockholm")!).points.every(([lat, lng]) => lat <= 59.51 + 1e-6 && lng <= 18.26 + 1e-6), "fit to city border");
const made = createZoneIn(emptyBook("nora"), { country: "FR", city: "paris", kind: "operating", name: "Batignolles", code: "PAR-BAT", points: bat, copyFrom: "op-fr-mn", schedule: "weekly", hours: "20:00–06:00" }, "nora");
const madeZone = made.book.draft.find((zone) => zone.id === made.id)!;
assert(!made.error && madeZone.name === "Paris · Batignolles" && madeZone.parentId === "svc-paris" && madeZone.hours === "20:00–06:00", "new zone in Paris");
assert(createZoneIn(made.book, { country: "FR", city: "paris", kind: "operating", name: "Again", code: "PAR-BAT", points: bat }, "nora").error, "codes are unique");
assert(createZoneIn(emptyBook("nora"), { country: "FR", city: "stockholm", kind: "operating", name: "X", code: "X-1", points: bat }, "nora").error, "the city must be in the country");
assert(zoneChanges(made.book.published, made.book.draft, "FR").some((change) => change.change === "added" && change.name === "Paris · Batignolles") && zoneChanges(made.book.published, made.book.draft, "SE").length === 0, "changes per country");
const goteborg = createZoneIn(emptyBook("nora"), { country: "SE", city: "goteborg", kind: "operating", name: "Centrum", code: "GOT-CEN", points: circleRing(57.7089, 11.9746, 1) }, "nora");
assert(!validateZones(goteborg.book.draft).some((issue) => issue.level === "error"), "a new city without a service area can launch");
const noPay = patchZone(made.book, made.id, { paymentMethods: [] }, "nora");
assert(launchChecklist(noPay.draft.find((zone) => zone.id === made.id)!, validateZones(noPay.draft)).find((item) => item.id === "payments")?.ok === false, "checklist sees missing payments");
assert(submitReview(noPay, "nora").error?.includes("payment methods missing"), "review is blocked until the checklist passes");
assert(!submitReview(made.book, "nora").error, "a ready zone goes to review");
const removed = deleteZone(made.book, made.id, "nora");
assert(!removed.error && !removed.book.draft.some((zone) => zone.id === made.id), "delete removes the zone from the draft");
assert(deleteZone(emptyBook("nora"), "svc-paris", "nora").error, "a service area with zones inside cannot be deleted");
const gaps = cityGaps(all, paris, 12);
assert(gaps.coverage > 0 && gaps.coverage < 100 && gaps.cells.length > 0, "gaps show where no zone is");
assert(cityGaps(all, cityById("lyon")!, 8).coverage === 0, "a city without zones is all gap");
assert(!suggestedShape(paris).error && suggestedShape(cityById("lyon")!).error, "suggested shape needs ride requests");
assert(Math.abs(lineKm([[59.33, 18.0], [59.33, 18.1]]) - 5.69) < 0.1, "measure a line");
assert(firstShapeFromFile(JSON.stringify(zonesToGeoJSON([madeZone]))).points.length === madeZone.points.length && firstShapeFromFile("nope").error, "first shape from a file");
assert(goLiveState({ ...madeZone, goLiveAt: "2099-01-01T06:00" }, Date.now()) === "scheduled" && goLiveState(madeZone, Date.now()) === "now", "go live later");
assert(activityInside(paris.outline).drivers > 0, "drivers inside Paris");

console.log("zones ok");
