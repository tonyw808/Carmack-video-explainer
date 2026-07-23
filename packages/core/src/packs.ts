// Credit packs offered for purchase. Stored in PriceConfig (key "packs") so an admin can
// change them without a deploy; these are the canonical defaults + validation shape.
import { z } from 'zod';

export const creditPackSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  credits: z.number().int().positive(),
  priceCents: z.number().int().positive(),
});
export type CreditPack = z.infer<typeof creditPackSchema>;

export const packsSchema = z.array(creditPackSchema).min(1);

export const DEFAULT_PACKS: CreditPack[] = [
  { id: 'starter', label: 'Starter', credits: 100, priceCents: 500 },
  { id: 'creator', label: 'Creator', credits: 550, priceCents: 2500 },
  { id: 'studio', label: 'Studio', credits: 1200, priceCents: 5000 },
];

export function findPack(packs: CreditPack[], id: string): CreditPack | undefined {
  return packs.find((p) => p.id === id);
}

export function findPackOrThrow(packs: CreditPack[], id: string): CreditPack {
  const pack = findPack(packs, id);
  if (!pack) throw new Error(`unknown credit pack: ${id}`);
  return pack;
}
