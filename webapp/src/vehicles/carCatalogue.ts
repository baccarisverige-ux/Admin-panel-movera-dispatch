/**
 * v0.18.178 (contract.json#carCatalogue.admin; owner 2026-11-28 "admin can add more"; area c73): the car makes and models
 * the driver app offers on Lägg till bil. GET /admin/car-catalogue (drivers.read), POST .../makes and
 * .../makes/{makeId}/models, PATCH .../makes/{makeId} and .../models/{modelId} { name?, hidden? } (vehicles.edit).
 * Hide, never delete (Rule 21). A rename changes the catalogue only; cars keep the make/model string they were saved with.
 */
export type CarSource = "eea" | "admin";
export type AdminCarModel = { modelId: string; name: string; hidden: boolean; source: CarSource; updatedAt?: string };
export type AdminCarMake = { makeId: string; name: string; hidden: boolean; source: CarSource; updatedAt?: string; models: AdminCarModel[] };
export type AdminCarCatalogue = { version: number; attribution: string; makes: AdminCarMake[] };
export type CarHttp = { json: <T>(path: string) => Promise<T>; post: <T>(path: string, body?: unknown) => Promise<T>; patch: <T>(path: string, body: unknown) => Promise<T> };

export const CAR_CATALOGUE_PATH = "/admin/car-catalogue";
/** The 8 labels of the card (owner OK pending, plan 4). */
export const CAR_LABELS = { title: "Car catalogue", addMake: "Add make", addModel: "Add model", hide: "Hide", show: "Show", hidden: "Hidden", typed: "Typed by driver", addToCatalogue: "Add to catalogue" } as const;
export const SOURCE_LABEL: Readonly<Record<CarSource, string>> = { eea: "EEA", admin: "Added by admin" };

/** Case- and accent-insensitive key ("skoda" finds "Škoda"), same rule as the server's name_key. */
export function carKey(text: string): string {
  return text.replace(/\+/g, " plus ").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Makes whose name, or one of whose models, holds the search (all when empty). */
export function filterMakes(makes: readonly AdminCarMake[], q: string): AdminCarMake[] {
  const key = carKey(q);
  if (!key) return [...makes];
  return makes.filter((m) => carKey(m.name).includes(key) || m.models.some((d) => carKey(d.name).includes(key)));
}

export const readCatalogue = (http: CarHttp) => http.json<AdminCarCatalogue>(CAR_CATALOGUE_PATH);
export const addMake = (http: CarHttp, name: string) => http.post<AdminCarMake>(`${CAR_CATALOGUE_PATH}/makes`, { name: name.trim() });
export const addModel = (http: CarHttp, makeId: string, name: string) => http.post<AdminCarModel>(`${CAR_CATALOGUE_PATH}/makes/${encodeURIComponent(makeId)}/models`, { name: name.trim() });
export const setMake = (http: CarHttp, makeId: string, body: { name?: string; hidden?: boolean }) => http.patch<AdminCarMake>(`${CAR_CATALOGUE_PATH}/makes/${encodeURIComponent(makeId)}`, body);
export const setModel = (http: CarHttp, modelId: string, body: { name?: string; hidden?: boolean }) => http.patch<AdminCarModel>(`${CAR_CATALOGUE_PATH}/models/${encodeURIComponent(modelId)}`, body);

/** The clear English reason of a failed change (translated by the screen). 409 make_exists names the row and whether it is hidden. */
export function carErrorText(error: unknown): string {
  const e = error as { status?: number; reason?: string | null; details?: string[] } | null;
  if (e?.reason === "make_exists" || e?.reason === "model_exists") return e.details?.[1] === "hidden" ? "Already in the catalogue, hidden: use Show." : "Already in the catalogue.";
  if (e?.reason === "missing_permission" || e?.status === 403) return "You need the right to edit vehicles.";
  if (e?.status === 404) return "This entry no longer exists.";
  return "Could not save. Try again.";
}

/** Vehicle detail: the car's make was typed by the driver (Vehicle.makeId null on a v0.18.178 server). */
export const carTypedByDriver = (vehicle: { makeId?: string | null }) => vehicle.makeId === null;
