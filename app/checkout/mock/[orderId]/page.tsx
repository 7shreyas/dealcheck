import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PRICE_LABEL } from "@/lib/config";
import { carName } from "@/lib/format";
import { isValidId } from "@/lib/ids";
import { getStore } from "@/lib/store";
import { hasStripe } from "@/lib/stripe";
import Flow from "../../../components/Flow.module.css";
import MockPayForm from "../../../components/MockPayForm";
import { SiteFooter, SiteHeader } from "../../../components/SiteChrome";

export const metadata: Metadata = { title: "Test checkout · DealCheck", robots: { index: false } };

// Mock mode only: stands in for Stripe Checkout when no Stripe key is set.
export default async function MockCheckoutPage({ params }: { params: Promise<{ orderId: string }> }) {
  if (hasStripe()) notFound();
  const { orderId } = await params;
  if (!isValidId(orderId)) notFound();
  const store = getStore();
  const order = await store.getOrder(orderId);
  if (!order) notFound();
  if (order.status === "paid") redirect(`/report/${orderId}`);
  const check = await store.getCheck(order.checkId);

  return (
    <>
      <SiteHeader />
      <main className={Flow.main}>
        <div className={`container ${Flow.narrow}`}>
          <section className={Flow.card} aria-labelledby="checkout-heading">
            <p className={Flow.eyebrow}>Test checkout</p>
            <h1 id="checkout-heading" className={Flow.h1}>
              Get your Deal Kit
            </h1>
            <p className={Flow.notice}>
              <strong>Test mode.</strong> Stripe isn&rsquo;t connected yet, so this is a pretend payment. No money moves.
            </p>
            <div className={Flow.summary}>
              <span>Deal Kit{check ? `: ${carName(check.input)}` : ""}</span>
              <span>{PRICE_LABEL}</span>
            </div>
            <MockPayForm orderId={orderId} label={`Pay ${PRICE_LABEL} (test)`} />
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
