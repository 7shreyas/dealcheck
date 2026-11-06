import { describe, it, expect } from 'vitest';
import { percentile, computePricing, selectComps, type Comp } from '../lib/pricing';

const prices = (ps: number[]) => ps.map((price) => ({ price }));

describe('percentile (linear interpolation)', () => {
  it('matches known values', () => {
    const v = [10000, 11000, 12000, 13000, 14000];
    expect(percentile(v, 25)).toBe(11000);
    expect(percentile(v, 50)).toBe(12000);
    expect(percentile(v, 75)).toBe(13000);
  });

  it('interpolates between values', () => {
    expect(percentile([10000, 20000], 50)).toBe(15000);
  });

  it('does not depend on input order', () => {
    expect(percentile([14000, 10000, 12000, 13000, 11000], 25)).toBe(11000);
  });
});

describe('computePricing', () => {
  const comps = prices([10000, 11000, 12000, 13000, 14000]);

  it('computes the fair range and median', () => {
    const r = computePricing({ asking: 12500, comps });
    expect(r.fairLow).toBe(11000);
    expect(r.fairHigh).toBe(13000);
    expect(r.median).toBe(12000);
  });

  it('flags overpriced when asking is above the 75th percentile', () => {
    const r = computePricing({ asking: 14000, comps });
    expect(r.verdict).toBe('overpriced');
    expect(r.overpricedBy).toBe(2000);
  });

  it('treats asking exactly at the 75th percentile as fair', () => {
    expect(computePricing({ asking: 13000, comps }).verdict).toBe('fair');
  });

  it('flags suspiciously cheap below 75% of the 25th percentile', () => {
    // 75% of 11,000 = 8,250
    expect(computePricing({ asking: 8000, comps }).verdict).toBe('suspiciously_cheap');
    expect(computePricing({ asking: 8300, comps }).verdict).toBe('fair');
  });

  it('sets target to the 25th percentile rounded down to $100', () => {
    const r = computePricing({ asking: 15000, comps: prices([10050, 11090, 12345, 13000, 14000]) });
    expect(r.target).toBe(11000); // p25 = 11,090 -> 11,000
  });

  it('rounds overpricedBy and walk-away to the nearest $100', () => {
    const r = computePricing({ asking: 15000, comps: prices([10000, 11000, 12345, 13000, 14000]) });
    expect(r.overpricedBy).toBe(2700); // 15,000 - 12,345 = 2,655
    expect(r.walkAway).toBe(12300); // min(12,345, 15,000)
  });

  it('caps walk-away at the asking price', () => {
    expect(computePricing({ asking: 11500, comps }).walkAway).toBe(11500);
  });

  it('has normal confidence with 5+ comps and no prediction', () => {
    expect(computePricing({ asking: 12000, comps }).confidence).toBe('normal');
  });

  it('has low confidence with fewer than 5 comps', () => {
    const r = computePricing({ asking: 12000, comps: prices([11000, 12000, 13000]) });
    expect(r.confidence).toBe('low');
  });

  it('has low confidence when the predicted price is >15% from the median', () => {
    expect(computePricing({ asking: 12000, comps, predictedPrice: 14000 }).confidence).toBe('low');
    expect(computePricing({ asking: 12000, comps, predictedPrice: 13000 }).confidence).toBe('normal');
  });

  it('returns verdict "unknown" with no comps instead of guessing', () => {
    const r = computePricing({ asking: 12000, comps: [] });
    expect(r.verdict).toBe('unknown');
    expect(r.confidence).toBe('low');
    expect(r.fairLow).toBeNull();
    expect(r.target).toBeNull();
  });
});

describe('selectComps (widening search)', () => {
  const target = { year: 2017, mileage: 80000 };
  const c = (o: Partial<Comp>): Comp => ({
    price: 12000, year: 2017, mileage: 80000, distanceMiles: 50, ...o,
  });

  it('uses the strict window when it has 5+ comps', () => {
    const pool = [c({}), c({}), c({}), c({}), c({}), c({ distanceMiles: 150 })];
    const r = selectComps(target, pool);
    expect(r.comps).toHaveLength(5);
    expect(r.radiusMiles).toBe(100);
    expect(r.yearWindow).toBe(1);
    expect(r.confidence).toBe('normal');
  });

  it('excludes comps outside year ±1 and mileage ±20k in the strict window', () => {
    const pool = [
      c({}), c({ year: 2016 }), c({ year: 2018 }), c({ mileage: 100000 }), c({ mileage: 60000 }),
      c({ year: 2015 }), c({ mileage: 100001 }),
    ];
    const r = selectComps(target, pool);
    expect(r.comps).toHaveLength(5);
    expect(r.radiusMiles).toBe(100);
  });

  it('widens to 200 miles before widening the year', () => {
    const pool = [c({}), c({}), c({}), c({ distanceMiles: 150 }), c({ distanceMiles: 190 }), c({ year: 2015 })];
    const r = selectComps(target, pool);
    expect(r.radiusMiles).toBe(200);
    expect(r.yearWindow).toBe(1);
    expect(r.comps).toHaveLength(5);
  });

  it('then widens to year ±2', () => {
    const pool = [c({}), c({}), c({ distanceMiles: 150 }), c({ year: 2015 }), c({ year: 2019, distanceMiles: 180 })];
    const r = selectComps(target, pool);
    expect(r.radiusMiles).toBe(200);
    expect(r.yearWindow).toBe(2);
    expect(r.comps).toHaveLength(5);
    expect(r.confidence).toBe('normal');
  });

  it('returns low confidence when still under 5 comps', () => {
    const r = selectComps(target, [c({}), c({}), c({ year: 2010 })]);
    expect(r.comps).toHaveLength(2);
    expect(r.confidence).toBe('low');
  });
});
