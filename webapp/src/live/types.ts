/**
 * The wire shapes of contract v0.5.3 that the live people area reads (openapi.yaml: AdminSession, AdminMe, Driver,
 * Fleet, FleetView, FleetInvitation, Vehicle, Document). Only the fields the panel shows are typed; unknown fields pass
 * through.
 */
import type { Role } from "../auth/permissions.ts";

export type AdminScope = { zones: "all" | string[]; countries?: string[]; fleetPartnerId?: string };

export type AdminMe = {
  adminId: string;
  email: string;
  name: string;
  role: Role;
  /** Fully expanded: the panel's 34 permission ids. */
  permissions: string[];
  scope: AdminScope;
  language?: string;
  idleTimeoutSeconds: number;
  approvalExempt: boolean;
};

export type AdminSession = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  actor: "admin";
  admin: AdminMe;
};

export type DriverAccountStatus = "pending" | "active" | "on_hold" | "suspended";
export type DriverOnlineStatus = "offline" | "going_online" | "online" | "on_trip" | "suspended";
export type DocumentStatus = "missing" | "in_review" | "approved" | "rejected" | "expired";
export type ReviewStatus = "pending" | "approved" | "rejected" | "blocked";

export type DocumentSummary = { documentId: string; type: string; status: DocumentStatus; expiresAt?: string };

export type DocumentRecord = {
  documentId: string;
  ownerId: string;
  type: string;
  status: DocumentStatus;
  expiresAt?: string;
  fileUrl?: string;
  reviewNote?: string;
  version: number;
  fileName?: string;
  mediaType?: string;
  uploadedAt?: string;
  reviewedAt?: string;
};

export type FleetLink = { fleetId: string; name: string; role: "owner" | "member"; status: ReviewStatus; linkedAt: string };

export type Driver = {
  driverId: string;
  accountStatus: DriverAccountStatus;
  onlineStatus: DriverOnlineStatus;
  firstName: string;
  lastName?: string;
  dateOfBirth?: string;
  email?: string;
  country?: string;
  cityId?: string;
  language?: string;
  accountType?: "driver" | "fleet";
  zoneIds: string[];
  categoryIds: string[];
  vehicleId?: string;
  fleet?: FleetLink;
  payoutTo?: "self" | "fleet";
  documents: DocumentSummary[];
  requiredDocuments?: string[];
  requiredFleetDocuments?: string[];
  termsAcceptedAt?: string;
  /** Pending invitations waiting for this account's answer (a driver's incoming invites, an owner's incoming requests). */
  pendingFleetInvitations?: number;
  version: number;
  location?: { lat: number; lng: number; measuredAt: string };
  lastFixAt?: string;
  rating?: number;
};

export type Fleet = {
  fleetId: string;
  name: string;
  orgNumber: string;
  address?: string;
  country: string;
  cityId: string;
  ownerDriverId: string;
  ownerName: string;
  ownerEmail?: string;
  status: ReviewStatus;
  code?: string;
  driverCount: number;
  vehicleCount: number;
  createdAt: string;
  version: number;
};

export type FleetDriver = {
  driverId: string;
  firstName: string;
  lastName?: string;
  accountStatus: DriverAccountStatus;
  onlineStatus: DriverOnlineStatus;
  vehicleId?: string;
  linkedAt: string;
};

export type Vehicle = {
  vehicleId: string;
  make: string;
  model: string;
  year: number;
  color: string;
  plate: string;
  seats: number;
  categoryIds: string[];
  status: ReviewStatus;
  version: number;
  fleetId?: string;
  driverId?: string;
  inUse?: boolean;
  documents?: DocumentSummary[];
  requiredDocuments?: string[];
};

export type FleetInvitationStatus = "pending" | "accepted" | "declined" | "cancelled" | "expired";

/**
 * Joining a fleet is two-sided (CONTRACT.md §14 "Joining is an invitation"): the driver asked with the code
 * (driver_request) or the owner invited a phone number (owner_invite; driverId missing until that number signs up).
 */
export type FleetInvitation = {
  invitationId: string;
  fleetId: string;
  fleetName: string;
  direction: "driver_request" | "owner_invite";
  driverId?: string;
  driverName?: string;
  phone?: string;
  status: FleetInvitationStatus;
  createdAt: string;
  expiresAt: string;
  decidedAt?: string;
  version: number;
};

export type FleetView = { fleet: Fleet; drivers: FleetDriver[]; vehicles: Vehicle[]; invitations?: FleetInvitation[] };

export type Page<T> = { items: T[]; nextCursor: string | null };

/** contract Money: integer minor units. */
export type LiveMoney = { amountMinor: number; currency: string };
export type TripPlace = { address?: string; lat: number; lng: number };

/** contract TripProjection as GET /admin/trips and GET /admin/trips/{tripId} send it (the fields the panel reads). */
export type Trip = {
  tripId: string;
  status: string;
  version: number;
  kind: "live" | "scheduled";
  scheduledAt?: string;
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string;
  riderId: string;
  driverId?: string;
  vehicleId?: string;
  zoneId: string;
  categoryId: string;
  pickup: TripPlace;
  dropoff: TripPlace;
  stops: TripPlace[];
  fare: LiveMoney;
  fareLines?: { code: string; amount: LiveMoney }[];
  driverEarnings?: LiveMoney;
  commission?: LiveMoney;
  driverBonus?: LiveMoney;
  pickupPay?: LiveMoney;
  walletApplied?: LiveMoney;
  cashToCollect?: LiveMoney;
  driverSilentAlert?: { at?: string; [key: string]: unknown };
  ratingStatus?: string;
  paymentMethod: string;
  paymentStatus?: string;
  driver?: { driverId: string; firstName: string; vehicle?: { vehicleId?: string; make?: string; model?: string; color?: string; plate?: string } };
  cancellation?: { actor: string; reasonCode: string; at: string; fee: LiveMoney | null; note?: string; feeStatus?: string };
};

