import { busSearchFilters } from '@zproo/catalog';
import { createHash } from 'node:crypto';
import type { BusCity, BusSearchResponse, BusSeatMap, BusTripDetails } from '@zproo/types';
import type { BusSearch } from '@zproo/validation';
import { clock } from '../lib/testContext';
import type { BusProvider } from '../providers/bus';
import type { CacheService } from './cache.service';

/** Short, because seats sell as people book; the seat map and booking re-check live. */
const SEARCH_CACHE_SECONDS = 60;

export class BusService {
  constructor(
    private readonly provider: BusProvider,
    private readonly cache: CacheService,
  ) {}

  cities(query: string): Promise<BusCity[]> {
    return this.provider.cities(query);
  }

  /**
   * Cached for 60 s per normalised query, so a supplier outage serves the last good result for
   * a minute at most. `searchId` identifies the query (it is the cache key's hash).
   */
  async search(search: BusSearch): Promise<BusSearchResponse> {
    const normalised = `${this.provider.name}:${search.from}:${search.to}:${search.date}`;
    const searchId = `srch_${createHash('sha256').update(normalised).digest('hex').slice(0, 20)}`;
    const trips = await this.cache.getOrSet(
      `buses:search:v2:${searchId}`,
      SEARCH_CACHE_SECONDS,
      () => this.provider.search(search),
    );
    return {
      searchId,
      serverNow: clock.now().toISOString(),
      from: search.from,
      to: search.to,
      date: search.date,
      trips,
      filters: busSearchFilters(trips),
      demo: this.provider.isDemo,
    };
  }

  getTrip(tripId: string): Promise<BusTripDetails | null> {
    return this.provider.getTrip(tripId);
  }

  /** Never cached: customers pick seats from this. */
  seatMap(tripId: string): Promise<BusSeatMap | null> {
    return this.provider.getSeatMap(tripId);
  }
}
