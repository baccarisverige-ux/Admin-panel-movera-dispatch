import { rideRequests } from "../dashboard/riders.ts";
import { caseOf, pastCases } from "../safety/cases.ts";
import { emptySafety } from "../safety/ops.ts";
import { emptyIncidentOps } from "../safety/cases.ts";
import { belongsToDriver, belongsToRider, matchDriver, matchRider, sameRider } from "./match.ts";
import type { DemoRecord } from "../api/seed.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

// U3 prep (START-HERE step 34): two riders called Anna whose phones read the same once masked.
const anna1: DemoRecord = { id: "R0001", name: "Anna", phone: "+46•••••12", zoneId: "Z001", status: "active" };
const anna2: DemoRecord = { id: "R0002", name: "Anna", phone: "+46•••••12", zoneId: "Z001", status: "active" };
const riders = [anna1, anna2];

// A waiting demo trip of the second Anna, carrying her rider id. The demo filter keeps about one in seven ids, so pick one it keeps.
const ids = Array.from({ length: 200 }, (_, index) => `T-U3-${index}`);
const tripId = ids.find((id) => rideRequests([{ id, name: "Anna", phone: "+46•••••12", zoneId: "Z001", status: "searching", riderId: "R0002" }], riders).length === 1);
assert(tripId, "a demo trip id the waiting filter keeps");
const [request] = rideRequests([{ id: tripId!, name: "Anna", phone: "+46•••••12", zoneId: "Z001", status: "searching", riderId: "R0002" }], riders);
assert(request.riderId === "R0002", `the waiting rider is joined by id, not by the masked phone (got ${request.riderId})`);


// The helper itself: id first, phone and name only when no id and only when they point at exactly one rider.
assert(matchRider(riders, { riderId: "R0002", phone: "+46•••••12", name: "Anna" })?.id === "R0002", "a record with a rider id picks that rider");
assert(matchRider(riders, { riderId: "R9999", phone: "+46•••••12", name: "Anna" }) === undefined, "an id nobody has matches nobody, the masked phone does not step in");
assert(matchRider(riders, { phone: "+46•••••12", name: "Anna" }) === undefined, "no id and an ambiguous phone and name: nobody, not the first Anna");
const bo: DemoRecord = { id: "R0003", name: "Bo", phone: "+46 70 123 45 67", zoneId: "Z001", status: "active" };
assert(matchRider([...riders, bo], { phone: "+46 70 123 45 67" })?.id === "R0003", "no id and a unique phone still matches (demo data)");
assert(matchRider([...riders, bo], { phone: "", name: "Bo" })?.id === "R0003", "no id, no phone and a unique name still matches (demo data)");
assert(matchRider([...riders, bo], { phone: "", name: "" }) === undefined, "empty phone and name match nobody");

// The rider page: which tickets belong to each Anna.
const ticket1: DemoRecord = { id: "TK1", name: "Anna", phone: "+46•••••12", zoneId: "Z001", status: "open", riderId: "R0001" };
const ticket2: DemoRecord = { id: "TK2", name: "Anna", phone: "+46•••••12", zoneId: "Z001", status: "open", riderId: "R0002" };
const ticketNoId: DemoRecord = { id: "TK3", name: "Anna", phone: "+46•••••12", zoneId: "Z001", status: "open" };
const everyone = [...riders, bo];
assert(belongsToRider(ticket1, anna1, everyone) && !belongsToRider(ticket1, anna2, everyone), "ticket 1 sits with the first Anna only");
assert(belongsToRider(ticket2, anna2, everyone) && !belongsToRider(ticket2, anna1, everyone), "ticket 2 sits with the second Anna only");
assert(!belongsToRider(ticketNoId, anna1, everyone) && !belongsToRider(ticketNoId, anna2, everyone), "a ticket without id and an ambiguous phone sits with neither Anna");

// Safety cases: the same-rider test behind "earlier cases".
const now = Date.parse("2026-11-09T10:00:00Z");
const row = (id: string, riderId?: string): DemoRecord => ({ id, name: "Anna", phone: "+46•••••12", zoneId: "Z001", status: "queued", kind: "sos", createdAt: "2026-11-09T09:00:00Z", live: true, ...(riderId ? { riderId } : {}) });
const [c1, c2, c3] = [row("I1", "R0001"), row("I2", "R0002"), row("I3", "R0001")].map((item) => caseOf(item, emptySafety(), emptyIncidentOps(), now));
assert(c1.riderId === "R0001", "a live case carries the server's rider id");
assert(pastCases(c1, [c1, c2, c3]).map((item) => item.id).join() === "I3", `earlier cases are the same rider id, not the same first name (got ${pastCases(c1, [c1, c2, c3]).map((item) => item.id).join()})`);
assert(sameRider({ phone: "+46 70 1", name: "Bo" }, { phone: "+46 70 1", name: "Eva" }), "demo rows without ids still pair by phone");

console.log("riders/match: ok");

// Step 34b: the same rule for drivers. Two drivers called Anna; a live ticket carries the server's driverId.
const driverAnna1: DemoRecord = { id: "D1001", name: "Anna", phone: "", zoneId: "Z001", status: "active" };
const driverAnna2: DemoRecord = { id: "D1002", name: "Anna", phone: "", zoneId: "Z001", status: "active" };
const driverBo: DemoRecord = { id: "D1003", name: "Bo", phone: "+46 70 999 00 00", zoneId: "Z001", status: "active" };
const driversAll = [driverAnna1, driverAnna2, driverBo];
const driverTicket: DemoRecord = { id: "TK7", name: "Anna", phone: "", zoneId: "Z001", status: "open", openedBy: "driver", driverId: "D1002" };
// Fail-before: the old DriverDetailPage join (item.name === driver.name) put this ticket on BOTH Annas.
assert([driverAnna1, driverAnna2].filter((driver) => driverTicket.name === driver.name).length === 2, "old name join matched both Annas (documents the bug)");
assert(belongsToDriver(driverTicket, driverAnna2, driversAll) && !belongsToDriver(driverTicket, driverAnna1, driversAll), "a ticket with driverId sits with that driver only");
assert(matchDriver(driversAll, { driverId: "D1002", name: "Anna" })?.id === "D1002", "a record with a driver id picks that driver");
assert(matchDriver(driversAll, { driverId: "D9999", name: "Anna" }) === undefined, "an unknown driver id matches nobody, the name does not step in");
assert(matchDriver(driversAll, { name: "Anna" }) === undefined, "no id and an ambiguous name: nobody, not the first Anna");
assert(matchDriver(driversAll, { phone: "+46 70 999 00 00" })?.id === "D1003", "no id and a unique phone still matches (demo data)");
assert(matchDriver(driversAll, { phone: "", name: "Bo" })?.id === "D1003", "no id and a unique name still matches (demo data)");
// Fail-before for SupportWorkspace: "first driver in the zone" was Anna 1 even for Anna 2's ticket.
assert(driversAll.find((item) => item.zoneId === driverTicket.zoneId)?.id === "D1001", "old zone join picked the first driver in the zone (documents the bug)");

console.log("riders/match: drivers ok");
