// Stripe client. With no STRIPE_SECRET_KEY, checkout runs in mock mode (a test
// payment page that marks the order paid through the same fulfillment path).

import Stripe from "stripe";
import { isOffline } from "./http";

let client: Stripe | null = null;

export function hasStripe(): boolean {
  return !isOffline() && Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

/** Signature verification needs only the webhook secret, not an API call. */
export function stripeForWebhooks(): Stripe {
  return process.env.STRIPE_SECRET_KEY ? getStripe() : new Stripe("sk_test_signature_check_only");
}
