import { hotelDestination, hotelResultsPage } from '@zproo/catalog';
import { createHash } from 'node:crypto';
import type {
  HotelDestination,
  HotelDetails,
  HotelRoomsResponse,
  HotelSearchResponse,
  RoomOccupancy,
} from '@zproo/types';
import { nightsBetween, serializeRooms, type HotelSearch } from '@zproo/validation';
import { clock } from '../lib/testContext';
import type { HotelProvider } from '../providers/hotel';
import type { CacheService } from './cache.service';

/** Short, because rooms sell as people book; the rooms list and booking re-check live. */
const SEARCH_CACHE_SECONDS = 60;

export class HotelService {
  constructor(
    private readonly provider: HotelProvider,
    private readonly cache: CacheService,
  ) {}

  destinations(query: string): Promise<HotelDestination[]> {
    return this.provider.destinations(query);
  }

  /**
   * The supplier's hotels for (destination, dates, rooms) are cached for 60 s; filters, sort and
   * pages are applied to the cached list, so paging and filtering never call the supplier again.
   * Null for an unknown destination.
   */
  async search(search: HotelSearch): Promise<HotelSearchResponse | null> {
    const destination = hotelDestination(search.destinationId);
    if (!destination) return null;
    const rooms: RoomOccupancy[] = search.rooms;
    const normalised = [
      this.provider.name,
      search.destinationId,
      search.checkIn,
      search.checkOut,
      serializeRooms(rooms),
    ].join(':');
    const searchId = `hsrch_${createHash('sha256').update(normalised).digest('hex').slice(0, 20)}`;
    const hotels = await this.cache.getOrSet(
      `hotels:search:v1:${searchId}`,
      SEARCH_CACHE_SECONDS,
      () => this.provider.search({ ...search, rooms }),
    );
    return {
      searchId,
      serverNow: clock.now().toISOString(),
      destination,
      checkIn: search.checkIn,
      checkOut: search.checkOut,
      nights: nightsBetween(search.checkIn, search.checkOut),
      rooms,
      ...hotelResultsPage(hotels, search),
      demo: this.provider.isDemo,
    };
  }

  details(hotelId: string): Promise<HotelDetails | null> {
    return this.provider.details(hotelId);
  }

  /** Never cached: customers choose rooms from this. */
  async rooms(
    hotelId: string,
    checkIn: string,
    checkOut: string,
  ): Promise<HotelRoomsResponse | null> {
    const roomTypes = await this.provider.rooms({ hotelId, checkIn, checkOut });
    if (!roomTypes) return null;
    return {
      hotelId,
      serverNow: clock.now().toISOString(),
      checkIn,
      checkOut,
      nights: nightsBetween(checkIn, checkOut),
      roomTypes,
      demo: this.provider.isDemo,
    };
  }
}
