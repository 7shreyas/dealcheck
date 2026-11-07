// GET /api/report/:orderId — the report, only for orders marked paid.
// 404 unknown order · 402 unpaid · 200 { report }

import { ensureReport } from "@/lib/fulfill";
import { isValidId } from "@/lib/ids";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  if (!isValidId(orderId)) return Response.json({ error: "Not found" }, { status: 404 });
  const order = await getStore().getOrder(orderId);
  if (!order) return Response.json({ error: "Not found" }, { status: 404 });
  if (order.status !== "paid") return Response.json({ error: "Payment required" }, { status: 402 });

  const result = await ensureReport(orderId);
  if (!result) return Response.json({ error: "Payment required" }, { status: 402 });
  return Response.json({ report: result.report });
}
