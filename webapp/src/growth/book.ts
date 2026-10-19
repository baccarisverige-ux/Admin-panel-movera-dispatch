/**
 * Kept because the live Reviews page has no equivalent yet (C-21): the average of the reviews that are not hidden.
 * Promotions are growth/ops.ts (redeemGrowth), moderation is moderateGrowth, bonuses are the seeded bonus rows.
 */
export type Review = { id: string; stars: number; text: string; hidden: boolean; hideReason: string | null };

export function averageStars(reviews: readonly Review[]): number {
  const visible = reviews.filter((review) => !review.hidden);
  if (visible.length === 0) return 0;
  return visible.reduce((sum, review) => sum + review.stars, 0) / visible.length;
}
