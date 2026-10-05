import { findAirport } from '@zproo/config';
import { describe, expect, it } from 'vitest';
import { buildTimetable, quoteFare, unitHash, zonedTimeToUtc } from './index';

describe('unitHash', () => {
  it('is deterministic and in [0, 1)', () => {
    expect(unitHash('a')).toBe(unitHash('a'));
    const values = Array.from({ length: 1000 }, (_, i) => unitHash(`k${i}`));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    // Roughly uniform: about half below 0.5.
    expect(values.filter((v) => v < 0.5).length).toBeGreaterThan(400);
    expect(values.filter((v) => v < 0.5).length).toBeLessThan(600);
  });
});

describe('flight timetable', () => {
  it('is deterministic and uses known airports', () => {
    const plans = buildTimetable();
    expect(buildTimetable()).toEqual(plans);
    expect(plans.length).toBeGreaterThan(200);
    for (const plan of plans) {
      for (const seg of plan.segments) {
        expect(findAirport(seg.from)).toBeDefined();
        expect(findAirport(seg.to)).toBeDefined();
      }
    }
  });

  it('prices fares ending in 99', () => {
    const quote = quoteFare({
      key: 'x',
      baseFarePaise: 390_000,
      cabin: 'ECONOMY',
      daysAhead: 20,
      weekday: 2,
      international: false,
    });
    expect(quote.fares.ADULT.basePaise % 10_000).toBe(9_900);
  });
});

describe('time', () => {
  it('converts India time to UTC', () => {
    expect(zonedTimeToUtc('2026-10-25', '21:30', 'Asia/Kolkata').toISOString()).toBe(
      '2026-10-25T16:00:00.000Z',
    );
  });
});
