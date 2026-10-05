import { findAirport } from '@zproo/config';
import { describe, expect, it } from 'vitest';
import { fareTotal } from '@zproo/utils';
import {
  connectionHubs,
  fareFamiliesFor,
  flightOfferId,
  flightPlans,
  flightRefund,
  parseFlightOfferId,
  planSlice,
  staticOfferSigner,
  unitHash,
  zonedTimeToUtc,
} from './index';

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

const PAX = { adults: 2, children: 1, infants: 1 };
const sign = staticOfferSigner;

describe('flight generator', () => {
  it('is deterministic: 15–30 itineraries in departure order on known airports', () => {
    const plans = flightPlans('PNQ', 'DEL', '2026-11-12', 'ECONOMY');
    expect(flightPlans('PNQ', 'DEL', '2026-11-12', 'ECONOMY')).toEqual(plans);
    expect(plans.length).toBeGreaterThanOrEqual(15);
    expect(plans.length).toBeLessThanOrEqual(30);
    const deps = plans.map((p) => p.segments[0]?.departureMs ?? 0);
    expect(deps).toEqual([...deps].sort((a, b) => a - b));
    for (const plan of plans) {
      for (const seg of plan.segments) {
        expect(findAirport(seg.from)).toBeDefined();
        expect(findAirport(seg.to)).toBeDefined();
      }
    }
    expect(plans.some((p) => p.segments.length === 1)).toBe(true);
    expect(plans.some((p) => p.segments.length === 2)).toBe(true);
  });

  it('has no itineraries where nobody flies and connects through hubs otherwise', () => {
    expect(flightPlans('SXR', 'NDC', '2026-11-12', 'ECONOMY')).toEqual([]);
    expect(connectionHubs('PNQ', 'SXR')).toContain('DEL');
  });

  it('keeps layovers between 45 minutes and 6 hours', () => {
    for (const date of ['2026-11-12', '2026-11-13', '2026-11-14']) {
      for (const plan of flightPlans('PNQ', 'COK', date, 'ECONOMY')) {
        for (const l of planSlice(plan).layovers) {
          expect(l.durationMin).toBeGreaterThanOrEqual(45);
          expect(l.durationMin).toBeLessThanOrEqual(360);
        }
      }
    }
  });

  it('signs offer ids and refuses tampered ones', () => {
    const key = {
      from: 'PNQ',
      to: 'DEL',
      date: '2026-11-12',
      cabin: 'ECONOMY' as const,
      pax: PAX,
      index: 3,
    };
    const id = flightOfferId(key, 1_790_000_000_000, sign);
    expect(id).toMatch(/^off_PNQDEL_20261112_E_211_03_[0-9a-z]+_[0-9a-f]{8}$/);
    expect(parseFlightOfferId(id, sign)).toMatchObject({ ...key, issuedAtMs: 1_790_000_000_000 });
    expect(parseFlightOfferId(id.replace('_211_', '_111_'), sign)).toBeNull();
    expect(parseFlightOfferId('off_nope', sign)).toBeNull();
  });

  it('prices fare families per passenger type, scoped to the itinerary', () => {
    const [plan, other] = flightPlans('PNQ', 'DEL', '2026-11-12', 'ECONOMY');
    if (!plan || !other) throw new Error('no plans');
    const fares = fareFamiliesFor(plan, PAX, '2026-10-20');
    expect(fares.map((f) => f.name)).toEqual(['Saver', 'Flexi', 'Super Flexi']);
    expect(fares[1]?.mostPopular).toBe(true);
    for (const f of fares) {
      expect(f.perPax.ADULT.base % 10_000).toBe(9_900);
      expect(f.perPax.ADULT.total).toBe(
        f.perPax.ADULT.base + f.perPax.ADULT.taxes + f.perPax.ADULT.fees,
      );
      expect(f.total).toBe(fareTotal(f.perPax, PAX));
      expect(f.perPax.CHILD.base).toBeLessThan(f.perPax.ADULT.base);
      expect(f.perPax.INFANT.fees).toBe(0);
    }
    expect((fares[0]?.price ?? 0) < (fares[2]?.price ?? 0)).toBe(true);
    const otherIds = fareFamiliesFor(other, PAX, '2026-10-20').map((f) => f.fareId);
    expect(otherIds).not.toContain(fares[1]?.fareId);
  });

  it('refunds what was paid minus airline and service fees, never below zero', () => {
    const [plan] = flightPlans('PNQ', 'DEL', '2026-11-12', 'ECONOMY');
    if (!plan) throw new Error('no plan');
    const [saver, flexi, superFlexi] = fareFamiliesFor(
      plan,
      { adults: 1, children: 0, infants: 0 },
      '2026-10-20',
    );
    if (!saver || !flexi || !superFlexi) throw new Error('no fares');
    const one = { adults: 1, children: 0, infants: 0 };
    expect(flightRefund([{ fare: superFlexi }], one, superFlexi.total)).toBe(
      superFlexi.total - 30_000,
    );
    expect(flightRefund([{ fare: flexi }], one, flexi.total)).toBe(flexi.total - 250_000 - 30_000);
    const saverRefund = flightRefund([{ fare: saver }], one, saver.total);
    expect(saverRefund).toBe(
      saver.refundable
        ? saver.total - Math.min(saver.perPax.ADULT.base, saver.cancellationFee ?? 0) - 30_000
        : saver.total - saver.perPax.ADULT.base - 30_000,
    );
    expect(flightRefund([{ fare: saver }], one, 10_000)).toBe(0);
  });

  it('formats local times with the airport offset and marks +1 arrivals', () => {
    const plans = flightPlans('BOM', 'DXB', '2026-11-12', 'ECONOMY');
    const slice = planSlice(plans[0] as (typeof plans)[number]);
    expect(slice.segments[0]?.departure).toMatch(/\+05:30$/);
    expect(slice.segments.at(-1)?.arrival).toMatch(/\+04:00$/);
  });
});

describe('time', () => {
  it('converts India time to UTC', () => {
    expect(zonedTimeToUtc('2026-10-25', '21:30', 'Asia/Kolkata').toISOString()).toBe(
      '2026-10-25T16:00:00.000Z',
    );
  });
});
