import { useEffect, useMemo, useState } from "react";
import { useRecords, useRiders, useSlice } from "../api/hooks";
import { rideRequests } from "../dashboard/riders";
import { CARE_KEY, emptyRiderCare, normalizeCare } from "./care";
import { buildRows, type Period } from "./segments";

/** Riders of the chosen country and zones, with everything the list and the rider page need. */
/** `enabled: false` reads nothing (Q132: the live alert bar needs no rider data). */
export function useRidersData(period: Period, scope?: string | null, options: { enabled?: boolean } = {}) {
  const off = options.enabled === false ? { enabled: false } : {};
  const riders = useRiders(scope ?? null, off);
  const trips = useRecords("trips", scope, { refetchMs: 30_000, ...off });
  const drivers = useRecords("drivers", undefined, off);
  const tickets = useRecords("tickets", undefined, off);
  const careSlice = useSlice<unknown>(CARE_KEY, emptyRiderCare(), off);
  const care = useMemo(() => normalizeCare(careSlice.value), [careSlice.value]);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 60_000) * 60_000);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 60_000) * 60_000), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const waiting = useMemo(() => new Set(rideRequests(trips.data ?? [], riders.data ?? []).map((request) => request.riderId).filter((id): id is string => Boolean(id))), [trips.data, riders.data]);
  const driverList = useMemo(() => (drivers.data ?? []).map((row) => ({ id: row.id, name: row.name, zoneId: row.zoneId })), [drivers.data]);
  const rows = useMemo(() => buildRows(riders.data ?? [], care, now, period, waiting, driverList), [riders.data, care, now, period, waiting, driverList]);
  return { rows, care, careSlice, now, loading: riders.isLoading || careSlice.loading, error: riders.isError, refetch: riders.refetch, tickets };
}
