import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { coachExpiresAt, coachIsOpen } from "@/lib/coach";
import { carName } from "@/lib/format";
import { ensureReport } from "@/lib/fulfill";
import { isValidId } from "@/lib/ids";
import { getStore } from "@/lib/store";
import Coach, { type CoachTurn } from "../../components/Coach";
import Flow from "../../components/Flow.module.css";
import PaymentPending from "../../components/PaymentPending";
import ReportView from "../../components/ReportView";
import { SiteFooter, SiteHeader } from "../../components/SiteChrome";

export const metadata: Metadata = { title: "Your Deal Kit · DealCheck", robots: { index: false } };
export const maxDuration = 60; // first view may generate the report

const DATE = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" });

export default async function ReportPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  if (!isValidId(orderId)) notFound();
  const store = getStore();
  const order = await store.getOrder(orderId);
  if (!order) notFound();
  const check = await store.getCheck(order.checkId);
  if (!check) notFound();

  // Paid content only for orders the webhook (or mock checkout) marked paid.
  if (order.status !== "paid") {
    return (
      <>
        <SiteHeader />
        <main className={Flow.main}>
          <div className={`container ${Flow.narrow}`}>
            <section className={Flow.card}>
              <PaymentPending checkHref={`/check/${check.id}`} />
            </section>
          </div>
        </main>
        <SiteFooter />
      </>
    );
  }

  const result = await ensureReport(orderId);
  if (!result) notFound();
  const history = await store.listCoachMessages(orderId);
  const turns: CoachTurn[] = history.map((m) => ({ role: m.role, text: m.text, stop: m.stop }));
  const open = coachIsOpen(order);
  const ends = coachExpiresAt(order);

  return (
    <>
      <SiteHeader />
      <main className={Flow.main}>
        <div className={`container ${Flow.narrow}`}>
          <section className={Flow.card} aria-labelledby="kit-heading">
            <p className={Flow.eyebrow}>Your Deal Kit</p>
            <h1 id="kit-heading" className={Flow.h1}>
              {carName(check.input)}
            </h1>
            <p className={Flow.notice}>
              <strong>Bookmark this page.</strong> It&rsquo;s your private link to the Deal Kit and the reply coach
              {order.email ? `. We also emailed it to ${order.email}.` : "."}
            </p>
            <div className={Flow.actions}>
              <a href={`/api/report/${orderId}/pdf`} className="btn btn-secondary">
                Download PDF
              </a>
              <a href="#coach" className="btn btn-secondary">
                Go to the reply coach
              </a>
            </div>
          </section>

          <ReportView report={result.report} />

          <Coach
            orderId={orderId}
            initial={turns}
            open={open}
            closesLabel={open && ends ? `Available until ${DATE.format(ends)}.` : ""}
          />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
