// Central config. The model is one constant so it can be swapped in one place.

import { isOffline } from "./http";

export const ANTHROPIC_MODEL = "claude-sonnet-5-5";

/** Listing extraction is simple structured reading: keep effort low. */
export const EXTRACT_EFFORT = "low" as const;
/** Leaves room for thinking on top of the small JSON answer. */
export const EXTRACT_MAX_TOKENS = 8000;

/** Report and coach: start low, raise only if quality falls short. */
export const REPORT_EFFORT = "low" as const;
export const REPORT_MAX_TOKENS = 16000;
export const COACH_EFFORT = "low" as const;
export const COACH_MAX_TOKENS = 8000;

/** Claude Sonnet 5.5 list prices, USD per million tokens (for cost logging). */
export const MODEL_USD_PER_MTOK = { input: 2, output: 10 };

/** Deal Kit price in cents. Change only when the founder asks. */
export const PRICE_CENTS = 2900;
export const PRICE_LABEL = "$29";

export const FREE_CHECKS_PER_DAY = 3;
/** Link/screenshot reads per IP per day (each one can cost a model call). */
export const EXTRACT_LIMIT_PER_DAY = 10;
/** Reply-coach messages per order per day. */
export const COACH_LIMIT_PER_DAY = 40;
export const COACH_DAYS = 7;

export function hasAnthropicKey(): boolean {
  return !isOffline() && Boolean(process.env.ANTHROPIC_API_KEY);
}

/** MarketCheck's per-call price depends on your plan; set it to log real costs. */
export function marketcheckUsdPerCall(): number {
  const n = Number(process.env.MARKETCHECK_COST_PER_CALL_USD);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
