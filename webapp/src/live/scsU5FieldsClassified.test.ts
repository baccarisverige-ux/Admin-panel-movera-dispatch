import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { appConfigState, driverAppConfig, riderAppConfig } from "../config/appConfigs.ts";
import { defaultCountrySettings } from "../config/countrySettings.ts";
import { emptyDispatchBook, liveRules } from "../dispatch/rules.ts";
import { defaultDoc, wireDocument } from "../drivers/onboardingSettings.ts";
import { defaultZoneBook } from "../pricing/zonePricing.ts";
import { COUNTRY_RULES_PANEL_KEYS, COUNTRY_RULES_STANDARD_ONLY_KEPT, OWNED, countryRulesOf, dispatchDocumentOf, patchChanged, pricingDocumentOf, type Doc } from "./configDocs.ts";

/**
 * SCS U5 (Rules audits/impact/safe-config-saves.md "U5", ledger row "SCS U5"; closes SF-F1-1): every contract field of
 * the 6 config documents the admin saves (top level, and one level down for object blocks) is in exactly one list:
 * owned by the admin's builder for that document, kept from the stored document on a save, or a server stamp. Then
 * each kept field is proved kept: it is put into a stored document and must come out of the real save merge
 * (patchChanged with the page's keys, countryRulesOf) unchanged. It replaces the by-hand count of the F1 supervisor
 * ("17 + 4 = 21"). A contract copy sync that adds a field nobody classified fails here, and so does a save helper that
 * stops keeping a field.
 */

/* ------------------------------------------------ the contract copy (contracts/openapi.yaml), read without a YAML library */

const LINES = readFileSync(new URL("../../../contracts/openapi.yaml", import.meta.url), "utf8").split("\n");
const indent = (line: string) => line.length - line.trimStart().length;

function schema(name: string): string[] {
  const at = LINES.indexOf(`    ${name}:`);
  assert.ok(at >= 0, `schema ${name} not in contracts/openapi.yaml`);
  const out: string[] = [];
  for (let i = at + 1; i < LINES.length; i++) {
    const line = LINES[i]!;
    if (line.trim() && indent(line) <= 4) break;
    out.push(line.slice(4));
  }
  return out;
}

/** The `properties:` of a block whose keys sit at `depth`: each property name with its own lines. */
function propertyBlocks(block: readonly string[], depth: number): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const at = block.findIndex((line) => line === `${" ".repeat(depth)}properties:`);
  if (at < 0) return out;
  const key = new RegExp(`^ {${depth + 2}}([A-Za-z_][A-Za-z0-9_]*):(?: |$)`);
  let name: string | null = null;
  for (let i = at + 1; i < block.length; i++) {
    const line = block[i]!;
    if (line.trim() && indent(line) <= depth) break;
    const match = key.exec(line);
    if (match) { name = match[1]!; out.set(name, []); continue; }
    if (name) out.get(name)!.push(line);
  }
  return out;
}

/** "key" and "key.child" for every property; a child block is inline properties or one direct $ref / allOf $ref (not list items or maps). */
function contractPaths(name: string): string[] {
  const out: string[] = [];
  for (const [key, inner] of propertyBlocks(schema(name), 2)) {
    out.push(key);
    let children = [...propertyBlocks(inner, 6).keys()];
    if (!children.length) {
      const refs = inner.map((line) => /^ {6}\$ref: '#\/components\/schemas\/(\w+)'|^ {8}- \$ref: '#\/components\/schemas\/(\w+)'/.exec(line)).map((match) => match?.[1] ?? match?.[2]).filter((ref): ref is string => Boolean(ref));
      if (refs.length === 1) children = [...propertyBlocks(schema(refs[0]!), 2).keys()];
    }
    out.push(...children.map((child) => `${key}.${child}`));
  }
  return out;
}

/* ------------------------------------------------ the admin's builders */

const plain = (value: unknown): value is Doc => typeof value === "object" && value !== null && !Array.isArray(value);
const pathsOf = (doc: Doc) => Object.entries(doc).flatMap(([key, value]) => [key, ...(plain(value) ? Object.keys(value).map((child) => `${key}.${child}`) : [])]);

/** The admin's edit: every number one higher, every switch the other way (ids and texts stay, so lists keep their items). */
function edit(value: unknown): unknown {
  if (typeof value === "number") return value + 1;
  if (typeof value === "boolean") return !value;
  if (Array.isArray(value)) return value.map(edit);
  if (plain(value)) return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, edit(inner)]));
  return value;
}

