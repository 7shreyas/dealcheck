// Central config. The model is one constant so it can be swapped in one place.

export const ANTHROPIC_MODEL = "claude-sonnet-5-5";

/** Listing extraction is simple structured reading: keep effort low. */
export const EXTRACT_EFFORT = "low" as const;

/** Leaves room for thinking on top of the small JSON answer. */
export const EXTRACT_MAX_TOKENS = 8000;

/** Link/screenshot reads per IP per day (each one can cost a model call). */
export const EXTRACT_LIMIT_PER_DAY = 10;

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
