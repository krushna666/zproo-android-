import { createHash } from 'node:crypto';
import { flightSearchFilters, isInternationalAirport } from '@zproo/catalog';
import type {
  AirportSuggestion,
  FlightOfferDetails,
  FlightOfferSummary,
  FlightSearchResponse,
} from '@zproo/types';
import type { FlightSearch } from '@zproo/validation';
import { clock } from '../lib/testContext';
import type { FlightProvider, FlightSearchQuery } from '../providers/flight';
import { ValidationError } from '../utils/errors';
import type { CacheService } from './cache.service';

/** Short, because availability changes as people book; details and booking re-price live. */
const SEARCH_CACHE_SECONDS = 60;
export const INTERNATIONAL_SOON = 'International flights are coming soon';

export class FlightService {
  constructor(
    private readonly provider: FlightProvider,
    private readonly cache: CacheService,
    private readonly options: { internationalEnabled: boolean },
  ) {}

  get isDemo(): boolean {
    return this.provider.isDemo;
  }

  airports(query: string): Promise<AirportSuggestion[]> {
    return this.provider.airports(query);
  }

  /** One-way, or round trip (outbound offers + return offers, booked together). */
  async search(search: FlightSearch): Promise<FlightSearchResponse> {
    if (
      !this.options.internationalEnabled &&
      (isInternationalAirport(search.from) || isInternationalAirport(search.to))
    ) {
      throw new ValidationError([{ path: 'query.to', message: INTERNATIONAL_SOON }]);
    }
    const pax = { adults: search.adults, children: search.children, infants: search.infants };
    const leg = (from: string, to: string, date: string) =>
      this.cachedSearch({ from, to, date, cabin: search.cabin, pax });
    const [offers, returnOffers] = await Promise.all([
      leg(search.from, search.to, search.date),
      search.returnDate ? leg(search.to, search.from, search.returnDate) : Promise.resolve([]),
    ]);
    const normalised = [
      this.provider.name,
      search.from,
      search.to,
      search.date,
      search.returnDate ?? '',
      search.cabin,
      pax.adults,
      pax.children,
      pax.infants,
    ].join(':');
    return {
      searchId: `srch_${createHash('sha256').update(normalised).digest('hex').slice(0, 20)}`,
      serverNow: clock.now().toISOString(),
      from: search.from,
      to: search.to,
      date: search.date,
      returnDate: search.returnDate ?? null,
      pax,
      cabin: search.cabin,
      offers,
      returnOffers,
      filters: flightSearchFilters([...offers, ...returnOffers]),
      demo: this.provider.isDemo,
    };
  }

  /** Live price and fare families (never cached). */
  getOffer(offerId: string, reprice: boolean): Promise<FlightOfferDetails | null> {
    return this.provider.getOffer(offerId, { reprice });
  }

  /** Cached for 60 s per normalised query (offers stay valid for 20 minutes after issue). */
  private async cachedSearch(query: FlightSearchQuery): Promise<FlightOfferSummary[]> {
    const key = `flights:search:v2:${this.provider.name}:${query.from}:${query.to}:${query.date}:${query.cabin}:${query.pax.adults}.${query.pax.children}.${query.pax.infants}`;
    return this.cache.getOrSet(key, SEARCH_CACHE_SECONDS, () => this.provider.search(query));
  }
}
