// POST /api/coach { orderId, message } → { reply, tip, stop }
// Paid orders only, for 7 days after purchase.

import { COACH_LIMIT_PER_DAY } from "@/lib/config";
import { COACH_MESSAGE_MAX, CoachExpiredError, coachIsOpen, coachReply } from "@/lib/coach";
import { isValidId } from "@/lib/ids";
import { allowDaily } from "@/lib/rateLimit";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { orderId?: unknown; message?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // handled below
  }
  const orderId = String(body.orderId ?? "");
  const message = typeof body.message === "string" ? body.message.trim().slice(0, COACH_MESSAGE_MAX) : "";
  if (!isValidId(orderId)) return Response.json({ error: "Not found" }, { status: 404 });
  if (!message) return Response.json({ error: "Paste the seller's message first." }, { status: 400 });

  const store = getStore();
  const order = await store.getOrder(orderId);
  if (!order) return Response.json({ error: "Not found" }, { status: 404 });
  if (order.status !== "paid") return Response.json({ error: "Payment required" }, { status: 402 });
  if (!coachIsOpen(order)) {
    return Response.json({ error: "The reply coach was available for 7 days after purchase and has now closed." }, { status: 403 });
  }
  if (!(await allowDaily(`coach:${orderId}`, COACH_LIMIT_PER_DAY))) {
    return Response.json({ error: "That's a lot of messages for one day. Try again tomorrow." }, { status: 429 });
  }

  const check = await store.getCheck(order.checkId);
  if (!check) return Response.json({ error: "Not found" }, { status: 404 });

  try {
    const history = await store.listCoachMessages(orderId);
    const result = await coachReply({ order, check, history, sellerMessage: message });
    const now = new Date().toISOString();
    await store.addCoachMessage({ orderId, role: "seller", text: message, stop: false, createdAt: now });
    await store.addCoachMessage({
      orderId,
      role: "coach",
      text: result.stop ? result.tip : result.reply,
      stop: result.stop,
      createdAt: now,
    });
    return Response.json({ reply: result.reply, tip: result.tip, stop: result.stop });
  } catch (err) {
    if (err instanceof CoachExpiredError) return Response.json({ error: err.message }, { status: 403 });
    console.error("[coach] failed", err);
    return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
