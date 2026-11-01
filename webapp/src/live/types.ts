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

/**
 * v0.18.5 (owner G2-D1 "Keep old until new approved (Recommended)"): renewalOf = the approved document this upload
 * renews; it is listed right after that one and reviewed with its own documentId.
 */
export type DocumentSummary = { documentId: string; type: string; status: DocumentStatus; expiresAt?: string; renewalOf?: string };

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
  /** v0.18.5 (G2-D1): set on a renewal. */
  renewalOf?: string;
};

export type FleetLink = { fleetId: string; name: string; role: "owner" | "member"; status: ReviewStatus; linkedAt: string };

/** v0.18.4 (G3-D2): the driver's own numbers over the last windowDays days; null while there are too few. */
export type DriverPerformance = { windowDays: number; from: string; offersAnswerable: number; offersAccepted: number; tripsCancelled: number; ratingCount: number; acceptancePct: number | null; cancellationPct: number | null; rating: number | null };

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
  /** When the account was created, if the server sends it (not in the contract yet: read when present). */
  createdAt?: string;
  /** Pending invitations waiting for this account's answer (a driver's incoming invites, an owner's incoming requests). */
  pendingFleetInvitations?: number;
  version: number;
  location?: { lat: number; lng: number; measuredAt: string };
  lastFixAt?: string;
  rating?: number;
  /** v0.18.4 (G3-D2): on GET /admin/drivers/{driverId} (not on the list). */
  performance?: DriverPerformance;
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
  /** v0.18.0: the car's fuel. */
  fuel?: "petrol" | "diesel" | "hybrid" | "electric";
  /** v0.18.3 (R2): "<category>:<problem>" while the car breaks the country's rules; Approve is 409 vehicle_rules_not_met. */
  ruleProblems?: string[];
  /** v0.18.5 (owner G2-D5.3): the ride categories and extras this car fits now; the admin gives some of them on approval. */
  fitCategories?: string[];
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

/** v0.18.7 (G5 Q4): the server's road-route ETA, refreshed every 30 s while a driver is on the way or driving. */
export type TripEta = { etaSeconds: number; distanceMeters: number; target: "pickup" | "dropoff"; at: string; source: "osrm" | "estimate" | "stale" };
/** v0.18.7 (G5 Q1): the rider as the driver and admin see them from accept to the end (never the rider's own view). */
export type RiderSummary = { firstName: string; rating?: number };
/** v0.18.7: the rules a trip is charged by (booking snapshot + the zone's switches at booking time). */
export type TripTerms = { currency: string; freeWaitMin: number; waitPerMin: LiveMoney; noShowAfterMin: number; noShowFee: LiveMoney; noShowDriverSharePct: number; cancelRule: { freeMin?: number; fee?: LiveMoney | null; [key: string]: unknown } | null; cancelDriverSharePct: number; cancelAfterArrivedIsNoShow: boolean; maxPickupMoveMeters: number };
/** contract Waiting (+ v0.18.7 Q5/Q6 amounts). */
export type TripWaiting = { arrivedAt: string; freeUntil: string; noShowAt: string; chargedSeconds: number; noShowFee?: LiveMoney; noShowDriverShare?: LiveMoney; chargedSecondsNow?: number; chargedSoFar?: LiveMoney; /** v0.18.8 (G6): whole paid minutes (rounded up), the applied rule ids and the effective minutes. */ paidMinutes?: number; rules?: string[]; freeWaitMin?: number; noShowAfterMin?: number };
/** contract Cancellation (+ v0.18.7 Q2/Q6 feeKind and driverShare). */
export type TripCancellation = { actor: string; reasonCode: string; at: string; fee: LiveMoney | null; note?: string; feeStatus?: "paid" | "owed" | "waived" | string; feeKind?: "cancel" | "no_show" | string; driverShare?: LiveMoney; /** v0.18.8 (G6): the admin's reverse of a no-show. */ reversal?: { at: string; by?: string; reason?: string; driverShareTakenBack: boolean }; /** v0.18.8 round 1: a paid fee refunded to the wallet (feeStatus stays waived). */ refundedAt?: string; refundedToWallet?: boolean };

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
  cancellation?: TripCancellation;
  /** v0.18.7 (contract.json#pickupWaiting.adminLiveRow): on a trip going on with a driver, list rows and the trip page alike. */
  driverLocation?: { lat: number; lng: number; measuredAt: string; accuracy?: number; heading?: number; moving?: boolean };
  etaSeconds?: number;
  eta?: TripEta;
  rider?: RiderSummary;
  terms?: TripTerms;
  waiting?: TripWaiting;
  /** v0.18.8 (G6, contract.json#arrivedWaiting.pin): the rider PIN (admin view only: pickupPin, pinAttempts). */
  pinRequired?: boolean;
  pickupPin?: string;
  pinVerified?: boolean;
  pinAttempts?: number;
  /** v0.18.8 round 1: 3 × maxAttempts wrong tries in all; only an admin unlock (POST /admin/trips/{id}/pin/unlock) clears it. */
  pinBlocked?: boolean;
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
export type LiveDriverList = { items: LiveDriverRow[]; staleAfterSeconds: number; serverTime: string; ridersOnline?: { zoneId: string; count: number }[]; ridersOnlineWindowSeconds?: number; zoneSupply?: ZoneSupplyRow[] };
/** v0.18.4 (G3-D5): GET /admin/live/drivers → zoneSupply, one row per zone. */
export type ZoneSupplyRow = { zoneId: string; online: number; free: number; busy: number; waiting: number; level: "ok" | "tight" | "short"; shortage: boolean };

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
  /** v0.18.7 (G5 Q3): every currency the rider owes in, oldest debt first; outstanding is the first of them. */
  outstandingByCurrency?: LiveMoney[];
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
