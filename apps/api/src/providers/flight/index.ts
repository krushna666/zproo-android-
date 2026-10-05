import type { PrismaClient } from '@prisma/client';
import type { OfferSigner } from '@zproo/catalog';
import type { Env } from '../../config/env';
import type { FlightProvider } from './FlightProvider';
import { MockFlightProvider } from './MockFlightProvider';

export type {
  FlightIssueResult,
  FlightProvider,
  FlightQuote,
  FlightSearchQuery,
} from './FlightProvider';

export function createFlightProvider(
  env: Pick<Env, 'FLIGHT_PROVIDER'>,
  prisma: PrismaClient,
  signOffer: OfferSigner,
): FlightProvider {
  switch (env.FLIGHT_PROVIDER) {
    case 'mock':
      return new MockFlightProvider(prisma, signOffer);
  }
}
