// After payment: generate the report once, log its cost, email it.
// Paid content is only ever produced for orders already marked paid (rule 5).

import type Anthropic from "@anthropic-ai/sdk";
import { sendReportEmail } from "./email";
import { carName } from "./format";
import { renderReportPdf } from "./pdf";
import { costFor, generateReport } from "./report";
import { getStore, type Store } from "./store";
import type { OrderRecord, Report } from "./types";

export type FulfillDeps = { store?: Store; client?: Anthropic; now?: Date };

/** Returns the order's report, generating and saving it first if needed. Null if unpaid. */
export async function ensureReport(orderId: string, deps: FulfillDeps = {}): Promise<{ order: OrderRecord; report: Report } | null> {
  const store = deps.store ?? getStore();
  const order = await store.getOrder(orderId);
  if (!order || order.status !== "paid") return null;
  if (order.report) return { order, report: order.report };

  const check = await store.getCheck(order.checkId);
  if (!check) throw new Error(`Order ${orderId} has no check ${order.checkId}`);

  const { report, usage } = await generateReport(check, { client: deps.client, now: deps.now });
  const saved = await store.saveReportIfMissing(orderId, report, costFor(check, usage));
  // Another request may have saved one first; serve whichever is stored.
  const fresh = saved ? null : await store.getOrder(orderId);
  return { order: fresh ?? { ...order, report }, report: fresh?.report ?? report };
}

/** Generates the report and sends the delivery email (once). */
export async function fulfillOrder(orderId: string, deps: FulfillDeps = {}): Promise<void> {
  const store = deps.store ?? getStore();
  const result = await ensureReport(orderId, deps);
  if (!result) return;
  const { order, report } = result;
  if (!order.email || order.emailedAt) return;

  const check = await store.getCheck(order.checkId);
  const car = check ? carName(check.input) : "your car";
  const pdf = await renderReportPdf(report, car);
  const status = await sendReportEmail({ to: order.email, orderId, car, pdf });
  if (status !== "failed") await store.updateOrder(orderId, { emailedAt: (deps.now ?? new Date()).toISOString() });
}

/** Marks the order paid (if still pending) and schedules fulfillment. Idempotent. */
export async function markPaidAndFulfill(
  orderId: string,
  fields: { email: string | null; stripeSessionId: string | null },
  schedule: (task: () => Promise<void>) => void,
  deps: FulfillDeps = {},
): Promise<boolean> {
  const store = deps.store ?? getStore();
  const changed = await store.markOrderPaid(orderId, { ...fields, paidAt: (deps.now ?? new Date()).toISOString() });
  if (changed) schedule(() => fulfillOrder(orderId, deps));
  return changed;
}
