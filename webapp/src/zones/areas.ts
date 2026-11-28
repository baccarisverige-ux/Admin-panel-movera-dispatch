/**
 * v0.18.172 (contract.json#preferredAreas.admin; owner 2026-11-27/28 driver preferred areas): the areas of a zone a
 * driver may prefer (kommun, stadsdelsområde, arrondissement, commune, département, Paris). GET /admin/areas
 * (zones.read), PATCH /admin/areas/{areaId} (zones.edit): switch an area off, or give it another name. Areas only
 * change the ORDER of booked rides in the driver app, never who may see a ride.
 */
export type AdminArea = {
  areaId: string; name: string; officialName: string; nameOverride: string | null; kind: string; zoneId: string; country: string;
  parentName?: string; derived: boolean; source: string; licence: string; sourceYear: number; active: boolean; updatedAt?: string;
};
export type AdminAreaPage = { items: AdminArea[]; nextCursor: string | null };
export type AreaHttp = { json: <T>(path: string) => Promise<T>; patch: <T>(path: string, body: unknown) => Promise<T> };

export const AREAS_PATH = "/admin/areas";

/** English kind labels (translated by the screen). */
export const AREA_KIND_LABEL: Readonly<Record<string, string>> = {
  kommun: "Municipality (kommun)", stadsdelsomrade: "District (stadsdelsområde)", city: "City", arrondissement: "Arrondissement",
  commune: "Commune", departement: "Département",
};
export const DERIVED_LABEL = "Approximate outline (derived from SCB statistical areas)";
export const DERIVED_INFO = "Used only to order booked rides in the driver app, never for who may see a ride.";

export function areasPath(zoneId: string, q: string, cursor: string | null): string {
  const p = new URLSearchParams({ zoneId });
  if (q.trim()) p.set("q", q.trim());
  if (cursor) p.set("cursor", cursor);
  return `${AREAS_PATH}?${p.toString()}`;
}

export const readAreas = (http: AreaHttp, zoneId: string, q = "", cursor: string | null = null): Promise<AdminAreaPage> =>
  http.json<AdminAreaPage>(areasPath(zoneId, q, cursor));

/** PATCH body: only what changed; an empty name clears the override (null). */
export function areaPatch(area: AdminArea, next: { active?: boolean; name?: string }): { active?: boolean; nameOverride?: string | null } | null {
  const body: { active?: boolean; nameOverride?: string | null } = {};
  if (next.active !== undefined && next.active !== area.active) body.active = next.active;
  if (next.name !== undefined) {
    const name = next.name.trim();
    const override = name === "" || name === area.officialName ? null : name.slice(0, 120);
    if (override !== area.nameOverride) body.nameOverride = override;
  }
  return Object.keys(body).length ? body : null;
}

export const saveArea = (http: AreaHttp, areaId: string, body: { active?: boolean; nameOverride?: string | null }): Promise<AdminArea> =>
  http.patch<AdminArea>(`${AREAS_PATH}/${encodeURIComponent(areaId)}`, body);

/** The clear English reason of a failed change (translated by the screen). */
export function areaErrorText(error: unknown): string {
  const e = error as { status?: number; reason?: string | null } | null;
  if (e?.reason === "zone_out_of_scope") return "This zone is outside your scope.";
  if (e?.reason === "missing_permission" || e?.status === 403) return "You need the right to edit zones.";
  if (e?.status === 404) return "This area no longer exists.";
  return "Could not save. Try again.";
}

/** Driver detail: "Södermalm, Solna" or the none text (English, translated by the page). */
export function preferredAreasText(areas: readonly { name: string }[] | undefined): string | null {
  return areas && areas.length ? areas.map((a) => a.name).join(", ") : null;
}
export const NO_PREFERRED_AREAS = "None: sees the whole zone by time";
