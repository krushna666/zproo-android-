import { addDays, flightSearchSchema, todayInIst } from '@zproo/validation';
import { describe, expect, it } from 'vitest';
import { busesUrl, flightsUrl, hotelsUrl, parseFlightSearch, trainsUrl } from './url';

const d = (n: number) => addDays(todayInIst(), n);
const query = (url: string) => new URLSearchParams(url.split('?')[1]);

describe('flight search URLs', () => {
  it('round-trips a round trip through the URL', () => {
    const search = flightSearchSchema.parse({
      from: 'PNQ',
      to: 'DEL',
      date: d(7),
      returnDate: d(10),
      adults: 2,
      children: 1,
      cabin: 'BUSINESS',
    });
    const url = flightsUrl(search);
    expect(url).toBe(
      `/flights/search?from=PNQ&to=DEL&date=${d(7)}&returnDate=${d(10)}&adults=2&children=1&infants=0&cabin=BUSINESS`,
    );
    expect(flightSearchSchema.parse(parseFlightSearch(query(url)))).toEqual(search);
  });

  it('has no return date for one-way trips', () => {
    const url = flightsUrl(flightSearchSchema.parse({ from: 'BOM', to: 'GOI', date: d(3) }));
    expect(query(url).has('returnDate')).toBe(false);
  });
});

describe('date-free deal links', () => {
  it('defaults the departure date when the link has none', () => {
    const parsed = flightSearchSchema.parse(
      parseFlightSearch(query('/flights/search?from=PNQ&to=DEL&adults=1&cabin=ECONOMY')),
    );
    expect(parsed.date).toBe(addDays(todayInIst(), 14));
  });
});

describe('other URLs', () => {
  it('omits defaults', () => {
    expect(busesUrl({ from: 'PNQ', to: 'BOM', date: '2026-12-01' })).toBe(
      '/buses/search?from=PNQ&to=BOM&date=2026-12-01',
    );
    expect(busesUrl({ from: 'PNQ', to: 'BOM', date: '2026-12-01' }, 'sort=cheapest')).toBe(
      '/buses/search?from=PNQ&to=BOM&date=2026-12-01&sort=cheapest',
    );
    expect(trainsUrl({ from: 'PUNE', to: 'NDLS', date: '2026-12-01', travelClass: 'ALL' })).toBe(
      '/trains/results?from=PUNE&to=NDLS&date=2026-12-01',
    );
    expect(
      hotelsUrl({
        destinationId: 'city_GOI',
        checkIn: '2026-12-01',
        checkOut: '2026-12-03',
        rooms: [
          { adults: 2, childAges: [] },
          { adults: 2, childAges: [7] },
        ],
      }),
    ).toBe(
      '/hotels/search?destinationId=city_GOI&checkIn=2026-12-01&checkOut=2026-12-03&rooms=2-0%7C2-1%3A7',
    );
  });
});
