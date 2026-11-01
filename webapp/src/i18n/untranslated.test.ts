import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { en } from "./en.ts";
import { needsTranslation, scanDataTexts, scanDataTree, scanSource, scanTree } from "./untranslated.ts";
import { fr } from "./fr.ts";
import { sv } from "./sv.ts";

/**
 * Owner rule: every text of the panel is in sv, fr and en; a text in one language only is a bug. This scans every
 * file under src and fails on a text an admin reads that does not go through tr()/trx()/trn().
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const KNOWN = new Set(Object.keys(en));

test("no English-only text in the panel: JSX text, labels, notices and CSV headers go through tr()", () => {
  const findings = scanTree(ROOT, KNOWN);
  assert.deepEqual(findings.map((finding) => `${finding.file}:${finding.line} ${finding.where} "${finding.text}"`), []);
});

test("the scan finds what it should and leaves brands, ids and symbols alone", () => {
  const code = `
    export function Page({ on }: { on: boolean }) {
      notify("Saved.");
      useCsv(onCsv, { name: "x", head: ["Zone", "Something nobody wrote"], rows: [] });
      return (
        <section aria-label="Zone list" title={tr("Done")}>
          <h2>Zones
            in this country</h2>
          <p>{on ? "Turned on" : tr("Off")} · {"SE-STO"}</p>
          <input placeholder={\`Search \${on}\`} />
          <b>{tr("Done")}</b> <i>Movera</i> <i>km</i> <i>→</i> <code>rider_support</code>
        </section>
      );
    }`;
  const found = scanSource("x.tsx", code, KNOWN).map((finding) => `${finding.where} ${finding.text}`);
  assert.deepEqual(found, [
    "notify() Saved.",
    "CSV header Something nobody wrote",
    "aria-label= Zone list",
    "JSX text Zones in this country",
    "JSX value Turned on",
    "placeholder= Search",
  ]);
  for (const text of ["Movera", "SMS", "D0042", "admin.zone.update", "child_seat", "12 km", "→", "https://movera.se"]) assert.equal(needsTranslation(text), false, text);
  for (const text of ["Email", "Save", "economy", "days"]) assert.equal(needsTranslation(text), true, text);
});

/**
 * Owner G2c (2026-10-30, "Fix now"): texts a component translates at run time (Num before/unit, card label/info, the
 * first notice) need a dictionary entry too, or sv and fr read English. The pages of driver group 2 have none left.
 */
const G2_PAGES = [
  "src/pages/DriversPage.tsx", "src/pages/DriverDetailPage.tsx", "src/drivers/ScheduledAccess.tsx", "src/pages/FleetPage.tsx",
  "src/pages/VehicleDetailPage.tsx", "src/pages/OnboardingPage.tsx", "src/drivers/OnboardingSettingsEditor.tsx", "src/pages/ContentPage.tsx",
];
/** Other pages still have such texts (Dispatch, Payments…): this number may only go down. */
const EXTENDED_BACKLOG = 0;

test("driver group 2 pages: every text translated at run time has an sv/fr entry", () => {
  const findings = scanTree(ROOT, KNOWN, true).filter((finding) => G2_PAGES.includes(finding.file.replaceAll("\\", "/")));
  assert.deepEqual(findings.map((finding) => `${finding.file}:${finding.line} ${finding.where} "${finding.text}"`), []);
});

test("texts translated at run time without an entry do not grow elsewhere", () => {
  const count = scanTree(ROOT, KNOWN, true).length;
  assert.ok(count <= EXTENDED_BACKLOG, `${count} texts without an entry (at most ${EXTENDED_BACKLOG}); add them to en, sv and fr`);
});

