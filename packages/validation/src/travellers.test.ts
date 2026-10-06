import { describe, expect, it } from 'vitest';
import { savedTravellerSchema, splitFullName } from './travellers';

describe('splitFullName', () => {
  it('keeps middle names with the first name', () => {
    expect(splitFullName('  Amit  Kumar Sharma ')).toEqual({
      firstName: 'Amit Kumar',
      lastName: 'Sharma',
    });
  });

  it('gives one-word names an empty last name', () => {
    expect(splitFullName('Ravi')).toEqual({ firstName: 'Ravi', lastName: '' });
  });
});

describe('savedTravellerSchema', () => {
  it('accepts a name with optional details and rejects anything else', () => {
    expect(savedTravellerSchema.parse({ firstName: 'Ravi' })).toEqual({
      firstName: 'Ravi',
      lastName: '',
    });
    expect(
      savedTravellerSchema.safeParse({ firstName: 'Ravi', lastName: 'K', price: 1 }).success,
    ).toBe(false);
    expect(savedTravellerSchema.safeParse({ firstName: '<b>Ravi</b>' }).success).toBe(false);
    expect(savedTravellerSchema.safeParse({ firstName: 'Ravi', dob: '2020-02-30' }).success).toBe(
      false,
    );
  });
});
