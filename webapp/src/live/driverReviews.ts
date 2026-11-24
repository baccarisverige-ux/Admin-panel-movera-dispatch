/**
 * v0.18.155 (contract.json#driverProfile.routes.adminList / adminModerate; owner 2026-11-20 "Now build all"): Reviews ›
 * Driver reviews. Every short review a rider writes waits here; it shows on the driver's profile only after Approve.
 * The server sends no rider id or contact: only the text, the first name the rider allowed (or none) and the month.
 */
export type DriverReviewStatus = "pending" | "approved" | "hidden";
export type AdminDriverReview = { reviewId: string; driverId: string; driverFirstName: string; zoneId: string; text: string; name: string | null; month: string; stars: number; status: DriverReviewStatus; createdAt: string };
export type DriverReviewLine = { id: string; driver: string; stars: number; text: string; by: string | null; month: string; status: DriverReviewStatus };

export const DRIVER_REVIEWS_PAGE = 50;

export function driverReviewsPath(status: DriverReviewStatus, cursor: string | null): string {
  return `/admin/driver-reviews?status=${status}&limit=${DRIVER_REVIEWS_PAGE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
}

export function reviewLine(r: AdminDriverReview): DriverReviewLine {
  return { id: r.reviewId, driver: r.driverFirstName, stars: r.stars, text: r.text, by: r.name, month: r.month, status: r.status };
}

export const moderatePath = (reviewId: string, approve: boolean) => `/admin/driver-reviews/${encodeURIComponent(reviewId)}/${approve ? "approve" : "hide"}`;
