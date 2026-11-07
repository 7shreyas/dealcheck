# DealCheck

A paid web app for people buying a used car from a private seller (Facebook Marketplace, Craigslist, OfferUp). The buyer adds a car (listing link, screenshots or typed details) and gets a free price verdict. For $29 they unlock a Deal Kit: fair price, target and walk-away offers, a scam check, model red flags, messages to send the seller and a meetup checklist, plus a reply coach for 7 days.

**Stack:** Next.js (App Router, TypeScript) · Stripe Checkout · Supabase (Postgres) · Anthropic API · Resend · Vitest · Playwright

---

## Quick start

```bash
npm install
cp .env.example .env.local   # optional: leave it empty to run fully in mock mode
npm run dev                  # http://localhost:3000
```

With no keys at all, the whole flow works end to end in **mock mode**: enter a car, see the free verdict, pay on a test checkout page, read the report and use the reply coach.

| Command | What it does |
|---|---|
| `npm run dev` | Start locally |
| `npm test` | Unit and integration tests (Vitest, no network) |
| `npm run test:e2e` | Playwright smoke test of the full flow at phone width, in mock mode |
| `npm run lint` / `npm run typecheck` | Lint and type checks |
| `npm run build` | Production build |

The first time you run the e2e test, install its browser: `npx playwright install chromium`.

---

## Environment variables

Put these in `.env.local` (locally) or in Vercel's project settings (production). **Any missing key puts that service in mock mode**; the app always runs.

| Variable | Used for | Without it (mock mode) |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Stripe redirect URLs and links in emails. Set it to your production URL on Vercel. | Defaults to `http://localhost:3000` |
| `MARKETCHECK_API_KEY` | Comparable listings near the buyer and a predicted price (when a VIN is given) | Realistic generated comps, labeled "Sample data" on the verdict page |
| `MARKETCHECK_COST_PER_CALL_USD` | Optional. Your plan's price per MarketCheck call, so cost logging includes data costs | Data calls are counted but priced at $0 |
| `ANTHROPIC_API_KEY` | Writing the report, the reply coach, and reading listings and screenshots | Report and coach use template text; links are read with a simple pattern reader; screenshots can't be read |
| `STRIPE_SECRET_KEY` | Stripe Checkout (test mode keys start with `sk_test_`) | A test checkout page marks the order paid. It's disabled whenever this key is set. |
| `STRIPE_WEBHOOK_SECRET` | Verifying Stripe webhook signatures (`whsec_…`) | The webhook returns 503 |
| `SUPABASE_URL` | Your Supabase project URL | In-memory store, cleared when the server restarts |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side database access (never expose it to the browser) | Same as above |
| `RESEND_API_KEY` | Sending the delivery email with the PDF | The email is logged to the server console |
| `RESEND_FROM_EMAIL` | Sender address, e.g. `DealCheck <kit@yourdomain.com>` (the domain must be verified in Resend) | Same as above |
| `DEALCHECK_OFFLINE` | Set to `1` to force mock mode for everything, even with keys set, and skip NHTSA. Used by the e2e test. | Normal behavior |

NHTSA (VIN decode, recalls, complaints) is free and needs no key, so it's always live unless `DEALCHECK_OFFLINE=1`.

---

## Setting up each service

### Supabase

1. Create a project at supabase.com.
2. In the SQL editor, run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql). It creates the tables (checks, orders, webhook events, daily counters, API cache, coach messages) and the counter function, with row-level security enabled and no public policies.
3. Copy the project URL and the **service role** key (Project settings → API) into `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

**Supabase is required in production.** Without it, orders live in server memory, which Vercel doesn't keep between requests.

### Stripe (test mode)

1. Copy your test secret key into `STRIPE_SECRET_KEY`.
2. Local webhooks: install the Stripe CLI and run
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
   and put the `whsec_…` secret it prints into `STRIPE_WEBHOOK_SECRET`.
3. Pay with the test card `4242 4242 4242 4242`, any future date, any CVC.

The price is set in code (`PRICE_CENTS` in [`lib/config.ts`](lib/config.ts)), so no Stripe product setup is needed.

### Anthropic

Put your key in `ANTHROPIC_API_KEY`. The model is one constant (`ANTHROPIC_MODEL` in [`lib/config.ts`](lib/config.ts), currently `claude-sonnet-5-5`) with effort set to `low`.

### MarketCheck

Put your key in `MARKETCHECK_API_KEY`. Responses are cached for 24 hours per year, model and ZIP. The two endpoints used are noted at the top of [`lib/comps.ts`](lib/comps.ts); check them against your MarketCheck plan's docs when you first connect, since plans differ.

### Resend

Verify your sending domain in Resend, then set `RESEND_API_KEY` and `RESEND_FROM_EMAIL`.

---

## Deploying to Vercel

1. Push the repo to GitHub and import it in Vercel (framework: Next.js; defaults are fine).
2. Set up Supabase as above. Don't deploy without it: see the note in the Supabase section.
3. In Vercel → Settings → Environment Variables, add every variable from the table above. Set `NEXT_PUBLIC_APP_URL` to your production URL, e.g. `https://dealcheck.vercel.app`.
4. Deploy.
5. In Stripe → Developers → Webhooks, add an endpoint at `https://YOUR-DOMAIN/api/stripe/webhook` listening for `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET` in Vercel and redeploy.
6. Run one test purchase end to end with the 4242 card.

The webhook, report and PDF routes set `maxDuration = 60` because report writing can take a while; that fits within Vercel's default limits.

---

## How it works

```
Input (link → page text, screenshots → model reading, or typed details)
  1. VIN decode          NHTSA vPIC               lib/vin.ts
  2. Comps + prediction  MarketCheck (24h cache)  lib/comps.ts
  3. Recalls/complaints  NHTSA                    lib/recalls.ts
  4. Price math          pure functions           lib/pricing.ts
  5. Scam rules          pure functions           lib/scam.ts
  ── free verdict (/check/[id]) ──
  6. Stripe Checkout $29 → webhook marks the order paid   lib/webhook.ts
  7. Report: code builds every number, the model writes the words   lib/report.ts
  8. Report page + PDF + email   /report/[orderId], lib/pdf.ts, lib/email.ts
  9. Reply coach for 7 days      lib/coach.ts
```

**Guardrails built in:**

- **Numbers:** the model never produces a number. After generation, every dollar figure must appear in our data (`lib/numberCheck.ts`). A failed check regenerates once, then falls back to the template-only report. Refusals and API errors also fall back.
- **Untrusted text:** seller and listing text is always wrapped in `<pasted_content>` tags with a fresh random id (`lib/untrusted.ts`), and the matching note is in every system prompt.
- **Walk-away ceiling:** the reply coach never suggests paying above the walk-away price; code checks every reply. If a seller's message trips a scam rule, the coach tells the buyer to stop and why, without calling the model.
- **Locked content:** report content is served only for orders the webhook marked paid. Order ids are 128-bit random, so report links can't be guessed.
- **Cost guards:** 3 free checks per IP per day, a cached MarketCheck response per car and ZIP, and the cost of each report logged on its order.

---

## Known limits

- The meetup checklist's title-transfer steps are Michigan-specific.
- Facebook Marketplace links can't be read (Facebook requires a login), so buyers upload screenshots instead. Only Craigslist and OfferUp links are fetched.
- There are no buyer accounts. The report link is the buyer's access, and it's also emailed when they give an address at checkout.
