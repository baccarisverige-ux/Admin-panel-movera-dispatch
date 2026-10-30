import { liveAverageRating, liveCompanyDocs, liveFleetCode } from "./fleet/liveOwner.ts";
import { DRIVER_DOCUMENTS, type DocStatus } from "./drivers/gate.ts";
import { docHealth, countHealth } from "./fleet/documents.ts";
import { countryActivationIssue, demoLeads, docProgress, driverMessage, emptyOnboardingRules, firstWarningDays, funnel, neededDocs, normalizeOnboardingRules, remind, reminderDue, rulesError as onboardingError, stepOf, type Applicant } from "./drivers/onboarding.ts";
import { carDocs, carEarnings, categoryProblem, checks, emptyVehicleRules, fits, photosOf, rulesError, rulesImpact, setPhoto, shouldHold } from "./vehicles/rules.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

// Vehicles
const rules = emptyVehicleRules();
const se = rules.countries.SE;
const old = { year: 2013, seats: 4, fuel: "petrol" as const, category: "economy" as const };
const ev = { year: 2022, seats: 4, fuel: "electric" as const, category: "electric" as const };
assert(fits(old, se).length === 0, "a 2013 car fits nothing in Sweden");
assert(fits(old, rules.countries.TN).includes("economy"), "Tunisia allows older cars");
assert(fits(ev, se).includes("electric") && fits(ev, se).includes("premium"), "a new electric car fits many categories");
assert(categoryProblem({ ...ev, fuel: "petrol" }, se.categories.find((rule) => rule.category === "electric")!)?.includes("not allowed"), "electric needs an electric car");
assert(categoryProblem({ ...ev, seats: 4 }, se.categories.find((rule) => rule.category === "xl")!)?.includes("needs 6"), "XL needs six seats");
const now = Date.parse("2026-10-12T12:00:00Z");
const profile = { insuranceExpiresAt: "2026-10-20", inspectionExpiresAt: "2026-09-01", registrationStatus: "approved" as const };
const docs = carDocs(profile, {}, now);
assert(docs.find((doc) => doc.id === "insurance")?.health === "expiring", "insurance expiring soon");
assert(carDocs(profile, {}, now, 5).find((doc) => doc.id === "insurance")?.health === "valid", "car papers follow the country's warning days");
assert(docs.find((doc) => doc.id === "inspection")?.health === "invalid", "inspection expired");
assert(shouldHold(docs, se) && !shouldHold(docs, { ...se, autoHold: false }), "auto hold follows the switch");
assert(carDocs({ ...profile, inspectionExpiresAt: "2027-09-01" }, { vehicle_insurance: { status: "expired" as DocStatus, expiresAt: "2026-10-01" } }, now).find((doc) => doc.id === "insurance")?.expiresAt === "2026-10-01", "the worse paper and its date count");
assert(carDocs(profile, { vehicle_insurance: { status: "needed" as DocStatus, expiresAt: "" } }, now).find((doc) => doc.id === "insurance")?.health === "expiring", "a paper not uploaded yet does not count against the car");
const photos = setPhoto(rules, "V0002", "inside", "rejected", "nora", "2026-10-12T12:00:00Z", "Dark");
assert(photosOf(photos, "V0002").inside.status === "rejected", "photo review is kept");
assert(checks(ev, carDocs({ ...profile, inspectionExpiresAt: "2027-09-01" }, {}, now), photosOf(photos, "V0002"), se, "electric").find((item) => item.label === "Photos")?.ok === false, "a rejected photo fails the checks");
assert(rulesError({ ...se, categories: se.categories.map((rule) => (rule.category === "economy" ? { ...rule, fuels: [] } : rule)) }), "a category needs a fuel");
const impact = rulesImpact([old, ev], se, { ...se, categories: se.categories.map((rule) => (rule.category === "economy" ? { ...rule, minYear: 2010 } : rule)) });
assert(impact.find((row) => row.category === "economy")?.before === 1 && impact.find((row) => row.category === "economy")?.after === 2, "rule changes show how many cars gain a category");
assert(carEarnings([{ id: "T1", name: "", phone: "", zoneId: "Z001", status: "completed", driverId: "D1", fareOre: 5000 }], "D1").grossMinor === 5000, "earnings per car");

