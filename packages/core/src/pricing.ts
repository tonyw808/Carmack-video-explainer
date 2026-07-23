// The single source of truth for what a job costs. base cost + per-second multiplier.
// Kept pure and dependency-free so it can run in the browser (cost preview), the API
// route (authoritative debit), and tests without a database.
import { z } from 'zod';

export const pricingSchema = z.object({
  baseCredits: z.number().int().nonnegative(),
  perSecondCredits: z.number().int().nonnegative(),
});
export type Pricing = z.infer<typeof pricingSchema>;

export const DEFAULT_PRICING: Pricing = {
  baseCredits: 10,
  perSecondCredits: 4,
};

/**
 * Credits required for a job of the given duration.
 * cost = ceil(base + perSecond * durationSec). Deterministic; never negative.
 */
export function computeJobCost(
  input: { durationSec: number },
  pricing: Pricing = DEFAULT_PRICING
): number {
  const raw = pricing.baseCredits + pricing.perSecondCredits * input.durationSec;
  return Math.max(0, Math.ceil(raw));
}
