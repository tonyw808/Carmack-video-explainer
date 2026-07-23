// Seeds baseline price configuration. Idempotent — safe to run repeatedly.
import { DEFAULT_PACKS, DEFAULT_PRICING } from '@reelforge/core';
import { prisma } from './client';

async function main() {
  await prisma.priceConfig.upsert({
    where: { key: 'pricing' },
    update: {},
    create: { key: 'pricing', valueJson: JSON.stringify(DEFAULT_PRICING) },
  });
  await prisma.priceConfig.upsert({
    where: { key: 'packs' },
    update: {},
    create: { key: 'packs', valueJson: JSON.stringify(DEFAULT_PACKS) },
  });
  console.log('[seed] price config ensured');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
