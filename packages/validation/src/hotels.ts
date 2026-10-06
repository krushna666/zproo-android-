import { z } from 'zod';
import { FLIGHT_MESSAGES, gstDetailsSchema, idNameSchema, travelContactSchema } from './booking';
import { isoDateSchema } from './common';
import { addDays, todayInIst } from './search';

/** Hotels open a year ahead; one booking covers up to 30 nights and 8 rooms. */
export const HOTEL_MAX_DAYS_AHEAD = 365;
export const HOTEL_MAX_NIGHTS = 30;
export const HOTEL_MAX_ROOMS = 8;
export const HOTEL_MAX_ADULTS_PER_ROOM = 4;
export const HOTEL_MAX_CHILDREN_PER_ROOM = 3;
export const HOTEL_MAX_CHILD_AGE = 17;
export const SPECIAL_REQUESTS_MAX = 300;
/** Results pages: 20 hotels by default, at most 30. */
export const HOTEL_PAGE_SIZE = 20;
export const HOTEL_MAX_PAGE_SIZE = 30;

export const HOTEL_MESSAGES = {
  destination: 'Choose a destination',
  checkInPast: "Check-in can't be in the past",
  checkInWindow: `Choose a check-in date within the next ${HOTEL_MAX_DAYS_AHEAD} days`,
  checkOut: 'Check-out must be after check-in',
  maxNights: `You can book up to ${HOTEL_MAX_NIGHTS} nights at a time`,
  maxRooms: `You can book up to ${HOTEL_MAX_ROOMS} rooms at a time`,
  rooms: 'Choose rooms and guests',
  minAdults: 'Each room needs at least one adult',
  maxAdults: `A room can have up to ${HOTEL_MAX_ADULTS_PER_ROOM} adults`,
  maxChildren: `A room can have up to ${HOTEL_MAX_CHILDREN_PER_ROOM} children`,
  childAge: 'Add the age of each child',
  specialRequests: `Special requests can be up to ${SPECIAL_REQUESTS_MAX} characters`,
  leadGuest: 'Add a lead guest for each room',
  rate: 'Choose a room rate',
} as const;

/** "This room fits up to 3 adults" — the room type's own limit (details page and API). */
export const roomFitsMessage = (max: number, who: 'adults' | 'children') =>
  `This room fits up to ${max} ${max !== 1 ? who : who === 'adults' ? 'adult' : 'child'}`;

// ───────────────────────────── Dates ─────────────────────────────

/** Nights between two IST calendar dates (30 Dec → 2 Jan = 3). Pure date arithmetic, no time zones. */
export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round(
    (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000,
  );
}

/** Every night of a stay (the check-in date up to the day before check-out). */
export function stayNights(checkIn: string, checkOut: string): string[] {
  const nights = Math.max(0, nightsBetween(checkIn, checkOut));
  return Array.from({ length: nights }, (_, i) => addDays(checkIn, i));
}

// ───────────────────────────── Rooms param ─────────────────────────────

/** A room as typed in the search widget: a child's age may still be missing (null). */
export interface RoomInput {
  adults: number;
  childAges: (number | null)[];
}

/**
 * Parses the compact `rooms` URL parameter: rooms separated by `|`, each `adults-children` with
 * the children's ages after a colon. `2-0|2-1:7` = room 1 with 2 adults, room 2 with 2 adults
 * and a 7-year-old. A child without an age stays `null` (reported by the schema). Returns null
 * when the text isn't in this shape at all.
 */
export function parseRoomsParam(value: string | null | undefined): RoomInput[] | null {
  if (!value) return null;
  const rooms: RoomInput[] = [];
  for (const part of value.split('|')) {
    const match = /^(\d{1,2})-(\d{1,2})(?::(\d{0,2}(?:,\d{0,2})*))?$/.exec(part.trim());
    if (!match) return null;
    const adults = Number(match[1]);
    const children = Number(match[2]);
    const given = match[3] ? match[3].split(',') : [];
    if (given.length > children) return null;
    rooms.push({
      adults,
      childAges: Array.from({ length: children }, (_, i) => {
        const age = given[i];
        return age === undefined || age === '' ? null : Number(age);
      }),
    });
  }
  return rooms.length > 0 ? rooms : null;
}