/** contract Offer (GET /admin/trips/{tripId}/offers). */
export type TripOffer = { offerId: string; driverId?: string; kind: string; status: string; expiresAt: string; fare: LiveMoney; driverEarnings?: LiveMoney; driverBonus?: LiveMoney; priority?: boolean; groupId?: string; source?: string };

/** contract Refund (201 of POST /admin/trips/{tripId}/refund). */
export type Refund = { refundId: string; amount: LiveMoney; status: string; reason: string };

/** GET /admin/live/drivers: drivers not offline, with the last position. */
export type LiveDriverRow = {
  driverId: string;
  firstName: string;
  onlineStatus: DriverOnlineStatus;
  moving?: boolean;
  location?: { lat: number; lng: number; measuredAt: string };
  lastFixAt?: string;
  stale: boolean;
  activeTripId?: string;
  tripStatus?: string;
  vehicleId?: string;
  plate?: string;
  zoneId?: string;
};
export type LiveDriverList = { items: LiveDriverRow[]; staleAfterSeconds: number; serverTime: string };

/** GET /admin/trips/{tripId}/trace: the car's positions on the trip (kept 30 days). */
export type TripTrace = { tripId: string; fixes: { lat: number; lng: number; measuredAt: string }[]; keptUntil: string };

/** GET /admin/riders (AdminRider). */
export type Rider = {
  riderId: string;
  firstName: string;
  phone: string;
  email?: string;
  rating?: number;
  status: string;
  version: number;
  outstanding: LiveMoney | null;
  wallet?: LiveMoney;
  language?: string;
  deletionRequestedAt?: string;
};

/** GET /admin/payments (PaymentIntent; the cash week adds cashCollected and walletApplied). */
export type Payment = { paymentId: string; tripId: string; amount: LiveMoney; method: string; purpose: string; status: string; createdAt: string; cashCollected?: LiveMoney; walletApplied?: LiveMoney };

/** GET /admin/refunds/payouts: refunds to send by hand (Swish/bank). */
export type RefundPayout = { refundId: string; tripId?: string; amount: LiveMoney; status?: string; reason?: string; createdAt?: string; riderId: string; riderName: string; riderPhone: string; payoutTo: unknown; payoutStatus?: string };

/** GET /admin/audit (AuditEntry). */
export type AuditEntry = { auditId: string; at: string; actor: string; actorId: string; actorRole?: string; action: string; targetType: string; targetId: string; reason?: string; result: string; after?: Record<string, unknown>; requestId: string };

/** GET /admin/approvals (Approval). */
export type Approval = { approvalId: string; action: string; targetType: string; targetId: string; status: "pending_approval" | "approved" | "rejected" | "expired"; requestedBy: string; requestedAt: string; decidedBy?: string; decidedAt?: string; decisionNote?: string };

/** GET /admin/trips/{tripId}/nearby-drivers. */
export type NearbyDriver = { driverId: string; firstName: string; onlineStatus: string; moving?: boolean; location: { lat: number; lng: number; measuredAt: string }; distanceMeters: number; pickupEtaSeconds: number; zoneId?: string; categoryIds: string[]; openOfferId?: string };

/** GET /admin/ratings (AdminRating, contract v0.9.0). */
export type AdminRating = { tripId: string; from: "rider" | "driver"; stars: number; tags: string[]; comment?: string; at: string; riderId: string; riderName?: string; driverId?: string; driverName?: string; zoneId: string; hidden: boolean; hiddenBy?: string; hiddenAt?: string; hideReason?: string };

/** GET /admin/tickets (SupportTicket, contract v0.9.0). */
export type TicketMessage = { messageId: string; from: "rider" | "driver" | "support"; text: string; at: string; adminName?: string };
export type SupportTicket = { ticketId: string; tripId?: string; openedBy: "rider" | "driver"; riderId?: string; driverId?: string; category: string; subject: string; status: "open" | "pending" | "resolved" | "closed"; priority?: string; createdAt: string; updatedAt: string; zoneId?: string; lastMessageAt?: string; messages?: TicketMessage[] };

/** GET /admin/risk/signals (RiskPerson, contract v0.9.0). */
export type RiskSignal = { value: number; count: number; total?: number };
export type RiskPerson = { who: "driver" | "rider"; id: string; name: string; zoneId?: string; signals: Partial<Record<"cancels" | "failed_payments" | "low_rating", RiskSignal>> };

/** GET /admin/kpis (KpiDay, contract v0.9.0; money lines v0.10.3). */
export type KpiDay = { date: string; zoneId: string; source: "live" | "summary"; currency: string; completedTrips: number; cancelledTrips: number; noShows: number; gross: number; commission: number; driverEarnings: number; pickupPay: number; driverBonus: number; cashCollected: number; walletApplied: number; newRiders: number; newDrivers: number;
  /** v0.10.3 (contract.json#kpis.money); absent from an older server = "Not connected yet". */
  tips?: number; refunds?: number; fees?: number; moveraEarnings?: number };
