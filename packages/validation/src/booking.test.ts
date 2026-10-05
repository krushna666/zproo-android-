import { describe, expect, it } from 'vitest';
import {
  ageOn,
  bookBusSchema,
  bookFlightSchema,
  flightAgeIssues,
  flightTravellerSchema,
  passengerTypeForAge,
} from './booking';

const adult = {
  type: 'ADULT',
  title: 'MR',
  firstName: 'Amit',
  lastName: 'Sharma',
  gender: 'MALE',
} as const;
const msgs = (r: { error?: { issues: { message: string }[] } }) =>
  r.error?.issues.map((i) => i.message) ?? [];

describe('ages', () => {
  it('computes whole years on a date, including leap-day birthdays', () => {
    expect(ageOn('2014-10-26', '2026-10-25')).toBe(11);
    expect(ageOn('2014-10-25', '2026-10-25')).toBe(12); // birthday on the travel date
    expect(ageOn('2024-02-29', '2026-02-28')).toBe(1);
    expect(ageOn('2024-02-29', '2026-03-01')).toBe(2);
    expect(passengerTypeForAge(1)).toBe('INFANT');
    expect(passengerTypeForAge(2)).toBe('CHILD');
    expect(passengerTypeForAge(12)).toBe('ADULT');
  });

  it('checks each type on the travel date', () => {
    const travel = '2026-10-25';
    const today = '2026-10-05';
    expect(flightAgeIssues([{ type: 'CHILD', dob: '2014-10-25' }], travel, today)).toEqual([
      { index: 0, message: 'A child must be 2–11 years old on the travel date' },
    ]);
    expect(flightAgeIssues([{ type: 'CHILD', dob: '2014-10-26' }], travel, today)).toEqual([]);
    expect(flightAgeIssues([{ type: 'ADULT', dob: '2015-01-01' }], travel, today)).toEqual([
      { index: 0, message: 'An adult must be 12 or older on the travel date' },
    ]);
    expect(flightAgeIssues([{ type: 'INFANT', dob: '2024-10-25' }], travel, today)).toEqual([
      { index: 0, message: 'An infant must be under 2 years old on the travel date' },
    ]);
    // Future date of birth, or an infant younger than 7 days on the travel date.
    expect(flightAgeIssues([{ type: 'INFANT', dob: '2026-10-10' }], travel, today)).toEqual([
      { index: 0, message: 'Enter a valid date of birth' },
    ]);
    expect(flightAgeIssues([{ type: 'INFANT', dob: '2026-10-03' }], '2026-10-08', today)).toEqual([
      { index: 0, message: 'Enter a valid date of birth' },
    ]);
    expect(flightAgeIssues([{ type: 'INFANT', dob: '2026-09-20' }], travel, today)).toEqual([]);
    expect(flightAgeIssues([{ type: 'ADULT' }], travel, today)).toEqual([]);
  });
});

describe('flightTravellerSchema', () => {
  it('accepts an adult without a date of birth', () => {
    expect(flightTravellerSchema.safeParse(adult).success).toBe(true);
  });

  it('requires a title that fits the type and a date of birth for children', () => {
    expect(msgs(flightTravellerSchema.safeParse({ ...adult, type: 'CHILD' }))).toEqual([
      'Choose a title',
      'Enter a valid date of birth',
    ]);
  });

  it('allows letters and spaces only, first name 1–32 and last name 2–32', () => {
    const name = 'Enter the name as on your government ID';
    expect(msgs(flightTravellerSchema.safeParse({ ...adult, firstName: 'अमित' }))).toEqual([name]);
    expect(msgs(flightTravellerSchema.safeParse({ ...adult, lastName: 'S' }))).toEqual([name]);
    expect(msgs(flightTravellerSchema.safeParse({ ...adult, firstName: "D'Souza" }))).toEqual([
      name,
    ]);
    expect(
      flightTravellerSchema.safeParse({ ...adult, firstName: 'A', lastName: 'Ng' }).success,
    ).toBe(true);
    expect(msgs(flightTravellerSchema.safeParse({ ...adult, lastName: 'x'.repeat(33) }))).toEqual([
      name,
    ]);
  });
});

describe('bookFlightSchema', () => {
  const offerId = 'off_PNQDEL_20261020_E_100_03_t1abcd_0123abcd';
  const valid = {
    offerId,
    fareId: 'fare_0a1b2c_flexi',
    travellers: [adult],
    contact: { email: 'Amit@Example.com', mobile: '98765 43210' },
    expectedTotal: 532000,
  };

  it('normalises contact details', () => {
    expect(bookFlightSchema.parse(valid).contact).toEqual({
      email: 'amit@example.com',
      mobile: '+919876543210',
    });
  });

  it('links each infant to a different adult', () => {
    const infant = {
      type: 'INFANT',
      title: 'MISS',
      firstName: 'Aanya',
      lastName: 'Sharma',
      gender: 'FEMALE',
      dob: '2026-01-01',
    } as const;
    expect(msgs(bookFlightSchema.safeParse({ ...valid, travellers: [adult, infant] }))).toEqual([
      'Each infant must travel with an adult',
    ]);
    expect(
      msgs(
        bookFlightSchema.safeParse({
          ...valid,
          travellers: [adult, { ...infant, infantOfIndex: 0 }, { ...infant, infantOfIndex: 0 }],
        }),
      ),
    ).toEqual(['Each infant must travel with a different adult']);
    expect(
      bookFlightSchema.safeParse({ ...valid, travellers: [adult, { ...infant, infantOfIndex: 0 }] })
        .success,
    ).toBe(true);
  });

  it('checks GSTIN, fare ids and the return fare', () => {
    expect(
      msgs(
        bookFlightSchema.safeParse({
          ...valid,
          gstDetails: { gstin: 'NOPE', companyName: 'Acme' },
        }),
      ),
    ).toEqual(['Enter a valid GSTIN']);
    expect(
      bookFlightSchema.safeParse({
        ...valid,
        gstDetails: { gstin: '27aapfu0939f1zv', companyName: 'Acme Travels' },
      }).success,
    ).toBe(true);
    expect(bookFlightSchema.safeParse({ ...valid, fareId: 'fare_flexi' }).success).toBe(false);
    expect(msgs(bookFlightSchema.safeParse({ ...valid, returnOfferId: offerId }))).toEqual([
      'Choose a fare for the return flight',
    ]);
    expect(bookFlightSchema.safeParse({ ...valid, price: 1 }).success).toBe(false);
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
