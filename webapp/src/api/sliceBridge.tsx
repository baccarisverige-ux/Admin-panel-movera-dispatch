import { createContext, useContext, type ReactNode } from "react";

/**
 * A slice read and written somewhere else than the demo store. Live mode wraps a demo screen in a bridge so the
 * screen's own components (useSlice, CommandButton with a sliceKey) read and write the Movera server through the
 * contract instead, unchanged. Without a bridge every slice keeps the demo adapter.
 */
export type SliceWrite = { action: string; reason: string; targetId: string; before: string; after: string; idempotencyKey: string };
export type SliceWriteResult = { message: string; status: "committed" | "pending_approval" };
export type SliceBridge = {
  queryKey: readonly unknown[];
  read: () => Promise<unknown>;
  write: (value: unknown, input: SliceWrite) => Promise<SliceWriteResult>;
};

const SliceBridgeContext = createContext<Readonly<Record<string, SliceBridge>>>({});

export function SliceBridgeProvider({ bridges, children }: { bridges: Readonly<Record<string, SliceBridge>>; children: ReactNode }) {
  return <SliceBridgeContext.Provider value={bridges}>{children}</SliceBridgeContext.Provider>;
}

export function useSliceBridges(): Readonly<Record<string, SliceBridge>> {
  return useContext(SliceBridgeContext);
}
