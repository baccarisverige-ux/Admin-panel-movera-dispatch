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
  paymentMethod: string;
  paymentStatus?: string;
  driver?: { driverId: string; firstName: string; vehicle?: { vehicleId?: string; make?: string; model?: string; color?: string; plate?: string } };
  cancellation?: { actor: string; reasonCode: string; at: string; fee: LiveMoney | null; note?: string; feeStatus?: string };
};

/** contract Offer (GET /admin/trips/{tripId}/offers). */
export type TripOffer = { offerId: string; kind: string; status: string; expiresAt: string; fare: LiveMoney; driverEarnings?: LiveMoney; source?: string };

/** contract Refund (201 of POST /admin/trips/{tripId}/refund). */
export type Refund = { refundId: string; amount: LiveMoney; status: string; reason: string };
