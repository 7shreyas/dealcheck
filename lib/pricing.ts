// Pricing rules (pure functions). Code does the numbers; the model never does.
// The formulas are fixed by CLAUDE.md and tests/pricing.test.ts. Change them
// only when the founder asks, and update the tests in the same change.

export type Comp = { price: number; year?: number; mileage?: number; distanceMiles?: number };

export type Verdict = "fair" | "overpriced" | "suspiciously_cheap" | "unknown";
export type Confidence = "normal" | "low";

export type Pricing = {
  fairLow: number | null;
  fairHigh: number | null;
  median: number | null;
  verdict: Verdict;
  overpricedBy: number | null;
  target: number | null;
  walkAway: number | null;
  confidence: Confidence;
};

const MIN_COMPS = 5;
const PREDICTION_TOLERANCE = 0.15;
const CHEAP_FACTOR = 0.75;
const MILEAGE_WINDOW = 20_000;

/** Each later step is tried only if the one before found fewer than 5 comps. */
const SEARCH_STEPS = [
  { radiusMiles: 100, yearWindow: 1 },
  { radiusMiles: 200, yearWindow: 1 },
  { radiusMiles: 200, yearWindow: 2 },
] as const;

const roundTo100 = (n: number) => Math.round(n / 100) * 100;
const floorTo100 = (n: number) => Math.floor(n / 100) * 100;

/** Percentile with linear interpolation between closest ranks (p in 0–100). */
export function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

export function computePricing(input: { asking: number; comps: { price: number }[]; predictedPrice?: number }): Pricing {
  const { asking, comps, predictedPrice } = input;
  if (comps.length === 0) {
    return {
      fairLow: null,
      fairHigh: null,
      median: null,
      verdict: "unknown",
      overpricedBy: null,
      target: null,
      walkAway: null,
      confidence: "low",
    };
  }

  const values = comps.map((c) => c.price);
  const p25 = percentile(values, 25);
  const median = percentile(values, 50);
  const p75 = percentile(values, 75);

  let verdict: Verdict = "fair";
  if (asking > p75) verdict = "overpriced";
  else if (asking < CHEAP_FACTOR * p25) verdict = "suspiciously_cheap";

  const predictionOff =
    predictedPrice !== undefined && Math.abs(predictedPrice - median) / median > PREDICTION_TOLERANCE;

  return {
    fairLow: p25,
    fairHigh: p75,
    median,
    verdict,
    overpricedBy: verdict === "overpriced" ? roundTo100(asking - median) : null,
    target: floorTo100(p25),
    walkAway: roundTo100(Math.min(median, asking)),
    confidence: comps.length < MIN_COMPS || predictionOff ? "low" : "normal",
  };
}

/**
 * Same model, year ±1, mileage ±20k, within 100 mi. Under 5 comps → widen to
 * 200 mi, then year ±2. Still under 5 → low confidence. A comp missing the
 * year, mileage or distance can't be placed in the window, so it's left out.
 */
export function selectComps(
  target: { year: number; mileage: number },
  pool: Comp[],
): { comps: Comp[]; confidence: Confidence; radiusMiles: number; yearWindow: number } {
  let comps: Comp[] = [];
  let step: (typeof SEARCH_STEPS)[number] = SEARCH_STEPS[0];
  for (step of SEARCH_STEPS) {
    const { radiusMiles, yearWindow } = step;
    comps = pool.filter(
      (c) =>
        c.year !== undefined &&
        c.mileage !== undefined &&
        c.distanceMiles !== undefined &&
        Math.abs(c.year - target.year) <= yearWindow &&
        Math.abs(c.mileage - target.mileage) <= MILEAGE_WINDOW &&
        c.distanceMiles <= radiusMiles,
    );
    if (comps.length >= MIN_COMPS) break;
  }
  return {
    comps,
    confidence: comps.length >= MIN_COMPS ? "normal" : "low",
    radiusMiles: step.radiusMiles,
    yearWindow: step.yearWindow,
  };
}
