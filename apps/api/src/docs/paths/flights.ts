import { bookFlightSchema } from '@zproo/validation';
import { BookingStatus, CabinClass, PaymentStatus } from '@zproo/types';
import { z } from 'zod';
import { ErrorResponse, registry, successEnvelope } from '../openapi';
import { BusBookingInfo } from './buses';

const bearer = [{ bearerAuth: [] }];
const json = (schema: z.ZodType) => ({ 'application/json': { schema } });
const ok = (description: string, data: z.ZodType) => ({
  description,
  content: json(successEnvelope(data)),
});
const error = (description: string) => ({ description, content: json(ErrorResponse) });
const paise = (description: string) =>
  z
    .number()
    .int()
    .openapi({ description: `${description} (paise)` });
const cabin = z.enum(Object.values(CabinClass) as [string, ...string[]]);

const Carrier = z.object({ code: z.string(), name: z.string() });
const PaxFare = z.object({
  base: z.number().int(),
  taxes: z.number().int(),
  fees: z.number().int(),
  total: z.number().int(),
});
const Pax = z.object({
  adults: z.number().int(),
  children: z.number().int(),
  infants: z.number().int(),
});

const FlightSlice = z.object({
  segments: z.array(
    z.object({
      carrier: Carrier,
      flightNo: z.string().openapi({ example: 'SF 5123' }),
      from: z.string().openapi({ example: 'PNQ' }),
      to: z.string().openapi({ example: 'DEL' }),
      departure: z.string().openapi({ example: '2026-10-20T06:15:00+05:30' }),
      arrival: z.string(),
      durationMin: z.number().int(),
      aircraft: z.string(),
      terminalFrom: z.string(),
      terminalTo: z.string(),
    }),
  ),
  stops: z.number().int(),
  layovers: z.array(
    z.object({
      airport: z.string(),
      durationMin: z.number().int(),
      changeOfTerminal: z.boolean(),
      selfTransfer: z.boolean(),
      overnight: z.boolean(),
    }),
  ),
  durationMin: z.number().int(),
});

const FlightOfferSummary = registry.register(
  'FlightOfferSummary',
  z.object({
    offerId: z.string().openapi({ description: 'Signed, opaque; valid for 20 minutes' }),
    expiresAt: z.iso.datetime(),
    carrier: Carrier,
    slices: z.array(FlightSlice),
    cabin,
    fromPrice: paise('Cheapest fare per adult, all-inclusive'),
    currency: z.literal('INR'),
    refundable: z.boolean(),
    mealIncluded: z.boolean(),
    seatsLeft: z.number().int(),
  }),
);

const FareFamily = registry.register(
  'FareFamily',
  z.object({
    fareId: z.string().openapi({ description: 'Scoped to its offer' }),
    name: z.enum(['Saver', 'Flexi', 'Super Flexi']),
    price: paise('Per adult'),
    total: paise('All travellers'),
    perPax: z.object({ ADULT: PaxFare, CHILD: PaxFare, INFANT: PaxFare }),
    cabinBaggageKg: z.number(),
    checkinBaggageKg: z.number(),
    changeFee: paise('Per traveller'),
    cancellationFee: paise('Per traveller; null = non-refundable').nullable(),
    refundable: z.boolean(),
    meal: z.enum(['PAID', 'INCLUDED']),
    seatSelection: z.enum(['PAID', 'FREE']),
    priority: z.boolean(),
    mostPopular: z.boolean(),
  }),
);

const FlightSearchResponse = registry.register(
  'FlightSearchResponse',
  z.object({
    searchId: z.string(),
    serverNow: z.iso.datetime(),
    from: z.string(),
    to: z.string(),
    date: z.string(),
    returnDate: z.string().nullable(),
    pax: Pax,
    cabin,
    offers: z.array(FlightOfferSummary),
    returnOffers: z.array(FlightOfferSummary),
    filters: z.object({
      airlines: z.array(
        z.object({
          code: z.string(),
          name: z.string(),
          count: z.number().int(),
          minPrice: z.number().int(),
        }),
      ),
      priceMin: z.number().int(),
      priceMax: z.number().int(),
    }),
    demo: z.boolean().openapi({ description: 'True for the development provider' }),
  }),
);

const FlightOfferDetails = registry.register(
  'FlightOfferDetails',
  FlightOfferSummary.extend({
    pax: Pax,
    fareFamilies: z.array(FareFamily),
    fareRules: z.array(z.string()),
    serverNow: z.iso.datetime(),
    replacesOfferId: z.string().nullable(),
  }),
);

const BookResponse = z.object({
  bookingRef: z.string(),
  status: z.literal('HELD'),
  holdExpiresAt: z.iso.datetime(),
  serverNow: z.iso.datetime(),
  priceBreakdown: z.object({
    lines: z.array(z.object({ label: z.string(), amountPaise: z.number().int() })),
    basePaise: z.number().int(),
    taxesPaise: z.number().int(),
    feesPaise: z.number().int(),
    discountPaise: z.number().int(),
    totalPaise: z.number().int(),
    currency: z.literal('INR'),
  }),
});

