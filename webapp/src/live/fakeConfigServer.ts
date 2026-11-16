import { marketOfZone } from "../markets/markets.ts";
import type { ConfigHttp, Doc } from "./configDocs.ts";

/**
 * Test helper (node --test only, never bundled): the server's config documents in memory, with the rules the admin
 * depends on (movera-server src/config/service.ts): a zone without its own live document uses its country's Standard;
 * a publish is the next version above the zone's own and its Standard's; History is newest first and carries the note;
 * Restore publishes an old version again when expectedVersion is the live one (else 409); Go back to Standard removes
 * the zone's own document and re-stamps the Standard. History and Restore take `country` (server commit fad59d5);
 * `{ countryHistory: false }` is the server before it (400 for a country).
 */
type Entry = { version: number; publishedAt: string; publishedBy: string; note?: string; action: "publish" | "restore"; restoredFrom?: number; document: Doc };
type Row = { draftVersion: number; draft: Doc | null; live: { version: number; document: Doc } | null; history: Entry[] };
export type FakeCall = { method: string; path: string; body?: unknown };
type Seed = { liveVersion: number; document: Doc; draftVersion?: number };

const refuse = (status: number, reason: string) => Object.assign(new Error(reason), { status, reason });
const standardOf = (id: string) => (/^standard-/.test(id) ? null : `standard-${marketOfZone(id)?.id ?? "SE"}`);

export function fakeConfigServer(seed: Record<string, Seed>, options: { countryHistory?: boolean; by?: string } = {}) {
  const calls: FakeCall[] = [];
  const rows = new Map<string, Row>();
  let clock = Date.parse("2026-11-16T06:00:00Z");
  const stamp = () => new Date((clock += 1000)).toISOString();
  for (const [key, item] of Object.entries(seed)) {
    const history: Entry[] = item.liveVersion > 0 ? [{ version: item.liveVersion, publishedAt: "2026-11-02T13:44:16.078Z", publishedBy: "seed", action: "publish", document: { ...item.document, version: item.liveVersion } }] : [];
    rows.set(key, { draftVersion: item.draftVersion ?? item.liveVersion + 1, draft: item.document, live: item.liveVersion > 0 ? { version: item.liveVersion, document: item.document } : null, history });
  }
  const scope = (doc: string, from: { zoneId?: string | null; country?: string | null }) => {
    if (Boolean(from.zoneId) === Boolean(from.country)) throw refuse(400, "scope_required");
    return `${doc}:${from.zoneId ?? `standard-${from.country}`}`;
  };
  const parts = (key: string) => ({ doc: key.slice(0, key.indexOf(":")), id: key.slice(key.indexOf(":") + 1) });
  const standardLive = (key: string) => {
    const { doc, id } = parts(key);
    const standard = standardOf(id);
    return standard ? rows.get(`${doc}:${standard}`)?.live ?? null : null;
  };
  function publish(key: string, note: string | undefined, restoredFrom?: number): { version: number } {
    const row = rows.get(key)!;
    const version = Math.max(row.live?.version ?? 0, standardLive(key)?.version ?? 0) + 1;
    const document = { ...row.draft!, version };
    row.live = { version, document };
    row.draftVersion += 1;
    row.history.unshift({ version, publishedAt: stamp(), publishedBy: options.by ?? "adm_1", ...(note ? { note } : {}), action: restoredFrom ? "restore" : "publish", ...(restoredFrom ? { restoredFrom } : {}), document });
    return { version };
  }
  const http: ConfigHttp = {
    json: async <T,>(path: string) => {
      calls.push({ method: "GET", path });
      const url = new URL(`http://x${path}`);
      const [, , , doc, tail] = url.pathname.split("/");
      const country = url.searchParams.get("country");
      if (tail === "history") {
        if (country && options.countryHistory === false) throw refuse(400, "invalid_body");
        const row = rows.get(scope(doc!, { zoneId: url.searchParams.get("zoneId"), country }));
        return { items: (row?.history ?? []).slice(0, Number(url.searchParams.get("limit") ?? 50)), nextCursor: null } as T;
      }
      if (tail) throw refuse(404, "not_found");
      const key = scope(doc!, { zoneId: url.searchParams.get("zoneId"), country });
      const row = rows.get(key);
      const standard = standardLive(key);
      const zone = !parts(key).id.startsWith("standard-");
      if (row && (row.live || row.draft)) return { version: row.draftVersion, liveVersion: row.live?.version ?? 0, ...(zone ? { usesStandard: !row.live && Boolean(standard) } : {}), document: structuredClone(row.draft ?? row.live!.document) } as T;
      if (standard) return { version: 1, liveVersion: 0, usesStandard: true, document: structuredClone(standard.document) } as T;
      throw refuse(404, "config_not_found");
    },
    put: async <T,>(path: string, body: unknown) => {
      calls.push({ method: "PUT", path, body });
      const input = body as { expectedVersion: number; zoneId?: string; country?: string; document: Doc };
      const key = scope(path.split("/")[3]!, input);
      const row = rows.get(key) ?? { draftVersion: 1, draft: null, live: null, history: [] };
      if (row.draftVersion !== input.expectedVersion) throw refuse(409, "version_mismatch");
      rows.set(key, { ...row, draftVersion: row.draftVersion + 1, draft: input.document });
      return { version: row.draftVersion + 1 } as T;
    },
    post: async <T,>(path: string, body: unknown) => {
      calls.push({ method: "POST", path, body });
      const [, , , doc, action] = path.split("/");
      const input = body as { expectedVersion: number; zoneId?: string; country?: string; version?: number; note?: string };
      const key = scope(doc!, input);
      const row = rows.get(key);
      if (action === "publish") {
        if (!row || row.draftVersion !== input.expectedVersion) throw refuse(409, "draft_changed");
        return publish(key, input.note) as T;
      }
      if (action === "restore") {
        if (!row?.live || row.live.version !== input.expectedVersion) throw refuse(409, "live_changed");
        const old = row.history.find((entry) => entry.version === input.version);
        if (!old) throw refuse(404, "version_not_found");
        row.draft = old.document;
        return publish(key, input.note ?? `Restore version ${input.version}`, input.version) as T;
      }
      if (action === "use-standard") {
        const standardKey = `${doc}:${standardOf(parts(key).id)}`;
        const standard = rows.get(standardKey);
        if (!row?.live) throw refuse(409, "already_standard");
        if (row.draftVersion !== input.expectedVersion) throw refuse(409, "draft_changed");
        if (!standard?.live) throw refuse(409, "standard_not_published");
        const version = Math.max(standard.live.version, row.live.version) + 1;
        rows.set(key, { draftVersion: 1, draft: null, live: null, history: row.history });
        standard.live = { version, document: { ...standard.live.document, version } };
        standard.history.unshift({ version, publishedAt: stamp(), publishedBy: options.by ?? "adm_1", note: `re-stamped: ${parts(key).id} went back to the standard`, action: "publish", document: standard.live.document });
        return { version } as T;
      }
      throw refuse(404, "not_found");
    },
  };
  return {
    http,
    calls,
    /** The live version of a document, or 0 when the scope has none of its own. */
    live: (key: string) => rows.get(key)?.live?.version ?? 0,
    liveDocument: (key: string) => rows.get(key)?.live?.document ?? null,
    history: (key: string) => rows.get(key)?.history ?? [],
    /** What was sent that changes the server, as "METHOD path scope". */
    writes: () => calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.path} ${(c.body as { zoneId?: string }).zoneId ?? `country=${(c.body as { country?: string }).country}`}`),
  };
}
