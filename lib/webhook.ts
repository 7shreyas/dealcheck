// Stripe webhook handling. The webhook is the only thing that marks a real
// order paid (rule 5: never trust the client for payment status).
// Idempotent: markOrderPaid only flips pending → paid once, so a re-delivered
// event never fulfills twice; event ids are recorded too.

import type Stripe from "stripe";
import { markPaidAndFulfill, type FulfillDeps } from "./fulfill";
import { getStore } from "./store";
import { stripeForWebhooks } from "./stripe";

export type WebhookResult = { status: number; body: Record<string, unknown> };

const PAID_EVENTS = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded"]);

export async function handleStripeWebhook(
  rawBody: string,
  signature: string | null,
  schedule: (task: () => Promise<void>) => void,
  deps: FulfillDeps = {},
): Promise<WebhookResult> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return { status: 503, body: { error: "Stripe webhook is not configured" } };
  if (!signature) return { status: 400, body: { error: "Missing Stripe-Signature header" } };

  let event: Stripe.Event;
  try {
    event = stripeForWebhooks().webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return { status: 400, body: { error: "Invalid signature" } };
  }

  const store = deps.store ?? getStore();

  if (PAID_EVENTS.has(event.type)) {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId ?? session.client_reference_id;
    if (!orderId) return { status: 200, body: { received: true, ignored: "no order id" } };
    if (session.payment_status !== "paid") return { status: 200, body: { received: true, ignored: "not paid yet" } };

    await markPaidAndFulfill(
      orderId,
      { email: session.customer_details?.email ?? null, stripeSessionId: session.id },
      schedule,
      { ...deps, store },
    );
  }

  const first = await store.claimEvent(event.id);
  return { status: 200, body: { received: true, duplicate: !first } };
}
