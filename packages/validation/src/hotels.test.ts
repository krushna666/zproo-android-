import { describe, expect, it } from 'vitest';
import {
  bookHotelSchema,
  hotelSearchSchemaAt,
  nightsBetween,
  parseRoomsParam,
  roomFitsMessage,
  sanitizeSpecialRequests,
  serializeRooms,
  stayNights,
} from './hotels';

const now = () => new Date('2026-10-05T20:00:00Z'); // 6 Oct 2026, 01:30 IST
const schema = hotelSearchSchemaAt(now);
const base = {
  destinationId: 'city_GOI',
  checkIn: '2026-10-20',
  checkOut: '2026-10-23',
  rooms: '2-0',
};
const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((i) => i.message) ?? [];

describe('rooms parameter', () => {
  it('parses rooms with children and their ages', () => {
    expect(parseRoomsParam('2-0|2-1:7')).toEqual([
      { adults: 2, childAges: [] },
      { adults: 2, childAges: [7] },
    ]);
    expect(parseRoomsParam('1-2:4,11')).toEqual([{ adults: 1, childAges: [4, 11] }]);
  });

  it('keeps a missing age as null and rejects other shapes', () => {
    expect(parseRoomsParam('2-2:5')).toEqual([{ adults: 2, childAges: [5, null] }]);
    expect(parseRoomsParam('2-1')).toEqual([{ adults: 2, childAges: [null] }]);
    for (const bad of ['', 'two', '2', '2-0|', '2-1:7,8', '2-x', null])
      expect(parseRoomsParam(bad)).toBeNull();
  });

  it('round-trips through the serializer', () => {
    for (const text of ['2-0', '2-0|2-1:7', '1-3:0,9,17|4-0', '2-2:5,'])
      expect(serializeRooms(parseRoomsParam(text) ?? [])).toBe(text);
  });
});

describe('nights', () => {
  it('counts calendar nights across month and year boundaries', () => {
    expect(nightsBetween('2026-12-30', '2027-01-02')).toBe(3);
    expect(nightsBetween('2026-10-31', '2026-11-01')).toBe(1);
    expect(nightsBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(stayNights('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
    ]);
  });
});

describe('hotelSearchSchema', () => {
  it('accepts a stay and parses rooms and filters', () => {
    const parsed = schema.parse({ ...base, rooms: '2-0|2-1:7', stars: '4,9', amenities: 'pool,x' });
    expect(parsed.rooms).toEqual([
      { adults: 2, childAges: [] },
      { adults: 2, childAges: [7] },
    ]);
    expect(parsed.stars).toEqual([4]);
    expect(parsed.amenities).toEqual(['pool']);
    expect(parsed.page).toBe(1);
  });

  it.each([
    [{ checkOut: '2026-10-20' }, 'Check-out must be after check-in'],
    [{ checkOut: '2026-10-19' }, 'Check-out must be after check-in'],
    [{ checkOut: '2026-11-20' }, 'You can book up to 30 nights at a time'],
    [{ checkIn: '2026-10-05', checkOut: '2026-10-07' }, "Check-in can't be in the past"],
    [{ rooms: '2-1' }, 'Add the age of each child'],
    [{ rooms: Array(9).fill('1-0').join('|') }, 'You can book up to 8 rooms at a time'],
    [{ rooms: '5-0' }, 'A room can have up to 4 adults'],
    [{ rooms: '0-1:5' }, 'Each room needs at least one adult'],
    [{ rooms: '2-4:1,2,3,4' }, 'A room can have up to 3 children'],
    [{ rooms: 'lots' }, 'Choose rooms and guests'],
    [{ destinationId: 'goa' }, 'Choose a destination'],
  ])('rejects %o', (patch, message) => {
    expect(messages(schema.safeParse({ ...base, ...patch }))).toContain(message);
  });

  it('allows exactly 30 nights and check-in today in IST', () => {
    expect(schema.safeParse({ ...base, checkOut: '2026-11-19' }).success).toBe(true);
    expect(
      schema.safeParse({ ...base, checkIn: '2026-10-06', checkOut: '2026-10-07' }).success,
    ).toBe(true);
  });
});

describe('room type occupancy', () => {
  it('words the limit like the room card', () => {
    expect(roomFitsMessage(3, 'adults')).toBe('This room fits up to 3 adults');
    expect(roomFitsMessage(1, 'children')).toBe('This room fits up to 1 child');
  });
});

describe('bookHotelSchema', () => {
  const room = {
    roomTypeId: 'rt_GOI007_1',
    rateId: 'rate_GOI007_1_bfr',
    adults: 2,
    childAges: [7],
    leadGuest: { title: 'MR', firstName: 'Amit', lastName: 'Sharma' },
  };
  const body = {
    hotelId: 'htl_GOI007',
    checkIn: '2026-10-20',
    checkOut: '2026-10-23',
    rooms: [room],
    contact: { email: 'amit@example.com', mobile: '9876543210' },
    expectedTotal: 1_000_000,
  };

  it('accepts a booking and strips markup from special requests', () => {
    const parsed = bookHotelSchema.parse({
      ...body,
      specialRequests:
        'Late check-in <script>alert(1)</script>"><img src=x onerror=alert(1)>\u0007',
    });
    expect(parsed.specialRequests).toBe('Late check-in ">');
  });

  it('rejects names with markup and long special requests', () => {
    const bad = bookHotelSchema.safeParse({
      ...body,
      rooms: [{ ...room, leadGuest: { ...room.leadGuest, firstName: '<b>Amit</b>' } }],
      specialRequests: 'x'.repeat(301),
    });
    expect(messages(bad)).toEqual([
      'Enter the name as on your government ID',
      'Special requests can be up to 300 characters',
    ]);
  });
});

describe('sanitizeSpecialRequests', () => {
  it('keeps plain text and line breaks', () => {
    expect(sanitizeSpecialRequests('  High floor,\n\n\n\nquiet room  ')).toBe(
      'High floor,\n\nquiet room',
    );
    expect(sanitizeSpecialRequests('2 < 3 and 5 > 4')).toBe('2 < 3 and 5 > 4');
  });
});