/** The inverse of parseRoomsParam. */
export function serializeRooms(rooms: readonly RoomInput[]): string {
  return rooms
    .map((r) => {
      const ages = r.childAges.map((a) => (a === null ? '' : String(a)));
      return `${r.adults}-${r.childAges.length}${ages.length > 0 ? `:${ages.join(',')}` : ''}`;
    })
    .join('|');
}

export const DEFAULT_ROOMS: readonly RoomInput[] = [{ adults: 2, childAges: [] }];

/** One searched room: 1–4 adults, 0–3 children, every child with an age of 0–17. */
export const roomOccupancySchema = z
  .object({
    adults: z.number().int(),
    childAges: z.array(z.number().int().min(0).max(HOTEL_MAX_CHILD_AGE).nullable()),
  })
  .superRefine((r, ctx) => {
    if (r.adults < 1)
      ctx.addIssue({ code: 'custom', path: ['adults'], message: HOTEL_MESSAGES.minAdults });
    if (r.adults > HOTEL_MAX_ADULTS_PER_ROOM)
      ctx.addIssue({ code: 'custom', path: ['adults'], message: HOTEL_MESSAGES.maxAdults });
    if (r.childAges.length > HOTEL_MAX_CHILDREN_PER_ROOM)
      ctx.addIssue({ code: 'custom', path: ['childAges'], message: HOTEL_MESSAGES.maxChildren });
    r.childAges.forEach((age, i) => {
      if (age === null)
        ctx.addIssue({ code: 'custom', path: ['childAges', i], message: HOTEL_MESSAGES.childAge });
    });
  })
  .transform((r) => ({ adults: r.adults, childAges: r.childAges.filter((a) => a !== null) }));

export const roomsSchema = z
  .array(roomOccupancySchema)
  .min(1, HOTEL_MESSAGES.rooms)
  .max(HOTEL_MAX_ROOMS, HOTEL_MESSAGES.maxRooms);

/** The `rooms` URL parameter, parsed and checked. */
const roomsParamSchema = z.string().transform((value, ctx) => {
  const rooms = parseRoomsParam(value);
  if (!rooms) {
    ctx.addIssue({ code: 'custom', message: HOTEL_MESSAGES.rooms });
    return z.NEVER;
  }
  const parsed = roomsSchema.safeParse(rooms);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) ctx.addIssue({ ...issue, code: 'custom' });
    return z.NEVER;
  }
  return parsed.data;
});

// ───────────────────────────── Search ─────────────────────────────

/** `city_GOI`, `area_GOI_calangute` or a hotel id `htl_GOI007`. */
export const HOTEL_DESTINATION_PATTERN =
  /^(city_[A-Z]{3}|area_[A-Z]{3}_[a-z0-9-]{2,40}|htl_[A-Z]{3}\d{3})$/;
export const hotelIdSchema = z.string().regex(/^htl_[A-Z]{3}\d{3}$/, 'Invalid hotel');
export const hotelDestinationIdSchema = z
  .string()
  .trim()
  .regex(HOTEL_DESTINATION_PATTERN, HOTEL_MESSAGES.destination);

/** Stay dates checked against `now` ("today" in IST). */
function stayDates(now: () => Date) {
  return z.object({ checkIn: isoDateSchema, checkOut: isoDateSchema }).superRefine((s, ctx) => {
    const today = todayInIst(now());
    if (s.checkIn < today)
      ctx.addIssue({ code: 'custom', path: ['checkIn'], message: HOTEL_MESSAGES.checkInPast });
    else if (nightsBetween(today, s.checkIn) > HOTEL_MAX_DAYS_AHEAD)
      ctx.addIssue({ code: 'custom', path: ['checkIn'], message: HOTEL_MESSAGES.checkInWindow });
    const nights = nightsBetween(s.checkIn, s.checkOut);
    if (nights < 1)
      ctx.addIssue({ code: 'custom', path: ['checkOut'], message: HOTEL_MESSAGES.checkOut });
    else if (nights > HOTEL_MAX_NIGHTS)
      ctx.addIssue({ code: 'custom', path: ['checkOut'], message: HOTEL_MESSAGES.maxNights });
  });
}

