import { bookHotelSchema } from '@zproo/validation';
import { z } from 'zod';
import { ErrorResponse, registry, successEnvelope } from '../openapi';

const bearer = [{ bearerAuth: [] }];
const json = (schema: z.ZodType) => ({ 'application/json': { schema } });
const ok = (description: string, data: z.ZodType) => ({
  description,
  content: json(successEnvelope(data)),
});
const error = (description: string) => ({ description, content: json(ErrorResponse) });
const tags = ['Hotels'];
const paise = (description: string) =>
  z
    .number()
    .int()
    .openapi({ description: `${description} (paise)` });

const Image = z.object({ url: z.string(), alt: z.string() });
const Geo = z.object({ lat: z.number(), lng: z.number() });
const boardBasis = z.enum(['ROOM_ONLY', 'BREAKFAST', 'HALF_BOARD', 'FULL_BOARD']);
const propertyType = z.enum(['HOTEL', 'RESORT', 'VILLA', 'HOMESTAY', 'APARTMENT']);
const Occupancy = z.object({ adults: z.number().int(), childAges: z.array(z.number().int()) });
const Nightly = z.array(z.object({ date: z.string(), price: z.number().int() }));

const Destination = registry.register(
  'HotelDestination',
  z.object({
    id: z.string().openapi({ example: 'city_GOI' }),
    type: z.enum(['CITY', 'AREA', 'HOTEL']),
    name: z.string(),
    city: z.string(),
    state: z.string(),
  }),
);

const HotelSummary = registry.register(
  'HotelSummary',
  z.object({
    hotelId: z.string().openapi({ example: 'htl_GOI007' }),
    name: z.string(),
    stars: z.number().int(),
    propertyType,
    area: z.string(),
    city: z.string(),
    rating: z.number(),
    ratingCount: z.number().int(),
    ratingLabel: z.string().openapi({ example: 'Excellent' }),
    thumbnail: Image,
    amenities: z.array(z.string()),
    pricePerNight: paise('Cheapest stay for the searched rooms, per night, before taxes'),
    totalPrice: paise('That stay for all nights, before taxes'),
    taxes: paise('Taxes on totalPrice'),
    taxesIncluded: z.literal(false),
    freeCancellation: z.boolean(),
    breakfastIncluded: z.boolean(),
    roomsLeft: z.number().int(),
    popularity: z.number(),
    geo: Geo,
  }),
);

const HotelRate = z.object({
  rateId: z.string().openapi({ example: 'rate_GOI007_1_bf' }),
  boardBasis,
  refundable: z.boolean(),
  freeCancellationUntil: z.string().nullable().openapi({ example: '2026-10-18T12:00:00+05:30' }),
  pricePerNight: paise('One room, average per night'),
  totalPrice: paise('One room, whole stay, before taxes'),
  taxes: paise('Taxes on totalPrice'),
  nightlyBreakdown: Nightly,
  roomsLeft: z.number().int(),
});

const HotelRoomType = registry.register(
  'HotelRoomType',
  z.object({
    roomTypeId: z.string().openapi({ example: 'rt_GOI007_1' }),
    name: z.string(),
    sizeSqft: z.number().int(),
    bed: z.string(),
    maxAdults: z.number().int(),
    maxChildren: z.number().int(),
    images: z.array(Image),
    amenities: z.array(z.string()),
    rates: z.array(HotelRate),
  }),
);

const HotelDetails = registry.register(
  'HotelDetails',
  z.object({
    hotelId: z.string(),
    name: z.string(),
    stars: z.number().int(),
    propertyType,
    description: z.string(),
    address: z.string(),
    area: z.string(),
    city: z.string(),
    state: z.string(),
    phone: z.string(),
    geo: Geo,
    rating: z.number(),
    ratingCount: z.number().int(),
    ratingLabel: z.string(),
    ratingBreakdown: z.array(z.object({ label: z.string(), score: z.number() })),
    images: z.array(Image).openapi({ description: 'At least five, each with alt text' }),
    amenities: z.array(z.string()),
    amenityGroups: z.array(
      z.object({
        group: z.enum(['General', 'Room', 'Food', 'Wellness', 'Accessibility']),
        items: z.array(z.string()),
      }),
    ),
    checkInTime: z.string(),
    checkOutTime: z.string(),
    houseRules: z.array(z.string()),
    cancellationSummary: z.string(),
    demo: z.boolean(),
  }),
);

/** The `hotel` part of BookingDetails. */
export const HotelBookingInfo = z.object({
  hotel: z.object({
    hotelId: z.string(),
    name: z.string(),
    stars: z.number().int(),
    address: z.string(),
    city: z.string(),
    phone: z.string(),
    checkInTime: z.string(),
    checkOutTime: z.string(),
    images: z.array(Image),
    houseRules: z.array(z.string()),
  }),
  checkIn: z.string(),
  checkOut: z.string(),
  nights: z.number().int(),
  rooms: z.array(
    z.object({
      roomTypeId: z.string(),
      roomName: z.string(),
      rateId: z.string(),
      boardBasis,
      refundable: z.boolean(),
      freeCancellationUntil: z.string().nullable(),
      adults: z.number().int(),
      childAges: z.array(z.number().int()),
      leadGuest: z.object({ title: z.string(), firstName: z.string(), lastName: z.string() }),
      price: z.number().int(),
      nightlyBreakdown: Nightly,
    }),
  ),
  specialRequests: z.string().nullable(),
  confirmationNo: z.string().nullable(),
  supplierRef: z.string().nullable(),
});

