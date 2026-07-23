// Runtime price-config access: read the admin-editable rows, validate with the core
// schemas, fall back to core defaults when a row is absent. The canonical default
// values live in @reelforge/core so the browser cost preview and the server agree.
import {
  DEFAULT_PACKS,
  DEFAULT_PRICING,
  packsSchema,
  pricingSchema,
  type CreditPack,
  type Pricing,
} from '@reelforge/core';
import type { PrismaClient } from '../generated/client/index.js';

export { DEFAULT_PACKS, DEFAULT_PRICING };

type ClientLike = Pick<PrismaClient, 'priceConfig'>;

export async function loadPricing(client: ClientLike): Promise<Pricing> {
  const row = await client.priceConfig.findUnique({ where: { key: 'pricing' } });
  if (!row) return DEFAULT_PRICING;
  const parsed = pricingSchema.safeParse(JSON.parse(row.valueJson));
  return parsed.success ? parsed.data : DEFAULT_PRICING;
}

export async function loadPacks(client: ClientLike): Promise<CreditPack[]> {
  const row = await client.priceConfig.findUnique({ where: { key: 'packs' } });
  if (!row) return DEFAULT_PACKS;
  const parsed = packsSchema.safeParse(JSON.parse(row.valueJson));
  return parsed.success ? parsed.data : DEFAULT_PACKS;
}
