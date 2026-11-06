import { describe, it, expect } from 'vitest';
import { runScamChecks, type ScamInput } from '../lib/scam';

const base: ScamInput = {
  asking: 12000,
  fairLow: 11000,
  text: 'Clean car, one owner, runs great. Can meet anytime, happy for you to bring a mechanic.',
  listing: { year: 2017, make: 'Honda', model: 'Civic' },
  vin: { year: 2017, make: 'HONDA', model: 'Civic' },
};

const triggered = (input: Partial<ScamInput>) =>
  runScamChecks({ ...base, ...input }).rules.filter((r) => r.triggered).map((r) => r.id);

describe('runScamChecks', () => {
  it('returns all six rules with evidence fields', () => {
    const { rules } = runScamChecks(base);
    expect(rules.map((r) => r.id).sort()).toEqual(
      ['no_meeting_or_inspection', 'price_far_below_market', 'scam_keywords', 'title_problem', 'urgency', 'vin_mismatch'],
    );
    rules.forEach((r) => expect(r).toHaveProperty('evidence'));
  });

  it('is low risk for a clean listing', () => {
    const r = runScamChecks(base);
    expect(r.risk).toBe('low');
    expect(r.rules.every((x) => !x.triggered)).toBe(true);
  });

  describe('price_far_below_market', () => {
    it('triggers when asking is more than 25% below the fair low', () => {
      expect(triggered({ asking: 8000 })).toContain('price_far_below_market'); // < 8,250
    });
    it('does not trigger at or above 75% of the fair low', () => {
      expect(triggered({ asking: 8250 })).not.toContain('price_far_below_market');
    });
    it('does not trigger when there is no fair range', () => {
      expect(triggered({ asking: 1000, fairLow: null })).not.toContain('price_far_below_market');
    });
  });

  describe('scam_keywords', () => {
    const phrases = [
      "I'm deployed overseas so the car is with a shipping company",
      'Payment through eBay Motors protection only',
      'We use an escrow service',
      'Send a gift card to hold it',
      'Wire transfer required',
      'Zelle deposit to hold the car',
      'Pay before viewing',
    ];
    it.each(phrases)('triggers on: %s', (text) => {
      expect(triggered({ text })).toContain('scam_keywords');
    });
    it('is case-insensitive', () => {
      expect(triggered({ text: 'GIFT CARD ONLY' })).toContain('scam_keywords');
    });
    it('returns the matched phrase as evidence', () => {
      const rule = runScamChecks({ ...base, text: 'Wire transfer required' }).rules.find((r) => r.id === 'scam_keywords')!;
      expect(String(rule.evidence).toLowerCase()).toContain('wire');
    });
  });

  describe('vin_mismatch', () => {
    it('triggers when the VIN year differs', () => {
      expect(triggered({ vin: { year: 2014, make: 'Honda', model: 'Civic' } })).toContain('vin_mismatch');
    });
    it('triggers when the VIN model differs', () => {
      expect(triggered({ vin: { year: 2017, make: 'Honda', model: 'Accord' } })).toContain('vin_mismatch');
    });
    it('ignores case differences', () => {
      expect(triggered({ vin: { year: 2017, make: 'honda', model: 'CIVIC' } })).not.toContain('vin_mismatch');
    });
    it('does not trigger without a VIN', () => {
      expect(triggered({ vin: null })).not.toContain('vin_mismatch');
    });
  });

  it.each(['No title, lost it in the move', "Title is in my cousin's name"])('title_problem: %s', (text) => {
    expect(triggered({ text })).toContain('title_problem');
  });

  it.each(["Can't meet in person", 'No inspections please'])('no_meeting_or_inspection: %s', (text) => {
    expect(triggered({ text })).toContain('no_meeting_or_inspection');
  });

  it.each(['Must sell today', 'First to send deposit gets it'])('urgency: %s', (text) => {
    expect(triggered({ text })).toContain('urgency');
  });

  describe('risk level', () => {
    it('is high when any core rule triggers alone', () => {
      expect(runScamChecks({ ...base, asking: 5000 }).risk).toBe('high');
      expect(runScamChecks({ ...base, text: 'gift card only' }).risk).toBe('high');
      expect(runScamChecks({ ...base, vin: { year: 2010, make: 'Honda', model: 'Civic' } }).risk).toBe('high');
    });
    it('is medium with one or two non-core rules', () => {
      expect(runScamChecks({ ...base, text: 'Must sell today' }).risk).toBe('medium');
      expect(runScamChecks({ ...base, text: 'Must sell today. No title.' }).risk).toBe('medium');
    });
    it('is high with three or more rules', () => {
      expect(runScamChecks({ ...base, text: "Must sell today. No title. Can't meet in person." }).risk).toBe('high');
    });
  });
});
