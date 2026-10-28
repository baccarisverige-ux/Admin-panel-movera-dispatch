import { useMemo, type ReactNode } from "react";
import { AdminApiContext } from "../api/AdminApiContext";
import { createLiveAdminApi } from "./liveAdminApi";
import { useLiveSession } from "./LiveSessionContext";
import { LiveZonesGate, LiveZonesSync } from "./LiveZones";

/** Live builds: the demo pages read and write through the signed-in live client (src/live/liveAdminApi.ts). */
export function LiveAdminApiProvider({ children }: { children: ReactNode }) {
  const { client } = useLiveSession();
  const api = useMemo(() => createLiveAdminApi(client), [client]);
  return <AdminApiContext.Provider value={api}><LiveZonesSync /><LiveZonesGate>{children}</LiveZonesGate></AdminApiContext.Provider>;
}