const BookingDetails = registry.register(
  'BookingDetails',
  z.object({
    reference: z.string().openapi({ example: 'ZF7K4Q2M9XPA' }),
    serviceType: z.enum(['FLIGHT', 'BUS']),
    status: z.enum(Object.values(BookingStatus) as [string, ...string[]]),
    paymentStatus: z.enum(Object.values(PaymentStatus) as [string, ...string[]]),
    createdAt: z.iso.datetime(),
    holdExpiresAt: z.iso.datetime().nullable(),
    serverNow: z.iso.datetime(),
    confirmedAt: z.iso.datetime().nullable(),
    cancelledAt: z.iso.datetime().nullable(),
    travelDate: z.string(),
    price: BookResponse.shape.priceBreakdown,
    contact: z.object({ email: z.string(), phone: z.string() }),
    coupon: z.object({ code: z.string(), discountPaise: z.number().int() }).nullable(),
    passengers: z.array(
      z.object({
        id: z.string(),
        type: z.string(),
        title: z.string(),
        firstName: z.string(),
        lastName: z.string(),
        dateOfBirth: z.string().nullable(),
        travellingWith: z.number().int().nullable(),
        age: z.number().int().nullable(),
        gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
        seatNumber: z.string().nullable(),
      }),
    ),
    flights: z.array(
      z.object({
        sequence: z.number().int(),
        offer: FlightOfferSummary,
        fare: FareFamily,
        pnr: z.string().nullable(),
        tickets: z.array(
          z.object({ passengerId: z.string(), ticketNumber: z.string(), segmentKey: z.string() }),
        ),
      }),
    ),
    bus: BusBookingInfo.nullable(),
    demo: z.boolean(),
  }),
);

const PaymentOrder = registry.register(
  'PaymentOrder',
  z.object({
    orderId: z.string().openapi({ example: 'order_Kx9f2Lm3' }),
    amount: z.number().int().openapi({ description: 'Paise, from the stored booking' }),
    currency: z.literal('INR'),
    keyId: z.string().nullable().openapi({ description: 'Public Razorpay key_id' }),
    provider: z.string(),
    bookingRef: z.string(),
    holdExpiresAt: z.iso.datetime().nullable(),
    serverNow: z.iso.datetime(),
  }),
);

const referenceParams = z.object({ reference: z.string().openapi({ example: 'ZF7K4Q2M9XPA' }) });

registry.registerPath({
  method: 'get',
  path: '/flights/airports',
  tags: ['Flights'],
  summary: 'Airport suggestions by code, city or name',
  request: { query: z.object({ q: z.string().openapi({ example: 'bom' }) }) },
  responses: {
    200: ok(
      'Airports',
      z.array(
        z.object({ iata: z.string(), city: z.string(), name: z.string(), country: z.string() }),
      ),
    ),
  },
});

registry.registerPath({
  method: 'get',
  path: '/flights/search',
  tags: ['Flights'],
  summary: 'Search flights (one-way or round trip)',
  description:
    'Passenger rules: adults + children ≤ 9, one infant per adult, at least one adult. Dates up to 330 days ahead. ' +
    'Cached for 60 seconds; offers are valid for 20 minutes and re-priced on the details call and at booking.',
  request: {
    query: z.object({
      from: z.string().openapi({ example: 'PNQ' }),
      to: z.string().openapi({ example: 'DEL' }),
      date: z.string().openapi({ example: '2026-10-20' }),
      returnDate: z.string().optional(),
      adults: z.string().optional(),
      children: z.string().optional(),
      infants: z.string().optional(),
      cabin: cabin.optional(),
    }),
  },
  responses: {
    200: ok('Offers (and return offers for round trips)', FlightSearchResponse),
    400: error('Invalid search'),
  },
});