export const HOTEL_SORTS = ['popularity', 'price_asc', 'price_desc', 'rating', 'stars'] as const;
export const HOTEL_FILTER_AMENITIES = [
  'pool',
  'wifi',
  'parking',
  'gym',
  'spa',
  'restaurant',
  'ac',
  'pet_friendly',
] as const;
export const PROPERTY_TYPES = ['HOTEL', 'RESORT', 'VILLA', 'HOMESTAY', 'APARTMENT'] as const;
export const GUEST_RATING_STEPS = [4.5, 4, 3.5] as const;

/** A comma list where unknown entries are dropped (filters never fail a search). */
const csvOf = <T extends string>(allowed: readonly T[]) =>
  z
    .string()
    .optional()
    .transform((v) =>
      (v ?? '')
        .split(',')
        .map((x) => x.trim())
        .filter((x): x is T => (allowed as readonly string[]).includes(x)),
    )
    .catch([]);
const optionalInt = z.coerce.number().int().min(0).optional().catch(undefined);
const flag = z
  .string()
  .optional()
  .transform((v) => v === '1' || v === 'true')
  .catch(false);

/**
 * Results filters and sort, kept in the URL. Lenient: a bad value is ignored rather than
 * failing the search (old links keep working).
 */
export const hotelFilterFields = {
  sort: z.enum(HOTEL_SORTS).optional().catch(undefined),
  priceMin: optionalInt,
  priceMax: optionalInt,
  stars: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? '')
        .split(',')
        .map(Number)
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 5),
    )
    .catch([]),
  rating: z.coerce
    .number()
    .refine((n) => (GUEST_RATING_STEPS as readonly number[]).includes(n))
    .optional()
    .catch(undefined),
  freeCancellation: flag,
  breakfast: flag,
  amenities: csvOf(HOTEL_FILTER_AMENITIES),
  areas: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? '')
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x.length > 0 && x.length <= 40),
    )
    .catch([]),
  types: csvOf(PROPERTY_TYPES),
  page: z.coerce.number().int().min(1).max(100).default(1).catch(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(HOTEL_MAX_PAGE_SIZE)
    .default(HOTEL_PAGE_SIZE)
    .catch(HOTEL_PAGE_SIZE),
};
export const hotelFiltersSchema = z.object(hotelFilterFields);
export type HotelFilters = z.output<typeof hotelFiltersSchema>;

/** GET /hotels/search and the results page URL (destination, dates, rooms + filters). */
export function hotelSearchSchemaAt(now: () => Date = () => new Date()) {
  return z
    .strictObject({
      destinationId: hotelDestinationIdSchema,
      checkIn: isoDateSchema,
      checkOut: isoDateSchema,
      rooms: roomsParamSchema,
      ...hotelFilterFields,
    })
    .superRefine((s, ctx) => {
      const dates = stayDates(now).safeParse(s);
      if (!dates.success)
        for (const issue of dates.error.issues) ctx.addIssue({ ...issue, code: 'custom' });
    });
}
export const hotelSearchSchema = hotelSearchSchemaAt();
export type HotelSearch = z.output<typeof hotelSearchSchema>;

/** The search widget's values (rooms as an array; children may still lack an age). */
export function hotelSearchFormSchemaAt(now: () => Date = () => new Date()) {
  return z
    .object({
      destinationId: hotelDestinationIdSchema,
      checkIn: isoDateSchema,
      checkOut: isoDateSchema,
      rooms: roomsSchema,
    })
    .superRefine((s, ctx) => {
      const dates = stayDates(now).safeParse(s);
      if (!dates.success)
        for (const issue of dates.error.issues) ctx.addIssue({ ...issue, code: 'custom' });
    });
}
export const hotelSearchFormSchema = hotelSearchFormSchemaAt();
export type HotelSearchForm = z.output<typeof hotelSearchFormSchema>;