const stayQuery = {
  checkIn: z.string().openapi({ example: '2026-10-20', description: 'IST date, not in the past' }),
  checkOut: z
    .string()
    .openapi({ example: '2026-10-23', description: 'After check-in, ≤ 30 nights' }),
  rooms: z.string().openapi({
    example: '2-0|2-1:7',
    description: 'Rooms separated by |: adults-children, then the ages after a colon (1–8 rooms)',
  }),
};
const hotelParams = z.object({ hotelId: z.string().openapi({ example: 'htl_GOI007' }) });
const referenceParams = z.object({ reference: z.string().openapi({ example: 'ZH7K4Q2M9XPA' }) });

registry.registerPath({
  method: 'get',
  path: '/hotels/destinations',
  tags,
  summary: 'Cities, areas and hotels for the destination picker',
  request: { query: z.object({ q: z.string().openapi({ example: 'goa' }) }) },
  responses: { 200: ok('Suggestions', z.array(Destination)), 400: error('Invalid query') },
});

registry.registerPath({
  method: 'get',
  path: '/hotels/search',
  tags,
  summary: 'Search hotels (filters, sort and pages on the server; cached 60 s)',
  request: {
    query: z.object({
      destinationId: z.string().openapi({ example: 'city_GOI' }),
      ...stayQuery,
      sort: z.enum(['popularity', 'price_asc', 'price_desc', 'rating', 'stars']).optional(),
      priceMin: z.number().int().optional(),
      priceMax: z.number().int().optional(),
      stars: z.string().optional().openapi({ example: '4,5' }),
      rating: z.enum(['4.5', '4', '3.5']).optional(),
      freeCancellation: z.enum(['1']).optional(),
      breakfast: z.enum(['1']).optional(),
      amenities: z.string().optional().openapi({ example: 'pool,wifi' }),
      areas: z.string().optional().openapi({ example: 'Calangute,Baga' }),
      types: z.string().optional().openapi({ example: 'RESORT,VILLA' }),
      page: z.number().int().optional(),
      pageSize: z.number().int().max(30).optional(),
    }),
  },
  responses: {
    200: ok(
      'A page of hotels',
      z.object({
        searchId: z.string(),
        serverNow: z.iso.datetime(),
        destination: Destination,
        checkIn: z.string(),
        checkOut: z.string(),
        nights: z.number().int(),
        rooms: z.array(Occupancy),
        total: z.number().int(),
        page: z.number().int(),
        pageSize: z.number().int(),
        hotels: z.array(HotelSummary),
        filters: z.object({
          priceMin: z.number().int(),
          priceMax: z.number().int(),
          areas: z.array(z.object({ name: z.string(), count: z.number().int() })),
          propertyTypes: z.array(z.object({ type: propertyType, count: z.number().int() })),
        }),
        demo: z.boolean(),
      }),
    ),
    400: error('Invalid search (e.g. "You can book up to 30 nights at a time")'),
  },
});

registry.registerPath({
  method: 'get',
  path: '/hotels/{hotelId}',
  tags,
  summary: 'Hotel details: gallery, amenities, house rules and cancellation policy',
  request: { params: hotelParams },
  responses: { 200: ok('Hotel', HotelDetails), 404: error('Hotel not sold') },
});

registry.registerPath({
  method: 'get',
  path: '/hotels/{hotelId}/rooms',
  tags,
  summary: 'Room types and rates for a stay (live, never cached)',
  request: { params: hotelParams, query: z.object(stayQuery) },
  responses: {
    200: ok(
      'Rooms',
      z.object({
        hotelId: z.string(),
        serverNow: z.iso.datetime(),
        checkIn: z.string(),
        checkOut: z.string(),
        nights: z.number().int(),
        roomTypes: z.array(HotelRoomType),
        demo: z.boolean(),
      }),
    ),
    404: error('Hotel not sold'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/hotels/book',
  tags,
  summary: 'Hold rooms for 15 minutes and create a booking awaiting payment',
  description:
    'Requires an `Idempotency-Key` header. Occupancy is checked against each room type; special ' +
    'requests are stored as plain text (markup removed, ≤ 300 characters).',
  security: bearer,
  request: {
    headers: z.object({ 'Idempotency-Key': z.string() }),
    body: { content: json(bookHotelSchema) },
  },
  responses: {
    201: ok(
      'Rooms held',
      z.object({
        bookingRef: z.string(),
        status: z.literal('HELD'),
        holdExpiresAt: z.iso.datetime(),
        serverNow: z.iso.datetime(),
        priceBreakdown: z.looseObject({}).openapi({ description: 'See PriceBreakdown' }),
      }),
    ),
    400: error('Invalid stay, occupancy, rate or guest names'),
    401: error('Not signed in'),
    409: error('PRICE_CHANGED or ROOM_UNAVAILABLE (details.roomTypeId)'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/hotels/{reference}/cancel',
  tags,
  summary: 'Cancel a confirmed hotel booking (owner)',
  description:
    'Full refund before each room’s free-cancellation deadline, all but the first night after it, ' +
    'nothing for non-refundable rates. Closed from the check-in date.',
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
