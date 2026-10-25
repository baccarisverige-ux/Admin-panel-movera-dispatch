/**
 * The wire shapes of contract v0.5.3 that the live people area reads (openapi.yaml: AdminSession, AdminMe, Driver,
 * Fleet, FleetView, Vehicle, Document). Only the fields the panel shows are typed; unknown fields pass through.
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

export type FleetView = { fleet: Fleet; drivers: FleetDriver[]; vehicles: Vehicle[] };

export type Page<T> = { items: T[]; nextCursor: string | null };
