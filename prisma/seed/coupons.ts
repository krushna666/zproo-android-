import type { PrismaClient } from '@prisma/client';
import { DEMO_COUPONS } from '@zproo/config';

/** Demo coupons from @zproo/config (idempotent upsert by code). */
export async function seedCoupons(prisma: PrismaClient): Promise<number> {
  for (const c of DEMO_COUPONS) {
    const data = { ...c, startsAt: new Date(c.startsAt), endsAt: new Date(c.endsAt) };
    await prisma.coupon.upsert({ where: { code: c.code }, create: data, update: data });
  }
  return DEMO_COUPONS.length;
}