// Onboarding
const onboarding = emptyOnboardingRules();
const docsWith = (status: DocStatus) => Object.fromEntries(DRIVER_DOCUMENTS.map((id) => [id, { status }])) as Applicant["docs"];
const applicant: Applicant = { id: "D9", name: "Elin Berg", zoneId: "Z001", fleet: false, status: "pending", docs: docsWith("needed"), bankOk: true, carOk: true };
assert(stepOf(applicant, onboarding.countries.SE) === "signup", "nothing uploaded is signed up");
assert(stepOf({ ...applicant, docs: { ...docsWith("needed"), driver_license: { status: "in_review" } } }, onboarding.countries.SE) === "documents", "uploading is the documents step");
const papersDone = { ...docsWith("approved"), terms: { status: "needed" as DocStatus }, virtual_session: { status: "needed" as DocStatus } };
assert(stepOf({ ...applicant, docs: papersDone, bankOk: false }, onboarding.countries.SE) === "checks", "bank waits in checks");
assert(stepOf({ ...applicant, docs: papersDone }, onboarding.countries.SE) === "training", "training last");
assert(stepOf({ ...applicant, docs: papersDone }, { ...onboarding.countries.SE, steps: onboarding.countries.SE.steps.map((step) => (step.id === "training" ? { ...step, on: false } : step)) }) === "ready", "a step turned off is skipped");
assert(stepOf({ ...applicant, docs: docsWith("approved") }, onboarding.countries.SE) === "ready", "all done is ready");
assert(!neededDocs(onboarding.countries.FR, false).includes("taxi_traffic_permit") && neededDocs(onboarding.countries.SE, false).includes("taxi_traffic_permit"), "papers per country");
assert(!neededDocs(onboarding.countries.SE, true).includes("company_registration"), "fleet drivers skip company registration");
assert(docProgress({ ...applicant, docs: { ...docsWith("needed"), driver_license: { status: "approved" } } }, onboarding.countries.SE).done === 1, "progress");
assert(countryActivationIssue({ ...applicant, docs: docsWith("approved") }, onboarding.countries.SE, null) === null, "all approved can activate");
assert(countryActivationIssue({ ...applicant, docs: docsWith("approved"), bankOk: false }, onboarding.countries.SE, null)?.includes("Bank"), "bank must be approved");
assert(onboardingError({ ...onboarding.countries.SE, docs: [] }), "the driving licence is always needed");
const lead = demoLeads("SE", ["Z001"])[0];
const reminded = remind(onboarding, lead.id, "signup", "nora", "2026-10-12T12:00:00Z");
assert(!reminderDue(lead, "signup", reminded, "SE", Date.parse("2026-10-12T13:00:00Z")), "no new reminder right after one");
assert(reminderDue(lead, "signup", reminded, "SE", Date.parse("2026-10-20T13:00:00Z")), "reminder again after the interval");
assert(!reminderDue(lead, "signup", { ...reminded, countries: { ...reminded.countries, SE: { ...reminded.countries.SE, reminders: false } } }, "SE", Date.parse("2026-10-20T13:00:00Z")), "reminders can be turned off");
const flow = funnel([applicant, lead], 2, onboarding.countries.SE);
assert(flow[0].pct === 100 && flow.every((row, index) => index === 0 || row.reached <= flow[index - 1].reached), "the funnel only goes down");
assert(driverMessage("Elin Berg", "Driving licence", "rejected", "Too dark").startsWith("Hi Elin, your driving licence could not be approved. Reason: Too dark"), "message to the driver");

// Q26: documents that expire: warn 30, 7 and 1 days before, then block until an admin approves the new one.
assert(onboarding.countries.SE.docWarnDays.join() === "30,7,1" && onboarding.countries.SE.blockAtExpiry, "warnings 30, 7 and 1 days before, then block");
assert(onboardingError({ ...onboarding.countries.SE, docWarnDays: [7, 30, 1] }) === "Document warnings: each warning must come after the one before (fewer days).", "warnings come in order");
assert(onboardingError({ ...onboarding.countries.SE, docWarnDays: [120, 7, 1] }) === "Document warnings: 1 to 90 days before expiry.", "warnings have a range");
const oldOnboarding = normalizeOnboardingRules({ draftRev: 3, countries: { SE: { ...onboarding.countries.SE, docWarnDays: undefined, blockAtExpiry: undefined } } });
assert(oldOnboarding.countries.SE.docWarnDays.join() === "30,7,1" && oldOnboarding.countries.SE.blockAtExpiry && oldOnboarding.draftRev === 3, "old saves get the document rules");
// Document colours follow the country's first warning instead of a fixed 30 days.
const in20 = { status: "approved" as DocStatus, expiresAt: new Date(Date.parse("2026-10-15T12:00:00Z") + 20 * 86_400_000).toISOString().slice(0, 10) };
const at = Date.parse("2026-10-15T12:00:00Z");
assert(firstWarningDays(onboarding, "SE") === 30 && firstWarningDays({ ...onboarding, countries: { ...onboarding.countries, FR: { ...onboarding.countries.FR, docWarnDays: [14, 3] } } }, "FR") === 14, "the first warning is the largest number of days");
assert(docHealth(in20, at).health === "expiring" && docHealth(in20, at, 14).health === "valid" && docHealth(in20, at, 21).label === "Expires in 20 days", "a document turns orange at the country's first warning");
assert(countHealth([in20, in20], at, 14).valid === 2 && countHealth([in20], at, 30).expiring === 1, "counts follow the warning days");

console.log("fleet ops ok");

// Owner G2 R3 (2026-10-30): live fleet owners show only the server's facts, with the country's real document count.
{
  const at = Date.parse("2026-10-30T12:00:00Z");
  const seFacts = { accountStatus: "on_hold", country: "SE", documents: [
    { documentId: "d1", type: "company_registration", status: "approved" as const },
    { documentId: "d2", type: "tax_settings", status: "in_review" as const },
  ] };
  const se = liveCompanyDocs(seFacts, "SE", at, 30);
  assert(se.total === 4, `SE has 4 company documents, not 7 (got ${se.total})`);
  assert(se.counts.valid === 1 && se.counts.review === 1 && se.counts.invalid === 2, "approved, in review and 2 missing");
  assert(liveCompanyDocs(undefined, "FR", at, 30).total === 6, "FR has 6 company documents");
  assert(liveCompanyDocs({ ...seFacts, requiredFleetDocuments: ["company_registration"] }, "SE", at, 30).total === 1, "the server's list wins");
  assert(liveAverageRating([{ id: "a", name: "", phone: "", zoneId: "", status: "active" }]) === null, "no rating from the server: null (—), never invented");
  assert(liveAverageRating([{ id: "a", name: "", phone: "", zoneId: "", status: "active", liveDriver: { onlineStatus: "offline", rating: 4.5, location: null, lastFixAt: null, stale: null, activeTripId: null } }]) === 4.5, "the server's rating");
  assert(liveFleetCode({}) === "—" && liveFleetCode({ liveFleetCode: "MV-7KQ2" }) === "MV-7KQ2", "the server's fleet code or —");
  console.log("live fleet owners ok");
}