const SENTINEL = { scsU5: "stored value the save must keep" };
function withSentinels(doc: Doc, paths: readonly string[]): Doc {
  const next = structuredClone(doc);
  for (const path of paths) {
    const [top, child] = path.split(".") as [string, string | undefined];
    if (child === undefined) { next[top] = structuredClone(SENTINEL); continue; }
    next[top] = { ...(plain(next[top]) ? next[top] : {}), [child]: structuredClone(SENTINEL) };
  }
  return next;
}
const at = (doc: Doc, path: string) => path.split(".").reduce<unknown>((value, part) => (plain(value) ? value[part] : undefined), doc);

const STAMPS = ["version", "publishedAt", "usesStandard", "zoneId"] as const;
const ZONE = "Z001";
const NOW = "2026-10-19T08:00:00Z";
const appState = appConfigState({ now: NOW });
const settings = defaultCountrySettings("SE");
const countryInput = {
  tips: settings.tips.filter((tip) => tip.enabled).map((tip) => tip.amount),
  raiseSteps: settings.raiseSteps.filter((step) => step.enabled).map((step) => step.amount),
  driverBonus: { defaultLimit: settings.driverBonusLimit, hardMax: settings.driverBonusLimit * 2 },
  driverPayChangeMax: settings.driverPayChangeMax, bonusCampaignMax: settings.bonusCampaignMax, personLimits: settings.personLimits,
  onTripMinDonePct: settings.onTripMinDonePct, chainLateFreeCancelMin: settings.chainLateFreeCancelMin, calls: settings.calls, chat: settings.chat,
  dontMatchAgain: settings.dontMatchAgain, walletCreditMax: settings.walletCreditMax, maxRiderDebt: settings.maxRiderDebt,
  driverOwesLimit: settings.driverOwesLimit, driverPayRequest: settings.driverPayRequest, emergencyNumbers: settings.emergencyNumbers, sosContactsSms: settings.sosContactsSms,
};

/** The keys each admin publish of an app document passes to patchChanged (liveSettings.ts publishAppParts callers). */
const RIDER_WRITERS: Record<string, readonly string[]> = { dispatch: OWNED.dispatch.rider, settings: OWNED.settings.rider, content: OWNED.content.rider, tipsAndLimits: ["tipRules"], paymentsAndLanguages: ["paymentMethods", "languages", "wallet"] };
const DRIVER_WRITERS: Record<string, readonly string[]> = { dispatch: OWNED.dispatch.driver, settings: OWNED.settings.driver, content: OWNED.content.driver, paymentsAndLanguages: ["paymentMethods", "languages"] };

type Entry = {
  schema: string;
  /** What the admin's builder writes (stamps left out). */
  built: Doc;
  /** Only these top-level keys are written by a save (app documents); undefined = the whole built document. */
  writers?: Record<string, readonly string[]>;
  /** Owned too, but only written when set (a default leaves them out of the built document). */
  ownedWhenSet?: readonly string[];
  /** Not written by the admin: a save keeps the stored value. */
  kept: readonly string[];
  /** The real save merge: the stored document and the built one in, the document sent out. */
  save: (stored: Doc, built: Doc, keys?: readonly string[]) => Doc;
};

const merge = (stored: Doc, built: Doc, keys?: readonly string[]) => patchChanged(stored, built, edit(built) as Doc, keys);

