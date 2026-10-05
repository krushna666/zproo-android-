import type {
  FareFamily,
  FlightOfferDetails,
  FlightOfferSummary,
  FlightSearchResponse,
  FlightSegment,
  PaxCounts,
} from '@zproo/types';

const seg = (o: Partial<FlightSegment> = {}): FlightSegment => ({
  carrier: { code: 'SF', name: 'Saffron Air' },
  flightNo: 'SF 201',
  from: 'PNQ',
  to: 'DEL',
  departure: '2026-10-25T06:30:00+05:30',
  arrival: '2026-10-25T08:50:00+05:30',
  durationMin: 140,
  aircraft: 'A320neo',
  terminalFrom: '1',
  terminalTo: '3',
  ...o,
});

export function makeOffer(
  overrides: Partial<FlightOfferSummary> & { segments?: FlightSegment[]; layoverMin?: number } = {},
): FlightOfferSummary {
  const { segments = [seg()], layoverMin = 85, ...rest } = overrides;
  const first = segments[0] as FlightSegment;
  const last = segments.at(-1) as FlightSegment;
  return {
    offerId: 'off_PNQDEL_20261025_E_100_00_t1abcd_0123abcd',
    expiresAt: new Date(Date.now() + 20 * 60_000).toISOString(),
    carrier: first.carrier,
    slices: [
      {
        segments,
        stops: segments.length - 1,
        layovers: segments.slice(1).map((s) => ({
          airport: s.from,
          durationMin: layoverMin,
          changeOfTerminal: false,
          selfTransfer: false,
          overnight: false,
        })),
        durationMin: Math.round((Date.parse(last.arrival) - Date.parse(first.departure)) / 60_000),
      },
    ],
    cabin: 'ECONOMY',
    fromPrice: 489_900,
    currency: 'INR',
    refundable: true,
    mealIncluded: true,
    seatsLeft: 9,
    ...rest,
  };
}

/** Three outbound offers: early non-stop (SF), cheap one-stop via BLR (MN), evening non-stop (DB). */
export const OFFERS: FlightOfferSummary[] = [
  makeOffer(),
  makeOffer({
    offerId: 'off_PNQDEL_20261025_E_100_01_t1abcd_0123abcd',
    carrier: { code: 'MN', name: 'Monsoon Airways' },
    segments: [
      seg({
        carrier: { code: 'MN', name: 'Monsoon Airways' },
        flightNo: 'MN 410',
        to: 'BLR',
        departure: '2026-10-25T09:10:00+05:30',
        arrival: '2026-10-25T10:50:00+05:30',
        durationMin: 100,
      }),
      seg({
        carrier: { code: 'MN', name: 'Monsoon Airways' },
        flightNo: 'MN 522',
        from: 'BLR',
        departure: '2026-10-25T12:15:00+05:30',
        arrival: '2026-10-25T15:05:00+05:30',
        durationMin: 170,
      }),
    ],
    fromPrice: 359_900,
    refundable: false,
    mealIncluded: false,
    seatsLeft: 3,
  }),
  makeOffer({
    offerId: 'off_PNQDEL_20261025_E_100_02_t1abcd_0123abcd',
    carrier: { code: 'DB', name: 'Deccan Blue' },
    segments: [
      seg({
        carrier: { code: 'DB', name: 'Deccan Blue' },
        flightNo: 'DB 880',
        departure: '2026-10-25T22:40:00+05:30',
        arrival: '2026-10-26T01:05:00+05:30',
        durationMin: 145,
      }),
    ],
    fromPrice: 419_900,
    mealIncluded: false,
  }),
];

export function makeSearch(
  offers: FlightOfferSummary[] = OFFERS,
  overrides: Partial<FlightSearchResponse> = {},
): FlightSearchResponse {
  const prices = offers.map((o) => o.fromPrice);
  return {
    searchId: 'srch_test',
    serverNow: new Date().toISOString(),
    from: 'PNQ',
    to: 'DEL',
    date: '2026-10-25',
    returnDate: null,
    pax: { adults: 1, children: 0, infants: 0 },
    cabin: 'ECONOMY',
    offers,
    returnOffers: [],
    filters: {
      airlines: offers.map((o) => ({ ...o.carrier, count: 1, minPrice: o.fromPrice })),
      priceMin: prices.length ? Math.min(...prices) : 0,
      priceMax: prices.length ? Math.max(...prices) : 0,
    },
    demo: true,
    ...overrides,
  };
}

export function makeFare(name: FareFamily['name'], base: number, pax: PaxCounts): FareFamily {
  const slug = { Saver: 'saver', Flexi: 'flexi', 'Super Flexi': 'superflexi' }[name];
  const fare = (b: number, fees: number) => {
    const taxes = Math.round((b * 0.05) / 100) * 100;
    return { base: b, taxes, fees, total: b + taxes + fees };
  };
  const perPax = {
    ADULT: fare(base, 65_000),
    CHILD: fare(base - 50_000, 65_000),
    INFANT: fare(150_000, 0),
  };
  return {
    fareId: `fare_a1b2c3_${slug}`,
    name,
    price: perPax.ADULT.total,
    total:
      perPax.ADULT.total * pax.adults +
      perPax.CHILD.total * pax.children +
      perPax.INFANT.total * pax.infants,
    perPax,
    cabinBaggageKg: 7,
    checkinBaggageKg: name === 'Saver' ? 15 : name === 'Flexi' ? 20 : 25,
    changeFee: name === 'Saver' ? 300_000 : name === 'Flexi' ? 100_000 : 0,
    cancellationFee: name === 'Saver' ? null : name === 'Flexi' ? 250_000 : 0,
    refundable: name !== 'Saver',
    meal: name === 'Super Flexi' ? 'INCLUDED' : 'PAID',
    seatSelection: name === 'Saver' ? 'PAID' : 'FREE',
    priority: name === 'Super Flexi',
    mostPopular: name === 'Flexi',
  };
}

export function makeDetails(
  offer: FlightOfferSummary = OFFERS[0] as FlightOfferSummary,
  pax: PaxCounts = { adults: 1, children: 0, infants: 0 },
): FlightOfferDetails {
  return {
    ...offer,
    pax,
    fareFamilies: [
      makeFare('Saver', 409_900, pax),
      makeFare('Flexi', 459_900, pax),
      makeFare('Super Flexi', 524_900, pax),
    ],
    fareRules: ['Fares are per traveller.', 'Cancellation closes 3 hours before departure.'],
    serverNow: new Date().toISOString(),
    replacesOfferId: null,
  };
}
