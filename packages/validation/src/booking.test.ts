import { describe, expect, it } from 'vitest';
import {
  ageOn,
  bookBusSchema,
  bookFlightSchema,
  passengerAgeIssues,
  passengerSchema,
  passengerTypeForAge,
} from './booking';

const adult = {
  type: 'ADULT',
  title: 'MR',
  firstName: 'Amit',
  lastName: 'Sharma',
  gender: 'MALE',
} as const;

describe('ages', () => {
  it('computes whole years on a date', () => {
    expect(ageOn('2014-10-26', '2026-10-25')).toBe(11);
    expect(ageOn('2014-10-25', '2026-10-25')).toBe(12);
    expect(passengerTypeForAge(1)).toBe('INFANT');
    expect(passengerTypeForAge(2)).toBe('CHILD');
    expect(passengerTypeForAge(12)).toBe('ADULT');
  });

  it('flags passengers whose age band differs on the travel date', () => {
    const child = { ...adult, type: 'CHILD', title: 'MSTR', dateOfBirth: '2014-10-20' } as const;
    expect(passengerAgeIssues([child], '2026-10-25')).toEqual([
      { index: 0, message: 'On the travel date this passenger is an adult (12+)' },
    ]);
    expect(passengerAgeIssues([{ ...child, dateOfBirth: '2016-01-01' }], '2026-10-25')).toEqual([]);
    expect(
      passengerAgeIssues([{ ...child, dateOfBirth: '2027-01-01' }], '2026-10-25')[0]?.message,
    ).toBe('Date of birth must be before the travel date');
  });
});

describe('passengerSchema', () => {
  it('accepts an adult without date of birth', () => {
    expect(passengerSchema.safeParse(adult).success).toBe(true);
  });

  it('requires matching titles and dates of birth for children', () => {
    const result = passengerSchema.safeParse({ ...adult, type: 'CHILD' });
    expect(result.error?.issues.map((i) => i.message)).toEqual([
      'Choose a title',
      'Date of birth is required for children and infants',
    ]);
  });

  it('requires names in English letters', () => {
    expect(
      passengerSchema.safeParse({ ...adult, firstName: 'अमित' }).error?.issues[0]?.message,
    ).toBe('Use English letters as on the ID');
  });
});

describe('bookFlightSchema', () => {
  it('normalises contact details', () => {
    const parsed = bookFlightSchema.parse({
      offerIds: ['mk_abc_20261025_ECONOMY'],
      passengers: [adult],
      contact: { email: 'Amit@Example.com', phone: '98765 43210' },
      expectedTotalPaise: 532000,
    });
    expect(parsed.contact).toEqual({ email: 'amit@example.com', phone: '+919876543210' });
  });
});

describe('bookBusSchema', () => {
  const valid = {
    tripId: 'trp_PNQ_BOM_20261020_07',
    seats: ['L4'],
    boardingPointId: 'bp_2',
    droppingPointId: 'dp_1',
    travellers: [{ seatNo: 'L4', name: 'Amit Sharma', age: '34', gender: 'MALE' }],
    contact: { email: 'Amit@Example.com', mobile: '98765 43210' },
    expectedTotal: 124_900,
  };
  const traveller = valid.travellers[0] as (typeof valid.travellers)[number];
  const issues = (input: object) =>
    bookBusSchema.safeParse(input).error?.issues.map((i) => [i.path.join('.'), i.message]) ?? [];

  it('accepts a booking and normalises age, email and mobile', () => {
    const parsed = bookBusSchema.parse(valid);
    expect(parsed.travellers[0]?.age).toBe(34);
    expect(parsed.contact).toEqual({ email: 'amit@example.com', mobile: '+919876543210' });
  });

  it('rejects unknown keys such as a client-sent price', () => {
    expect(bookBusSchema.safeParse({ ...valid, seatPrice: 1 }).success).toBe(false);
    expect(
      bookBusSchema.safeParse({ ...valid, travellers: [{ ...traveller, price: 1 }] }).success,
    ).toBe(false);
  });

  it('allows 1–6 unique seats with exactly one traveller each', () => {
    const seven = Array.from({ length: 7 }, (_, i) => `L${i + 1}`);
    expect(issues({ ...valid, seats: seven })).toContainEqual([
      'seats',
      'You can select up to 6 seats',
    ]);
    expect(
      issues({ ...valid, seats: ['L4', 'L4'], travellers: [traveller, traveller] }),
    ).toContainEqual(['seats', 'Choose each seat once']);
    expect(issues({ ...valid, seats: ['L4', 'L5'] })).toContainEqual([
      'travellers',
      'Add one traveller for each seat',
    ]);
    expect(issues({ ...valid, travellers: [{ ...traveller, seatNo: 'L9' }] })).toContainEqual([
      'travellers.0.seatNo',
      'Add one traveller for each seat',
    ]);
  });

  it('uses the SOP name and age messages', () => {
    expect(issues({ ...valid, travellers: [{ ...traveller, name: 'A' }] })).toEqual([
      ['travellers.0.name', 'Name is too short'],
    ]);
    expect(issues({ ...valid, travellers: [{ ...traveller, name: 'Amit 3' }] })).toEqual([
      ['travellers.0.name', 'Name contains invalid characters'],
    ]);
    for (const age of ['0', '121', '3.5', '']) {
      expect(issues({ ...valid, travellers: [{ ...traveller, age }] })).toEqual([
        ['travellers.0.age', 'Enter a valid age'],
      ]);
    }
  });

  it('validates trip and point IDs', () => {
    expect(bookBusSchema.safeParse({ ...valid, tripId: 'bs_abc' }).success).toBe(false);
    expect(issues({ ...valid, boardingPointId: '' })).toEqual([
      ['boardingPointId', 'Choose a boarding point'],
    ]);
  });
});
