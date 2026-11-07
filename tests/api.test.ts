import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { POST as checkoutRoute } from "../app/api/checkout/route";
import { POST as mockPayRoute } from "../app/api/checkout/mock/route";
import { GET as reportRoute } from "../app/api/report/[orderId]/route";
import { GET as pdfRoute } from "../app/api/report/[orderId]/pdf/route";
import { POST as webhookRoute } from "../app/api/stripe/webhook/route";
import { isValidId, newId } from "../lib/ids";
import { handleStripeWebhook } from "../lib/webhook";
import { ID_A, ID_B, ID_C, flush, freshStore, makeCheck, makeOrder } from "./helpers";

const SECRET = "whsec_test_secret";
const stripe = new Stripe("sk_test_unused");

function sessionEvent(orderId: string, overrides: Record<string, unknown> = {}, eventId = "evt_1") {
  return JSON.stringify({
    id: eventId,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_1",
        object: "checkout.session",
        payment_status: "paid",
        client_reference_id: orderId,
        metadata: { orderId },
        customer_details: { email: "buyer@example.com" },
        ...overrides,
      },
    },
  });
}
const sign = (payload: string, secret = SECRET) => stripe.webhooks.generateTestHeaderString({ payload, secret });
const webhookReq = (payload: string, signature: string | null) =>
  new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: signature ? { "stripe-signature": signature } : {},
    body: payload,
  });
const params = (orderId: string) => ({ params: Promise.resolve({ orderId }) });

beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", "");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function seed() {
  const store = freshStore();
  await store.saveCheck(makeCheck());
  await store.createOrder(makeOrder());
  return store;
}

describe("Stripe webhook", () => {
  it("rejects an invalid signature with 400", async () => {
    const store = await seed();
    const payload = sessionEvent(ID_B);
    expect((await webhookRoute(webhookReq(payload, sign(payload, "whsec_wrong")))).status).toBe(400);
    expect((await webhookRoute(webhookReq(payload, null))).status).toBe(400);
    expect((await webhookRoute(webhookReq(payload.replace("buyer@", "evil@"), sign(payload)))).status).toBe(400);
    expect((await store.getOrder(ID_B))!.status).toBe("pending");
  });

  it("marks the order paid on a valid checkout.session.completed", async () => {
    const store = await seed();
    const payload = sessionEvent(ID_B);
    const res = await webhookRoute(webhookReq(payload, sign(payload)));
    expect(res.status).toBe(200);
    const order = (await store.getOrder(ID_B))!;
    expect(order.status).toBe("paid");
    expect(order.email).toBe("buyer@example.com");
    expect(order.stripeSessionId).toBe("cs_test_1");
    await flush(); // fulfillment runs after the response
    expect((await store.getOrder(ID_B))!.report?.sections).toHaveLength(7);
  });

  it("doesn't double-process the same event delivered twice", async () => {
    const store = await seed();
    const payload = sessionEvent(ID_B);
    const scheduled: string[] = [];
    const schedule = () => void scheduled.push("fulfill");

    const first = await handleStripeWebhook(payload, sign(payload), schedule, { store });
    const second = await handleStripeWebhook(payload, sign(payload), schedule, { store });

    expect(first.body).toMatchObject({ received: true, duplicate: false });
    expect(second.body).toMatchObject({ received: true, duplicate: true });
    expect(scheduled).toEqual(["fulfill"]);
  });

  it("ignores sessions that aren't paid yet", async () => {
    const store = await seed();
    const payload = sessionEvent(ID_B, { payment_status: "unpaid" });
    await webhookRoute(webhookReq(payload, sign(payload)));
    expect((await store.getOrder(ID_B))!.status).toBe("pending");
  });

  it("returns 503 when the webhook secret isn't configured", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    await seed();
    const payload = sessionEvent(ID_B);
    expect((await webhookRoute(webhookReq(payload, sign(payload)))).status).toBe(503);
  });
});

describe("report access", () => {
  it("returns 402 for an unpaid order and 200 for a paid one", async () => {
    const store = await seed();
    expect((await reportRoute(new Request("http://x"), params(ID_B))).status).toBe(402);
    expect((await pdfRoute(new Request("http://x"), params(ID_B))).status).toBe(402);

    await store.markOrderPaid(ID_B, { email: null, stripeSessionId: "cs_1", paidAt: new Date().toISOString() });
    const res = await reportRoute(new Request("http://x"), params(ID_B));
    expect(res.status).toBe(200);
    expect((await res.json()).report.sections).toHaveLength(7);

    const pdf = await pdfRoute(new Request("http://x"), params(ID_B));
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("can't reveal another buyer's report by changing the order id", async () => {
    const store = await seed();
    await store.markOrderPaid(ID_B, { email: null, stripeSessionId: "cs_1", paidAt: new Date().toISOString() });
    for (const guess of [ID_C, "1", "2", ID_B.slice(0, -1) + "C", "../" + ID_B]) {
      const res = await reportRoute(new Request("http://x"), params(guess));
      expect(res.status).toBe(404);
    }
    // Ids are 128 random bits, URL-safe, and never repeat.
    const ids = new Set(Array.from({ length: 1000 }, newId));
    expect(ids.size).toBe(1000);
    for (const id of ids) expect(isValidId(id)).toBe(true);
  });
});

describe("checkout (mock mode)", () => {
  it("creates a pending order and returns the test payment page", async () => {
    const store = await seed();
    const res = await checkoutRoute(
      new Request("http://x", { method: "POST", body: JSON.stringify({ checkId: ID_A }) }),
    );
    const { url } = await res.json();
    expect(url).toMatch(/^\/checkout\/mock\/[A-Za-z0-9_-]{22}$/);
    const orderId = url.split("/").pop();
    expect((await store.getOrder(orderId))!.status).toBe("pending");
  });

  it("mock payment marks paid through the same fulfillment path", async () => {
    const store = await seed();
    const res = await mockPayRoute(
      new Request("http://x", { method: "POST", body: JSON.stringify({ orderId: ID_B, email: "a@b.co" }) }),
    );
    expect(await res.json()).toEqual({ url: `/report/${ID_B}` });
    expect((await store.getOrder(ID_B))!.status).toBe("paid");
    await flush();
    const order = (await store.getOrder(ID_B))!;
    expect(order.report).not.toBeNull();
    expect(order.emailedAt).not.toBeNull();
  });

  it("disables mock payment whenever Stripe is configured", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_real");
    const store = await seed();
    const res = await mockPayRoute(new Request("http://x", { method: "POST", body: JSON.stringify({ orderId: ID_B }) }));
    expect(res.status).toBe(404);
    expect((await store.getOrder(ID_B))!.status).toBe("pending");
  });
});
