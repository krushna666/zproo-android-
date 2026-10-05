import { bookBusSchema } from '@zproo/validation';
import { z } from 'zod';
import { ErrorResponse, registry, successEnvelope } from '../openapi';

const bearer = [{ bearerAuth: [] }];
const json = (schema: z.ZodType) => ({ 'application/json': { schema } });
const ok = (description: string, data: z.ZodType) => ({
  description,
  content: json(successEnvelope(data)),
});
const error = (description: string) => ({ description, content: json(ErrorResponse) });
const tags = ['Buses'];
const paise = (description: string) =>
  z
    .number()
    .int()
    .openapi({ description: `${description} (paise)` });

const BusPoint = registry.register(
  'BusPoint',
  z.object({
    id: z.string(),
    name: z.string().openapi({ example: 'Swargate' }),
    landmark: z.string(),
    address: z.string(),
    time: z.string().openapi({ example: '2026-10-25T21:30:00+05:30' }),
  }),
);

const busLayout = z.enum([
  'SEATER_2_2',
  'SEATER_2_1',
  'SLEEPER_2_1',
  'SEMI_SLEEPER_2_2',
  'SEATER_SLEEPER_COMBO',
]);
const amenity = z.enum([
  'wifi',
  'charging',
  'water',
  'blanket',
  'reading_light',
  'cctv',
  'tracking',
  'snacks',
]);

const tripFields = {
  tripId: z.string().openapi({ description: 'Opaque trip id; pass back for seats or booking' }),
  serviceNumber: z.string().openapi({ example: 'SSK 2130' }),
  operator: z.object({
    code: z.string(),
    name: z.string(),
    rating: z.number(),
    ratingCount: z.number().int(),
    phone: z.string(),
  }),
  busType: z.object({
    label: z.string().openapi({ example: 'A/C Sleeper (2+1)' }),
    layout: busLayout,
    ac: z.boolean(),
    sleeper: z.boolean(),
    seater: z.boolean(),
  }),
  from: z.object({ code: z.string().openapi({ example: 'PNQ' }), name: z.string() }),
  to: z.object({ code: z.string().openapi({ example: 'BOM' }), name: z.string() }),
  date: z.string().openapi({ description: 'IST date of departure', example: '2026-10-25' }),
  departure: z.string(),
  arrival: z.string(),
  durationMin: z.number().int(),
  fromPrice: paise('Cheapest open seat, taxes included'),
  seatsLeft: z.number().int(),
  amenities: z.array(amenity),
  boardingCount: z.number().int(),
  droppingCount: z.number().int(),
  liveTracking: z.boolean(),
  cancellable: z.boolean(),
};

const BusTripSummary = registry.register(
  'BusTripSummary',
  z.object({ ...tripFields, photos: z.number().int() }),
);

const BusTripDetails = registry.register(
  'BusTripDetails',
  z.object({
    ...tripFields,
    photos: z.array(z.object({ url: z.string(), alt: z.string() })),
    distanceKm: z.number().int(),
    boardingPoints: z.array(BusPoint),
    droppingPoints: z.array(BusPoint),
    cancellationPolicy: z.array(
      z.object({ hoursBefore: z.number().int(), refundPercent: z.number().int() }),
    ),
    restStops: z.array(
      z.object({ name: z.string(), time: z.string(), durationMin: z.number().int() }),
    ),
    policies: z.object({ luggage: z.string(), pets: z.string(), idProof: z.string() }),
    bookable: z.boolean().openapi({ description: 'False within 30 minutes of departure' }),
  }),
);

const BusSeat = z.object({
  seatNo: z.string().openapi({ example: 'L4' }),
  row: z.number().int(),
  col: z.number().int(),
  type: z.enum(['SEATER', 'SEMI_SLEEPER', 'SLEEPER']),
  price: paise('Seat price, taxes included'),
  status: z.enum(['AVAILABLE', 'BOOKED', 'HELD', 'BLOCKED']),
  ladiesOnly: z.boolean(),
  bookedByFemale: z.boolean(),
  width: z.number().int(),
  height: z.number().int(),
});