/** Raw search input from URL parameters (results page and API share the reading). */
export function hotelSearchInputFromParams(params: { get(name: string): string | null }) {
  const checkIn = params.get('checkIn') ?? addDays(todayInIst(), 7);
  const raw: Record<string, string> = {
    destinationId: params.get('destinationId') ?? '',
    checkIn,
    checkOut: params.get('checkOut') ?? addDays(checkIn, 2),
    rooms: params.get('rooms') ?? serializeRooms(DEFAULT_ROOMS),
  };
  for (const key of Object.keys(hotelFilterFields)) {
    const value = params.get(key);
    if (value !== null) raw[key] = value;
  }
  return raw;
}

/** Live rooms query: GET /hotels/:hotelId/rooms?checkIn=&checkOut=&rooms= */
export function hotelRoomsQuerySchemaAt(now: () => Date = () => new Date()) {
  return z
    .strictObject({ checkIn: isoDateSchema, checkOut: isoDateSchema, rooms: roomsParamSchema })
    .superRefine((s, ctx) => {
      const dates = stayDates(now).safeParse(s);
      if (!dates.success)
        for (const issue of dates.error.issues) ctx.addIssue({ ...issue, code: 'custom' });
    });
}

// ───────────────────────────── Booking ─────────────────────────────

/**
 * Special requests are plain text: tags and control characters are removed (newlines kept),
 * runs of spaces collapsed. The stored text is shown escaped on every screen and in the PDF.
 */
export function sanitizeSpecialRequests(value: string): string {
  return (
    value
      // Whole <script>/<style> blocks, then any other tag.
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<\/?[a-z!][^>]*>?/gi, '')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

export const HOTEL_TITLES = ['MR', 'MRS', 'MS', 'MISS', 'MSTR', 'DR'] as const;

export const leadGuestSchema = z.strictObject({
  title: z.enum(HOTEL_TITLES, { message: FLIGHT_MESSAGES.title }),
  firstName: idNameSchema(1),
  lastName: idNameSchema(2),
});
export type LeadGuestInput = z.output<typeof leadGuestSchema>;

export const hotelRateIdSchema = z
  .string()
  .regex(/^rate_[A-Z]{3}\d{3}_\d_[a-z0-9]{2,8}$/, HOTEL_MESSAGES.rate);
export const hotelRoomTypeIdSchema = z.string().regex(/^rt_[A-Z]{3}\d{3}_\d$/, HOTEL_MESSAGES.rate);

export const bookHotelSchema = z.strictObject({
  hotelId: hotelIdSchema,
  checkIn: isoDateSchema,
  checkOut: isoDateSchema,
  rooms: z
    .array(
      z.strictObject({
        roomTypeId: hotelRoomTypeIdSchema,
        rateId: hotelRateIdSchema,
        adults: z
          .number()
          .int()
          .min(1, HOTEL_MESSAGES.minAdults)
          .max(HOTEL_MAX_ADULTS_PER_ROOM, HOTEL_MESSAGES.maxAdults),
        childAges: z
          .array(z.number().int().min(0).max(HOTEL_MAX_CHILD_AGE))
          .max(HOTEL_MAX_CHILDREN_PER_ROOM, HOTEL_MESSAGES.maxChildren)
          .default([]),
        leadGuest: leadGuestSchema,
      }),
    )
    .min(1, HOTEL_MESSAGES.rooms)
    .max(HOTEL_MAX_ROOMS, HOTEL_MESSAGES.maxRooms),
  contact: travelContactSchema,
  specialRequests: z
    .string()
    .max(2_000, HOTEL_MESSAGES.specialRequests)
    .transform(sanitizeSpecialRequests)
    .refine((v) => v.length <= SPECIAL_REQUESTS_MAX, HOTEL_MESSAGES.specialRequests)
    .optional(),
  gstDetails: gstDetailsSchema.optional(),
  expectedTotal: z.number().int().min(0),
});
export type BookHotelInput = z.output<typeof bookHotelSchema>;
