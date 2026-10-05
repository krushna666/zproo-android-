import { BookingStatus } from '@zproo/types';
import { describe, expect, it } from 'vitest';
import {
  BOOKING_TRANSITIONS,
  IllegalTransitionError,
  canTransition,
  isTerminal,
  sourcesOf,
  transition,
} from './bookingState';

const ALL = Object.values(BookingStatus);

/** Every legal edge, written out independently of the table under test. */
const LEGAL = new Set([
  'DRAFT→HELD',
  'DRAFT→FAILED',
  'HELD→PAYMENT_PENDING',
  'HELD→EXPIRED',
  'HELD→FAILED',
  'PAYMENT_PENDING→CONFIRMED',
  'PAYMENT_PENDING→EXPIRED',
  'PAYMENT_PENDING→FAILED',
  'CONFIRMED→CANCELLED',
  'CONFIRMED→COMPLETED',
  'CANCELLED→REFUND_PENDING',
  'REFUND_PENDING→REFUNDED',
]);

describe('booking transition()', () => {
  // All 100 ordered pairs: each is either a listed legal edge or rejected.
  for (const from of ALL) {
    for (const to of ALL) {
      const edge = `${from}→${to}`;
      it(`${edge} is ${LEGAL.has(edge) ? 'allowed' : 'rejected'}`, () => {
        if (LEGAL.has(edge)) {
          expect(transition(from, to)).toBe(to);
          expect(canTransition(from, to)).toBe(true);
        } else {
          expect(() => transition(from, to)).toThrow(IllegalTransitionError);
          expect(canTransition(from, to)).toBe(false);
        }
      });
    }
  }

  it('covers every status in the table', () => {
    expect(Object.keys(BOOKING_TRANSITIONS).sort()).toEqual([...ALL].sort());
  });

  it('never leaves a terminal state', () => {
    expect(ALL.filter(isTerminal).sort()).toEqual(
      ['COMPLETED', 'EXPIRED', 'FAILED', 'REFUNDED'].sort(),
    );
  });

  it('lists the sources of a target state', () => {
    expect(sourcesOf('EXPIRED').sort()).toEqual(['HELD', 'PAYMENT_PENDING']);
    expect(sourcesOf('CONFIRMED')).toEqual(['PAYMENT_PENDING']);
    expect(sourcesOf('DRAFT')).toEqual([]);
  });

  it('reports the illegal edge', () => {
    expect(() => transition('EXPIRED', 'CONFIRMED')).toThrow(
      'Illegal booking transition EXPIRED → CONFIRMED',
    );
  });
});