test("the extended scan finds Num before/unit, card label/info and a first notice without an entry", () => {
  const code = `
    export function Page() {
      const [notice, setNotice] = useState("Nothing saved yet.");
      return (
        <section>
          <Num label={tr("Done")} before="Each fortnight" unit="fortnights" value={1} onChange={() => {}} />
          <Num label={tr("Done")} unit="Done" value={1} onChange={() => {}} />
          <Cards cards={[{ id: "a", label: "A card nobody wrote", info: \`Within \${n} days.\` }, { id: "b", label: "Done" }]} />
        </section>
      );
    }`;
  const found = scanSource("x.tsx", code, KNOWN, true).map((finding) => `${finding.where} ${finding.text}`);
  assert.deepEqual(found, ["notice state Nothing saved yet.", "before= Each fortnight", "unit= fortnights", "card label A card nobody wrote", "card info Within days."]);
  assert.deepEqual(scanSource("x.tsx", code, KNOWN), [], "the basic scan is unchanged");
});

/* Page audit 2026-11-01: English left in FR/SV (tabs, help texts, cards, roles…). */

/** The pages of the audit: every data text has an entry. */
const AUDIT_PAGES = [
  "src/pages/TeamPage.tsx", "src/platform/team.ts", "src/pages/HandoverPage.tsx", "src/handover/drills.ts", "src/pages/MessagesPage.tsx",
  "src/messages/extra.ts", "src/messages/driverNotices.ts", "src/pages/PromotionsPage.tsx", "src/pages/RiskPage.tsx", "src/safety/risk.ts",
  "src/pages/ConfirmPage.tsx", "src/config/confirm.ts", "src/platform/SettingsParts.tsx", "src/pages/AuditPage.tsx", "src/pages/ReviewsPage.tsx",
  "src/ui/SupportWorkspace.tsx", "src/support/desk.ts", "src/payments/runs.ts",
];
/** Only the feature catalog (src/data/catalog.ts, a list for the product owner) is left; this may only go down. */
const DATA_BACKLOG = 46;

test("data texts (tabs, rows, cards) of the audited pages all have an sv/fr entry", () => {
  const known = new Set(Object.keys(en));
  const findings = scanDataTree(ROOT, known).filter((finding) => AUDIT_PAGES.includes(finding.file.replaceAll("\\", "/")));
  assert.deepEqual(findings.map((finding) => `${finding.file}:${finding.line} "${finding.text}"`), []);
});

test("data texts without an entry do not grow", () => {
  const count = scanDataTree(ROOT, new Set(Object.keys(en))).length;
  assert.ok(count <= DATA_BACKLOG, `${count} data texts without an entry (at most ${DATA_BACKLOG}); add them to en, sv and fr`);
});

test("the data scan finds a tab label nobody wrote and leaves known texts and codes alone", () => {
  const code = `const TABS = [{ id: "a", label: "Admins" }, { id: "b", label: "A tab nobody wrote" }, { id: "c", label: "SE-STO" }];`;
  const found = scanDataTexts("x.ts", code, new Set(["Admins"])).map((finding) => finding.text);
  assert.deepEqual(found, ["A tab nobody wrote"]);
});

test("every audit wording has a real French and Swedish text (not left in English)", () => {
  for (const key of ["Roles and permissions", "Sign-in safety", "Limits", "Shift handover", "Runbooks and drills", "Limits and quiet hours", "Driver notifications", "Rider promotions", "Driver bonuses", "Safety rules", "Fraud rules", "Settings to approve", "Search radius", "No driver yet", "Rider did not arrive", "Thanks for writing. We are looking into it and will reply within the hour.", "VAT inside"] as const) {
    assert.ok(key in en, key);
    assert.notEqual((fr as Record<string, string>)[key], key, `fr ${key}`);
    assert.notEqual((sv as Record<string, string>)[key], key, `sv ${key}`);
  }
});

test("French avoids the 'à les / de les' wording the audit saw", () => {
  const bad = Object.entries(fr).filter(([, text]) => /(^|\s)(à|de) les\s/.test(text));
  assert.deepEqual(bad, []);
});
