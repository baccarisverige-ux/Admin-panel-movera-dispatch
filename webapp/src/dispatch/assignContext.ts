import { createContext, useContext } from "react";
import type { Candidate } from "../dashboard/riders";

/**
 * What a screen can hand the assign panel when it opens it: the free drivers near the rider with their positions,
 * so the Radar section can count who is inside a radar zone. Screens without live positions (the Trip page) open
 * it without them.
 */
export type AssignExtras = { candidates?: Candidate[] };

export type AssignPanelApi = { open: (tripId: string, extras?: AssignExtras) => void };

export const AssignPanelContext = createContext<AssignPanelApi>({ open: () => undefined });

export function useAssignPanel(): AssignPanelApi {
  return useContext(AssignPanelContext);
}