const ENTRIES: Entry[] = [
  {
    schema: "PricingDocument",
    built: pricingDocumentOf(defaultZoneBook(ZONE), ZONE, null),
    ownedWhenSet: ["minTripMeters"],
    kept: ["surge.maxMultiplier", "surge.notifyDrivers"],
    save: merge,
  },
  {
    schema: "DispatchDocument",
    built: dispatchDocumentOf(liveRules(emptyDispatchBook(), ZONE), ZONE, null),
    ownedWhenSet: ["limits.maxPickupKm", "neighbours.afterStep"],
    kept: ["radar.steps", "radar.reaskAfterSeconds", "exclusive.steps", "exclusive.reaskAfterSeconds"],
    save: merge,
  },
  {
    schema: "CountryRules",
    built: countryRulesOf("SE", "SEK", countryInput, null),
    kept: ["payoutMode", "payoutSchedule", "calls.adminCallRoles", "calls.phoneProvider"],
    save: (stored) => countryRulesOf("SE", "SEK", countryInput, stored),
  },
  {
    schema: "RiderAppConfig",
    built: riderAppConfig(ZONE, appState) as unknown as Doc,
    writers: RIDER_WRITERS,
    kept: [
      "currency", "timeZone", "country", "catalog", "catalog.categories", "tips", "raiseSteps", "promoCap", "pickupFee", "pickupFee.byCategory",
      "booking.reservationsOn", "cancelFees.driverSharePct", "cancelFees.earlyEnd", "waiting", "waiting.freeWaitMin", "waiting.perMin",
      "waiting.noShowAfterMin", "waiting.noShowFee", "waiting.byCategory", "waiting.cancelAfterArrivedIsNoShow", "waiting.farPickup",
      "waiting.rideTypes", "waiting.stopFreeWaitMin", "waiting.perMinShown", "rideCheck", "rideCheck.stopMinutes", "rideCheck.offRouteKm",
      "rideCheck.endFarMeters", "rideCheck.noAnswerSeconds", "rideCheck.repeatMinutes", "rideCheck.noAnswerAlarm", "rideCheck.scanEverySeconds",
      "appUpdate.storeUrl", "raisePrice", "raisePrice.maxFactor", "dontMatchAgain", "routeChange", "paymentOptions", "emergencyNumbers",
    ],
    save: merge,
  },
  {
    schema: "DriverAppConfig",
    built: driverAppConfig(ZONE, appState) as unknown as Doc,
    writers: DRIVER_WRITERS,
    kept: [
      "currency", "timeZone", "country", "catalog", "catalog.categories", "offers.exclusiveReasons", "pickupPay", "pickupPay.offers", "pickupPay.display",
      "pickupPay.byCategory", "pickupPay.perKm", "pickupPay.perMin", "pickupPay.freeKm", "pickupPay.freeMin", "pickupPay.ranges", "pickupPay.maxPerRide",
      "driverBonus", "driverBonus.defaultLimit", "driverBonus.hardMax", "appUpdate.storeUrl", "dontMatchAgain", "paymentOptions",
      "emergencyNumbers", "sosContactsSms", "sosContactsSms.connected",
    ],
    save: merge,
  },
  {
    schema: "OnboardingSettings",
    built: wireDocument(defaultDoc("SE")) as unknown as Doc,
    kept: ["documentTypes"],
    save: merge,
  },
];

function ownedOf(entry: Entry): Set<string> {
  const keys = entry.writers ? new Set(Object.values(entry.writers).flat()) : null;
  const built = pathsOf(entry.built).filter((path) => !keys || keys.has(path.split(".")[0]!));
  return new Set([...built, ...(entry.ownedWhenSet ?? [])].filter((path) => !(STAMPS as readonly string[]).includes(path)));
}

for (const entry of ENTRIES) {
  test(`SCS U5 ${entry.schema}: every contract field is owned, kept or a server stamp (exactly one)`, () => {
    const contract = contractPaths(entry.schema);
    assert.ok(contract.length > 5, `${entry.schema}: the contract copy was not read (${contract.length} fields)`);
    const owned = ownedOf(entry);
    const kept = new Set(entry.kept);
    const stamps = new Set<string>(STAMPS);
    const problems: string[] = [];
    for (const path of contract) {
      const lists = [owned.has(path) && "owned", kept.has(path) && "kept", stamps.has(path) && "server stamp"].filter(Boolean);
      if (lists.length === 0) problems.push(`${path}: in no list (classify it: owned by the builder, kept, or a server stamp)`);
      if (lists.length > 1) problems.push(`${path}: in ${lists.join(" and ")}`);
    }
    const known = new Set(contract);
    for (const path of [...entry.kept, ...(entry.ownedWhenSet ?? [])]) if (!known.has(path)) problems.push(`${path}: listed but not a contract field of ${entry.schema}`);
    assert.deepEqual(problems, []);
  });

  test(`SCS U5 ${entry.schema}: every kept field survives the admin's save of the stored document`, () => {
    const stored = withSentinels(entry.built, entry.kept);
    const runs: [string, readonly string[] | undefined][] = entry.writers ? Object.entries(entry.writers).filter(([, keys]) => keys.length) : [["save", undefined]];
    const lost: string[] = [];
    for (const [writer, keys] of runs) {
      const sent = entry.save(stored, entry.built, keys);
      for (const path of entry.kept) if (JSON.stringify(at(sent, path)) !== JSON.stringify(at(stored, path))) lost.push(`${writer}: ${path}`);
    }
    assert.deepEqual(lost, []);
  });
}

test("SCS U5 CountryRules: the top level is exactly the panel keys + the Standard-only kept keys (the F1 by-hand count 17 + 4 = 21)", () => {
  const top = contractPaths("CountryRules").filter((path) => !path.includes("."));
  assert.deepEqual([...top].sort(), [...new Set([...COUNTRY_RULES_PANEL_KEYS, ...COUNTRY_RULES_STANDARD_ONLY_KEPT])].sort());
});
