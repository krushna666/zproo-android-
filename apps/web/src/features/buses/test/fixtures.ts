import type {
  BusSearchResponse,
  BusSeat,
  BusSeatMap,
  BusTripDetails,
  BusTripSummary,
} from '@zproo/types';

const OPERATORS = {
  SSK: {
    code: 'SSK',
    name: 'Sahyadri Skyline',
    rating: 4.5,
    ratingCount: 3120,
    phone: '+91 20 4000 1001',
  },
  PPR: {
    code: 'PPR',
    name: 'Pune Pravas',
    rating: 3.9,
    ratingCount: 740,
    phone: '+91 20 4000 1002',
  },
  ECO: {
    code: 'ECO',
    name: 'Ecoline Electric',
    rating: 4.6,
    ratingCount: 1330,
    phone: '+91 20 4000 1003',
  },
} as const;

/** Times carry the +05:30 offset, as the API sends them. */
export function makeSummary(overrides: Partial<BusTripSummary> = {}): BusTripSummary {
  return {
    tripId: 'trp_PNQ_BOM_20261025_00',
    serviceNumber: 'SSK 2130',
    operator: OPERATORS.SSK,
    busType: {
      label: 'A/C Sleeper (2+1)',
      layout: 'SLEEPER_2_1',
      ac: true,
      sleeper: true,
      seater: false,
    },
    from: { code: 'PNQ', name: 'Pune' },
    to: { code: 'BOM', name: 'Mumbai' },
    date: '2026-10-25',
    departure: '2026-10-25T21:30:00+05:30',
    arrival: '2026-10-26T01:00:00+05:30',
    durationMin: 210,
    fromPrice: 124_900,
    seatsLeft: 20,
    amenities: ['wifi', 'charging', 'blanket', 'tracking'],
    boardingCount: 2,
    droppingCount: 2,
    liveTracking: true,
    cancellable: true,
    photos: 4,
    ...overrides,
  };
}

export const TRIPS: BusTripSummary[] = [
  makeSummary(),
  makeSummary({
    tripId: 'trp_PNQ_BOM_20261025_01',
    serviceNumber: 'PPR 0715',
    operator: OPERATORS.PPR,
    busType: {
      label: 'Non A/C Seater (2+2)',
      layout: 'SEATER_2_2',
      ac: false,
      sleeper: false,
      seater: true,
    },
    departure: '2026-10-25T07:15:00+05:30',
    arrival: '2026-10-25T10:45:00+05:30',
    fromPrice: 59_900,
    seatsLeft: 4,
    amenities: ['water'],
    liveTracking: false,
  }),
  makeSummary({
    tripId: 'trp_PNQ_BOM_20261025_02',
    serviceNumber: 'ECO 1000',
    operator: OPERATORS.ECO,
    busType: {
      label: 'A/C Seater (2+2)',
      layout: 'SEATER_2_2',
      ac: true,
      sleeper: false,
      seater: true,
    },
    departure: '2026-10-25T10:00:00+05:30',
    arrival: '2026-10-25T13:20:00+05:30',
    durationMin: 200,
    fromPrice: 89_900,
    seatsLeft: 30,
    amenities: ['charging', 'cctv'],
    liveTracking: false,
  }),
];

export function makeSearch(trips: BusTripSummary[] = TRIPS): BusSearchResponse {
  const prices = trips.map((t) => t.fromPrice);
  return {
    searchId: 'srch_test',
    serverNow: '2026-10-20T10:00:00.000Z',
    from: 'PNQ',
    to: 'BOM',
    date: '2026-10-25',
    trips,
    filters: {
      operators: trips.map((t) => ({ name: t.operator.name, count: 1 })),
      priceMin: prices.length ? Math.min(...prices) : 0,
      priceMax: prices.length ? Math.max(...prices) : 0,
    },
    demo: true,
  };
}

export function makeDetails(overrides: Partial<BusTripDetails> = {}): BusTripDetails {
  const { photos: _count, ...summary } = makeSummary();
  return {
    ...summary,
    photos: [{ url: '/assets/buses/exterior.svg', alt: 'Coach exterior' }],
    distanceKm: 150,
    boardingPoints: [
      {
        id: 'bp_1',
        name: 'Swargate',
        landmark: 'Near Swargate Bus Stand',
        address: 'Shankarshet Road, Swargate, Pune 411042',
        time: '2026-10-25T21:30:00+05:30',
      },
      {
        id: 'bp_2',
        name: 'Wakad',
        landmark: 'Wakad Bridge',
        address: 'Wakad, Pune',
        time: '2026-10-25T22:00:00+05:30',
      },
    ],
    droppingPoints: [
      {
        id: 'dp_1',
        name: 'Vashi',
        landmark: 'Vashi Plaza',
        address: 'Vashi, Navi Mumbai',
        time: '2026-10-26T00:30:00+05:30',
      },
      {
        id: 'dp_2',
        name: 'Dadar',
        landmark: 'Dadar TT Circle',
        address: 'Dadar East, Mumbai',
        time: '2026-10-26T01:00:00+05:30',
      },
    ],
    cancellationPolicy: [
      { hoursBefore: 24, refundPercent: 90 },
      { hoursBefore: 12, refundPercent: 75 },
      { hoursBefore: 4, refundPercent: 50 },
      { hoursBefore: 0, refundPercent: 0 },
    ],
    restStops: [
      { name: 'Food Mall, Khalapur', time: '2026-10-25T23:15:00+05:30', durationMin: 20 },
    ],
    policies: {
      luggage: 'Two pieces up to 15 kg.',
      pets: 'Pets are not allowed on board.',
      idProof: 'Carry a government photo ID.',
    },
    bookable: true,
    ...overrides,
  };
}

const seat = (seatNo: string, row: number, col: number, extra: Partial<BusSeat> = {}): BusSeat => ({
  seatNo,
  row,
  col,
  type: 'SLEEPER',
  price: 124_900,
  status: 'AVAILABLE',
  ladiesOnly: false,
  bookedByFemale: false,
  width: 1,
  height: 2,
  ...extra,
});

export function makeSeatMap(tripId = 'trp_PNQ_BOM_20261025_00'): BusSeatMap {
  return {
    tripId,
    serverNow: '2026-10-20T10:00:00.000Z',
    layout: 'SLEEPER_2_1',
    maxSelectable: 6,
    bookable: true,
    demo: true,
    decks: [
      {
        deck: 'LOWER',
        rows: 4,
        cols: 4,
        seats: [
          seat('L1', 0, 0),
          seat('L2', 0, 2, { status: 'BOOKED' }),
          seat('L3', 0, 3, { ladiesOnly: true }),
          seat('L4', 2, 0),
          seat('L5', 2, 2),
          seat('L6', 2, 3),
        ],
      },
      {
        deck: 'UPPER',
        rows: 2,
        cols: 4,
        seats: [
          seat('U1', 0, 0, { price: 109_900 }),
          seat('U2', 0, 2, { price: 109_900 }),
          seat('U3', 0, 3, { price: 109_900 }),
        ],
      },
    ],
  };
}
