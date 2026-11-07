// POST /api/checkout/mock { orderId, email? } — mock mode only.
// Stands in for Stripe + webhook when STRIPE_SECRET_KEY isn't set, using the
// same mark-paid-and-fulfill path. Disabled (404) whenever Stripe is configured.

import { runAfterResponse } from "@/lib/background";
import { markPaidAndFulfill } from "@/lib/fulfill";
import { isValidId } from "@/lib/ids";
import { getStore } from "@/lib/store";
import { hasStripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (hasStripe()) return Response.json({ error: "Not found" }, { status: 404 });

  let body: { orderId?: unknown; email?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // handled below
  }
  const orderId = String(body.orderId ?? "");
  if (!isValidId(orderId) || !(await getStore().getOrder(orderId))) {
    return Response.json({ error: "We couldn't find that order." }, { status: 404 });
  }
  const email = typeof body.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) ? body.email.trim() : null;

  await markPaidAndFulfill(orderId, { email, stripeSessionId: null }, runAfterResponse);
  return Response.json({ url: `/report/${orderId}` });
}
