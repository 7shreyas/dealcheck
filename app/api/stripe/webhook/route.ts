// POST /api/stripe/webhook — Stripe calls this after checkout.
// Local testing: stripe listen --forward-to localhost:3000/api/stripe/webhook

import { runAfterResponse } from "@/lib/background";
import { handleStripeWebhook } from "@/lib/webhook";

export const runtime = "nodejs";
export const maxDuration = 60; // report generation runs after the response

export async function POST(req: Request) {
  const raw = await req.text(); // the raw body is needed for signature checks
  const result = await handleStripeWebhook(raw, req.headers.get("stripe-signature"), runAfterResponse);
  return Response.json(result.body, { status: result.status });
}
