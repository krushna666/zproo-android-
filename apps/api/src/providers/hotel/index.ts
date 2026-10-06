import type { PrismaClient } from '@prisma/client';
import type { Env } from '../../config/env';
import type { HotelProvider } from './HotelProvider';
import { MockHotelProvider } from './MockHotelProvider';

export type { HotelProvider, HotelSearchQuery, HotelStay } from './HotelProvider';
export { MockHotelProvider } from './MockHotelProvider';

export function createHotelProvider(
  env: Pick<Env, 'HOTEL_PROVIDER'>,
  prisma: PrismaClient,
): HotelProvider {
  switch (env.HOTEL_PROVIDER) {
    case 'mock':
      return new MockHotelProvider(prisma);
  }
}
