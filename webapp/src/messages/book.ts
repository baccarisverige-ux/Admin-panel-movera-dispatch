/**
 * Kept because the live admin has no delivery states yet (C-21): accepted, sent, delivered, failed.
 * The test-send audience is messages/ops.ts (campaignAudience).
 */
export type Delivery = "accepted" | "sent" | "delivered" | "failed";

export type Audience = { app: "rider" | "driver"; zone: string };

export type Outbound = { id: string; audience: Audience; body: string; status: Delivery };

export function advance(message: Outbound, next: Delivery): Outbound {
  return { ...message, status: next };
}
