import { useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/httpClient";
import { SliceBridgeProvider, type SliceBridge, type SliceWriteResult } from "../api/sliceBridge";
import { COUNTRY_SETTINGS_KEY, normalizeCountrySettingsBook } from "../config/countrySettings";
import { useMarketScope } from "../markets/useMarketScope";
import { PricingPage } from "../pages/PricingPage";
import { SLICE_KEY, normalizeStore, type Revision } from "../pricing/zonePricing";
import { NoAccess } from "../ui/kit";
import { tr } from "../i18n";
import { useLiveSession } from "./LiveSessionContext";
import { countryBookOf, planCountryWrite, planPricingWrite, storeOf, type ConfigDraft, type Plan, type PricingDocument, type SurgeSchedule, type ZoneServer } from "./livePricing";
import { ErrorLine, isVersionMismatch } from "./ui";

/**
 * Live Pricing: the demo Pricing section itself (pages/PricingPage.tsx and every panel it uses), reading and writing
 * the Movera server through the contract. The demo's two slices (zone pricing, country Tips & limits) are bridged
 * (api/sliceBridge.tsx): the screen is unchanged, livePricing.ts maps the documents both ways.
 */
export function LivePricingPage() {
  const { client, can, admin } = useLiveSession();
  const queryClient = useQueryClient();
  const { market } = useMarketScope();
  const scoped = admin && Array.isArray(admin.scope.zones) ? admin.scope.zones : null;
  const zoneIds = useMemo(() => market.zones.map((zone) => zone.id).filter((id) => !scoped || scoped.includes(id)), [market, scoped]);
  const serverKey = useMemo(() => ["live", "pricing", "server", market.id, zoneIds.join(",")] as const, [market.id, zoneIds]);
  // Publishes made from this screen: the contract has no read of the pricing history (see the report).
  const history = useRef<Revision[]>([]);

  const server = useQuery({
    queryKey: serverKey,
    enabled: can("settings.read"),
    retry: false,
    queryFn: async (): Promise<ZoneServer[]> => {
      const optional = async <T,>(path: string): Promise<T | null> => {
        try {
          return (await client.json<T>(path)) ?? null;
        } catch (error) {
          if (error instanceof ApiError && error.status === 404) return null;
          throw error;
        }
      };
      return Promise.all(zoneIds.map(async (zoneId) => {
        const q = `?zoneId=${encodeURIComponent(zoneId)}`;
        const [pricing, rider, driver, surge] = await Promise.all([
          optional<ConfigDraft<PricingDocument>>(`/admin/config/pricing${q}`),
          optional<NonNullable<ZoneServer["rider"]>>(`/admin/config/rider_app_config${q}`),
          optional<NonNullable<ZoneServer["driver"]>>(`/admin/config/driver_app_config${q}`),
          optional<SurgeSchedule>(`/admin/zones/${encodeURIComponent(zoneId)}/surge`),
        ]);
        return { zoneId, pricing, rider, driver, surge };
      }));
    },
  });

  const bridges = useMemo<Record<string, SliceBridge>>(() => {
    const zones = () => queryClient.getQueryData<ZoneServer[]>(serverKey) ?? [];
    const fresh = async () => {
      await queryClient.invalidateQueries({ queryKey: serverKey });
      return queryClient.fetchQuery<ZoneServer[]>({ queryKey: serverKey });
    };

    /** Runs the planned calls in order: config documents as a draft PUT and a publish, surge schedules directly. */
    async function run(plan: Plan, note: string): Promise<SliceWriteResult> {
      if (plan.refused.length) throw new Error(plan.refused.join(" "));
      if (!plan.steps.length) throw new Error(tr("Nothing changed."));
      let pending = 0;
      for (const step of plan.steps) {
        try {
          if (step.kind === "config") {
            let expectedVersion = step.expectedVersion;
            let current: Record<string, unknown> | null = null;
            if (expectedVersion === null) {
              const draft = await client.json<ConfigDraft>(`/admin/config/${step.doc}?zoneId=${encodeURIComponent(step.zoneId)}`).catch((error: unknown) => {
                if (error instanceof ApiError && error.status === 404) return null;
                throw error;
              });
              expectedVersion = draft?.version ?? 1;
              current = draft?.document ?? null;
            }
            const saved = await client.json<ConfigDraft>(`/admin/config/${step.doc}`, { method: "PUT", body: JSON.stringify({ expectedVersion, zoneId: step.zoneId, document: step.patch(current) }) });
            const answer = await client.post<{ approvalId?: string }>(`/admin/config/${step.doc}/publish`, { expectedVersion: saved.version, zoneId: step.zoneId, ...(note ? { note } : {}) });
            if (answer && "approvalId" in answer) pending += 1;
          } else if (step.kind === "surge") {
            const answer = await client.json<{ approvalId?: string }>(`/admin/zones/${encodeURIComponent(step.zoneId)}/surge`, { method: "PUT", body: JSON.stringify(step.body) });
            if (answer && "approvalId" in answer) pending += 1;
          } else {
            await client.post(`/admin/zones/${encodeURIComponent(step.zoneId)}/surge/end`, step.body);
          }
        } catch (error) {
          await fresh().catch(() => undefined);
          if (isVersionMismatch(error)) throw new Error(tr("Someone else changed {0}. It was reloaded; check it and try again.", [step.label]));
          throw new Error(`${step.label}: ${error instanceof Error ? error.message : tr("Something failed.")}`);
        }
      }
      await fresh();
      return pending ? { status: "pending_approval", message: tr("Sent. {0} of the changes wait for a second admin to approve.", [pending]) } : { status: "committed", message: "" };
    }

    const pricing: SliceBridge = {
      queryKey: ["live", "pricing", "slice", SLICE_KEY, ...serverKey],
      read: async () => storeOf(await queryClient.fetchQuery<ZoneServer[]>({ queryKey: serverKey }), history.current, Date.now()),
      write: async (value, input) => {
        const now = Date.now();
        const prev = storeOf(zones(), history.current, now);
        const next = normalizeStore(value);
        const result = await run(planPricingWrite(prev, next, zones(), input.reason, now), input.reason);
        const added = next.history.filter((item) => !prev.history.some((old) => old.rev === item.rev));
        if (added.length) history.current = [...added, ...history.current];
        return result;
      },
    };
    const country: SliceBridge = {
      queryKey: ["live", "pricing", "slice", COUNTRY_SETTINGS_KEY, ...serverKey],
      read: async () => countryBookOf(await queryClient.fetchQuery<ZoneServer[]>({ queryKey: serverKey })),
      write: async (value, input) => run(planCountryWrite(countryBookOf(zones()), normalizeCountrySettingsBook(value), zones()), input.reason),
    };
    return { [SLICE_KEY]: pricing, [COUNTRY_SETTINGS_KEY]: country };
  }, [client, queryClient, serverKey]);

  if (!can("settings.read")) return <NoAccess />;
  if (server.isLoading) return <p className="state-line">{tr("Loading pricing.")}</p>;
  if (server.error) return <ErrorLine error={server.error} onRetry={() => void server.refetch()} />;
  return (
    <SliceBridgeProvider bridges={bridges}>
      <PricingPage />
    </SliceBridgeProvider>
  );
}
