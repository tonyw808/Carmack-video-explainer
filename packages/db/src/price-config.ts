// Canonical default price configuration, shared by the seed script and by runtime
// fallbacks when a PriceConfig row is absent. Values live in the DB so admins can
// change them without a deploy; the shapes are zod-validated in @reelforge/core.

export const DEFAULT_PRICING = {
  baseCredits: 10,
  perSecondCredits: 4,
} as const;

export const DEFAULT_PACKS = [
  { id: 'starter', label: 'Starter', credits: 100, priceCents: 500 },
  { id: 'creator', label: 'Creator', credits: 550, priceCents: 2500 },
  { id: 'studio', label: 'Studio', credits: 1200, priceCents: 5000 },
] as const;
