/**
 * Contract v0.18.154 P16c (contract.json#appUpdate; owner 2026-11-21 20:30 "Yes, build it now (Recommended)"): the
 * minimum app version per app (rider_app_config, driver_app_config), per platform (android, ios) and per scope (a zone or
 * a country Standard), with the store links. Empty = off (null on the wire). Pure helpers for config/AppUpdatePanel.tsx.
 */

type Doc = Record<string, unknown>;

export const MIN_APPS = ["rider", "driver"] as const;
export type MinApp = (typeof MIN_APPS)[number];
export const MIN_APP_DOC: Record<MinApp, "rider_app_config" | "driver_app_config"> = { rider: "rider_app_config", driver: "driver_app_config" };
export const MIN_PLATFORMS = ["android", "ios"] as const;
export type MinPlatform = (typeof MIN_PLATFORMS)[number];

/** The four fields of one app, as typed (empty = off / the app's own store link). */
export type MinVersionFields = { minVersion: Record<MinPlatform, string>; storeUrls: Record<MinPlatform, string> };
export const MIN_FIELD_KINDS = ["minVersion", "storeUrls"] as const;
export type MinFieldKind = (typeof MIN_FIELD_KINDS)[number];

/** x.y.z, whole numbers 0-99999, no leading zeros (contract.json#appUpdate.validation). */
const SEMVER = /^(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})$/;
const isObject = (value: unknown): value is Doc => typeof value === "object" && value !== null && !Array.isArray(value);

/** The fields as the document has them (null or missing = ""). */
export function minVersionFieldsOf(document: Doc | null | undefined): MinVersionFields {
  const update = isObject(document?.["appUpdate"]) ? (document!["appUpdate"] as Doc) : {};
  const read = (kind: MinFieldKind) => {
    const map = isObject(update[kind]) ? (update[kind] as Doc) : {};
    return Object.fromEntries(MIN_PLATFORMS.map((p) => [p, typeof map[p] === "string" ? (map[p] as string) : ""])) as Record<MinPlatform, string>;
  };
  return { minVersion: read("minVersion"), storeUrls: read("storeUrls") };
}

/** Why one typed value cannot be saved (null = fine; "" is always fine). */
export function minFieldIssue(kind: MinFieldKind, value: string): string | null {
  const v = value.trim();
  if (v === "") return null;
  if (kind === "minVersion") return SEMVER.test(v) ? null : "Write the version as x.y.z, for example 1.4.0.";
  return /^https:\/\/\S+$/.test(v) && v.length <= 500 ? null : "Write a full https:// link.";
}

export function minFieldsIssues(fields: MinVersionFields): string[] {
  return MIN_FIELD_KINDS.flatMap((kind) => MIN_PLATFORMS.map((p) => minFieldIssue(kind, fields[kind][p])).filter((x): x is string => x !== null));
}

export const sameMinFields = (a: MinVersionFields, b: MinVersionFields) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The server's document with appUpdate.minVersion and appUpdate.storeUrls set from the fields ("" = null); every other
 * key, also the older appUpdate keys, stays as the server has it.
 */
export function withMinVersion(document: Doc, fields: MinVersionFields): Doc {
  const next: Doc = structuredClone(document);
  const update: Doc = isObject(next["appUpdate"]) ? (next["appUpdate"] as Doc) : {};
  for (const kind of MIN_FIELD_KINDS) {
    update[kind] = Object.fromEntries(MIN_PLATFORMS.map((p) => [p, fields[kind][p].trim() === "" ? null : fields[kind][p].trim()]));
  }
  next["appUpdate"] = update;
  delete next["usesStandard"];
  return next;
}
