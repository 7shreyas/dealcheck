# DealCheck — Test Suite

Run everything with `npm test` (Vitest). All tests must pass before any task counts as done.

## 1. Acceptance tests (pre-written, don't edit to make them pass)

These lock in the business rules. If a test looks wrong, **ask the founder** rather than changing it.

| File | Covers |
|---|---|
| `tests/pricing.test.ts` | `percentile`, `computePricing` (fair range, verdict, target, walk-away, rounding, confidence), `selectComps` (widening search) |
| `tests/scam.test.ts` | all 6 scam rules, keyword matching, VIN mismatch, risk levels |
| `tests/guards.test.ts` | `findUnverifiedNumbers` (model may only quote our numbers), `wrapUntrusted` (seller text can't pose as instructions) |

Required exports:

```ts
// lib/pricing.ts
export type Comp = { price: number; year?: number; mileage?: number; distanceMiles?: number };
export function percentile(values: number[], p: number): number; // linear interpolation
export function computePricing(input: { asking: number; comps: { price: number }[]; predictedPrice?: number }): {
  fairLow: number | null; fairHigh: number | null; median: number | null;
  verdict: 'fair' | 'overpriced' | 'suspiciously_cheap' | 'unknown';
  overpricedBy: number | null; target: number | null; walkAway: number | null;
  confidence: 'normal' | 'low';
};
export function selectComps(target: { year: number; mileage: number }, pool: Comp[]): {
  comps: Comp[]; confidence: 'normal' | 'low'; radiusMiles: number; yearWindow: number;
};

// lib/scam.ts
export type ScamInput = {
  asking: number; fairLow: number | null; text: string;
  listing: { year: number; make: string; model: string };
  vin?: { year: number; make: string; model: string } | null;
};
export function runScamChecks(input: ScamInput): {
  rules: { id: string; triggered: boolean; evidence: unknown }[];
  risk: 'low' | 'medium' | 'high';
};

// lib/numberCheck.ts
export function findUnverifiedNumbers(output: string, allowed: number[]): string[]; // $29 always allowed

// lib/untrusted.ts
export function wrapUntrusted(text: string, id?: string): string; // random id when omitted
```

## 2. Tests Claude Code must write

Mock every external service (Anthropic, MarketCheck, NHTSA, Stripe, Supabase, Resend). No test hits the network.

### Data layer — `tests/data.test.ts`
- [ ] VIN decode parses an NHTSA fixture into `{ year, make, model, trim }`
- [ ] VIN decode returns `null` (doesn't throw) on an invalid VIN or an API error
- [ ] MarketCheck response → `Comp[]` with distance, mileage, year, price
- [ ] A second call for the same year/model/ZIP within 24h uses the cache (one fetch)
- [ ] Missing `MARKETCHECK_API_KEY` → mock fixtures, app keeps working
- [ ] Recalls/complaints fixtures parse; an API error → empty list, not a crash

### Report generation — `tests/report.test.ts`
- [ ] Reads text from a response whose first block is `thinking` (collects `text` blocks only)
- [ ] Output with an unverified dollar figure → regenerates once → still bad → template-only report
- [ ] `stop_reason: "refusal"` → template-only report, no crash
- [ ] Report contains all 7 sections in order
- [ ] Listing text in the prompt is wrapped with `wrapUntrusted`
- [ ] `verdict: "unknown"` / low confidence → the report says so plainly and doesn't show a target offer

### Reply coach — `tests/coach.test.ts`
- [ ] Seller message is wrapped with `wrapUntrusted`, and the system prompt contains the pasted-content note
- [ ] Prompt includes the target and walk-away prices
- [ ] A suggested reply with a dollar figure above walk-away is rejected and regenerated (or falls back)
- [ ] Seller message that triggers a scam rule → the response tells the buyer to stop
- [ ] Coach refuses requests after 7 days from purchase

### Payments & access — `tests/api.test.ts`
- [ ] Webhook rejects an invalid Stripe signature (400)
- [ ] Valid `checkout.session.completed` marks the order paid
- [ ] The same webhook event delivered twice doesn't double-process (idempotent)
- [ ] Report route returns 402 for an unpaid order, 200 for a paid one
- [ ] Changing the order ID in the URL can't reveal another buyer's report (unguessable IDs or ownership check)

### Cost guards — `tests/limits.test.ts`
- [ ] 4th free check from the same IP in a day is blocked (429); the next day is allowed
- [ ] Cost per report (data calls + tokens) is logged on the order

### Input validation — `tests/validation.test.ts`
- [ ] Rejects a missing or negative price, mileage over 500,000, a year in the future or before 1980, an invalid ZIP
- [ ] Trims and caps listing text length (e.g. 5,000 characters)

## 3. End-to-end smoke test — `tests/e2e/flow.spec.ts` (Playwright, mock mode)
- [ ] Enter car details → free verdict shows → paid sections show "Unlock"
- [ ] Mock checkout → report page shows all 7 sections
- [ ] Reply coach returns a message
- [ ] Runs at phone width (390×844) without horizontal scrolling

## Coverage target
`lib/pricing.ts`, `lib/scam.ts`, `lib/numberCheck.ts`, `lib/untrusted.ts`: 100% of lines. Everything else: the cases listed above.