registry.registerPath({
  method: 'get',
  path: '/flights/{offerId}',
  tags: ['Flights'],
  summary: 'Live price, fare families and fare rules (never cached)',
  description: '`?reprice=1` renews an expired offer at the current price (or 409 if it is gone).',
  request: {
    params: z.object({ offerId: z.string() }),
    query: z.object({ reprice: z.enum(['0', '1']).optional() }),
  },
  responses: {
    200: ok('Offer with fare families', FlightOfferDetails),
    409: error('FARE_UNAVAILABLE — expired or sold out'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/flights/book',
  tags: ['Flights'],
  summary: 'Hold seats and create a booking awaiting payment',
  description:
    'Requires an `Idempotency-Key` header. Validates travellers (ages on the travel date, infants linked to ' +
    'distinct adults), re-prices live (PRICE_CHANGED / FARE_UNAVAILABLE) and holds seats for 15 minutes or ' +
    "the airline's shorter limit.",
  security: bearer,
  request: {
    headers: z.object({
      'Idempotency-Key': z.string().openapi({ example: '3f1c3c8e-4a1b-4f7e-9d7a-0a2c9b9f6e11' }),
    }),
    body: { content: json(bookFlightSchema) },
  },
  responses: {
    201: ok('Seats held', BookResponse),
    400: error('Invalid travellers or missing Idempotency-Key'),
    401: error('Not signed in'),
    409: error('PRICE_CHANGED, FARE_UNAVAILABLE or IDEMPOTENCY_CONFLICT'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/flights/{reference}/cancel',
  tags: ['Flights'],
  summary: 'Cancel a confirmed flight booking (owner)',
  description:
    'Refund = paid − airline cancellation fee per traveller − ZPROO GO fee (₹300). Closed 3 hours before departure.',
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

registry.registerPath({
  method: 'get',
  path: '/bookings',
  tags: ['Bookings'],
  summary: "The signed-in user's bookings, newest first",
  security: bearer,
  responses: {
    200: ok(
      'Bookings',
      z.array(
        z.object({
          reference: z.string(),
          serviceType: z.string(),
          status: z.string(),
          paymentStatus: z.string(),
          title: z.string(),
          subtitle: z.string(),
          travelDate: z.string(),
          totalPaise: z.number().int(),
          createdAt: z.iso.datetime(),
        }),
      ),
    ),
  },
});

registry.registerPath({
  method: 'get',
  path: '/bookings/{reference}',
  tags: ['Bookings'],
  summary: 'Booking details (owner, or staff with booking:read:any)',
  security: bearer,
  request: { params: referenceParams },
  responses: { 200: ok('Booking', BookingDetails), 404: error('Not found') },
});

registry.registerPath({
  method: 'get',
  path: '/bookings/{reference}/ticket.pdf',
  tags: ['Bookings'],
  summary: 'Download the e-ticket (confirmed bookings only)',
  security: bearer,
  request: { params: referenceParams },
  responses: {
    200: {
      description: 'PDF e-ticket',
      content: { 'application/pdf': { schema: z.string().openapi({ format: 'binary' }) } },
    },
    404: error('Not found'),
    409: error('Booking not confirmed'),
  },
});

const idempotencyHeader = z.object({
  'idempotency-key': z.uuid().openapi({ description: 'Client-generated UUID; retries replay' }),
});

const PaymentResult = z.object({
  bookingRef: z.string(),
  status: z.string().openapi({ example: 'CONFIRMED' }),
  paymentStatus: z.string().openapi({ example: 'CAPTURED' }),
});

registry.registerPath({
  method: 'post',
  path: '/payments/create',
  tags: ['Payments'],
  summary: 'Create (or reuse) the payment order for a booking',
  description:
    'The amount always comes from the booking on the server. Moves the booking HELD → PAYMENT_PENDING.',
  security: bearer,
  request: {
    headers: idempotencyHeader,
    body: { content: json(z.object({ bookingRef: z.string() })) },
  },
  responses: {
    201: ok('Payment order', PaymentOrder),
    403: error('Not your booking'),
    404: error('Booking not found'),
    409: error('Booking not awaiting payment, or IDEMPOTENCY_CONFLICT'),
    410: error('HOLD_EXPIRED'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/payments/verify',
  tags: ['Payments'],
  summary: "Verify the gateway's payment and confirm the booking",
  description:
    "HMAC-SHA256(orderId|paymentId) is checked in constant time, then the gateway's record of the " +
    'payment must match the order, amount and currency. The browser is never trusted.',
  security: bearer,
  request: {
    headers: idempotencyHeader,
    body: {
      content: json(
        z.object({
          bookingRef: z.string(),
          orderId: z.string(),
          paymentId: z.string(),
          signature: z.string(),
        }),
      ),
    },
  },
  responses: {
    200: ok('Payment captured; booking confirmed (or issuing)', PaymentResult),
    400: error('Signature or amount did not verify (PAYMENT_ERROR)'),
    403: error('Not your payment'),
    410: error('HOLD_EXPIRED — the payment is recorded as refund due'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/payments/webhook',
  tags: ['Payments'],
  summary: 'Gateway webhook (payment.captured, order.paid, payment.failed)',
  description:
    'Authenticated by X-Razorpay-Signature over the raw body. Each X-Razorpay-Event-Id is processed ' +
    'once; whichever of verify/webhook arrives first confirms the booking, the other is a no-op.',
  request: {
    headers: z.object({ 'x-razorpay-signature': z.string(), 'x-razorpay-event-id': z.string() }),
  },
  responses: {
    200: ok(
      'Processed, duplicate or ignored',
      z.object({ outcome: z.enum(['processed', 'duplicate', 'ignored']) }),
    ),
    400: error('Invalid signature or payload'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/payments/fail',
  tags: ['Payments'],
  summary: 'Record a failed or abandoned payment attempt',
  security: bearer,
  request: {
    body: { content: json(z.object({ orderId: z.string(), reason: z.string() })) },
  },
  responses: { 200: ok('Recorded', z.null()), 404: error('Payment not found') },
});
