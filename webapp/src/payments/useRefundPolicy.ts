import { useMemo } from "react";
import { useSlice } from "../api/hooks";
import { REFUND_POLICY_KEY, normalizeRefundPolicy, type RefundPolicy } from "./refundPolicy";

/** The one second-admin refund rule, as saved in Settings (Q25). Defaults until it loads. */
export function useRefundPolicy(): { policy: RefundPolicy; loading: boolean; slice: ReturnType<typeof useSlice<unknown>> } {
  const slice = useSlice<unknown>(REFUND_POLICY_KEY, null);
  const policy = useMemo(() => normalizeRefundPolicy(slice.value), [slice.value]);
  return { policy, loading: slice.loading, slice };
}
