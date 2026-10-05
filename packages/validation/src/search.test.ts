import { describe, expect, it } from 'vitest';
import {
  addDays,
  busSearchSchema,
  busSearchSchemaAt,
  cabSearchSchema,
  flightSearchSchemaAt,
  hotelSearchSchema,
  parcelQuoteSchema,
  todayIso,
  trainSearchSchema,
} from './search';

const today = todayIso();
const inDays = (n: number) => addDays(today, n);
const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((i) => i.message) ?? [];

describe('dates', () => {
  it('formats local dates and adds days across months', () => {
    expect(todayIso(new Date(2026, 9, 25, 23, 30))).toBe('2026-10-25');
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
  });
});

describe('flightSearchSchema', () => {
  const now = () => new Date('2026-10-05T20:00:00Z'); // 6 Oct, 01:30 IST
  const schema = flightSearchSchemaAt(now);
  const base = { from: 'pnq', to: 'DEL', date: '2026-10-20', adults: '1' };

  it('accepts a one-way search and normalises codes and numbers', () => {
    expect(schema.parse(base)).toEqual({
      from: 'PNQ',
      to: 'DEL',
      date: '2026-10-20',
      adults: 1,
      children: 0,
      infants: 0,
      cabin: 'ECONOMY',
    });
  });

  it('rejects unknown airports, the same airport twice, and dates outside 330 days', () => {
    expect(messages(schema.safeParse({ ...base, from: 'XXX' }))).toContain('Choose an airport');
    expect(messages(schema.safeParse({ ...base, to: 'pnq' }))).toEqual([
      'Choose different airports for From and To',
    ]);
    expect(messages(schema.safeParse({ ...base, date: '2026-10-05' }))).toEqual([
      'Choose a date within the next 330 days',
    ]);
    expect(schema.safeParse({ ...base, date: '2027-09-01' }).success).toBe(true);
    expect(messages(schema.safeParse({ ...base, date: '2027-09-02' }))).toEqual([
      'Choose a date within the next 330 days',
    ]);
    expect(schema.safeParse({ ...base, trip: 'ONE_WAY' }).success).toBe(false);
  });

  it('needs the return date on or after departure', () => {
    expect(messages(schema.safeParse({ ...base, returnDate: '2026-10-19' }))).toEqual([
      'Return date must be on or after the departure date',
    ]);
    expect(schema.parse({ ...base, returnDate: '2026-10-20' }).returnDate).toBe('2026-10-20');
    expect(schema.parse({ ...base, returnDate: '' }).returnDate).toBeUndefined();
  });

  it('applies the passenger rules with the exact messages', () => {
    expect(messages(schema.safeParse({ ...base, adults: 6, children: 4 }))).toEqual([
      'You can book up to 9 travellers at a time',
    ]);
    expect(messages(schema.safeParse({ ...base, adults: 1, infants: 2 }))).toEqual([
      'Each infant must travel with an adult',
    ]);
    expect(messages(schema.safeParse({ ...base, adults: 0, children: 1 }))).toEqual([
      'Add at least one adult',
    ]);
    expect(schema.safeParse({ ...base, adults: 9, infants: 4 }).success).toBe(true);
    expect(schema.safeParse({ ...base, infants: 5, adults: 5 }).success).toBe(false);
  });
});

describe('ground transport', () => {
  it('normalises bus cities to codes (older slug links still work)', () => {
    expect(busSearchSchema.parse({ from: 'pnq', to: 'mumbai', date: inDays(2) })).toMatchObject({
      from: 'PNQ',
      to: 'BOM',
    });
    expect(
      messages(busSearchSchema.safeParse({ from: 'PNQ', to: 'PNQ', date: inDays(2) })),
    ).toContain('Choose different cities for From and To');
    expect(messages(busSearchSchema.safeParse({ from: '', to: 'XXX', date: inDays(2) }))).toEqual([
      'Choose a city',
      'Choose a city',
    ]);
  });

  it('keeps bus dates within the next 120 days (IST)', () => {
    const now = () => new Date('2026-10-05T20:00:00Z'); // 6 Oct, 01:30 IST
    const schema = busSearchSchemaAt(now);
    const msg = 'Choose a date within the next 120 days';
    expect(messages(schema.safeParse({ from: 'PNQ', to: 'BOM', date: '2026-10-05' }))).toEqual([
      msg,
    ]);
    expect(schema.safeParse({ from: 'PNQ', to: 'BOM', date: '2026-10-06' }).success).toBe(true);
    expect(schema.safeParse({ from: 'PNQ', to: 'BOM', date: '2027-02-03' }).success).toBe(true);
    expect(messages(schema.safeParse({ from: 'PNQ', to: 'BOM', date: '2027-02-04' }))).toEqual([
      msg,
    ]);
    expect(schema.safeParse({ from: 'PNQ', to: 'BOM', date: '2026-10-07', x: 1 }).success).toBe(
      false,
    );
  });

  it('validates train stations and class', () => {
    expect(trainSearchSchema.parse({ from: 'pune', to: 'ndls', date: inDays(2) })).toMatchObject({
      from: 'PUNE',
      to: 'NDLS',
      travelClass: 'ALL',
    });
    expect(
      trainSearchSchema.safeParse({ from: 'PUNE', to: 'NDLS', date: inDays(2), travelClass: '9Z' })
        .success,
    ).toBe(false);
  });

  it('requires a date and time for scheduled cabs', () => {
    expect(
      cabSearchSchema.safeParse({ pickup: 'Hinjewadi Phase 1', drop: 'Pune Airport' }).success,
    ).toBe(true);
    expect(
      messages(
        cabSearchSchema.safeParse({
          pickup: 'Hinjewadi Phase 1',
          drop: 'Pune Airport',
          when: 'LATER',
        }),
      ),
    ).toContain('Choose when to be picked up');
  });
});

describe('hotelSearchSchema', () => {
  const base = { city: 'goa', checkIn: inDays(10), checkOut: inDays(13), rooms: 1, adults: 2 };

  it('accepts a valid stay', () => {
    expect(hotelSearchSchema.safeParse(base).success).toBe(true);
  });

  it('checks nights, adults per room and room capacity', () => {
    expect(messages(hotelSearchSchema.safeParse({ ...base, checkOut: inDays(10) }))).toContain(
      'Check-out must be after check-in',
    );
    expect(messages(hotelSearchSchema.safeParse({ ...base, checkOut: inDays(45) }))).toContain(
      'Stays can be up to 30 nights',
    );
    expect(messages(hotelSearchSchema.safeParse({ ...base, rooms: 3, adults: 2 }))).toContain(
      'Each room needs at least one adult',
    );
    expect(messages(hotelSearchSchema.safeParse({ ...base, adults: 4, children: 2 }))).toContain(
      'Up to 4 guests per room — add a room',
    );
  });
});

describe('parcelQuoteSchema', () => {
  it('validates PIN codes and weight', () => {
    expect(
      parcelQuoteSchema.safeParse({ fromPincode: '411001', toPincode: '400001', weightKg: '2.5' })
        .success,
    ).toBe(true);
    expect(
      messages(
        parcelQuoteSchema.safeParse({ fromPincode: '011001', toPincode: '400001', weightKg: 60 }),
      ),
    ).toEqual(['Enter a valid 6-digit pickup PIN code', 'Up to 50 kg per parcel']);
  });
});
