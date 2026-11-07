// GET /api/report/:orderId/pdf — PDF download, only for paid orders.

import { carName } from "@/lib/format";
import { ensureReport } from "@/lib/fulfill";
import { isValidId } from "@/lib/ids";
import { renderReportPdf } from "@/lib/pdf";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  if (!isValidId(orderId)) return new Response("Not found", { status: 404 });
  const store = getStore();
  const order = await store.getOrder(orderId);
  if (!order) return new Response("Not found", { status: 404 });
  if (order.status !== "paid") return new Response("Payment required", { status: 402 });

  const result = await ensureReport(orderId);
  if (!result) return new Response("Payment required", { status: 402 });
  const check = await store.getCheck(order.checkId);
  const pdf = await renderReportPdf(result.report, check ? carName(check.input) : "Your car");
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="dealcheck-deal-kit.pdf"',
      "Cache-Control": "private, no-store",
    },
  });
}
