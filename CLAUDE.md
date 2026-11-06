# CLAUDE.md — DealCheck

## What this is
DealCheck is a paid web app for people buying a used car from a **private seller** (Facebook Marketplace, Craigslist, OfferUp). The buyer enters a car's details and gets a free price verdict. For $29 they unlock a Deal Kit: fair price, target and walk-away offers, a scam check, model red flags, ready-to-send seller messages and a meetup checklist, plus a 7-day reply coach.

Solo founder project. It's not for dealer purchases, and it's not a replacement for a mechanic's inspection.

## Commands
- `npm run dev` — start locally (runs in mock mode if API keys are missing)
- `npm test` — Vitest unit + integration tests (see `tests/TESTING.md`)
- `npm run test:e2e` — Playwright smoke test in mock mode
- `npm run lint` / `npm run typecheck` — run both before calling any task done
- `stripe listen --forward-to localhost:3000/api/stripe/webhook` — local webhook testing

## Stack
Next.js (App Router, TypeScript) on Vercel · Stripe Checkout (test mode) · Supabase (Postgres) · Anthropic API · Resend · Vitest

## Architecture
```
lib/vin.ts        NHTSA vPIC decode (free)
lib/comps.ts      MarketCheck comps + predicted price (24h cache)
lib/recalls.ts    NHTSA recalls + complaints (free)
lib/pricing.ts    fair range, verdict, target, walk-away (pure functions)
lib/scam.ts       scam rules (pure functions)
lib/numberCheck.ts findUnverifiedNumbers: flags $ figures not in our data
lib/untrusted.ts  wrapUntrusted: wraps seller/listing text in <pasted_content> tags
lib/report.ts     Anthropic call → report sections + number check
lib/coach.ts      reply coach
lib/mocks/        fixture data used when a key is missing
app/              pages + API routes (check, checkout, webhook, report, coach)
```
Flow: input → VIN → comps → recalls → pricing → scam rules → **free verdict** → Stripe → webhook marks paid → report → page + PDF + email → reply coach (7 days).

## Hard rules (don't break these)

1. **Code does the numbers, the model does the words.** The model never produces a price, percentage or statistic. Every number comes from `pricing.ts` and the data APIs and is passed in as structured input. After generation, verify every dollar figure in the output appears in the input. If one doesn't, regenerate once, then fall back to the template-only report.
2. **Seller and listing text is untrusted.** Wrap it in `<pasted_content id="…">` tags with a fresh random ID per request (each tag on its own line), and keep the matching system-prompt note in `lib/report.ts` / `lib/coach.ts`. Never pass seller text in unwrapped.
3. **The reply coach never suggests paying above the walk-away price.** If a scam rule triggers on a seller's message, it tells the buyer to stop and explains why.
4. **No secrets in code.** Keys live in `.env.local`. Keep `.env.example` current. A missing key means that service runs in mock mode; the app must always run.
5. **Paid content stays locked.** Report sections are served only for orders the webhook has marked paid. Never trust the client for payment status.

## Pricing logic (`lib/pricing.ts`)
- **Comps:** same model, year ±1, mileage ±20k, within 100 mi. If fewer than 5, widen to 200 mi, then year ±2. Still fewer than 5 → `confidence: "low"`.
- **Fair range** = 25th–75th percentile. Median = the comps' median. If the predicted price is more than 15% off the median → `confidence: "low"`.
- **Verdict:**
  - asking > 75th percentile → `overpriced` by (asking − median), rounded to \$100
  - asking < 75% of the 25th percentile → `suspiciously_cheap`
  - else → `fair`
- **Target** = 25th percentile, rounded down to \$100. **Walk-away** = min(median, asking), rounded to \$100.

Change these formulas only when asked, and update the tests in the same change.

## Scam rules (`lib/scam.ts`)
Each rule returns `{ id, triggered, evidence }`. The rules:
1. price far below market
2. scam keywords (deployed, shipping, escrow, gift card, wire, deposit before viewing)
3. VIN mismatch with the listing
4. title problems
5. no meeting or no inspection allowed
6. urgency language

Risk: **high** if rule 1, 2 or 3 triggers, or 3+ rules trigger. **Medium** for 1–2. **Low** otherwise. Every rule has a test.

## Testing
- **Acceptance tests are pre-written:** `tests/pricing.test.ts`, `tests/scam.test.ts`, `tests/guards.test.ts`. They define the business rules and the exact exports (listed in `tests/TESTING.md`). **Never edit them to make code pass.** If one seems wrong, ask the founder.
- Write the remaining tests listed in `tests/TESTING.md`: data layer, report, reply coach, payments and access, limits, validation, and the Playwright smoke test.
- Mock every external service. No test hits the network.
- Every bug fix comes with a test that fails before the fix.
- Coverage: 100% of lines for `pricing.ts`, `scam.ts`, `numberCheck.ts` and `untrusted.ts`.

## Anthropic API
- Model is one constant in `lib/config.ts` (default `claude-sonnet-5-5`). Set `effort` explicitly (start `low`) and leave `max_tokens` room for thinking.
- Read responses by block type: collect `text` blocks, never assume `content[0]` is text.
- Don't ask the model to write out its reasoning in the response.
- Handle `stop_reason: "refusal"` by falling back to the template-only report.

## Design
- Font: Urbanist.
- Colors: blue `#1D4ED8` for the brand, orange `#C2410C` **only** for primary actions, navy `#0F1B33` for dark sections, `#F3F6FB` for light backgrounds.
- Avoid: cream backgrounds, gradient washes, italic headline accents, "01/02/03" labels, monospace labels, pill buttons, emoji icons, cards with a colored left border.
- Mobile first, since most traffic comes from phones via Facebook. Contrast at least 4.5:1, real `<button>`/`<label>` elements, touch targets 44px or more.
- Footer disclaimer: "Not affiliated with Facebook, Meta or Craigslist. Price estimates are guidance, not a guarantee of value."

## Cost guards
- 3 free checks per IP per day.
- Cache MarketCheck calls for 24h per year/model/ZIP.
- Log cost per report (data calls + tokens) on the order.

## Working style
- Keep the app runnable after every change. Run tests, lint and typecheck before saying a task is done.
- Give a one-line status note per step and keep going. Stop only for a decision only the founder can make, or a blocker like a missing key (and keep building whatever doesn't depend on it, in mock mode).
- **Ask first** before deleting files you didn't create, running migrations against a non-local database, deploying, or changing pricing formulas or the price.
- Finish with: what works, how to run it, what's still mocked, which env vars are needed.
