// POST /api/checkout { checkId } → { url }
// Creates a pending order, then a Stripe Checkout session (or, in mock mode,
// a link to the test payment page). The order is marked paid only by the
// Stripe webhook (or the mock payment page when Stripe isn't configured).

import { appUrl, PRICE_CENTS } from "@/lib/config";
import { carName } from "@/lib/format";
import { isValidId, newId } from "@/lib/ids";
import { getStore } from "@/lib/store";
import { getStripe, hasStripe } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let checkId = "";
  try {
    checkId = String(((await req.json()) as { checkId?: unknown }).checkId ?? "");
  } catch {
    // fall through to the 400 below
  }
  if (!isValidId(checkId)) return Response.json({ error: "Missing check." }, { status: 400 });

  const store = getStore();
  const check = await store.getCheck(checkId);
  if (!check) return Response.json({ error: "We couldn't find that check." }, { status: 404 });

  const orderId = newId();
  await store.createOrder({
    id: orderId,
    checkId,
    status: "pending",
    createdAt: new Date().toISOString(),
    paidAt: null,
    email: null,
    stripeSessionId: null,
    report: null,
    cost: null,
    emailedAt: null,
  });

  if (!hasStripe()) return Response.json({ url: `/checkout/mock/${orderId}` });

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: PRICE_CENTS,
            product_data: { name: "DealCheck Deal Kit", description: carName(check.input) },
          },
        },
      ],
      client_reference_id: orderId,
      metadata: { orderId, checkId },
      success_url: `${appUrl()}/report/${orderId}`,
      cancel_url: `${appUrl()}/check/${checkId}`,
    });
    await store.updateOrder(orderId, { stripeSessionId: session.id });
    if (!session.url) throw new Error("Stripe returned no checkout URL");
    return Response.json({ url: session.url });
  } catch (err) {
    console.error("[checkout] Stripe session failed", err);
    return Response.json({ error: "We couldn't start checkout. Try again." }, { status: 502 });
  }
}