const BusSeatMap = registry.register(
  'BusSeatMap',
  z.object({
    tripId: z.string(),
    serverNow: z.iso.datetime(),
    layout: busLayout,
    decks: z.array(
      z.object({
        deck: z.enum(['LOWER', 'UPPER']),
        rows: z.number().int(),
        cols: z.number().int(),
        seats: z.array(BusSeat),
      }),
    ),
    maxSelectable: z.number().int(),
    bookable: z.boolean(),
    demo: z.boolean(),
  }),
);

/** The `bus` part of BookingDetails. */
export const BusBookingInfo = z.object({
  trip: BusTripDetails,
  seats: z.array(z.string()),
  boardingPoint: BusPoint,
  droppingPoint: BusPoint,
  pnr: z.string().nullable(),
});

const tripParams = z.object({ tripId: z.string() });
const referenceParams = z.object({ reference: z.string().openapi({ example: 'ZB7K4Q2M9XPA' }) });

registry.registerPath({
  method: 'get',
  path: '/buses/cities',
  tags,
  summary: 'City suggestions for the bus search form',
  request: { query: z.object({ q: z.string().openapi({ example: 'pun' }) }) },
  responses: {
    200: ok(
      'Matching cities',
      z.array(
        z.object({ code: z.string(), name: z.string(), state: z.string(), popular: z.boolean() }),
      ),
    ),
    400: error('Invalid query'),
  },
});

registry.registerPath({
  method: 'get',
  path: '/buses/search',
  tags,
  summary: 'Search buses between two cities',
  description: 'City codes as in the search widget (e.g. `PNQ`, `BOM`). Cached 60 s.',
  request: {
    query: z.object({
      from: z.string().openapi({ example: 'PNQ' }),
      to: z.string().openapi({ example: 'BOM' }),
      date: z.string().optional().openapi({ example: '2026-10-25' }),
    }),
  },
  responses: {
    200: ok(
      'Departures in time order',
      z.object({
        searchId: z.string(),
        serverNow: z.iso.datetime(),
        from: z.string(),
        to: z.string(),
        date: z.string(),
        trips: z.array(BusTripSummary),
        filters: z.object({
          operators: z.array(z.object({ name: z.string(), count: z.number().int() })),
          priceMin: z.number().int(),
          priceMax: z.number().int(),
        }),
        demo: z.boolean(),
      }),
    ),
    400: error('Invalid search'),
  },
});

registry.registerPath({
  method: 'get',
  path: '/buses/{tripId}',
  tags,
  summary: 'Trip details: operator, coach, photos, points, rest stops and policies',
  request: { params: tripParams },
  responses: { 200: ok('Trip', BusTripDetails), 404: error('Trip no longer sold') },
});

registry.registerPath({
  method: 'get',
  path: '/buses/{tripId}/seats',
  tags,
  summary: 'Seat layout with live availability and per-seat prices (never cached)',
  request: { params: tripParams },
  responses: { 200: ok('Seat map', BusSeatMap), 404: error('Trip no longer sold') },
});

registry.registerPath({
  method: 'post',
  path: '/buses/book',
  tags,
  summary: 'Hold seats for 10 minutes and create a booking awaiting payment',
  description:
    'Requires an `Idempotency-Key` header. One traveller per seat, up to 6. Ladies-only seats ' +
    'require a female traveller.',
  security: bearer,
  request: {
    headers: z.object({ 'Idempotency-Key': z.string() }),
    body: { content: json(bookBusSchema) },
  },
  responses: {
    201: ok(
      'Seats held',
      z.object({
        bookingRef: z.string(),
        status: z.literal('HELD'),
        holdExpiresAt: z.iso.datetime(),
        serverNow: z.iso.datetime(),
        priceBreakdown: z.looseObject({}).openapi({ description: 'See PriceBreakdown' }),
      }),
    ),
    400: error('Invalid travellers, seats or points, or missing Idempotency-Key'),
    401: error('Not signed in'),
    409: error('PRICE_CHANGED or SEAT_UNAVAILABLE'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/buses/{reference}/cancel',
  tags,
  summary: 'Cancel a confirmed bus booking (owner)',
  description: "Refund follows the operator's cancellation policy for the time left to departure.",
  security: bearer,
  request: { params: referenceParams },
  responses: {
    200: ok(
      'Cancelled',
      z.object({ bookingRef: z.string(), status: z.string(), refundAmount: z.number().int() }),
    ),
    403: error('Not your booking'),
    409: error('Not cancellable'),
  },
});
